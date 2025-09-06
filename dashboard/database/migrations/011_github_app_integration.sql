-- GitHub App Integration Tables
-- Migration: 011_github_app_integration.sql

-- GitHub App installations (per user, single-org MVP)
CREATE TABLE github_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- GitHub App installation data
    installation_id BIGINT NOT NULL UNIQUE,
    target_type TEXT NOT NULL CHECK (target_type IN ('User', 'Organization')),
    target_id BIGINT NOT NULL,
    target_login TEXT NOT NULL,
    
    -- App permissions and metadata
    permissions JSONB DEFAULT '{}',
    app_id BIGINT NOT NULL DEFAULT 0,
    suspended_at TIMESTAMPTZ NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Business rule: One installation per user (single-org MVP)
    CONSTRAINT unique_user_installation UNIQUE (user_id)
);

-- Update existing repositories table to link with GitHub installations
ALTER TABLE repositories 
ADD COLUMN installation_id BIGINT REFERENCES github_installations(installation_id) ON DELETE SET NULL,
ADD COLUMN github_repo_id BIGINT,
ADD COLUMN default_branch TEXT DEFAULT 'main',
ADD COLUMN topics TEXT[] DEFAULT '{}',
ADD COLUMN language TEXT,
ADD COLUMN stars_count INTEGER DEFAULT 0,
ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create unique constraint for GitHub repo per installation
CREATE UNIQUE INDEX idx_repositories_github_repo 
ON repositories(installation_id, github_repo_id) 
WHERE installation_id IS NOT NULL AND github_repo_id IS NOT NULL;

-- Webhook events tracking
CREATE TABLE github_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id BIGINT REFERENCES github_installations(installation_id) ON DELETE CASCADE,
    
    -- GitHub webhook data
    github_delivery_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    action TEXT,
    
    -- Request data
    payload JSONB NOT NULL,
    signature_valid BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ NULL,
    
    -- Error handling
    processing_error TEXT NULL,
    retry_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_github_installations_user_id ON github_installations(user_id);
CREATE INDEX idx_github_installations_installation_id ON github_installations(installation_id);
CREATE INDEX idx_repositories_installation_id ON repositories(installation_id);
CREATE INDEX idx_webhook_events_installation_id ON github_webhook_events(installation_id);
CREATE INDEX idx_webhook_events_event_type ON github_webhook_events(event_type);
CREATE INDEX idx_webhook_events_created_at ON github_webhook_events(created_at);

-- Row Level Security (RLS) policies
ALTER TABLE github_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_webhook_events ENABLE ROW LEVEL SECURITY;

-- Users can only see their own installations
CREATE POLICY user_installations_policy ON github_installations
    FOR ALL USING (auth.uid() = user_id);

-- Webhook events are readable by installation owners
CREATE POLICY webhook_events_policy ON github_webhook_events
    FOR SELECT USING (
        installation_id IN (
            SELECT installation_id 
            FROM github_installations 
            WHERE user_id = auth.uid()
        )
    );

-- Update repositories RLS to include installation-based access
DROP POLICY IF EXISTS repositories_policy ON repositories;
CREATE POLICY repositories_policy ON repositories
    FOR ALL USING (
        auth.uid() = user_id OR 
        installation_id IN (
            SELECT installation_id 
            FROM github_installations 
            WHERE user_id = auth.uid()
        )
    );

-- Functions for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_github_installations_updated_at 
    BEFORE UPDATE ON github_installations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_repositories_updated_at 
    BEFORE UPDATE ON repositories 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Stored procedure to clean up old webhook events (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_events()
RETURNS void AS $$
BEGIN
    DELETE FROM github_webhook_events 
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE github_installations IS 'GitHub App installations linked to user accounts (single-org MVP)';
COMMENT ON TABLE github_webhook_events IS 'GitHub webhook events for audit trail and debugging';
COMMENT ON COLUMN github_installations.installation_id IS 'GitHub App installation ID from GitHub API';
COMMENT ON COLUMN github_installations.target_type IS 'Installation target: User or Organization';
COMMENT ON COLUMN repositories.installation_id IS 'Links repository to GitHub App installation';
COMMENT ON CONSTRAINT unique_user_installation ON github_installations IS 'Business rule: One installation per user for MVP';