'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { Plus, Copy, Trash2, Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react';

interface ApiTokenManagementProps {
  tokens: any[];
  userRepos: any[];
}

export function ApiTokenManagement({ tokens, userRepos }: ApiTokenManagementProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showToken, setShowToken] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string>('');
  
  // Form state
  const [tokenName, setTokenName] = useState('');
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [expiresIn, setExpiresIn] = useState('30'); // days

  const supabase = createClient();

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (!tokenName.trim()) {
        throw new Error('Token name is required');
      }

      // Generate a random token (in production, this would be done on the server)
      const token = 'scc_' + Math.random().toString(36).substring(2, 15) + 
                           Math.random().toString(36).substring(2, 15) + 
                           Math.random().toString(36).substring(2, 15);

      // Calculate expiration date
      const expiresAt = expiresIn === 'never' ? null : 
        new Date(Date.now() + parseInt(expiresIn) * 24 * 60 * 60 * 1000).toISOString();

      // In a real implementation, you would:
      // 1. Hash the token for storage
      // 2. Create database entry
      // 3. Associate with selected repositories
      
      setNewToken(token);
      setSuccess(`API token "${tokenName}" created successfully! Make sure to copy it now - you won't be able to see it again.`);
      setTokenName('');
      setSelectedRepos([]);
      setExpiresIn('30');
      setShowCreateForm(false);
      
    } catch (err: any) {
      setError(err.message || 'Failed to create token');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteToken = async (tokenId: string, tokenName: string) => {
    if (!confirm(`Are you sure you want to delete the token "${tokenName}"? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { error } = await supabase
        .from('api_tokens')
        .delete()
        .eq('id', tokenId);

      if (error) throw error;

      setSuccess(`Token "${tokenName}" has been deleted.`);
      // Refresh the page to show updated list
      window.location.reload();
      
    } catch (err: any) {
      setError(err.message || 'Failed to delete token');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setSuccess('Token copied to clipboard!');
      setTimeout(() => setSuccess(''), 3000);
    }).catch(() => {
      setError('Failed to copy token');
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isExpired = (dateString: string | null) => {
    if (!dateString) return false;
    return new Date(dateString) < new Date();
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

      {/* New Token Display */}
      {newToken && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-3">
              <p><strong>Your new API token:</strong></p>
              <div className="flex items-center gap-2 bg-muted p-2 rounded font-mono text-sm">
                <span className="flex-1">{newToken}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(newToken)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm">
                <strong>Important:</strong> Store this token securely. You won't be able to see it again.
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Create Token Form */}
      {!showCreateForm ? (
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium">API Tokens</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {tokens.length} tokens configured
            </p>
          </div>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Token
          </Button>
        </div>
      ) : (
        <form onSubmit={handleCreateToken} className="space-y-4 p-4 border rounded-lg">
          <div>
            <h3 className="text-lg font-medium">Create New API Token</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Generate a token for programmatic access to SwiftConcur
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="tokenName">Token Name</Label>
            <Input
              id="tokenName"
              type="text"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              placeholder="e.g., CI/CD Pipeline, Development"
              required
              disabled={loading}
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              Choose a descriptive name to remember what this token is used for
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiresIn">Expiration</Label>
            <select
              id="expiresIn"
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
              <option value="never">Never expires</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label>Repository Access</Label>
            <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2">
              {userRepos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No repositories available</p>
              ) : (
                userRepos.map((userRepo) => {
                  const repo = userRepo.repos;
                  if (!repo) return null;
                  
                  return (
                    <div key={repo.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`repo-${repo.id}`}
                        checked={selectedRepos.includes(repo.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRepos([...selectedRepos, repo.id]);
                          } else {
                            setSelectedRepos(selectedRepos.filter(id => id !== repo.id));
                          }
                        }}
                        className="h-4 w-4 rounded border-input"
                      />
                      <Label htmlFor={`repo-${repo.id}`} className="text-sm">
                        {repo.name}
                      </Label>
                    </div>
                  );
                })
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Select which repositories this token can access
            </p>
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Token
                </>
              )}
            </Button>
            
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setShowCreateForm(false);
                setTokenName('');
                setSelectedRepos([]);
                setExpiresIn('30');
                setError('');
              }}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Token List */}
      {tokens.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <Plus className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No API Tokens</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            API tokens allow you to authenticate with the SwiftConcur API for automated workflows 
            and integrations.
          </p>
          {!showCreateForm && (
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Token
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {tokens.map((token) => (
            <div key={token.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{token.name}</h4>
                  {isExpired(token.expires_at) && (
                    <Badge variant="destructive">Expired</Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Created {formatDate(token.created_at)}</p>
                  {token.expires_at && (
                    <p>Expires {formatDate(token.expires_at)}</p>
                  )}
                  {token.last_used_at ? (
                    <p>Last used {formatDate(token.last_used_at)}</p>
                  ) : (
                    <p>Never used</p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleDeleteToken(token.id, token.name)}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Usage Information */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>API Token Security:</strong>
          <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
            <li>Treat API tokens like passwords - never share them publicly</li>
            <li>Use separate tokens for different applications or environments</li>
            <li>Rotate tokens regularly and delete unused ones</li>
            <li>Set appropriate expiration dates for enhanced security</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}