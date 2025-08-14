	•	Supabase Row-Level Security (RLS): Enable RLS on the Supabase tables to enforce that users can only access their own data ￼. 
    
    Since the data is organized by organization/repo, implement RLS policies such that a given user (or API key) can only read/write rows belonging to their authorized org/repo. 
    
    Supabase allows attaching an auth JWT with requests – use that to map to Postgres roles. RLS acts as a defense in depth in case any bug allows a query it shouldn’t. 
    
    Test these policies thoroughly.