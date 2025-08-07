import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database, UserRole } from './types';

// Security: Rate limiting for server requests (note: not reliable on serverless)
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 100; // requests per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const current = requestCounts.get(identifier);

  if (!current || now > current.resetTime) {
    requestCounts.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (current.count >= RATE_LIMIT) return false;
  current.count++;
  return true;
}

const isProd = process.env.NODE_ENV === 'production';
const COOKIE_DOMAIN = process.env.SUPABASE_COOKIE_DOMAIN || undefined; // e.g. ".gradualsystems.io"

const BASE_COOKIE_OPTS: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax', // IMPORTANT: lax for auth redirects
  path: '/',
  ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
};

export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            const finalOpts: CookieOptions = { ...BASE_COOKIE_OPTS, ...options };
            cookieStore.set({ name, value, ...finalOpts });
          } catch (error) {
            // Happens in some server-component contexts; harmless
            console.warn('Failed to set cookie:', error);
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            const finalOpts: CookieOptions = {
              ...BASE_COOKIE_OPTS,
              ...options,
              maxAge: 0,
              expires: new Date(0),
            };
            // next/headers has .delete, but this works across runtimes:
            cookieStore.set({ name, value: '', ...finalOpts });
          } catch (error) {
            console.warn('Failed to remove cookie:', error);
          }
        },
      },
    }
  );
}

// Security: Enhanced user verification with role checking
export async function verifyUser(requiredRole?: UserRole) {
  const supabase = createClient();

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    console.log('verifyUser check:', {
      hasUser: !!user,
      userEmail: user?.email,
      emailConfirmed: user?.email_confirmed_at,
      error: error?.message,
    });

    if (error || !user) return { user: null, error: 'Unauthorized' };

    if (!checkRateLimit(user.id)) return { user: null, error: 'Rate limit exceeded' };

    if (requiredRole) {
      const userRole = user.user_metadata?.role as UserRole | undefined;
      if (!userRole) return { user: null, error: 'No role assigned' };

      const roleHierarchy: Record<UserRole, number> = { read: 1, admin: 2, owner: 3 };
      if (roleHierarchy[userRole] < roleHierarchy[requiredRole]) {
        return { user: null, error: 'Insufficient permissions' };
      }
    }

    return { user, error: null };
  } catch (error) {
    console.error('User verification error:', error);
    return { user: null, error: 'Verification failed' };
  }
}

// Security: Repository access control
export async function verifyRepoAccess(repoId: string, requiredRole: UserRole = 'read') {
  const { user, error } = await verifyUser();
  if (error || !user) return { hasAccess: false, error };

  const supabase = createClient();

  try {
    const { data, error: accessError } = await supabase
      .from('user_repos')
      .select('role')
      .eq('user_id', user.id)
      .eq('repo_id', repoId)
      .single();

    if (accessError || !data) return { hasAccess: false, error: 'Repository not found or access denied' };

    const roleHierarchy: Record<UserRole, number> = { read: 1, admin: 2, owner: 3 };
    const hasAccess = roleHierarchy[data.role] >= roleHierarchy[requiredRole];

    return {
      hasAccess,
      error: hasAccess ? null : 'Insufficient repository permissions',
      role: data.role,
    };
  } catch (error) {
    console.error('Repository access verification error:', error);
    return { hasAccess: false, error: 'Access verification failed' };
  }
}

// Security: Input sanitization utility (basic)
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    return input.replace(/[<>\"']/g, '').replace(/[;()]/g, '').trim().slice(0, 1000);
  }
  if (Array.isArray(input)) return input.map(sanitizeInput).slice(0, 100);
  if (input && typeof input === 'object') {
    const sanitized: any = {};
    Object.keys(input).slice(0, 50).forEach((key) => {
      if (typeof key === 'string' && key.length < 100) {
        sanitized[sanitizeInput(key)] = sanitizeInput((input as any)[key]);
      }
    });
    return sanitized;
  }
  return input;
}

// Security: Audit logging utility
export async function auditLog(
  action: string,
  resourceType: string,
  resourceId: string,
  additionalData?: any
) {
  const { user } = await verifyUser();
  if (!user) return;

  // If you need IP/UA reliably, accept a NextRequest and read from req.headers instead.
  console.log('AUDIT LOG:', {
    timestamp: new Date().toISOString(),
    userId: user.id,
    userEmail: user.email,
    action,
    resourceType,
    resourceId,
    additionalData: sanitizeInput(additionalData),
  });
}