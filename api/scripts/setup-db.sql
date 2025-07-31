-- SwiftConcur API Database Schema
-- Run this script in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Repositories table
CREATE TABLE IF NOT EXISTS repos(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  tier text DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Runs table
CREATE TABLE IF NOT EXISTS runs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid REFERENCES repos(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  warnings_count int NOT NULL DEFAULT 0 CHECK (warnings_count >= 0),
  ai_summary text,
  r2_object_key text,
  commit_sha text NOT NULL CHECK (commit_sha ~ '^[a-f0-9]{7,40}$'),
  branch text NOT NULL CHECK (length(branch) > 0),
  pull_request int CHECK (pull_request > 0)
);

-- Warnings table
CREATE TABLE IF NOT EXISTS warnings(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES runs(id) ON DELETE CASCADE NOT NULL,
  file_path text NOT NULL CHECK (length(file_path) > 0),
  line int NOT NULL CHECK (line > 0),
  column int CHECK (column > 0),
  type text NOT NULL CHECK (type IN ('actor_isolation', 'sendable', 'data_race', 'performance')),
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  message text NOT NULL CHECK (length(message) > 0),
  code_context jsonb,
  suggested_fix text
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_warnings_run_id ON warnings(run_id);
CREATE INDEX IF NOT EXISTS idx_warnings_type_severity ON warnings(type, severity);
CREATE INDEX IF NOT EXISTS idx_runs_repo_created ON runs(repo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_commit_sha ON runs(commit_sha);
CREATE INDEX IF NOT EXISTS idx_runs_branch ON runs(branch);

-- Materialized view for trend queries
DROP MATERIALIZED VIEW IF EXISTS repo_warning_daily;
CREATE MATERIALIZED VIEW repo_warning_daily AS
SELECT 
  repo_id,
  DATE(created_at) as date,
  COUNT(DISTINCT run_id) as run_count,
  SUM(warnings_count) as total_warnings,
  AVG(warnings_count::numeric) as avg_warnings
FROM runs
GROUP BY repo_id, DATE(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repo_warning_daily_unique ON repo_warning_daily(repo_id, date);

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_repo_warning_daily()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY repo_warning_daily;
END;
$$;

-- Function to get repository statistics
CREATE OR REPLACE FUNCTION get_repo_stats(repo_uuid uuid)
RETURNS TABLE(
  total_runs bigint,
  total_warnings bigint,
  avg_warnings numeric,
  latest_run timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::bigint as total_runs,
    COALESCE(SUM(warnings_count), 0)::bigint as total_warnings,
    COALESCE(AVG(warnings_count::numeric), 0) as avg_warnings,
    MAX(created_at) as latest_run
  FROM runs
  WHERE repo_id = repo_uuid;
END;
$$;

-- Function to cleanup old runs for free tier
CREATE OR REPLACE FUNCTION cleanup_old_runs(repo_uuid uuid, keep_count int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count int;
BEGIN
  -- Delete runs older than keep_count, keeping the most recent ones
  WITH old_runs AS (
    SELECT id
    FROM runs
    WHERE repo_id = repo_uuid
    ORDER BY created_at DESC
    OFFSET keep_count
  )
  DELETE FROM runs
  WHERE id IN (SELECT id FROM old_runs);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_repos_updated_at ON repos;
CREATE TRIGGER update_repos_updated_at
  BEFORE UPDATE ON repos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE warnings ENABLE ROW LEVEL SECURITY;

-- Policy for service role (API access)
DROP POLICY IF EXISTS "Service role can access all repos" ON repos;
CREATE POLICY "Service role can access all repos" ON repos
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can access all runs" ON runs;
CREATE POLICY "Service role can access all runs" ON runs
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can access all warnings" ON warnings;
CREATE POLICY "Service role can access all warnings" ON warnings
  FOR ALL USING (auth.role() = 'service_role');

-- Insert sample data for testing (optional)
-- Uncomment the following lines if you want sample data

/*
INSERT INTO repos (id, name, tier) VALUES
  ('123e4567-e89b-12d3-a456-426614174000', 'sample-repo', 'free'),
  ('456e7890-e89b-12d3-a456-426614174001', 'pro-repo', 'pro')
ON CONFLICT (name) DO NOTHING;

INSERT INTO runs (id, repo_id, warnings_count, commit_sha, branch) VALUES
  ('987fcdeb-51a2-43d8-b765-789012345678', '123e4567-e89b-12d3-a456-426614174000', 2, 'abc123def456', 'main'),
  ('654321fe-dcba-9876-5432-109876543210', '456e7890-e89b-12d3-a456-426614174001', 0, 'def456abc789', 'feature/test')
ON CONFLICT (id) DO NOTHING;
*/

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Refresh the materialized view initially
SELECT refresh_repo_warning_daily();

-- Show summary
DO $$
BEGIN
  RAISE NOTICE 'SwiftConcur database schema setup completed successfully!';
  RAISE NOTICE 'Tables created: repos, runs, warnings';
  RAISE NOTICE 'Materialized view created: repo_warning_daily';
  RAISE NOTICE 'Functions created: get_repo_stats, cleanup_old_runs, refresh_repo_warning_daily';
  RAISE NOTICE 'RLS policies enabled for service_role access';
END;
$$;