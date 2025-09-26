import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/github/app';
import { createServiceRoleClient } from '@/lib/supabase/server';

type BaselineRequest = {
  installation_id: number;
  repo_full_name: string;
  baseline_json?: unknown;
  baseline_hash?: string | null;
};

const SIGNATURE_HEADER = 'x-hub-signature-256';

function extractSignature(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const [algorithm, signature] = headerValue.split('=');
  if (!algorithm || algorithm.toLowerCase() !== 'sha256' || !signature) {
    return null;
  }
  return `sha256=${signature}`;
}

async function fetchInstallation(installationId: number) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('github_installations')
    .select('installation_id, user_id, webhook_secret')
    .eq('installation_id', installationId)
    .single<{ installation_id: number; user_id: string; webhook_secret: string | null }>();

  if (error || !data) {
    return null;
  }

  return data;
}

async function ensureRepositoryOwnership(installationId: number, repoFullName: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('repositories')
    .select('id')
    .eq('installation_id', installationId)
    .eq('full_name', repoFullName)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw new Error('Repository verification failed');
  }

  if (!data) {
    return false;
  }

  return true;
}

async function lookupBaseline(request: BaselineRequest) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('swiftconcur_baselines')
    .select('baseline_json, baseline_hash')
    .eq('installation_id', request.installation_id)
    .eq('repo_full_name', request.repo_full_name)
    .maybeSingle<{ baseline_json: unknown; baseline_hash: string | null }>();

  if (error && error.code !== 'PGRST116') {
    console.error('Baseline lookup failed', {
      installationId: request.installation_id,
      repoFullName: request.repo_full_name,
      error,
    });
    throw new Error('Baseline lookup failed');
  }

  if (!data) {
    return NextResponse.json({ exists: false }, { status: 204 });
  }

  return NextResponse.json(
    {
      baseline_json: data.baseline_json,
      baseline_hash: data.baseline_hash,
    },
    { status: 200 }
  );
}

async function upsertBaseline(request: BaselineRequest, userId: string) {
  if (typeof request.baseline_json === 'undefined') {
    return NextResponse.json({ error: 'baseline_json is required' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from('swiftconcur_baselines')
    .upsert(
      {
        installation_id: request.installation_id,
        repo_full_name: request.repo_full_name,
        baseline_json: request.baseline_json,
        baseline_hash: request.baseline_hash ?? null,
        user_id: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'installation_id,repo_full_name' }
    );

  if (error) {
    console.error('Failed to store baseline', {
      installationId: request.installation_id,
      repoFullName: request.repo_full_name,
      error,
    });
    throw new Error('Failed to store baseline');
  }

  return NextResponse.json({ stored: true }, { status: 200 });
}

async function readBaselineRequest(request: NextRequest): Promise<{ raw: string; payload: BaselineRequest } | null> {
  const rawBody = await request.text();

  try {
    const payload = JSON.parse(rawBody) as BaselineRequest;
    return { raw: rawBody, payload };
  } catch (error) {
    return null;
  }
}

function validatePayloadFields(payload: BaselineRequest) {
  if (!payload || typeof payload.installation_id !== 'number' || !payload.repo_full_name) {
    return false;
  }
  return true;
}

async function verifySignature(rawBody: string, request: NextRequest, secret: string) {
  const signatureHeader = extractSignature(request.headers.get(SIGNATURE_HEADER));
  if (!signatureHeader) {
    return { valid: false, response: NextResponse.json({ error: 'Missing or invalid signature header' }, { status: 401 }) };
  }

  const isValid = await verifyWebhookSignature(rawBody, signatureHeader, secret);
  if (!isValid) {
    return { valid: false, response: NextResponse.json({ error: 'Signature verification failed' }, { status: 401 }) };
  }

  return { valid: true };
}

export async function POST(request: NextRequest) {
  const parsed = await readBaselineRequest(request);
  if (!parsed || !validatePayloadFields(parsed.payload)) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const installation = await fetchInstallation(parsed.payload.installation_id);
  if (!installation) {
    return NextResponse.json({ error: 'Installation not found' }, { status: 404 });
  }

  if (!installation.webhook_secret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 403 });
  }

  const { valid, response } = await verifySignature(parsed.raw, request, installation.webhook_secret);
  if (!valid) {
    return response!;
  }

  let repositoryOwned = false;
  try {
    repositoryOwned = await ensureRepositoryOwnership(installation.installation_id, parsed.payload.repo_full_name);
  } catch (error) {
    return NextResponse.json({ error: 'Repository verification failed' }, { status: 500 });
  }

  if (!repositoryOwned) {
    return NextResponse.json({ error: 'Repository not linked to installation' }, { status: 404 });
  }

  return lookupBaseline(parsed.payload);
}

export async function PUT(request: NextRequest) {
  const parsed = await readBaselineRequest(request);
  if (!parsed || !validatePayloadFields(parsed.payload)) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const installation = await fetchInstallation(parsed.payload.installation_id);
  if (!installation) {
    return NextResponse.json({ error: 'Installation not found' }, { status: 404 });
  }

  if (!installation.webhook_secret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 403 });
  }

  const { valid, response } = await verifySignature(parsed.raw, request, installation.webhook_secret);
  if (!valid) {
    return response!;
  }

  let repositoryOwned = false;
  try {
    repositoryOwned = await ensureRepositoryOwnership(installation.installation_id, parsed.payload.repo_full_name);
  } catch (error) {
    return NextResponse.json({ error: 'Repository verification failed' }, { status: 500 });
  }

  if (!repositoryOwned) {
    return NextResponse.json({ error: 'Repository not linked to installation' }, { status: 404 });
  }

  try {
    return await upsertBaseline(parsed.payload, installation.user_id);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to store baseline' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return NextResponse.json({ allow: ['POST', 'PUT'] }, { status: 200 });
}
