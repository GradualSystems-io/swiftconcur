Create a Next.js dashboard for SwiftConcur CI with:

1. Pages:
   - /dashboard - Overview of all repos
   - /repo/[id] - Individual repo trends
   - /settings - Integration management
   - /billing - Subscription status

2. Features:
   - Line charts showing warning trends over time
   - Branch comparison views
   - Warning type breakdown (pie charts)
   - PR impact analysis
   - Export reports (CSV/PDF)

3. Supabase integration:
   - Row-level security for multi-tenancy
   - Real-time updates via subscriptions
   - Efficient queries for large datasets

4. Authentication via GitHub OAuth
5. Responsive design with Tailwind CSS
6. Loading states and error boundaries