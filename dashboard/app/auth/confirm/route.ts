import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as 'signup' | 'recovery' | 'email_change' | null;
  const next = searchParams.get('next') ?? '/';

  console.log('Auth confirm request:', { token_hash: !!token_hash, type, next });

  if (token_hash && type) {
    const supabase = createClient();

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        type,
        token_hash,
      });

      if (error) {
        console.error('Auth confirmation error:', error);
        return NextResponse.redirect(
          new URL(`/SwiftConcur/auth/login?error=${encodeURIComponent(error.message)}`, request.url)
        );
      }

      console.log('Email confirmation successful:', data?.user?.email, 'Session:', !!data?.session);
      
      // For signup confirmations, check if we have a session
      if (type === 'signup') {
        if (data?.session) {
          // User is now logged in, redirect to dashboard
          return NextResponse.redirect(new URL('/SwiftConcur', request.url));
        } else {
          // No session, redirect to login with success message
          return NextResponse.redirect(
            new URL('/SwiftConcur/auth/login?message=Email confirmed! Please sign in with your password.', request.url)
          );
        }
      }
    } catch (error) {
      console.error('Auth confirmation exception:', error);
      return NextResponse.redirect(
        new URL('/SwiftConcur/auth/login?error=confirmation_failed', request.url)
      );
    }
  }

  // If no token or type, redirect to login
  return NextResponse.redirect(new URL('/SwiftConcur/auth/login', request.url));
}