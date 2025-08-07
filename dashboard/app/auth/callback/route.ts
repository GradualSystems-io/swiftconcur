import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = request.nextUrl.searchParams.get('code') ?? request.nextUrl.searchParams.get('token');  // PKCE / magic-link
  const error_code = requestUrl.searchParams.get('error');
  const error_description = requestUrl.searchParams.get('error_description');

  // Handle errors from the callback
  if (error_code) {
    console.error('Auth callback error:', error_code, error_description);
    return NextResponse.redirect(
      new URL(`/SwiftConcur/auth/login?error=${encodeURIComponent(error_description || error_code)}`, requestUrl.origin)
    );
  }

  if (code) {
    const supabase = createClient();
    
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (error) {
        console.error('Auth callback error:', error);
        return NextResponse.redirect(
          new URL(`/SwiftConcur/auth/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
        );
      }

      // Log the response for debugging
      console.log('Auth callback data:', JSON.stringify(data, null, 2));

      // Session established successfully
      if (data?.user && data?.session) {
        console.log('User authenticated successfully:', data.user.email, 'Email confirmed:', data.user.email_confirmed_at);
        // User is fully authenticated, go to dashboard
        return NextResponse.redirect(new URL('/SwiftConcur', requestUrl.origin));
      } else if (data?.user && !data?.session) {
        console.log('User exists but no session:', data.user.email, 'Email confirmed:', data.user.email_confirmed_at);
        return NextResponse.redirect(
          new URL('/SwiftConcur/auth/login?message=Email confirmed! Please sign in with your password.', requestUrl.origin)
        );
      }
    } catch (error) {
      console.error('Auth callback exception:', error);
      return NextResponse.redirect(
        new URL('/SwiftConcur/auth/login?error=callback_error', requestUrl.origin)
      );
    }
  }

  // If no code or error, redirect to login
  return NextResponse.redirect(new URL('/SwiftConcur/auth/login', requestUrl.origin));
}