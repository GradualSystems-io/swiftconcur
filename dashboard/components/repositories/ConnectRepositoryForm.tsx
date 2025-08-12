'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import { GitBranch, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface ConnectRepositoryFormProps {
  onSuccess?: () => void;
}

export function ConnectRepositoryForm({ onSuccess }: ConnectRepositoryFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'connecting' | 'success'>('form');
  const [formData, setFormData] = useState({
    repoUrl: '',
    repoName: '',
    tier: 'free' as 'free' | 'pro' | 'enterprise',
    accessToken: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStep('connecting');

    try {
      // Extract owner/repo from GitHub URL
      const urlMatch = formData.repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!urlMatch) {
        throw new Error('Invalid GitHub URL format');
      }

      const [, owner, repo] = urlMatch;
      const repoName = formData.repoName || `${owner}/${repo}`;

      const response = await fetch('/api/repositories/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repo_url: formData.repoUrl,
          repo_name: repoName,
          tier: formData.tier,
          owner,
          repo,
          access_token: formData.accessToken,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to connect repository');
      }

      const result = await response.json();
      
      setStep('success');
      toast({
        title: 'Repository Connected!',
        description: `${repoName} has been successfully connected to SwiftConcur CI.`,
      });

      // Reset form
      setTimeout(() => {
        setFormData({
          repoUrl: '',
          repoName: '',
          tier: 'free',
          accessToken: '',
        });
        setStep('form');
        onSuccess?.();
      }, 2000);

    } catch (error) {
      console.error('Connection error:', error);
      setStep('form');
      toast({
        title: 'Connection Failed',
        description: error instanceof Error ? error.message : 'Failed to connect repository',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (step === 'connecting') {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Connecting Repository</h3>
          <p className="text-muted-foreground">
            Setting up webhook and configuring access...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (step === 'success') {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Repository Connected!</h3>
          <p className="text-muted-foreground">
            Your repository is now ready for Swift concurrency monitoring.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Repository URL */}
      <div className="space-y-2">
        <Label htmlFor="repoUrl">GitHub Repository URL</Label>
        <Input
          id="repoUrl"
          type="url"
          placeholder="https://github.com/username/repository"
          value={formData.repoUrl}
          onChange={(e) => setFormData(prev => ({ ...prev, repoUrl: e.target.value }))}
          required
        />
        <p className="text-xs text-muted-foreground">
          Enter the full GitHub URL for your Swift repository
        </p>
      </div>

      {/* Repository Name (optional override) */}
      <div className="space-y-2">
        <Label htmlFor="repoName">Display Name (Optional)</Label>
        <Input
          id="repoName"
          placeholder="My Swift App"
          value={formData.repoName}
          onChange={(e) => setFormData(prev => ({ ...prev, repoName: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground">
          Custom name for this repository in your dashboard
        </p>
      </div>

      {/* Tier Selection */}
      <div className="space-y-2">
        <Label htmlFor="tier">Plan Tier</Label>
        <Select
          value={formData.tier}
          onValueChange={(value: 'free' | 'pro' | 'enterprise') => 
            setFormData(prev => ({ ...prev, tier: value }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="free">
              Free - Public repositories, basic monitoring
            </SelectItem>
            <SelectItem value="pro">
              Pro - Private repositories, advanced features
            </SelectItem>
            <SelectItem value="enterprise">
              Enterprise - Unlimited usage, priority support
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* GitHub Access Token */}
      <div className="space-y-2">
        <Label htmlFor="accessToken">GitHub Personal Access Token</Label>
        <Input
          id="accessToken"
          type="password"
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          value={formData.accessToken}
          onChange={(e) => setFormData(prev => ({ ...prev, accessToken: e.target.value }))}
          required
        />
        <p className="text-xs text-muted-foreground">
          Required to access repository and set up webhooks. 
          <a 
            href="https://github.com/settings/tokens/new?scopes=repo,admin:repo_hook" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline ml-1"
          >
            Create token →
          </a>
        </p>
      </div>

      {/* Required Permissions Alert */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Required token permissions:</strong> repo (Full control of private repositories) 
          and admin:repo_hook (Full control of repository hooks)
        </AlertDescription>
      </Alert>

      {/* Submit Button */}
      <Button 
        type="submit" 
        disabled={loading || !formData.repoUrl || !formData.accessToken}
        className="w-full"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <GitBranch className="h-4 w-4 mr-2" />
            Connect Repository
          </>
        )}
      </Button>

      {/* Help Section */}
      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <h4 className="font-semibold mb-2">Need Help?</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Make sure your repository contains Swift code</li>
          <li>• The token needs repo and webhook permissions</li>
          <li>• Private repositories require a Pro or Enterprise plan</li>
          <li>• Contact support if you encounter issues</li>
        </ul>
      </div>
    </form>
  );
}