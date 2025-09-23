-- Migration: 013_installation_webhook_secret.sql
-- Purpose: Allow per-installation webhook secrets managed via the dashboard UI

ALTER TABLE github_installations
ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

COMMENT ON COLUMN github_installations.webhook_secret IS 'User-managed secret used to verify SwiftConcur warning webhooks per installation';

CREATE INDEX IF NOT EXISTS idx_github_installations_webhook_secret
ON github_installations(installation_id)
WHERE webhook_secret IS NOT NULL;
