-- Get user ID for test data setup
-- Run this first to find your user ID, then use it in add-test-data.sql

SELECT 
  id, 
  email, 
  created_at,
  email_confirmed_at
FROM auth.users 
ORDER BY created_at DESC;

-- Copy the 'id' from the result above and replace 'YOUR_USER_ID_HERE' 
-- in the add-test-data.sql file