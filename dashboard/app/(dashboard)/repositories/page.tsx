import { createClient, verifyUser } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GitBranch, Plus, ExternalLink, Settings, BookOpen } from 'lucide-react';
import Link from 'next/link';
import GitHubInstallation from '@/components/repositories/GitHubInstallation';

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
  
  // Fetch user's repositories from GitHub App integration
  const { data: repos } = await supabase
    .from('repositories')
    .select(`
      id,
      name,
      full_name,
      is_private,
      default_branch,
      language,
      stars_count,
      updated_at,
      github_installations(target_login)
    `)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

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
            <a href="#github-app">
              <Plus className="h-4 w-4 mr-2" />
              Add Repository
            </a>
          </Button>
        </div>
      </div>

      {/* GitHub App Integration */}
      <section id="github-app" className="scroll-mt-24">
        <GitHubInstallation />
      </section>

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
              <strong>Install the GitHub App:</strong> Use the button above to install SwiftConcur
              on your organization or personal account. This connects your repositories and
              provisions webhooks automatically.
            </li>
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
              <strong>Verify Webhook:</strong> The GitHub App configures the webhook for you—no
              manual tokens required.
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
