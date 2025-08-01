import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database, UserRole } from './types';

// Security: Rate limiting for server requests
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
  
  if (current.count >= RATE_LIMIT) {
    return false;
  }
  
  current.count++;
  return true;
}

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
            // Security: Ensure secure cookie options
            const secureOptions: CookieOptions = {
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'strict',
              path: '/',
            };
            
            cookieStore.set({ name, value, ...secureOptions });
          } catch (error) {
            // Handle the case where cookies can't be set (e.g., in Server Components)
            console.warn('Failed to set cookie:', error);
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            const secureOptions: CookieOptions = {
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'strict',
              path: '/',
            };
            
            cookieStore.set({ name, value: '', ...secureOptions });
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
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return { user: null, error: 'Unauthorized' };
    }
    
    // Security: Rate limiting per user
    if (!checkRateLimit(user.id)) {
      return { user: null, error: 'Rate limit exceeded' };
    }
    
    // If role checking is required, verify user has access
    if (requiredRole) {
      // This would typically check against a user_roles table or user metadata
      const userRole = user.user_metadata?.role as UserRole;
      
      if (!userRole) {
        return { user: null, error: 'No role assigned' };
      }
      
      // Role hierarchy check
      const roleHierarchy: Record<UserRole, number> = {
        read: 1,
        admin: 2,
        owner: 3,
      };
      
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
  
  if (error || !user) {
    return { hasAccess: false, error };
  }
  
  const supabase = createClient();
  
  try {
    const { data, error: accessError } = await supabase
      .from('user_repos')
      .select('role')
      .eq('user_id', user.id)
      .eq('repo_id', repoId)
      .single();
    
    if (accessError || !data) {
      return { hasAccess: false, error: 'Repository not found or access denied' };
    }
    
    // Check role hierarchy
    const roleHierarchy: Record<UserRole, number> = {
      read: 1,
      admin: 2,
      owner: 3,
    };
    
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

// Security: Input sanitization utility
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove potentially dangerous characters
    return input
      .replace(/[<>\"']/g, '') // Remove HTML/XSS characters
      .replace(/[;()]/g, '') // Remove SQL injection characters
      .trim()
      .slice(0, 1000); // Limit length
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeInput).slice(0, 100); // Limit array length
  }
  
  if (input && typeof input === 'object') {
    const sanitized: any = {};
    Object.keys(input).slice(0, 50).forEach(key => { // Limit object keys
      if (typeof key === 'string' && key.length < 100) {
        sanitized[sanitizeInput(key)] = sanitizeInput(input[key]);
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
  
  // In a real application, you would log this to a secure audit table
  console.log('AUDIT LOG:', {
    timestamp: new Date().toISOString(),
    userId: user.id,
    userEmail: user.email,
    action,
    resourceType,
    resourceId,
    additionalData: sanitizeInput(additionalData),
    userAgent: process.env.HTTP_USER_AGENT,
    ip: process.env.HTTP_X_FORWARDED_FOR || process.env.HTTP_X_REAL_IP,
  });
}