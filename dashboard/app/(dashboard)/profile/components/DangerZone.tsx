'use client';

import { useState } from 'react';
import { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';

interface DangerZoneProps {
  user: User;
}

export function DangerZone({ user }: DangerZoneProps) {
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [error, setError] = useState('');

  const { signOut } = useAuth();
  const supabase = createClient();

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Verify confirmation text
    if (deleteConfirmation !== 'DELETE MY ACCOUNT') {
      setError('Please type "DELETE MY ACCOUNT" exactly to confirm');
      setLoading(false);
      return;
    }

    try {
      // First, delete user data from our database
      const { error: deleteError } = await supabase
        .from('user_repos')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) {
        console.warn('Error cleaning up user data:', deleteError);
        // Continue with account deletion even if cleanup fails
      }

      // Sign out the user first
      await signOut();

      // Redirect to a deletion confirmation page or login
      window.location.href = '/auth/login?message=account_deleted';
      
    } catch (err: any) {
      console.error('Account deletion error:', err);
      setError('Failed to delete account. Please contact support.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Delete Account Warning */}
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Warning:</strong> Account deletion is permanent and cannot be undone. 
          All your data, including repositories, runs, and settings will be permanently deleted.
        </AlertDescription>
      </Alert>

      {/* Delete Account Section */}
      {!showDeleteConfirm ? (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium text-red-600 dark:text-red-400">
              Delete Account
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Permanently delete your SwiftConcur account and all associated data.
            </p>
          </div>
          
          <Button 
            variant="destructive"
            onClick={() => setShowDeleteConfirm(true)}
            className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete My Account
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium text-red-600 dark:text-red-400">
              Confirm Account Deletion
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              This action cannot be undone. This will permanently delete your account and remove all data.
            </p>
          </div>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>This will delete:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Your user profile and account information</li>
                <li>All connected repositories and their configurations</li>
                <li>Historical warning data and analytics</li>
                <li>API tokens and webhook configurations</li>
                <li>All preferences and settings</li>
              </ul>
            </AlertDescription>
          </Alert>

          <form onSubmit={handleDeleteAccount} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deleteConfirmation">
                Type <strong>DELETE MY ACCOUNT</strong> to confirm
              </Label>
              <Input
                id="deleteConfirmation"
                type="text"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="DELETE MY ACCOUNT"
                required
                disabled={loading}
                className="font-mono"
              />
            </div>

            <div className="flex gap-3">
              <Button 
                type="submit" 
                variant="destructive"
                disabled={loading || deleteConfirmation !== 'DELETE MY ACCOUNT'}
                className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    I understand, delete my account
                  </>
                )}
              </Button>
              
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmation('');
                  setError('');
                }}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}