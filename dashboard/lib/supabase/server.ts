import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from './types';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          const cookie = cookieStore.get(name);
          console.log(`Getting cookie ${name}:`, cookie?.value ? 'found' : 'not found');
          return cookie?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            // Let Supabase control all cookie options for auth cookies
            if (name.startsWith('sb-')) {
              cookieStore.set({ name, value, ...options });
            } else {
              // Apply your custom options only to non-auth cookies
              cookieStore.set({ 
                name, 
                value, 
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
                ...options 
              });
            }
          } catch (error) {
            // This is expected in Server Components during rendering
            // The middleware will handle the actual cookie setting
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ 
              name, 
              value: '', 
              maxAge: 0,
              ...options 
            });
          } catch (error) {
            // Expected in Server Components
          }
        },
      },
    }
  );
}

/**
 * Create a service role client for server-side operations (webhooks, background jobs)
 * This bypasses Row Level Security and should only be used in trusted server contexts
 */
export function createServiceRoleClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  }

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: {
        get() { return undefined; },
        set() {},
        remove() {},
      },
    }
  );
}

export async function verifyUser() {
  const supabase = createClient();
  
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return { user: null, error: 'Unauthorized' };

    return { user, error: null };
  } catch (error) {
    console.error('User verification error:', error);
    return { user: null, error: 'Verification failed' };
  }
}