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
  
  // Get user's repositories with security checks
  const { data: repos } = await supabase
    .from('user_repos')
    .select('repo_id, repos(id, name)')
    .eq('user_id', user.id)
    .order('repos(name)');
  
  // Transform for sidebar compatibility
  const repoList = repos?.map(r => ({
    id: r.repo_id,
    name: r.repos?.name || 'Unknown',
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