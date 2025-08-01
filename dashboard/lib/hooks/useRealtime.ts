'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useSecurity } from '@/app/providers';

interface UseRealtimeOptions {
  onNewRun?: (run: any) => void;
  onRunUpdate?: (run: any) => void;
  onWarningUpdate?: (warning: any) => void;
  onError?: (error: Error) => void;
}

export function useRealtime(
  repoId: string | undefined,
  onUpdate: () => void,
  options: UseRealtimeOptions = {}
) {
  const supabase = createClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const { reportSecurityEvent } = useSecurity();
  
  useEffect(() => {
    if (!repoId) return;
    
    // Security: Validate repoId format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(repoId)) {
      reportSecurityEvent('invalid_realtime_repo_id', { repoId });
      return;
    }
    
    console.log('Setting up realtime subscription for repo:', repoId);
    
    try {
      // Create a unique channel name
      const channelName = `repo-${repoId}-${Date.now()}`;
      
      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'runs',
            filter: `repo_id=eq.${repoId}`,
          },
          (payload) => {
            console.log('New run detected:', payload.new);
            reportSecurityEvent('realtime_new_run', { repoId, runId: payload.new.id });
            options.onNewRun?.(payload.new);
            onUpdate();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'runs',
            filter: `repo_id=eq.${repoId}`,
          },
          (payload) => {
            console.log('Run updated:', payload.new);
            options.onRunUpdate?.(payload.new);
            onUpdate();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'warnings',
          },
          (payload) => {
            // Only react to warnings for runs from this repo
            console.log('New warning detected:', payload.new);
            options.onWarningUpdate?.(payload.new);
            onUpdate();
          }
        )
        .subscribe((status, error) => {
          if (error) {
            console.error('Realtime subscription error:', error);
            reportSecurityEvent('realtime_subscription_error', { error: error.message, repoId });
            options.onError?.(error);
          } else {
            console.log('Realtime subscription status:', status);
            if (status === 'SUBSCRIBED') {
              reportSecurityEvent('realtime_subscribed', { repoId, channel: channelName });
            }
          }
        });
      
      channelRef.current = channel;
      
      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        if (channel.state === 'joined') {
          channel.send({
            type: 'broadcast',
            event: 'heartbeat',
            payload: { timestamp: Date.now() },
          });
        }
      }, 30000); // 30 seconds
      
      return () => {
        console.log('Cleaning up realtime subscription');
        clearInterval(heartbeat);
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      };
    } catch (error) {
      console.error('Failed to set up realtime subscription:', error);
      reportSecurityEvent('realtime_setup_error', { error, repoId });
      options.onError?.(error as Error);
    }
  }, [repoId, onUpdate, options, supabase, reportSecurityEvent]);
  
  // Security: Monitor connection health
  useEffect(() => {
    if (!channelRef.current) return;
    
    const checkConnection = () => {
      const channel = channelRef.current;
      if (!channel) return;
      
      if (channel.state === 'closed' || channel.state === 'errored') {
        reportSecurityEvent('realtime_connection_unhealthy', { 
          state: channel.state,
          repoId 
        });
      }
    };
    
    const healthCheck = setInterval(checkConnection, 60000); // Check every minute
    
    return () => clearInterval(healthCheck);
  }, [repoId, reportSecurityEvent]);
  
  return {
    isConnected: channelRef.current?.state === 'joined',
    channel: channelRef.current,
    disconnect: () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    },
  };
}

// Hook for global realtime updates (all repos)
export function useGlobalRealtime(onUpdate: () => void) {
  const supabase = createClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const { reportSecurityEvent } = useSecurity();
  
  useEffect(() => {
    console.log('Setting up global realtime subscription');
    
    try {
      const channel = supabase
        .channel('global-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'runs',
          },
          (payload) => {
            console.log('Global run change:', payload);
            onUpdate();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'repo_warning_daily',
          },
          (payload) => {
            console.log('Daily stats updated:', payload);
            onUpdate();
          }
        )
        .subscribe((status, error) => {
          if (error) {
            console.error('Global realtime subscription error:', error);
            reportSecurityEvent('global_realtime_error', { error: error.message });
          } else {
            console.log('Global realtime subscription status:', status);
          }
        });
      
      channelRef.current = channel;
      
      return () => {
        console.log('Cleaning up global realtime subscription');
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      };
    } catch (error) {
      console.error('Failed to set up global realtime subscription:', error);
      reportSecurityEvent('global_realtime_setup_error', { error });
    }
  }, [onUpdate, supabase, reportSecurityEvent]);
  
  return {
    isConnected: channelRef.current?.state === 'joined',
    disconnect: () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    },
  };
}