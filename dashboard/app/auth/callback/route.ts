import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
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

      // Session established successfully
      if (data?.user) {
        return NextResponse.redirect(new URL('/SwiftConcur', requestUrl.origin));
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