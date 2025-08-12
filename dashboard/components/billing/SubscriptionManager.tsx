'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  Settings, 
  CreditCard, 
  Play, 
  X, 
  ExternalLink,
  MoreHorizontal,
  Loader2
} from 'lucide-react';
import { useState } from 'react';

interface Subscription {
  id: string;
  stripe_subscription_id: string;
  plan_id: string;
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

interface SubscriptionManagerProps {
  subscription: Subscription;
}

export function SubscriptionManager({ subscription }: SubscriptionManagerProps) {
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string>('');
  
  const handleBillingAction = async (actionType: string) => {
    setLoading(true);
    setAction(actionType);
    
    try {
      const response = await fetch('/api/billing/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionType }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Action failed');
      }
      
      const result = await response.json();
      
      if (actionType === 'portal' && result.url) {
        window.location.href = result.url;
      } else {
        // Refresh the page to show updated status
        window.location.reload();
      }
      
    } catch (error) {
      console.error('Billing action error:', error);
      alert(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setLoading(false);
      setAction('');
    }
  };
  
  const getStatusBadge = () => {
    switch (subscription.status) {
      case 'active':
        return subscription.cancel_at_period_end ? (
          <Badge variant="outline" className="text-yellow-600 border-yellow-300">
            Canceling
          </Badge>
        ) : (
          <Badge className="bg-green-600">Active</Badge>
        );
      case 'past_due':
        return <Badge variant="destructive">Past Due</Badge>;
      case 'trialing':
        return <Badge variant="secondary">Trialing</Badge>;
      default:
        return <Badge variant="outline">{subscription.status}</Badge>;
    }
  };
  
  return (
    <div className="flex items-center gap-2">
      {getStatusBadge()}
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            size="sm"
            disabled={loading}
          >
            {loading && action ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {action === 'portal' && 'Opening Portal...'}
                {action === 'cancel' && 'Canceling...'}
                {action === 'reactivate' && 'Reactivating...'}
              </>
            ) : (
              <>
                <Settings className="w-4 h-4 mr-2" />
                Manage
                <MoreHorizontal className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Subscription Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          <DropdownMenuItem 
            onClick={() => handleBillingAction('portal')}
            disabled={loading}
          >
            <CreditCard className="w-4 h-4 mr-2" />
            Billing Portal
            <ExternalLink className="w-4 h-4 ml-auto" />
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          {subscription.cancel_at_period_end ? (
            <DropdownMenuItem 
              onClick={() => handleBillingAction('reactivate')}
              disabled={loading}
              className="text-green-600 focus:text-green-600"
            >
              <Play className="w-4 h-4 mr-2" />
              Reactivate Subscription
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem 
              onClick={() => handleBillingAction('cancel')}
              disabled={loading}
              className="text-red-600 focus:text-red-600"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel Subscription
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}