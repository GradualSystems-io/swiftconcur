'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createClient } from '@/lib/supabase/client';
import { useState, useEffect, createContext, useContext } from 'react';
import { User } from '@supabase/supabase-js';
import { ClientRateLimit } from '@/lib/utils';

// Create contexts
const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
} | null>(null);

const SecurityContext = createContext<{
  rateLimit: ClientRateLimit;
  reportSecurityEvent: (event: string, details?: any) => void;
} | null>(null);

// Security monitoring
function useSecurityMonitoring() {
  const rateLimit = new ClientRateLimit(50, 60000); // 50 requests per minute
  
  const reportSecurityEvent = (event: string, details: any = {}) => {
    // In production, this would send to a security monitoring service
    console.warn('SECURITY EVENT:', {
      timestamp: new Date().toISOString(),
      event,
      details,
      userAgent: navigator.userAgent,
      url: window.location.href,
    });
    
    // Rate limit security events to prevent spam
    if (!rateLimit.isAllowed('security-events')) {
      console.warn('Security event rate limit exceeded');
      return;
    }
    
    // Could integrate with services like Sentry, DataDog, etc.
  };
  
  return { rateLimit, reportSecurityEvent };
}

// Auth provider component
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  
  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Session error:', error);
          setUser(null);
        } else {
          setUser(session?.user ?? null);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    
    getSession();
    
    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event);
      
      // Security: Monitor auth events
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        // Log security-relevant events
        console.log('Auth security event:', { event, timestamp: new Date().toISOString() });
      }
      
      setUser(session?.user ?? null);
      setLoading(false);
    });
    
    return () => subscription.unsubscribe();
  }, [supabase.auth]);
  
  const signOut = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // Security: Clear any sensitive data from localStorage
      if (typeof window !== 'undefined') {
        // Clear any cached sensitive data
        Object.keys(localStorage).forEach(key => {
          if (key.includes('supabase') || key.includes('auth')) {
            localStorage.removeItem(key);
          }
        });
      }
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// Security provider component
function SecurityProvider({ children }: { children: React.ReactNode }) {
  const security = useSecurityMonitoring();
  
  useEffect(() => {
    // Security: Monitor for suspicious activity
    const handleVisibilityChange = () => {
      if (document.hidden) {
        security.reportSecurityEvent('tab_hidden');
      }
    };
    
    const handleBeforeUnload = () => {
      security.reportSecurityEvent('page_unload');
    };
    
    // Security: Detect developer tools
    let devtools = { open: false, orientation: null };
    const threshold = 160;
    
    const detectDevTools = () => {
      if (
        window.outerHeight - window.innerHeight > threshold ||
        window.outerWidth - window.innerWidth > threshold
      ) {
        if (!devtools.open) {
          devtools.open = true;
          security.reportSecurityEvent('devtools_opened');
        }
      } else {
        devtools.open = false;
      }
    };
    
    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Check for devtools periodically
    const devToolsInterval = setInterval(detectDevTools, 1000);
    
    // Security: Monitor for console access attempts
    const originalConsole = { ...console };
    console.warn = (...args: any[]) => {
      if (args[0]?.includes?.('security') || args[0]?.includes?.('password')) {
        security.reportSecurityEvent('console_security_access', { args });
      }
      return originalConsole.warn(...args);
    };
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(devToolsInterval);
      Object.assign(console, originalConsole);
    };
  }, [security]);
  
  return (
    <SecurityContext.Provider value={security}>
      {children}
    </SecurityContext.Provider>
  );
}

// Main providers component
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: (failureCount, error: any) => {
              // Security: Don't retry on auth errors
              if (error?.status === 401 || error?.status === 403) {
                return false;
              }
              return failureCount < 3;
            },
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: false, // Don't retry mutations for security
          },
        },
      })
  );
  
  return (
    <QueryClientProvider client={queryClient}>
      <SecurityProvider>
        <AuthProvider>
          {children}
          <ReactQueryDevtools initialIsOpen={false} />
        </AuthProvider>
      </SecurityProvider>
    </QueryClientProvider>
  );
}

// Custom hooks
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useSecurity() {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
}