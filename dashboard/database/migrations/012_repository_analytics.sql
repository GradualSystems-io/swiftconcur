-- Repository analytics tables for SwiftConcur
-- Stores structured results from warning runs and daily aggregates

CREATE TABLE IF NOT EXISTS warning_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    commit_sha TEXT,
    branch TEXT,
    pull_request INTEGER,
    total_warnings INTEGER DEFAULT 0,
    new_warnings INTEGER DEFAULT 0,
    fixed_warnings INTEGER DEFAULT 0,
    critical_warnings INTEGER DEFAULT 0,
    build_time_seconds INTEGER,
    report_url TEXT,
    analysis_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS warnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES warning_runs(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    file_path TEXT NOT NULL,
    line_number INTEGER,
    column_number INTEGER,
    message TEXT NOT NULL,
    code_context JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS repository_warning_daily (
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    run_count INTEGER DEFAULT 0,
    total_warnings INTEGER DEFAULT 0,
    new_warnings INTEGER DEFAULT 0,
    fixed_warnings INTEGER DEFAULT 0,
    critical_warnings INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (repository_id, date)
);

CREATE INDEX IF NOT EXISTS idx_warning_runs_repository ON warning_runs(repository_id);
CREATE INDEX IF NOT EXISTS idx_warning_runs_created_at ON warning_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_warnings_run_id ON warnings(run_id);
CREATE INDEX IF NOT EXISTS idx_repository_warning_daily_date ON repository_warning_daily(date);

ALTER TABLE warning_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE repository_warning_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own warning_runs" ON warning_runs
    FOR SELECT USING (
        repository_id IN (
            SELECT id FROM repositories WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can read own warnings" ON warnings
    FOR SELECT USING (
        run_id IN (
            SELECT id FROM warning_runs WHERE repository_id IN (
                SELECT id FROM repositories WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can read own repository_warning_daily" ON repository_warning_daily
    FOR SELECT USING (
        repository_id IN (
            SELECT id FROM repositories WHERE user_id = auth.uid()
        )
    );

CREATE OR REPLACE FUNCTION touch_repository_warning_daily()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS repository_warning_daily_updated_at ON repository_warning_daily;
CREATE TRIGGER repository_warning_daily_updated_at
    BEFORE UPDATE ON repository_warning_daily
    FOR EACH ROW
    EXECUTE FUNCTION touch_repository_warning_daily();
