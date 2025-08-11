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
  
  // IMPORTANT: Don't specify storage - let @supabase/ssr handle cookies automatically
  client = createBrowserClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // REMOVE the storage line - let it use cookies by default
      flowType: 'pkce', // Add this for better security
    },
    global: {
      headers: {
        'X-Client-Info': 'swiftconcur-dashboard',
      },
    },
    db: {
      schema: 'public',
    },
    cookies: {
      // Let @supabase/ssr handle cookie operations automatically
      // It will use document.cookie in the browser
    },
  });
  
  // Your security interceptor is fine
  const originalRequest = client.rest.request;
  client.rest.request = async (options) => {
    options.headers = {
      ...options.headers,
      'X-Request-Origin': 'dashboard',
      'X-Client-Version': '1.0.0',
    };
    
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

export function clearClient() {
  client = null;
}