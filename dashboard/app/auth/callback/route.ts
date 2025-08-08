import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as 'signup' | 'recovery' | 'email_change' | null;

  const supabase = createClient();

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash });
      if (error) throw error;
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    // Nothing we can process
    return NextResponse.redirect(
      new URL('/auth/login?error=missing_code', req.url)
    );
  } catch (err: any) {
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(err?.message ?? 'auth_failed')}`, req.url)
    );
  }
}