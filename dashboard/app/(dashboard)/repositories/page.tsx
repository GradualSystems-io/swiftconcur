import { createClient, verifyUser } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GitBranch, Plus, ExternalLink, Settings, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { ConnectRepositoryForm } from '@/components/repositories/ConnectRepositoryForm';

export default async function RepositoriesPage() {
  const { user, error } = await verifyUser();
  
  if (error || !user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">Authentication Required</h2>
          <p className="text-muted-foreground mt-2">Please sign in to continue</p>
        </div>
      </div>
    );
  }

  const supabase = createClient();
  
  // Fetch user's repositories
  const { data: repos } = await supabase
    .from('user_repos')
    .select(`
      repo_id,
      repo_name,
      repo_tier,
      total_warnings,
      critical_warnings,
      last_run_at,
      created_at
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Repositories</h1>
          <p className="text-muted-foreground">
            Manage your Swift repositories and monitor concurrency warnings
          </p>
        </div>
        
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/docs">
              <BookOpen className="h-4 w-4 mr-2" />
              Documentation
            </Link>
          </Button>
          <Button asChild>
            <a href="#connect">
              <Plus className="h-4 w-4 mr-2" />
              Add Repository
            </a>
          </Button>
        </div>
      </div>

      {/* Repository List */}
      {repos && repos.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {repos.map((repo) => (
            <Card key={repo.repo_id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4" />
                    <CardTitle className="text-lg">{repo.repo_name}</CardTitle>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    repo.repo_tier === 'enterprise' ? 'bg-purple-100 text-purple-800' :
                    repo.repo_tier === 'pro' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {repo.repo_tier}
                  </span>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total Warnings</p>
                    <p className="font-semibold">{repo.total_warnings || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Critical</p>
                    <p className="font-semibold text-red-600">{repo.critical_warnings || 0}</p>
                  </div>
                </div>
                
                <div className="text-sm">
                  <p className="text-muted-foreground">Last Run</p>
                  <p className="font-medium">
                    {repo.last_run_at 
                      ? new Date(repo.last_run_at).toLocaleDateString()
                      : 'Never'
                    }
                  </p>
                </div>
                
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/repositories/${repo.repo_id}`}>
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View
                    </Link>
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/repositories/${repo.repo_id}/settings`}>
                      <Settings className="h-3 w-3 mr-1" />
                      Settings
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <GitBranch className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-semibold mb-2">No Repositories Connected</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Start monitoring your Swift projects by connecting your first repository.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Connect Repository Section */}
      <Card id="connect">
        <CardHeader>
          <CardTitle>Connect a New Repository</CardTitle>
          <CardDescription>
            Add a GitHub repository to start monitoring Swift concurrency warnings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectRepositoryForm />
        </CardContent>
      </Card>

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Setup Instructions</CardTitle>
          <CardDescription>
            How to integrate SwiftConcur CI with your repository
          </CardDescription>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none">
          <ol className="space-y-4">
            <li>
              <strong>Add GitHub Action:</strong> Add the SwiftConcur CI action to your workflow file:
              <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded mt-2 text-sm overflow-x-auto">
{`- name: SwiftConcur CI
  uses: swiftconcur/swiftconcur-ci@v1
  with:
    scheme: 'YourAppScheme'
    workspace-path: 'YourApp.xcworkspace'
    threshold: 0`}
              </pre>
            </li>
            <li>
              <strong>Configure Webhook:</strong> We'll automatically set up a webhook to receive 
              build results from your repository.
            </li>
            <li>
              <strong>Start Building:</strong> Push code or create a pull request to trigger 
              the first Swift concurrency analysis.
            </li>
          </ol>
          
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/50 rounded-lg">
            <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
              Need Help?
            </h4>
            <p className="text-blue-700 dark:text-blue-300 text-sm">
              Check out our{' '}
              <Link href="/docs" className="underline hover:no-underline">
                complete documentation
              </Link>{' '}
              for detailed setup instructions and troubleshooting guides.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}