import { createClient } from '@/lib/supabase/server';
import { PLANS } from '@/lib/billing/plans';
import { getUsageStats, getUserSubscription } from '@/lib/billing/usage';
import { getUserGitHubSubscription } from '@/lib/billing/github-marketplace';
import { PlanCard } from '@/components/billing/PlanCard';
import { UsageChart } from '@/components/billing/UsageChart';
import { SubscriptionManager } from '@/components/billing/SubscriptionManager';
import { BillingProviderSelector } from '@/components/billing/BillingProviderSelector';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, CreditCard, AlertTriangle, CheckCircle, Github } from 'lucide-react';
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
  
  // Get user's subscriptions (both Stripe and GitHub)
  const stripeSubscription = await getUserSubscription(user.id);
  const githubSubscription = await getUserGitHubSubscription(user.id);
  
  // Determine active subscription (prioritize Stripe over GitHub)
  const activeSubscription = stripeSubscription || githubSubscription;
  const currentPlan = activeSubscription?.plan_id || 'free';
  const billingProvider = stripeSubscription ? 'stripe' : githubSubscription ? 'github_marketplace' : null;
  
  // Get usage statistics if user has a subscription
  let usage = null;
  if (activeSubscription) {
    try {
      usage = await getUsageStats(activeSubscription.id);
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
                <Badge variant={activeSubscription?.status === 'active' ? 'default' : 'destructive'}>
                  {activeSubscription?.status || 'inactive'}
                </Badge>
              )}
              {billingProvider && (
                <Badge variant="outline" className="flex items-center gap-1">
                  {billingProvider === 'stripe' ? (
                    <CreditCard className="w-3 h-3" />
                  ) : (
                    <Github className="w-3 h-3" />
                  )}
                  {billingProvider === 'stripe' ? 'Stripe' : 'GitHub Marketplace'}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              {activeSubscription?.status === 'active' 
                ? `Next billing date: ${new Date(activeSubscription.current_period_end).toLocaleDateString()}`
                : currentPlan === 'free' 
                  ? 'No active subscription'
                  : 'Subscription inactive'
              }
            </p>
            {activeSubscription?.cancel_at_period_end && (
              <p className="text-yellow-600 mt-1">
                ⚠️ Subscription will be canceled on {new Date(activeSubscription.current_period_end).toLocaleDateString()}
              </p>
            )}
            {githubSubscription?.on_free_trial && (
              <p className="text-blue-600 mt-1">
                🎁 Free trial ends on {new Date(githubSubscription.free_trial_ends_on!).toLocaleDateString()}
              </p>
            )}
          </div>
          
          {activeSubscription && billingProvider === 'stripe' && (
            <SubscriptionManager subscription={activeSubscription} />
          )}
          
          {activeSubscription && billingProvider === 'github_marketplace' && (
            <Button variant="outline" asChild>
              <a 
                href={`https://github.com/marketplace/${process.env.NEXT_PUBLIC_GITHUB_APP_NAME || 'swiftconcur-ci'}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="w-4 h-4 mr-2" />
                Manage on GitHub
                <ExternalLink className="w-4 h-4 ml-2" />
              </a>
            </Button>
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
      
      {/* Billing Provider Selection */}
      {currentPlan === 'free' && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">Choose Your Payment Method</h2>
          <BillingProviderSelector />
        </div>
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
              disabled={activeSubscription?.status === 'active' && plan.id === currentPlan}
              billingProvider={billingProvider}
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