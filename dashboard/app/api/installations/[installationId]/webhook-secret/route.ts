import { NextRequest, NextResponse } from 'next/server';
import { verifyUser, createServiceRoleClient } from '@/lib/supabase/server';

interface RequestBody {
  secret?: string;
}

function validateSecret(secret: string) {
  const trimmed = secret.trim();
  if (trimmed.length === 0) {
    throw new Error('Secret cannot be empty');
  }
  if (trimmed.length > 256) {
    throw new Error('Secret is too long (max 256 characters)');
  }
  return trimmed;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { installationId: string } }
) {
  const { user } = await verifyUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const installationId = Number(params.installationId);
  if (!Number.isFinite(installationId)) {
    return NextResponse.json({ error: 'Invalid installation id' }, { status: 400 });
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.secret) {
    return NextResponse.json({ error: 'Secret is required' }, { status: 400 });
  }

  let sanitizedSecret: string;
  try {
    sanitizedSecret = validateSecret(body.secret);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid secret';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: installation, error: fetchError } = await supabase
    .from('github_installations')
    .select('installation_id')
    .eq('installation_id', installationId)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !installation) {
    return NextResponse.json({ error: 'Installation not found' }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from('github_installations')
    .update({ webhook_secret: sanitizedSecret })
    .eq('installation_id', installationId);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to store webhook secret' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { installationId: string } }
) {
  const { user } = await verifyUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const installationId = Number(params.installationId);
  if (!Number.isFinite(installationId)) {
    return NextResponse.json({ error: 'Invalid installation id' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: installation, error: fetchError } = await supabase
    .from('github_installations')
    .select('installation_id')
    .eq('installation_id', installationId)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !installation) {
    return NextResponse.json({ error: 'Installation not found' }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from('github_installations')
    .update({ webhook_secret: null })
    .eq('installation_id', installationId);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to clear webhook secret' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
