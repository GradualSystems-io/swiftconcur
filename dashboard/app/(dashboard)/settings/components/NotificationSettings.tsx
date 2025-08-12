'use client';

import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createClient } from '@/lib/supabase/client';
import { Save, Loader2, Bell, Mail, MessageSquare } from 'lucide-react';

interface NotificationSettingsProps {
  user: User;
}

interface NotificationPreferences {
  email_enabled: boolean;
  critical_warnings: boolean;
  daily_summary: boolean;
  weekly_report: boolean;
  new_repository: boolean;
  threshold_exceeded: boolean;
  slack_enabled: boolean;
  slack_webhook_url: string;
}

export function NotificationSettings({ user }: NotificationSettingsProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  
  // Notification preferences state
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    email_enabled: true,
    critical_warnings: true,
    daily_summary: false,
    weekly_report: true,
    new_repository: true,
    threshold_exceeded: true,
    slack_enabled: false,
    slack_webhook_url: '',
  });

  const supabase = createClient();

  // Load user preferences from user metadata
  useEffect(() => {
    const savedPrefs = user.user_metadata?.notification_preferences;
    if (savedPrefs) {
      setPreferences(prev => ({ ...prev, ...savedPrefs }));
    }
  }, [user]);

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          notification_preferences: preferences
        }
      });

      if (error) throw error;

      setSuccess('Notification preferences saved successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to save preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckboxChange = (key: keyof NotificationPreferences, value: boolean) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  const handleInputChange = (key: keyof NotificationPreferences, value: string) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  return (
    <form onSubmit={handleSavePreferences} className="space-y-6">
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

      {/* Email Notifications */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          <h3 className="text-lg font-medium">Email Notifications</h3>
        </div>
        
        <div className="space-y-3 pl-7">
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="email_enabled"
              checked={preferences.email_enabled}
              onChange={(e) => handleCheckboxChange('email_enabled', e.target.checked)}
              disabled={loading}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="email_enabled" className="text-sm font-medium">
              Enable email notifications
            </Label>
          </div>
          
          {preferences.email_enabled && (
            <>
              <div className="flex items-center space-x-3 ml-6">
                <input
                  type="checkbox"
                  id="critical_warnings"
                  checked={preferences.critical_warnings}
                  onChange={(e) => handleCheckboxChange('critical_warnings', e.target.checked)}
                  disabled={loading}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="critical_warnings" className="text-sm">
                  Critical warnings detected
                </Label>
              </div>
              
              <div className="flex items-center space-x-3 ml-6">
                <input
                  type="checkbox"
                  id="threshold_exceeded"
                  checked={preferences.threshold_exceeded}
                  onChange={(e) => handleCheckboxChange('threshold_exceeded', e.target.checked)}
                  disabled={loading}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="threshold_exceeded" className="text-sm">
                  Warning threshold exceeded
                </Label>
              </div>
              
              <div className="flex items-center space-x-3 ml-6">
                <input
                  type="checkbox"
                  id="daily_summary"
                  checked={preferences.daily_summary}
                  onChange={(e) => handleCheckboxChange('daily_summary', e.target.checked)}
                  disabled={loading}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="daily_summary" className="text-sm">
                  Daily summary report
                </Label>
              </div>
              
              <div className="flex items-center space-x-3 ml-6">
                <input
                  type="checkbox"
                  id="weekly_report"
                  checked={preferences.weekly_report}
                  onChange={(e) => handleCheckboxChange('weekly_report', e.target.checked)}
                  disabled={loading}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="weekly_report" className="text-sm">
                  Weekly insights report
                </Label>
              </div>
              
              <div className="flex items-center space-x-3 ml-6">
                <input
                  type="checkbox"
                  id="new_repository"
                  checked={preferences.new_repository}
                  onChange={(e) => handleCheckboxChange('new_repository', e.target.checked)}
                  disabled={loading}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="new_repository" className="text-sm">
                  New repository connected
                </Label>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Slack Notifications */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          <h3 className="text-lg font-medium">Slack Integration</h3>
        </div>
        
        <div className="space-y-3 pl-7">
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="slack_enabled"
              checked={preferences.slack_enabled}
              onChange={(e) => handleCheckboxChange('slack_enabled', e.target.checked)}
              disabled={loading}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="slack_enabled" className="text-sm font-medium">
              Enable Slack notifications
            </Label>
          </div>
          
          {preferences.slack_enabled && (
            <div className="ml-6 space-y-2">
              <Label htmlFor="slack_webhook_url" className="text-sm">
                Slack Webhook URL
              </Label>
              <input
                type="url"
                id="slack_webhook_url"
                value={preferences.slack_webhook_url}
                onChange={(e) => handleInputChange('slack_webhook_url', e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                disabled={loading}
                className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                Get your webhook URL from Slack's{' '}
                <a 
                  href="https://api.slack.com/messaging/webhooks" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:no-underline"
                >
                  Incoming Webhooks
                </a>{' '}
                documentation.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Notification Timing */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <h3 className="text-lg font-medium">Notification Timing</h3>
        </div>
        
        <div className="pl-7 space-y-2">
          <p className="text-sm text-muted-foreground">
            • <strong>Critical warnings:</strong> Immediate notification
          </p>
          <p className="text-sm text-muted-foreground">
            • <strong>Daily summaries:</strong> Sent at 9:00 AM in your timezone
          </p>
          <p className="text-sm text-muted-foreground">
            • <strong>Weekly reports:</strong> Sent on Mondays at 9:00 AM
          </p>
          <p className="text-sm text-muted-foreground">
            • <strong>Threshold alerts:</strong> Maximum once per hour per repository
          </p>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Preferences
            </>
          )}
        </Button>
      </div>
    </form>
  );
}