import { createServiceRoleClient } from '@/lib/supabase/server';

export async function getInstallationWebhookSecret(
  installationId: number
): Promise<string | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('github_installations')
    .select('webhook_secret')
    .eq('installation_id', installationId)
    .single<{ webhook_secret: string | null }>();

  if (error) {
    console.error('Failed to load webhook secret for installation', {
      installationId,
      error,
    });
    return null;
  }

  return data?.webhook_secret ?? null;
}

export async function getWebhookSecretForRepository(
  repoId?: number,
  repoFullName?: string
): Promise<{ secret: string | null; installationId: number | null }> {
  if (!repoId && !repoFullName) {
    return { secret: null, installationId: null };
  }

  const supabase = createServiceRoleClient();

  let query = supabase
    .from('repositories')
    .select('installation_id, github_installations!inner(webhook_secret)')
    .limit(1);

  if (repoId) {
    query = query.eq('github_repo_id', repoId);
  }

  if (repoFullName) {
    query = query.eq('full_name', repoFullName);
  }

  const { data, error } = await query.single<{
    installation_id: number | null;
    github_installations: { webhook_secret: string | null } | null;
  }>();

  if (error) {
    console.error('Failed to resolve repository webhook secret', {
      repoId,
      repoFullName,
      error,
    });
    return { secret: null, installationId: null };
  }

  if (!data?.installation_id) {
    return { secret: null, installationId: null };
  }

  return {
    secret: data.github_installations?.webhook_secret ?? null,
    installationId: data.installation_id,
  };
}
