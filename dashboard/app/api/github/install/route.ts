/**
 * GitHub App installation callback handler
 * Links GitHub App installation to user account
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { linkGitHubUser } from '@/lib/github/auth';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const installationId = searchParams.get('installation_id');
  const setupAction = searchParams.get('setup_action');

  // Redirect URL for different scenarios
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const dashboardUrl = `${baseUrl}/repositories`;
  const errorUrl = `${baseUrl}/repositories?error=installation_failed`;

  try {
    // Validate installation ID
    if (!installationId || isNaN(parseInt(installationId))) {
      console.error('Invalid or missing installation_id');
      return NextResponse.redirect(errorUrl);
    }

    // Get current user session
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('User not authenticated:', authError?.message);
      // Redirect to login with return URL
      const loginUrl = `${baseUrl}/auth/login?redirect=${encodeURIComponent(request.url)}`;
      return NextResponse.redirect(loginUrl);
    }

    const installationIdNum = parseInt(installationId);

    if (setupAction === 'install') {
      // New installation - link to user account
      console.log(`Linking installation ${installationIdNum} to user ${user.id}`);

      // We don't have GitHub user ID yet, so we'll use 0 as placeholder
      // The actual GitHub user ID will be populated from the installation data
      await linkGitHubUser(user.id, 0, installationIdNum);

      // Redirect to dashboard with success message
      return NextResponse.redirect(`${dashboardUrl}?installation=success`);

    } else if (setupAction === 'update') {
      // Installation updated - refresh repository sync
      console.log(`Updating installation ${installationIdNum} for user ${user.id}`);

      // Re-sync repositories to pick up changes
      const { syncUserRepositories } = await import('@/lib/github/auth');
      await syncUserRepositories(user.id);

      // Redirect to dashboard with update message
      return NextResponse.redirect(`${dashboardUrl}?installation=updated`);

    } else {
      // Unknown setup action
      console.warn(`Unknown setup_action: ${setupAction}`);
      return NextResponse.redirect(dashboardUrl);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Installation callback error:', errorMessage);

    // Redirect with error message
    const errorParam = encodeURIComponent(errorMessage);
    return NextResponse.redirect(`${errorUrl}&message=${errorParam}`);
  }
}

// Handle POST requests (not typically used but good to have)
export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'POST not supported for installation callback' },
    { status: 405 }
  );
}