-- Add webhook_secret column to github_installations
ALTER TABLE github_installations
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

COMMENT ON COLUMN github_installations.webhook_secret IS 'User-managed shared secret used to validate SwiftConcur warning webhooks';
