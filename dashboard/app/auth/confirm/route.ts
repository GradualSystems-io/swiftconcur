// app/SwiftConcur/auth/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic'; // ensure this never gets statically optimized

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as
    | 'signup'
    | 'recovery'
    | 'email_change'
    | null;
  const next = url.searchParams.get('next') ?? '/SwiftConcur';

  const supabase = createClient();

  try {
    // New PKCE flow: ?code=...
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(
          new URL(
            `/SwiftConcur/auth/login?error=${encodeURIComponent(error.message)}`,
            req.url
          )
        );
      }
      // Success: session cookie has been set
      return NextResponse.redirect(new URL(next, req.url));
    }

    // Legacy flow: ?token_hash=...&type=...
    if (token_hash && type) {
      const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });
      if (error) {
        return NextResponse.redirect(
          new URL(
            `/SwiftConcur/auth/login?error=${encodeURIComponent(error.message)}`,
            req.url
          )
        );
      }

      // If Supabase returned a session, go to dashboard, otherwise bounce to login.
      if (data?.session) {
        return NextResponse.redirect(new URL('/SwiftConcur', req.url));
      }
      return NextResponse.redirect(
        new URL(
          '/SwiftConcur/auth/login?message=Email confirmed! Please sign in.',
          req.url
        )
      );
    }

    // Nothing to process – fallback
    return NextResponse.redirect(new URL('/SwiftConcur/auth/login', req.url));
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(
        `/SwiftConcur/auth/login?error=${encodeURIComponent(
          e?.message ?? 'confirmation_failed'
        )}`,
        req.url
      )
    );
  }
}