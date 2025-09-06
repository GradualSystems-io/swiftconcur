/**
 * GitHub repository sync endpoint
 * Manually triggers repository synchronization
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncUserRepositories } from '@/lib/github/auth';

export async function POST(request: NextRequest) {
  try {
    // Get current user
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Sync repositories
    const repositories = await syncUserRepositories(user.id);

    return NextResponse.json({
      success: true,
      count: repositories.length,
      repositories: repositories.map(repo => ({
        name: repo.name,
        fullName: repo.fullName,
        private: repo.private,
      })),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Repository sync error:', errorMessage);

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}