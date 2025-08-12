import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/audit';

interface ConnectRepoRequest {
  repo_url: string;
  repo_name: string;
  tier: 'free' | 'pro' | 'enterprise';
  owner: string;
  repo: string;
  access_token: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ConnectRepoRequest = await request.json();
    const { repo_url, repo_name, tier, owner, repo, access_token } = body;

    // Validate required fields
    if (!repo_url || !repo_name || !tier || !owner || !repo || !access_token) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = createClient();
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify GitHub repository access
    const repoCheckResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SwiftConcur-CI/1.0',
      },
    });

    if (!repoCheckResponse.ok) {
      const error = await repoCheckResponse.json().catch(() => ({}));
      return NextResponse.json(
        { 
          error: 'Unable to access repository',
          details: error.message || 'Check that the repository exists and your token has the required permissions'
        },
        { status: 400 }
      );
    }

    const repoData = await repoCheckResponse.json();

    // Check if repository is already connected by this user
    const { data: existingRepo } = await supabase
      .from('user_repos')
      .select('repo_id')
      .eq('user_id', user.id)
      .eq('repo_name', repo_name)
      .single();

    if (existingRepo) {
      return NextResponse.json(
        { error: 'Repository already connected' },
        { status: 409 }
      );
    }

    // Create webhook URL
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/github`;
    
    // Set up GitHub webhook
    const webhookResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'SwiftConcur-CI/1.0',
      },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: [
          'push',
          'pull_request',
          'workflow_run',
          'check_run',
          'check_suite'
        ],
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret: process.env.GITHUB_WEBHOOK_SECRET,
          insecure_ssl: '0',
        },
      }),
    });

    let webhookId = null;
    if (webhookResponse.ok) {
      const webhookData = await webhookResponse.json();
      webhookId = webhookData.id;
    } else {
      // Log webhook creation failure but continue
      console.warn('Failed to create GitHub webhook:', await webhookResponse.text());
    }

    // Generate a unique repo ID
    const repoId = `${owner}_${repo}_${Date.now()}`;

    // Store repository in database
    const { data: newRepo, error: insertError } = await supabase
      .from('user_repos')
      .insert({
        repo_id: repoId,
        user_id: user.id,
        repo_name: repo_name,
        repo_tier: tier,
        repo_url: repo_url,
        github_owner: owner,
        github_repo: repo,
        github_id: repoData.id,
        is_private: repoData.private,
        webhook_id: webhookId,
        access_token_hash: hashToken(access_token), // Store hash, not plaintext
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      
      // Try to clean up webhook if it was created
      if (webhookId) {
        await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks/${webhookId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'SwiftConcur-CI/1.0',
          },
        }).catch(console.error);
      }

      return NextResponse.json(
        { error: 'Failed to save repository configuration' },
        { status: 500 }
      );
    }

    // Audit log the repository connection
    await audit.auditLog({
      event: 'repository.connected',
      category: 'configuration',
      actor_id: user.id,
      resource_type: 'repository',
      resource_id: repoId,
      resource_name: repo_name,
      metadata: {
        repo_url,
        tier,
        github_owner: owner,
        github_repo: repo,
        is_private: repoData.private,
        webhook_created: Boolean(webhookId),
      },
    });

    return NextResponse.json({
      success: true,
      repository: {
        id: repoId,
        name: repo_name,
        tier,
        url: repo_url,
        webhook_configured: Boolean(webhookId),
      },
    });

  } catch (error) {
    console.error('Repository connection error:', error);
    
    // Audit the failed attempt
    await audit.auditLog({
      event: 'repository.connection_failed',
      category: 'configuration',
      success: false,
      error_message: error instanceof Error ? error.message : 'Unknown error',
      metadata: {
        repo_url: request.body?.repo_url,
      },
    });

    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// Simple token hashing for storage (don't store plaintext tokens)
function hashToken(token: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
}