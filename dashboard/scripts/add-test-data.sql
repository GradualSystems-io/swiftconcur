-- Add test data for development
-- Run this in your Supabase SQL editor after creating a user

-- First, get the user ID from the auth.users table
-- Replace 'YOUR_USER_EMAIL' with the actual email of your test user

-- Insert a test repository
INSERT INTO repos (id, name, tier) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 'ConcurDemo', 'free')
ON CONFLICT (name) DO NOTHING;

-- Link the repository to your user (replace YOUR_USER_ID with actual user ID)
-- You can find the user ID by running: SELECT id, email FROM auth.users;
INSERT INTO user_repos (user_id, repo_id, role) VALUES 
-- Replace this UUID with your actual user ID from auth.users table
('YOUR_USER_ID_HERE', '550e8400-e29b-41d4-a716-446655440000', 'owner')
ON CONFLICT (user_id, repo_id) DO NOTHING;

-- Add some test run data
INSERT INTO runs (id, repo_id, warnings_count, commit_sha, branch) VALUES 
('660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', 1, 'abc123def456789012345678901234567890abcd', 'main'),
('660e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', 3, 'def456abc789012345678901234567890abcdef1', 'main'),
('660e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440000', 0, '123456789abcdef012345678901234567890abc2', 'feature/test')
ON CONFLICT (id) DO NOTHING;

-- Add some test warnings
INSERT INTO warnings (run_id, file_path, line, column_number, type, severity, message, code_context) VALUES 
(
  '660e8400-e29b-41d4-a716-446655440001', 
  '/Users/test/ConcurDemo/Item.swift', 
  37, 
  24, 
  'actor_isolation', 
  'high',
  'Main actor-isolated property ''count'' can not be mutated from a Sendable closure; this is an error in the Swift 6 language mode',
  '{"before": ["    func doWork() {", "        DispatchQueue.global().async {"], "line": "            self.model.count += 1", "after": ["        }", "    }"]}'::jsonb
),
(
  '660e8400-e29b-41d4-a716-446655440002',
  '/Users/test/ConcurDemo/DataManager.swift',
  45,
  12,
  'sendable',
  'medium',
  'Type ''DataModel'' does not conform to the ''Sendable'' protocol',
  '{"before": ["class DataModel {", "    var items: [String] = []"], "line": "    func updateItems() {", "after": ["        // Update logic", "    }"]}'::jsonb
),
(
  '660e8400-e29b-41d4-a716-446655440002',
  '/Users/test/ConcurDemo/NetworkManager.swift',
  23,
  8,
  'data_race',
  'critical',
  'Data race detected: concurrent access to shared mutable state',
  '{"before": ["private var cache = [String: Data]()", ""], "line": "func fetchData() async {", "after": ["    cache[key] = data", "}"]}'::jsonb
),
(
  '660e8400-e29b-41d4-a716-446655440002',
  '/Users/test/ConcurDemo/ViewController.swift',
  12,
  16,
  'actor_isolation',
  'low',
  'Call to main actor-isolated instance method ''updateUI()'' in a context that may not be on the main actor',
  '{"before": ["Task {", "    let data = await fetchData()"], "line": "    updateUI(with: data)", "after": ["}", ""]}'::jsonb
);

-- Refresh the materialized view to include the new data
SELECT refresh_repo_warning_daily();

-- Verify the data was inserted correctly
SELECT 'Test data inserted successfully!' as message;
SELECT 
  r.name as repo_name,
  COUNT(ru.id) as run_count,
  SUM(ru.warnings_count) as total_warnings
FROM repos r
LEFT JOIN runs ru ON r.id = ru.repo_id
WHERE r.name = 'ConcurDemo'
GROUP BY r.id, r.name;