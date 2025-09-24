"use client";

import { FormEvent, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';

interface WebhookSecretManagerProps {
  installationId: number | null;
  secretConfigured: boolean;
}

type StatusState =
  | { state: 'idle'; message?: string }
  | { state: 'saving'; message?: string }
  | { state: 'saved'; message: string }
  | { state: 'error'; message: string }
  | { state: 'cleared'; message: string };

export function WebhookSecretManager({ installationId, secretConfigured }: WebhookSecretManagerProps) {
  const [secretValue, setSecretValue] = useState('');
  const [status, setStatus] = useState<StatusState>({ state: 'idle' });
  const [configured, setConfigured] = useState(secretConfigured);

  const isSaving = status.state === 'saving';

  const apiBase = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
    if (!base) return '';
    return base.endsWith('/') ? base.slice(0, -1) : base;
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!installationId) {
      setStatus({ state: 'error', message: 'Installation is not linked; connect the GitHub App before saving the secret.' });
      return;
    }

    if (!secretValue.trim()) {
      setStatus({ state: 'error', message: 'Enter the secret value from your GitHub repository settings.' });
      return;
    }

    setStatus({ state: 'saving' });

    try {
      const response = await fetch(`${apiBase}/api/installations/${installationId}/webhook-secret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: secretValue }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message = data?.error || 'Failed to store webhook secret.';
        setStatus({ state: 'error', message });
        return;
      }

      setSecretValue('');
      setConfigured(true);
      setStatus({ state: 'saved', message: 'Webhook secret saved. Add the same value to your GitHub Actions secrets.' });
    } catch (error) {
      console.error('Failed to save webhook secret', error);
      setStatus({ state: 'error', message: 'Unexpected error saving webhook secret.' });
    }
  }

  async function handleClear() {
    setStatus({ state: 'saving' });

    if (!installationId) {
      setStatus({ state: 'error', message: 'Installation is not linked; connect the GitHub App before clearing the secret.' });
      return;
    }

    try {
      const response = await fetch(`${apiBase}/api/installations/${installationId}/webhook-secret`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message = data?.error || 'Failed to clear webhook secret.';
        setStatus({ state: 'error', message });
        return;
      }

      setConfigured(false);
      setStatus({ state: 'cleared', message: 'Webhook secret removed. Unsigned payloads will be accepted.' });
    } catch (error) {
      console.error('Failed to clear webhook secret', error);
      setStatus({ state: 'error', message: 'Unexpected error clearing webhook secret.' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-dashed border-muted-foreground/40 p-4">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Webhook signing</p>
            <p>
              Paste the <code className="rounded bg-muted px-1 py-0.5">GH_WEBHOOK_SECRET</code> value you added to your repository secrets. We use it to
              validate incoming SwiftConcur warning webhooks.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="webhook-secret">Webhook secret</Label>
          <Input
            id="webhook-secret"
            type="text"
            placeholder="e.g. 8f2c4b..."
            value={secretValue}
            onChange={event => setSecretValue(event.target.value)}
            disabled={isSaving}
            autoComplete="off"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Save secret
          </Button>
          <Button type="button" variant="outline" disabled={isSaving || !configured} onClick={handleClear}>
            <XCircle className="mr-2 h-4 w-4" />
            Remove secret
          </Button>
          <span className="text-sm text-muted-foreground">{configured ? 'Secret configured' : 'Secret not set yet'}</span>
        </div>
      </form>

      {status.state !== 'idle' && status.message && (
        <Alert variant={status.state === 'error' ? 'destructive' : 'default'}>
          <AlertDescription className="flex items-center gap-2">
            {status.state === 'error' && <XCircle className="h-4 w-4" />}
            {status.state === 'saved' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            {status.state === 'cleared' && <Info className="h-4 w-4" />}
            <span>{status.message}</span>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
