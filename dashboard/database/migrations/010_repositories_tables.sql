-- Repository management tables for SwiftConcur CI
-- This supports the repository connection and monitoring functionality

-- Main repositories table
CREATE TABLE IF NOT EXISTS repos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    full_name TEXT NOT NULL,
    github_id INTEGER UNIQUE,
    github_owner TEXT NOT NULL,
    github_repo TEXT NOT NULL,
    is_private BOOLEAN DEFAULT TRUE,
    repo_url TEXT NOT NULL,
    webhook_id INTEGER,
    webhook_secret TEXT,
    tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User repository associations
CREATE TABLE IF NOT EXISTS user_repos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    repo_id TEXT REFERENCES repos(id) ON DELETE CASCADE NOT NULL,
    repo_name TEXT NOT NULL,
    repo_tier TEXT DEFAULT 'free' CHECK (repo_tier IN ('free', 'pro', 'enterprise')),
    repo_url TEXT NOT NULL,
    github_owner TEXT NOT NULL,
    github_repo TEXT NOT NULL,
    github_id INTEGER,
    is_private BOOLEAN DEFAULT TRUE,
    webhook_id INTEGER,
    access_token_hash TEXT, -- Hashed GitHub token for API access
    total_warnings INTEGER DEFAULT 0,
    critical_warnings INTEGER DEFAULT 0,
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, repo_id)
);

-- Repository statistics
CREATE TABLE IF NOT EXISTS repo_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id TEXT REFERENCES repos(id) ON DELETE CASCADE NOT NULL,
    total_runs INTEGER DEFAULT 0,
    total_warnings INTEGER DEFAULT 0,
    critical_warnings INTEGER DEFAULT 0,
    high_warnings INTEGER DEFAULT 0,
    medium_warnings INTEGER DEFAULT 0,
    low_warnings INTEGER DEFAULT 0,
    last_run_at TIMESTAMPTZ,
    trend_7d INTEGER DEFAULT 0, -- Warning count change over 7 days
    trend_30d INTEGER DEFAULT 0, -- Warning count change over 30 days
    avg_warnings_per_run DECIMAL(10,2) DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 0, -- Percentage of successful builds
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(repo_id)
);

-- Warning records for detailed tracking
CREATE TABLE IF NOT EXISTS warning_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id TEXT REFERENCES repos(id) ON DELETE CASCADE NOT NULL,
    run_id TEXT NOT NULL, -- GitHub Actions run ID or similar
    warning_type TEXT NOT NULL CHECK (warning_type IN (
        'actor_isolation', 'sendable', 'data_race', 'performance', 'other'
    )),
    severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    file_path TEXT NOT NULL,
    line_number INTEGER,
    column_number INTEGER,
    message TEXT NOT NULL,
    code_context TEXT, -- Surrounding code context
    suggestion TEXT, -- AI-generated suggestion for fixing
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'ignored')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Build/run logs
CREATE TABLE IF NOT EXISTS build_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id TEXT REFERENCES repos(id) ON DELETE CASCADE NOT NULL,
    run_id TEXT NOT NULL, -- External run identifier (GitHub Actions, etc.)
    trigger_event TEXT NOT NULL CHECK (trigger_event IN ('push', 'pull_request', 'manual', 'schedule')),
    branch TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    commit_message TEXT,
    author_email TEXT,
    status TEXT DEFAULT 'running' CHECK (status IN ('running', 'success', 'failure', 'cancelled')),
    warnings_found INTEGER DEFAULT 0,
    critical_warnings INTEGER DEFAULT 0,
    build_duration_seconds INTEGER,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    log_data JSONB, -- Structured build log data
    error_message TEXT
);

-- GitHub webhook events log
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id TEXT REFERENCES repos(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    action TEXT,
    github_delivery_id TEXT UNIQUE,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processing_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Enable RLS on all tables
ALTER TABLE repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE repo_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE warning_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE build_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- repos: Users can only see repos they have access to
CREATE POLICY "Users can view accessible repos" ON repos
    FOR SELECT USING (
        id IN (
            SELECT repo_id FROM user_repos 
            WHERE user_id = auth.uid()
        )
    );

-- user_repos: Users can only see their own repository associations
CREATE POLICY "Users can access own repo associations" ON user_repos
    FOR ALL USING (user_id = auth.uid());

-- repo_stats: Users can view stats for their repos
CREATE POLICY "Users can view repo stats" ON repo_stats
    FOR SELECT USING (
        repo_id IN (
            SELECT repo_id FROM user_repos 
            WHERE user_id = auth.uid()
        )
    );

-- warning_records: Users can view warnings for their repos
CREATE POLICY "Users can view repo warnings" ON warning_records
    FOR ALL USING (
        repo_id IN (
            SELECT repo_id FROM user_repos 
            WHERE user_id = auth.uid()
        )
    );

-- build_runs: Users can view build runs for their repos
CREATE POLICY "Users can view repo builds" ON build_runs
    FOR SELECT USING (
        repo_id IN (
            SELECT repo_id FROM user_repos 
            WHERE user_id = auth.uid()
        )
    );

-- webhook_events: Users can view webhook events for their repos
CREATE POLICY "Users can view repo webhooks" ON webhook_events
    FOR SELECT USING (
        repo_id IN (
            SELECT repo_id FROM user_repos 
            WHERE user_id = auth.uid()
        )
    );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_repos_github_id ON repos(github_id);
CREATE INDEX IF NOT EXISTS idx_repos_owner_repo ON repos(github_owner, github_repo);
CREATE INDEX IF NOT EXISTS idx_user_repos_user ON user_repos(user_id);
CREATE INDEX IF NOT EXISTS idx_user_repos_repo ON user_repos(repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_stats_repo ON repo_stats(repo_id);
CREATE INDEX IF NOT EXISTS idx_warning_records_repo ON warning_records(repo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warning_records_type ON warning_records(warning_type, severity);
CREATE INDEX IF NOT EXISTS idx_build_runs_repo ON build_runs(repo_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_build_runs_status ON build_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_repo ON webhook_events(repo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed, created_at);

-- Functions for repository management

-- Function to update repository statistics
CREATE OR REPLACE FUNCTION update_repo_stats(repo_id_param TEXT)
RETURNS VOID AS $$
DECLARE
    stats_record RECORD;
BEGIN
    -- Calculate current statistics
    SELECT 
        COUNT(*) as total_runs,
        COALESCE(SUM(warnings_found), 0) as total_warnings,
        COALESCE(SUM(critical_warnings), 0) as critical_warnings,
        MAX(completed_at) as last_run_at,
        COALESCE(AVG(warnings_found), 0) as avg_warnings_per_run,
        (COUNT(*) FILTER (WHERE status = 'success') * 100.0 / NULLIF(COUNT(*), 0)) as success_rate
    INTO stats_record
    FROM build_runs 
    WHERE repo_id = repo_id_param 
      AND status IN ('success', 'failure');
    
    -- Update or insert repo stats
    INSERT INTO repo_stats (
        repo_id,
        total_runs,
        total_warnings,
        critical_warnings,
        last_run_at,
        avg_warnings_per_run,
        success_rate,
        updated_at
    ) VALUES (
        repo_id_param,
        stats_record.total_runs,
        stats_record.total_warnings,
        stats_record.critical_warnings,
        stats_record.last_run_at,
        stats_record.avg_warnings_per_run,
        stats_record.success_rate,
        NOW()
    )
    ON CONFLICT (repo_id) DO UPDATE SET
        total_runs = EXCLUDED.total_runs,
        total_warnings = EXCLUDED.total_warnings,
        critical_warnings = EXCLUDED.critical_warnings,
        last_run_at = EXCLUDED.last_run_at,
        avg_warnings_per_run = EXCLUDED.avg_warnings_per_run,
        success_rate = EXCLUDED.success_rate,
        updated_at = NOW();
    
    -- Also update user_repos for quick dashboard access
    UPDATE user_repos SET
        total_warnings = stats_record.total_warnings,
        critical_warnings = stats_record.critical_warnings,
        last_run_at = stats_record.last_run_at,
        updated_at = NOW()
    WHERE repo_id = repo_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process webhook events
CREATE OR REPLACE FUNCTION process_webhook_event(event_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    webhook_record RECORD;
    repo_record RECORD;
BEGIN
    -- Get webhook event
    SELECT * INTO webhook_record
    FROM webhook_events
    WHERE id = event_id AND processed = FALSE;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Get repository info
    SELECT * INTO repo_record
    FROM repos
    WHERE id = webhook_record.repo_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Process based on event type
    CASE webhook_record.event_type
        WHEN 'workflow_run' THEN
            -- Handle GitHub Actions workflow completion
            IF webhook_record.payload->>'action' = 'completed' THEN
                -- Create or update build run record
                INSERT INTO build_runs (
                    repo_id,
                    run_id,
                    trigger_event,
                    branch,
                    commit_sha,
                    commit_message,
                    author_email,
                    status,
                    started_at,
                    completed_at
                ) VALUES (
                    webhook_record.repo_id,
                    webhook_record.payload->'workflow_run'->>'id',
                    webhook_record.payload->'workflow_run'->>'event',
                    webhook_record.payload->'workflow_run'->'head_branch',
                    webhook_record.payload->'workflow_run'->'head_sha',
                    webhook_record.payload->'workflow_run'->'head_commit'->>'message',
                    webhook_record.payload->'workflow_run'->'head_commit'->'author'->>'email',
                    CASE webhook_record.payload->'workflow_run'->>'conclusion'
                        WHEN 'success' THEN 'success'
                        WHEN 'failure' THEN 'failure'
                        WHEN 'cancelled' THEN 'cancelled'
                        ELSE 'failure'
                    END,
                    (webhook_record.payload->'workflow_run'->>'created_at')::timestamptz,
                    (webhook_record.payload->'workflow_run'->>'updated_at')::timestamptz
                )
                ON CONFLICT (repo_id, run_id) DO UPDATE SET
                    status = EXCLUDED.status,
                    completed_at = EXCLUDED.completed_at;
                    
                -- Update repository statistics
                PERFORM update_repo_stats(webhook_record.repo_id);
            END IF;
            
        WHEN 'push' THEN
            -- Handle push events (could trigger builds)
            NULL; -- Placeholder for push event handling
            
        WHEN 'pull_request' THEN
            -- Handle pull request events
            NULL; -- Placeholder for PR event handling
            
        ELSE
            -- Unknown event type
            NULL;
    END CASE;
    
    -- Mark event as processed
    UPDATE webhook_events SET
        processed = TRUE,
        processed_at = NOW()
    WHERE id = event_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically update updated_at timestamps
DROP TRIGGER IF EXISTS update_repos_updated_at ON repos;
CREATE TRIGGER update_repos_updated_at
    BEFORE UPDATE ON repos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_repos_updated_at ON user_repos;
CREATE TRIGGER update_user_repos_updated_at
    BEFORE UPDATE ON user_repos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_repo_stats_updated_at ON repo_stats;
CREATE TRIGGER update_repo_stats_updated_at
    BEFORE UPDATE ON repo_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();