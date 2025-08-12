'use client';

import { useState } from 'react';
import { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { Plus, Github, Trash2, Settings, Loader2, ExternalLink } from 'lucide-react';

interface RepositoryManagementProps {
  userRepos: any[];
  user: User;
}

export function RepositoryManagement({ userRepos, user }: RepositoryManagementProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [showAddRepo, setShowAddRepo] = useState(false);
  
  // Add repo form state
  const [repoUrl, setRepoUrl] = useState('');
  
  const supabase = createClient();

  const handleAddRepository = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Parse GitHub repository URL
      const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!urlMatch) {
        throw new Error('Invalid GitHub repository URL');
      }

      const [, owner, repo] = urlMatch;
      const fullName = `${owner}/${repo}`;

      // For now, just show success - actual GitHub integration would happen here
      setSuccess(`Repository ${fullName} will be added to your account. You'll receive setup instructions via email.`);
      setRepoUrl('');
      setShowAddRepo(false);
      
      // In a real implementation, you would:
      // 1. Validate the repository exists and user has access
      // 2. Create webhook in GitHub
      // 3. Add repository to database
      // 4. Send setup instructions
      
    } catch (err: any) {
      setError(err.message || 'Failed to add repository');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRepository = async (repoId: string, repoName: string) => {
    if (!confirm(`Are you sure you want to remove ${repoName}? This will delete all associated data.`)) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Remove user's access to the repository
      const { error } = await supabase
        .from('user_repos')
        .delete()
        .eq('user_id', user.id)
        .eq('repo_id', repoId);

      if (error) throw error;

      setSuccess(`Repository ${repoName} has been removed from your account.`);
      // Refresh the page to show updated list
      window.location.reload();
      
    } catch (err: any) {
      setError(err.message || 'Failed to remove repository');
    } finally {
      setLoading(false);
    }
  };

  const getTierBadgeVariant = (tier: string) => {
    switch (tier) {
      case 'enterprise':
        return 'default';
      case 'pro':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Add Repository Form */}
      {!showAddRepo ? (
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium">Connected Repositories</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {userRepos.length} repositories connected
            </p>
          </div>
          <Button onClick={() => setShowAddRepo(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Repository
          </Button>
        </div>
      ) : (
        <form onSubmit={handleAddRepository} className="space-y-4 p-4 border rounded-lg">
          <div>
            <h3 className="text-lg font-medium">Add New Repository</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Connect a GitHub repository to start monitoring Swift concurrency warnings
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="repoUrl">Repository URL</Label>
            <Input
              id="repoUrl"
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repository"
              required
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Enter the GitHub repository URL you want to monitor
            </p>
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Github className="h-4 w-4 mr-2" />
                  Add Repository
                </>
              )}
            </Button>
            
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setShowAddRepo(false);
                setRepoUrl('');
                setError('');
              }}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Repository List */}
      {userRepos.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <Github className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-semibold mb-2">No Repositories Connected</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Connect your first GitHub repository to start monitoring Swift concurrency warnings 
            and get AI-powered insights.
          </p>
          {!showAddRepo && (
            <Button onClick={() => setShowAddRepo(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Repository
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {userRepos.map((userRepo) => {
            const repo = userRepo.repos;
            if (!repo) return null;
            
            return (
              <div key={repo.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <Github className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{repo.name}</h4>
                      <Badge variant={getTierBadgeVariant(repo.tier)}>
                        {repo.tier}
                      </Badge>
                      {repo.is_private && (
                        <Badge variant="outline" className="text-xs">
                          Private
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {repo.full_name} • Role: {userRepo.role}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Connected {new Date(repo.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.open(`https://github.com/${repo.full_name}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  
                  {userRepo.role === 'owner' && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleRemoveRepository(repo.id, repo.name)}
                      disabled={loading}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Setup Instructions */}
      {userRepos.length > 0 && (
        <Alert>
          <Settings className="h-4 w-4" />
          <AlertDescription>
            <strong>Next steps:</strong> To complete the setup, add the SwiftConcur GitHub Action 
            to your repository workflows. Visit our{' '}
            <a href="/docs/setup" className="underline hover:no-underline" target="_blank">
              setup guide
            </a>{' '}
            for detailed instructions.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}