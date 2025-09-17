import { createClient, verifyUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Security: Verify user authentication
  const { user, error } = await verifyUser();
  
  if (error || !user) {
    redirect('/auth/login');
  }
  
  const supabase = createClient();
  
  // Fetch repositories for the sidebar navigation
  const { data: repoRows, error: repoError } = await supabase
    .from('repositories')
    .select('id, full_name, name')
    .eq('user_id', user.id)
    .order('full_name');

  if (repoError && repoError.code !== 'PGRST116') {
    console.error('Failed to load repositories for sidebar:', repoError.message);
  }

  const repoList = repoRows?.map((repo) => ({
    id: repo.id,
    name: repo.full_name || repo.name || 'Repository',
  })) || [];
  
  return (
    <div className="min-h-screen bg-background">
      <Header user={user} />
      <div className="flex h-[calc(100vh-3.5rem)]">
        <div className="hidden md:flex w-64 flex-shrink-0 border-r">
          <Sidebar repos={repoList} />
        </div>
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-6 max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
