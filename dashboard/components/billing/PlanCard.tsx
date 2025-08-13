'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Sparkles, Loader2 } from 'lucide-react';
import { Plan } from '@/lib/billing/plans';
import { useState } from 'react';

interface PlanCardProps {
  plan: Plan;
  currentPlan: boolean;
  popular?: boolean;
  disabled?: boolean;
  billingProvider?: string | null;
}

export function PlanCard({ plan, currentPlan, popular, disabled, billingProvider }: PlanCardProps) {
  const [loading, setLoading] = useState(false);
  
  const features = [
    {
      name: 'Private Repositories',
      included: plan.features.privateRepos,
      value: typeof plan.limits.repositories === 'number' 
        ? `${plan.limits.repositories} repos` 
        : 'Unlimited repos',
    },
    {
      name: 'Monthly Warnings',
      value: typeof plan.limits.warningsPerMonth === 'number'
        ? `${plan.limits.warningsPerMonth.toLocaleString()} warnings`
        : 'Unlimited warnings',
      included: true,
    },
    {
      name: 'AI-Powered Summaries',
      included: plan.features.aiSummaries,
      highlight: true,
    },
    {
      name: 'Slack Integration',
      included: plan.features.slackIntegration,
    },
    {
      name: 'Teams Integration',
      included: plan.features.teamsIntegration,
    },
    {
      name: 'Warning History',
      value: typeof plan.limits.retentionDays === 'number' 
        ? `${plan.limits.retentionDays} days` 
        : 'Unlimited',
      included: true,
    },
    {
      name: 'Team Members',
      value: typeof plan.limits.teamMembers === 'number'
        ? `${plan.limits.teamMembers} members`
        : 'Unlimited members',
      included: plan.limits.teamMembers !== 1,
    },
    {
      name: 'SSO & Audit Logs',
      included: plan.features.sso,
    },
    {
      name: 'Priority Support',
      included: plan.features.prioritySupport,
    },
  ];
  
  const handleSelectPlan = async () => {
    if (currentPlan || disabled || loading) return;
    
    // Check if Stripe is properly configured for this plan
    if (plan.id !== 'free' && (!plan.stripePriceId || plan.stripePriceId.includes('placeholder'))) {
      alert('Billing is not yet configured for this plan. Please contact support for assistance.');
      return;
    }
    
    setLoading(true);
    
    try {
      if (plan.id === 'free') {
        // Handle downgrade to free (would need cancellation flow)
        window.location.href = '/billing/cancel';
        return;
      }
      
      // Determine which billing provider to use
      const urlParams = new URLSearchParams(window.location.search);
      const preferredProvider = urlParams.get('provider') || 'stripe';
      
      if (preferredProvider === 'github_marketplace' || billingProvider === 'github_marketplace') {
        // Redirect to GitHub Marketplace
        const githubAppName = process.env.NEXT_PUBLIC_GITHUB_APP_NAME || 'swiftconcur-ci';
        window.location.href = `https://github.com/marketplace/${githubAppName}`;
        return;
      }
      
      // Use Stripe checkout (handle basePath correctly)
      const basePath = '/SwiftConcur'; // Match next.config.js basePath
      const response = await fetch(`${basePath}/api/stripe/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          successUrl: `${window.location.origin}${basePath}/billing?success=true`,
          cancelUrl: `${window.location.origin}${basePath}/billing?canceled=true`,
        }),
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to create checkout session';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch (parseError) {
          // If response is not JSON, get text content
          const errorText = await response.text();
          errorMessage = errorText || `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      const { url } = data;
      
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No checkout URL received');
      }
      
    } catch (error) {
      console.error('Checkout error:', error);
      alert(error instanceof Error ? error.message : 'Failed to start checkout process');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Card className={`relative ${currentPlan ? 'ring-2 ring-primary' : ''} ${disabled ? 'opacity-75' : ''}`}>
      {popular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-purple-600">
          <Sparkles className="w-3 h-3 mr-1" />
          Most Popular
        </Badge>
      )}
      
      <CardHeader>
        <CardTitle className="text-2xl flex items-center gap-2">
          {plan.displayName}
          {currentPlan && <Badge variant="outline">Current</Badge>}
        </CardTitle>
        <CardDescription>
          {plan.id === 'free' && 'Perfect for getting started with Swift concurrency tracking'}
          {plan.id === 'pro' && 'Best for growing teams and production applications'}
          {plan.id === 'enterprise' && 'Advanced features for large organizations'}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <div className="text-center">
          <span className="text-4xl font-bold">
            ${plan.priceMonthly / 100}
          </span>
          <span className="text-muted-foreground">/month</span>
          {plan.id === 'enterprise' && (
            <p className="text-sm text-muted-foreground mt-1">Custom pricing available</p>
          )}
        </div>
        
        <ul className="space-y-3">
          {features.map((feature) => (
            <li key={feature.name} className="flex items-start gap-2">
              {feature.included ? (
                <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
              ) : (
                <X className="w-5 h-5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
              )}
              <span className={`text-sm ${!feature.included && 'text-muted-foreground/50'}`}>
                {feature.value || feature.name}
                {feature.highlight && feature.included && (
                  <Sparkles className="w-4 h-4 text-yellow-500 inline ml-1" />
                )}
              </span>
            </li>
          ))}
        </ul>
        
        <Button
          onClick={handleSelectPlan}
          variant={currentPlan ? 'outline' : popular ? 'default' : 'secondary'}
          className="w-full"
          disabled={currentPlan || disabled || loading}
        >
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {currentPlan ? 'Current Plan' : 
           plan.id === 'enterprise' ? 'Contact Sales' :
           loading ? 'Processing...' : 
           'Select Plan'}
        </Button>
        
        {plan.id === 'enterprise' && (
          <p className="text-xs text-center text-muted-foreground">
            <a href="mailto:sales@swiftconcur.dev" className="hover:underline">
              Contact our sales team for custom pricing
            </a>
          </p>
        )}
      </CardContent>
    </Card>
  );
}