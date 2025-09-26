-- Create table for storing SwiftConcur baselines per installation/repository
CREATE TABLE IF NOT EXISTS swiftconcur_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    installation_id BIGINT NOT NULL,
    repo_full_name TEXT NOT NULL,
    baseline_json JSONB NOT NULL,
    baseline_hash TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS swiftconcur_baselines_installation_repo_idx
    ON swiftconcur_baselines(installation_id, repo_full_name);

ALTER TABLE swiftconcur_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role access only" ON swiftconcur_baselines
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
