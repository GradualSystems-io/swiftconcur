import { createClient } from '@/lib/supabase/server';
import { PLANS } from '@/lib/billing/plans';
import { getUsageStats, getUserSubscription } from '@/lib/billing/usage';
import { PlanCard } from '@/components/billing/PlanCard';
import { UsageChart } from '@/components/billing/UsageChart';
import { SubscriptionManager } from '@/components/billing/SubscriptionManager';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, CreditCard, AlertTriangle, CheckCircle } from 'lucide-react';
import { redirect } from 'next/navigation';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const supabase = createClient();
  
  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    redirect('/auth/login');
  }
  
  // Get user's subscription
  const subscription = await getUserSubscription(user.id);
  const currentPlan = subscription?.plan_id || 'free';
  
  // Get usage statistics if user has a subscription
  let usage = null;
  if (subscription) {
    try {
      usage = await getUsageStats(subscription.id);
    } catch (error) {
      console.error('Error getting usage stats:', error);
    }
  }
  
  // Handle success/error messages from URL params
  const success = searchParams.success === 'true';
  const canceled = searchParams.canceled === 'true';
  const upgrade = searchParams.upgrade === 'true';
  const reason = searchParams.reason as string;
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing & Usage</h1>
        <p className="text-muted-foreground mt-2">
          Manage your subscription and monitor usage
        </p>
      </div>
      
      {/* Status Messages */}
      {success && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Welcome to SwiftConcur Pro!</strong> Your subscription is now active.
          </AlertDescription>
        </Alert>
      )}
      
      {canceled && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Payment was canceled. Your current plan remains unchanged.
          </AlertDescription>
        </Alert>
      )}
      
      {upgrade && reason && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Usage limit exceeded!</strong> 
            {reason === 'warnings_limit_exceeded' && ' You\'ve reached your monthly warning processing limit.'}
            {reason === 'api_calls_limit_exceeded' && ' You\'ve reached your hourly API call limit.'}
            {' '}Please upgrade your plan to continue using all features.
          </AlertDescription>
        </Alert>
      )}
      
      {/* Current Plan Summary */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold">
                Current Plan: {PLANS[currentPlan].displayName}
              </h2>
              {currentPlan !== 'free' && (
                <Badge variant={subscription?.status === 'active' ? 'default' : 'destructive'}>
                  {subscription?.status || 'inactive'}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              {subscription?.status === 'active' 
                ? `Next billing date: ${new Date(subscription.current_period_end).toLocaleDateString()}`
                : currentPlan === 'free' 
                  ? 'No active subscription'
                  : 'Subscription inactive'
              }
            </p>
            {subscription?.cancel_at_period_end && (
              <p className="text-yellow-600 mt-1">
                ⚠️ Subscription will be canceled on {new Date(subscription.current_period_end).toLocaleDateString()}
              </p>
            )}
          </div>
          
          {subscription && (
            <SubscriptionManager subscription={subscription} />
          )}
        </div>
      </div>
      
      {/* Usage Statistics */}
      {usage && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">Current Usage</h2>
          <UsageChart usage={usage} />
        </div>
      )}
      
      {/* Upgrade Prompt for Free Users */}
      {currentPlan === 'free' && (
        <Alert>
          <AlertDescription>
            <strong>Unlock AI-powered summaries and advanced features!</strong>
            <br />
            Upgrade to Pro for AI summaries, Slack integration, and 12-month warning history.
          </AlertDescription>
        </Alert>
      )}
      
      {/* Available Plans */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Available Plans</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {Object.values(PLANS).map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentPlan={plan.id === currentPlan}
              popular={plan.popular}
              disabled={subscription?.status === 'active' && plan.id === currentPlan}
            />
          ))}
        </div>
      </div>
      
      {/* FAQ Section */}
      <div className="mt-12">
        <h2 className="text-2xl font-semibold mb-4">Frequently Asked Questions</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-medium">How does billing work?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Billing is handled securely through Stripe. You'll be charged monthly based on your selected plan.
              All payments are processed with bank-level security.
            </p>
          </div>
          <div>
            <h3 className="font-medium">Can I change plans anytime?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Yes! You can upgrade or downgrade your plan anytime. Changes take effect immediately,
              and you'll be prorated for any differences.
            </p>
          </div>
          <div>
            <h3 className="font-medium">What happens if I exceed my limits?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              The GitHub Action will continue to work but won't send data to the dashboard until
              your usage resets or you upgrade your plan.
            </p>
          </div>
          <div>
            <h3 className="font-medium">Is my payment information secure?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Yes! We use Stripe for payment processing, which is PCI DSS Level 1 compliant.
              We never store your payment information on our servers.
            </p>
          </div>
          <div>
            <h3 className="font-medium">Can I cancel anytime?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Absolutely! You can cancel your subscription at any time. Your access will continue
              until the end of your current billing period.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}