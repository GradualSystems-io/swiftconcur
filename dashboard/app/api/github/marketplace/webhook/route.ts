import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { initializeUsageLimits } from '@/lib/billing/usage';

// Get webhook secret with runtime validation
function getGitHubWebhookSecret(): string {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('GITHUB_WEBHOOK_SECRET is required');
  }
  return secret;
}

interface GitHubMarketplacePurchase {
  account: {
    id: number;
    login: string;
    type: 'User' | 'Organization';
    avatar_url?: string;
    gravatar_id?: string;
    url?: string;
  };
  billing_cycle: 'monthly' | 'yearly';
  unit_count: number;
  on_free_trial: boolean;
  free_trial_ends_on: string | null;
  next_billing_date: string;
  plan: {
    id: number;
    name: string;
    description: string;
    monthly_price_in_cents: number;
    yearly_price_in_cents: number;
    price_model: string;
    has_free_trial: boolean;
    unit_name: string | null;
    bullets: string[];
  };
}

interface GitHubMarketplaceEvent {
  action: 'purchased' | 'changed' | 'cancelled' | 'pending_change' | 'pending_change_cancelled';
  effective_date?: string;
  sender: {
    id: number;
    login: string;
    avatar_url?: string;
    gravatar_id?: string;
    url?: string;
    type?: string;
  };
  marketplace_purchase: GitHubMarketplacePurchase;
  previous_marketplace_purchase?: GitHubMarketplacePurchase;
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  
  try {
    // Get the raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('x-hub-signature-256');
    const deliveryId = request.headers.get('x-github-delivery');
    const eventType = request.headers.get('x-github-event');
    
    // Security: Verify webhook signature
    if (!verifyGitHubWebhookSignature(body, signature, getGitHubWebhookSecret())) {
      console.error('Invalid GitHub webhook signature');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Only process marketplace_purchase events
    if (eventType !== 'marketplace_purchase') {
      console.log(`Ignoring non-marketplace event: ${eventType}`);
      return NextResponse.json({ received: true }, { status: 200 });
    }
    
    const event: GitHubMarketplaceEvent = JSON.parse(body);
    
    // Security: Log all events for audit trail
    await supabase.from('billing_events').insert({
      billing_provider: 'github_marketplace',
      event_type: `marketplace_${event.action}`,
      event_data: event,
      github_delivery_id: deliveryId,
      processing_status: 'pending',
    });
    
    console.log(`Processing GitHub Marketplace webhook: ${event.action} (${deliveryId})`);
    
    // Process event based on action
    switch (event.action) {
      case 'purchased':
        await handleMarketplacePurchase(event);
        break;
        
      case 'changed':
        await handleMarketplaceChange(event);
        break;
        
      case 'cancelled':
        await handleMarketplaceCancellation(event);
        break;
        
      case 'pending_change':
        await handlePendingChange(event);
        break;
        
      case 'pending_change_cancelled':
        await handlePendingChangeCancelled(event);
        break;
        
      default:
        console.warn('Unknown marketplace action:', event.action);
    }
    
    // Mark event as processed
    await supabase
      .from('billing_events')
      .update({ processing_status: 'processed' })
      .eq('github_delivery_id', deliveryId);
    
    return NextResponse.json({ received: true }, { status: 200 });
    
  } catch (error) {
    console.error('GitHub Marketplace webhook error:', error);
    
    // Mark event as failed if we can identify it
    const deliveryId = request.headers.get('x-github-delivery');
    if (deliveryId) {
      await supabase
        .from('billing_events')
        .update({ processing_status: 'failed' })
        .eq('github_delivery_id', deliveryId);
    }
    
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handleMarketplacePurchase(event: GitHubMarketplaceEvent) {
  const supabase = createClient();
  
  try {
    const purchase = event.marketplace_purchase;
    
    // Use the database function to sync subscription
    const { data: subscriptionId } = await supabase.rpc('sync_github_subscription', {
      p_github_account_id: purchase.account.id,
      p_github_login: purchase.account.login,
      p_account_type: purchase.account.type,
      p_github_plan_id: purchase.plan.id,
      p_action: 'purchased',
      p_billing_cycle: purchase.billing_cycle,
      p_unit_count: purchase.unit_count,
      p_next_billing_date: purchase.next_billing_date,
      p_on_free_trial: purchase.on_free_trial,
      p_free_trial_ends_on: purchase.free_trial_ends_on,
    });
    
    if (subscriptionId) {
      // Get the plan ID to initialize usage limits
      const { data: planData } = await supabase.rpc('get_plan_by_github_id', {
        p_github_plan_id: purchase.plan.id,
      });
      
      if (planData) {
        await initializeUsageLimits(subscriptionId, planData);
      }
    }
    
    console.log(`✅ New GitHub Marketplace subscription: ${purchase.account.login} on ${purchase.plan.name}`);
    
  } catch (error) {
    console.error('Failed to handle marketplace purchase:', error);
    throw error;
  }
}

async function handleMarketplaceChange(event: GitHubMarketplaceEvent) {
  const supabase = createClient();
  
  try {
    const purchase = event.marketplace_purchase;
    const previousPurchase = event.previous_marketplace_purchase;
    
    console.log(`Plan change: ${purchase.account.login} from ${previousPurchase?.plan.name} to ${purchase.plan.name}`);
    
    // Use the database function to sync subscription
    const { data: subscriptionId } = await supabase.rpc('sync_github_subscription', {
      p_github_account_id: purchase.account.id,
      p_github_login: purchase.account.login,
      p_account_type: purchase.account.type,
      p_github_plan_id: purchase.plan.id,
      p_action: 'changed',
      p_billing_cycle: purchase.billing_cycle,
      p_unit_count: purchase.unit_count,
      p_next_billing_date: purchase.next_billing_date,
      p_on_free_trial: purchase.on_free_trial,
      p_free_trial_ends_on: purchase.free_trial_ends_on,
    });
    
    if (subscriptionId) {
      // Get the new plan ID to update usage limits
      const { data: planData } = await supabase.rpc('get_plan_by_github_id', {
        p_github_plan_id: purchase.plan.id,
      });
      
      if (planData) {
        await initializeUsageLimits(subscriptionId, planData);
      }
    }
    
    console.log(`✅ GitHub Marketplace subscription updated: ${purchase.account.login}`);
    
  } catch (error) {
    console.error('Failed to handle marketplace change:', error);
    throw error;
  }
}

async function handleMarketplaceCancellation(event: GitHubMarketplaceEvent) {
  const supabase = createClient();
  
  try {
    const purchase = event.marketplace_purchase;
    
    // Use the database function to sync subscription
    await supabase.rpc('sync_github_subscription', {
      p_github_account_id: purchase.account.id,
      p_github_login: purchase.account.login,
      p_account_type: purchase.account.type,
      p_github_plan_id: purchase.plan.id,
      p_action: 'cancelled',
      p_billing_cycle: purchase.billing_cycle,
      p_unit_count: purchase.unit_count,
    });
    
    console.log(`✅ GitHub Marketplace subscription cancelled: ${purchase.account.login}`);
    
  } catch (error) {
    console.error('Failed to handle marketplace cancellation:', error);
    throw error;
  }
}

async function handlePendingChange(event: GitHubMarketplaceEvent) {
  // Log pending changes but don't process until effective
  const purchase = event.marketplace_purchase;
  console.log(`Pending change for ${purchase.account.login} to ${purchase.plan.name}, effective: ${event.effective_date}`);
}

async function handlePendingChangeCancelled(event: GitHubMarketplaceEvent) {
  // Log cancellation of pending change
  const purchase = event.marketplace_purchase;
  console.log(`Pending change cancelled for ${purchase.account.login}`);
}

function verifyGitHubWebhookSignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  
  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')}`;
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}