'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Github, Shield, Zap, Users } from 'lucide-react';
import { useState } from 'react';

export function BillingProviderSelector() {
  const [selectedProvider, setSelectedProvider] = useState<'stripe' | 'github' | null>(null);
  
  const providers = [
    {
      id: 'stripe' as const,
      name: 'Direct Billing',
      icon: CreditCard,
      description: 'Pay directly with credit card',
      features: [
        'Instant activation',
        'All major credit cards',
        'Secure payment processing',
        'Monthly or annual billing',
        'Cancel anytime'
      ],
      benefits: [
        { icon: Zap, text: 'Fastest setup' },
        { icon: Shield, text: 'PCI compliant' },
      ],
      buttonText: 'Choose Direct Billing',
      recommended: true,
    },
    {
      id: 'github' as const,
      name: 'GitHub Marketplace',
      icon: Github,
      description: 'Pay through GitHub billing',
      features: [
        'Unified GitHub billing',
        'Organization billing',
        'GitHub invoicing',
        'Marketplace benefits',
        'Enterprise agreements'
      ],
      benefits: [
        { icon: Users, text: 'Organization billing' },
        { icon: Shield, text: 'GitHub security' },
      ],
      buttonText: 'Choose GitHub Marketplace',
      recommended: false,
    },
  ];
  
  const handleProviderSelect = (providerId: 'stripe' | 'github') => {
    if (providerId === 'stripe') {
      // Redirect to plan selection with Stripe
      window.location.hash = 'plans';
      setSelectedProvider('stripe');
    } else {
      // Redirect to GitHub Marketplace
      const githubAppName = process.env.NEXT_PUBLIC_GITHUB_APP_NAME || 'swiftconcur-ci';
      window.open(`https://github.com/marketplace/${githubAppName}`, '_blank');
    }
  };
  
  return (
    <div className="grid gap-6 md:grid-cols-2 mb-8">
      {providers.map((provider) => {
        const IconComponent = provider.icon;
        return (
          <Card 
            key={provider.id} 
            className={`relative cursor-pointer transition-all hover:shadow-lg ${
              selectedProvider === provider.id ? 'ring-2 ring-primary' : ''
            }`}
            onClick={() => setSelectedProvider(provider.id)}
          >
            {provider.recommended && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-purple-600">
                Recommended
              </Badge>
            )}
            
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-3">
                <IconComponent className="w-6 h-6" />
                {provider.name}
              </CardTitle>
              <CardDescription>{provider.description}</CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {provider.features.map((feature, index) => (
                  <li key={index} className="text-sm flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                    {feature}
                  </li>
                ))}
              </ul>
              
              <div className="flex flex-wrap gap-2">
                {provider.benefits.map((benefit, index) => {
                  const BenefitIcon = benefit.icon;
                  return (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      <BenefitIcon className="w-3 h-3" />
                      {benefit.text}
                    </Badge>
                  );
                })}
              </div>
              
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  handleProviderSelect(provider.id);
                }}
                className="w-full"
                variant={provider.recommended ? 'default' : 'outline'}
              >
                {provider.buttonText}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}