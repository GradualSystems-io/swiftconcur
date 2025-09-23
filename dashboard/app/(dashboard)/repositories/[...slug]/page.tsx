import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WebhookSecretManager } from '@/components/repositories/WebhookSecretManager';
import { createClient, verifyUser } from '@/lib/supabase/server';

interface RepositoryResponse {
  id: string;
  name: string | null;
  full_name: string | null;
  is_private: boolean;
  default_branch: string | null;
  language: string | null;
  stars_count: number | null;
  updated_at: string | null;
  github_repo_id: number | null;
  installation_id: number | null;
}

export default async function RepositoryDetailPage({
  params,
}: {
  params: { slug: string[] };
}) {
  const { user, error } = await verifyUser();

  if (error || !user) {
    notFound();
  }

  const slug = params.slug ?? [];
  if (slug.length === 0) {
    notFound();
  }

  const fullName = decodeURIComponent(slug.join('/'));
  const supabase = createClient();
  const selectColumns = `id, name, full_name, is_private, default_branch, language, stars_count, updated_at, github_repo_id, installation_id`;

  let repository: RepositoryResponse | null = null;
  let fetchError: { message: string; code: string } | null = null;

  const fullNameResult = await supabase
    .from('repositories')
    .select(selectColumns)
    .eq('user_id', user!.id)
    .eq('full_name', fullName)
    .maybeSingle<RepositoryResponse>();

  if (fullNameResult.error && fullNameResult.error.code !== 'PGRST116') {
    fetchError = fullNameResult.error;
  } else {
    repository = fullNameResult.data ?? null;
  }

  if (!repository && !fetchError) {
    const fallbackResult = await supabase
      .from('repositories')
      .select(selectColumns)
      .eq('user_id', user!.id)
      .eq('name', fullName)
      .maybeSingle<RepositoryResponse>();

    if (fallbackResult.error && fallbackResult.error.code !== 'PGRST116') {
      fetchError = fallbackResult.error;
    } else {
      repository = fallbackResult.data ?? null;
    }
  }

  if (fetchError) {
    console.error('Failed to load repository', {
      fullName,
      userId: user!.id,
      error: fetchError,
    });
    notFound();
  }

  if (!repository) {
    notFound();
  }

  const data = repository;

  let targetLogin: string | undefined;
  let secretConfigured = false;
  if (data.installation_id) {
    const { data: installationRow, error: installationError } = await supabase
      .from('github_installations')
      .select('target_login, webhook_secret')
      .eq('installation_id', data.installation_id)
      .single<{ target_login: string; webhook_secret: string | null }>();

    if (!installationError) {
      targetLogin = installationRow?.target_login;
      secretConfigured = Boolean(installationRow?.webhook_secret);
    } else if (installationError.code !== 'PGRST116') {
      throw new Error(`Failed to load installation details: ${installationError.message}`);
    }
  }

  const lastUpdated = data.updated_at ? new Date(data.updated_at).toLocaleString() : 'Unknown';
  const repoUrl = data.full_name ? `https://github.com/${data.full_name}` : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{data.full_name}</h1>
          <p className="text-muted-foreground">
            Managed by {targetLogin ?? 'GitHub App'}
          </p>
        </div>
        <div className="flex gap-2">
          {repoUrl && (
            <Button variant="outline" asChild>
              <Link href={repoUrl} target="_blank" rel="noopener noreferrer">
                View on GitHub
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href="/repositories">Back to Repositories</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Repository Overview</CardTitle>
          <CardDescription>Connection details extracted from the GitHub App</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <span className="text-sm text-muted-foreground">Visibility</span>
            <div className="mt-1">
              <Badge variant={data.is_private ? 'secondary' : 'default'}>
                {data.is_private ? 'Private' : 'Public'}
              </Badge>
            </div>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">Default Branch</span>
            <div className="mt-1 font-medium">{data.default_branch ?? 'main'}</div>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">Primary Language</span>
            <div className="mt-1 font-medium">{data.language ?? 'Unknown'}</div>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">Stars</span>
            <div className="mt-1 font-medium">{data.stars_count ?? 0}</div>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">GitHub Repo ID</span>
            <div className="mt-1 font-medium">{data.github_repo_id ?? '—'}</div>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">Last Synced</span>
            <div className="mt-1 font-medium">{lastUpdated}</div>
          </div>
        </CardContent>
      </Card>

      {data.installation_id && (
        <Card>
          <CardHeader>
            <CardTitle>Webhook Secret</CardTitle>
            <CardDescription>
              Store the shared secret used to sign SwiftConcur warning payloads from this installation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WebhookSecretManager
              installationId={data.installation_id}
              secretConfigured={secretConfigured}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
