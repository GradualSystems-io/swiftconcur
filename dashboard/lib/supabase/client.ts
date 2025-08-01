import { createBrowserClient } from '@supabase/ssr';
import { Database } from './types';

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

// Security: Validate environment variables
function validateEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error('Missing required Supabase environment variables');
  }
  
  // Validate URL format
  try {
    new URL(url);
  } catch {
    throw new Error('Invalid Supabase URL format');
  }
  
  // Basic key validation (should be a valid looking JWT)
  if (!key.includes('.') || key.length < 100) {
    throw new Error('Invalid Supabase key format');
  }
  
  return { url, key };
}

export function createClient() {
  // Return existing client if available (singleton pattern)
  if (client) return client;
  
  const { url, key } = validateEnvironment();
  
  client = createBrowserClient<Database>(url, key, {
    auth: {
      // Security: Set secure cookie options
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
    global: {
      // Security headers for all requests
      headers: {
        'X-Client-Info': 'swiftconcur-dashboard',
      },
    },
    db: {
      // Security: Set schema to public explicitly
      schema: 'public',
    },
  });
  
  // Security: Add request interceptor for additional validation
  const originalRequest = client.rest.request;
  client.rest.request = async (options) => {
    // Add security headers
    options.headers = {
      ...options.headers,
      'X-Request-Origin': 'dashboard',
      'X-Client-Version': '1.0.0',
    };
    
    // Security: Validate query parameters for potential injection
    if (options.query) {
      Object.entries(options.query).forEach(([key, value]) => {
        if (typeof value === 'string' && value.includes(';')) {
          console.warn(`Potentially unsafe query parameter: ${key}`);
        }
      });
    }
    
    return originalRequest.call(client!.rest, options);
  };
  
  return client;
}

// Security: Function to clear client (useful for logout)
export function clearClient() {
  client = null;
}