import { createClient, verifyUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ProfileForm } from './components/ProfileForm';
import { SecuritySection } from './components/SecuritySection';
import { DangerZone } from './components/DangerZone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Shield, AlertTriangle } from 'lucide-react';

export default async function ProfilePage() {
  const { user, error } = await verifyUser();
  
  if (error || !user) {
    redirect('/auth/login');
  }

  const supabase = createClient();
  
  // Get user's profile data and security info
  const isEmailVerified = user.email_confirmed_at !== null;
  const hasPassword = user.app_metadata.provider === 'email';
  const oauthProviders = user.app_metadata.providers || [];
  
  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-2">
          Manage your personal information and account settings
        </p>
      </div>

      {/* Email Verification Alert */}
      {!isEmailVerified && (
        <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <CardTitle className="text-lg text-yellow-800 dark:text-yellow-200">
                Email Verification Required
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-yellow-700 dark:text-yellow-300 text-sm mb-3">
              Please verify your email address to access all features and ensure account security.
            </p>
            <form action="/api/auth/resend-verification" method="post" className="inline">
              <button 
                type="submit"
                className="text-sm font-medium text-yellow-800 dark:text-yellow-200 underline hover:no-underline"
              >
                Resend verification email
              </button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Personal Information
          </CardTitle>
          <CardDescription>
            Update your personal details and profile information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm user={user} />
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security
          </CardTitle>
          <CardDescription>
            Manage your password and security preferences
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SecuritySection 
            user={user} 
            hasPassword={hasPassword}
            oauthProviders={oauthProviders}
          />
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 dark:border-red-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible and destructive actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DangerZone user={user} />
        </CardContent>
      </Card>
    </div>
  );
}