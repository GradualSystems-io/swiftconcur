'use client';

import { useState } from 'react';
import { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { Key, Shield, Github, Chrome, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface SecuritySectionProps {
  user: User;
  hasPassword: boolean;
  oauthProviders: string[];
}

export function SecuritySection({ user, hasPassword, oauthProviders }: SecuritySectionProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  
  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const supabase = createClient();

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Validation
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long');
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      setSuccess('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email!, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      });

      if (error) throw error;

      setSuccess('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email');
    } finally {
      setLoading(false);
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'github':
        return <Github className="h-4 w-4" />;
      case 'google':
        return <Chrome className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const getProviderName = (provider: string) => {
    switch (provider) {
      case 'github':
        return 'GitHub';
      case 'google':
        return 'Google';
      default:
        return provider.charAt(0).toUpperCase() + provider.slice(1);
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

      {/* Account Security Status */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Email Verification */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            {user.email_confirmed_at ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-yellow-600" />
            )}
            <div>
              <div className="font-medium">Email Verification</div>
              <div className="text-sm text-muted-foreground">
                {user.email_confirmed_at ? 'Verified' : 'Pending verification'}
              </div>
            </div>
          </div>
          <Badge variant={user.email_confirmed_at ? 'default' : 'secondary'}>
            {user.email_confirmed_at ? 'Verified' : 'Unverified'}
          </Badge>
        </div>

        {/* Password Status */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <Key className="h-5 w-5 text-blue-600" />
            <div>
              <div className="font-medium">Password</div>
              <div className="text-sm text-muted-foreground">
                {hasPassword ? 'Password set' : 'No password set'}
              </div>
            </div>
          </div>
          <Badge variant={hasPassword ? 'default' : 'secondary'}>
            {hasPassword ? 'Set' : 'Not Set'}
          </Badge>
        </div>
      </div>

      {/* Connected Accounts */}
      {oauthProviders.length > 0 && (
        <div>
          <h3 className="text-lg font-medium mb-3">Connected Accounts</h3>
          <div className="space-y-2">
            {oauthProviders.map((provider) => (
              <div key={provider} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {getProviderIcon(provider)}
                  <span className="font-medium">{getProviderName(provider)}</span>
                </div>
                <Badge variant="outline">Connected</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Password Management */}
      <div>
        <h3 className="text-lg font-medium mb-3">Password Management</h3>
        
        {!showPasswordForm ? (
          <div className="space-y-3">
            <Button 
              onClick={() => setShowPasswordForm(true)}
              disabled={loading}
              className="mr-3"
            >
              <Key className="h-4 w-4 mr-2" />
              {hasPassword ? 'Change Password' : 'Set Password'}
            </Button>
            
            {hasPassword && (
              <Button 
                variant="outline" 
                onClick={handlePasswordReset}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Shield className="h-4 w-4 mr-2" />
                )}
                Send Reset Email
              </Button>
            )}
          </div>
        ) : (
          <form onSubmit={handlePasswordChange} className="space-y-4">
            {hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required={hasPassword}
                  disabled={loading}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Must be at least 8 characters long
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                disabled={loading}
              />
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4 mr-2" />
                    Update Password
                  </>
                )}
              </Button>
              
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowPasswordForm(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setError('');
                }}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}