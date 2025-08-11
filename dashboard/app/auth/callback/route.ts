import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as 'signup' | 'recovery' | 'email_change' | null;
  const next = url.searchParams.get('next') ?? '/dashboard';
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  console.log('Auth callback:', {
    hasCode: !!code,
    hasTokenHash: !!token_hash,
    type,
    error,
    errorDescription
  });

  // Handle Supabase errors
  if (error) {
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(errorDescription || error)}`, req.url)
    );
  }

  const supabase = createClient();

  try {
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (error) {
        console.error('Exchange failed:', error);
        throw error;
      }

      // Create response with redirect
      const response = NextResponse.redirect(new URL(next, req.url));
      
      // Verify session exists before redirect
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session after exchange!');
        throw new Error('Session creation failed');
      }
      
      console.log('Auth successful, redirecting to:', next);
      return response;
    }

    if (token_hash && type) {
      const { data, error } = await supabase.auth.verifyOtp({ 
        type, 
        token_hash 
      });
      
      if (error) {
        console.error('OTP verification failed:', error);
        throw error;
      }

      return NextResponse.redirect(new URL(next, req.url));
    }

    return NextResponse.redirect(
      new URL('/auth/login?error=missing_code', req.url)
    );
  } catch (err: any) {
    console.error('Auth error:', err);
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(err?.message ?? 'auth_failed')}`, req.url)
    );
  }
}