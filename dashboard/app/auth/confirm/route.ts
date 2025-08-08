// app/auth/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  // Preserve all query params (code, token_hash, type, etc.)
  const params = url.searchParams.toString();
  return NextResponse.redirect(new URL(`/auth/callback?${params}`, url.origin));
}