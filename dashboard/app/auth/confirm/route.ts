// app/SwiftConcur/auth/confirm/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const searchParams = url.searchParams

  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'signup' | 'recovery' | 'email_change' | null

  // Optional post-login redirect, kept strict to your app subpath to avoid open redirects
  const requestedNext = searchParams.get('next')
  const safeNext =
    requestedNext && requestedNext.startsWith('/SwiftConcur')
      ? requestedNext
      : '/SwiftConcur/dashboard'

  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, url.origin))
  const loginWithError = (msg: string) =>
    redirectTo(`/SwiftConcur/auth/login?error=${encodeURIComponent(msg)}`)

  const supabase = createClient()

  try {
    // 1) Preferred: PKCE / code exchange flow
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) return loginWithError(error.message)

      // Touch the user to ensure cookies are written in SSR contexts
      await supabase.auth.getUser()
      return redirectTo(safeNext)
    }

    // 2) Back-compat: token_hash + type (verifyOtp)
    if (token_hash && type) {
      const { data, error } = await supabase.auth.verifyOtp({ type, token_hash })
      if (error) return loginWithError(error.message)

      if (type === 'signup') {
        // If session exists, they're logged in; otherwise prompt to log in
        if (data?.session) return redirectTo(safeNext)
        return redirectTo(
          '/SwiftConcur/auth/login?message=' +
            encodeURIComponent('Email confirmed! Please sign in to continue.')
        )
      }

      // For recovery/email_change just send them to app home or next
      return redirectTo(safeNext)
    }

    // No recognizable params → send to login
    return redirectTo('/SwiftConcur/auth/login')
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'confirmation_failed'
    return loginWithError(message)
  }
}