import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationSettings } from '@/app/(dashboard)/settings/components/NotificationSettings';
import { createClient } from '@/lib/supabase/client';

// Mock Supabase client
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(),
}));

const mockSupabase = {
  auth: {
    updateUser: jest.fn(),
  },
};

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  user_metadata: {
    notification_preferences: {
      email_enabled: true,
      critical_warnings: true,
      daily_summary: false,
      weekly_report: true,
      new_repository: true,
      threshold_exceeded: true,
      slack_enabled: false,
      slack_webhook_url: '',
    },
  },
};

describe('NotificationSettings', () => {
  beforeEach(() => {
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    mockSupabase.auth.updateUser.mockClear();
  });

  it('renders notification preferences correctly', () => {
    render(<NotificationSettings user={mockUser} />);
    
    expect(screen.getByLabelText(/enable email notifications/i)).toBeChecked();
    expect(screen.getByLabelText(/critical warnings detected/i)).toBeChecked();
    expect(screen.getByLabelText(/daily summary report/i)).not.toBeChecked();
    expect(screen.getByLabelText(/weekly insights report/i)).toBeChecked();
  });

  it('shows email notification options only when email is enabled', () => {
    render(<NotificationSettings user={mockUser} />);
    
    // Should show email options initially
    expect(screen.getByLabelText(/critical warnings detected/i)).toBeInTheDocument();
    
    // Disable email notifications
    fireEvent.click(screen.getByLabelText(/enable email notifications/i));
    
    // Email options should be hidden
    expect(screen.queryByLabelText(/critical warnings detected/i)).not.toBeInTheDocument();
  });

  it('shows slack webhook URL field when slack is enabled', () => {
    render(<NotificationSettings user={mockUser} />);
    
    // Should not show webhook field initially
    expect(screen.queryByLabelText(/slack webhook url/i)).not.toBeInTheDocument();
    
    // Enable Slack notifications
    fireEvent.click(screen.getByLabelText(/enable slack notifications/i));
    
    // Should show webhook field
    expect(screen.getByLabelText(/slack webhook url/i)).toBeInTheDocument();
  });

  it('saves notification preferences successfully', async () => {
    mockSupabase.auth.updateUser.mockResolvedValueOnce({ error: null });
    
    render(<NotificationSettings user={mockUser} />);
    
    // Change a preference
    fireEvent.click(screen.getByLabelText(/daily summary report/i));
    
    // Save preferences
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));
    
    await waitFor(() => {
      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
        data: {
          notification_preferences: expect.objectContaining({
            daily_summary: true, // Should be changed
            email_enabled: true,
            critical_warnings: true,
          }),
        },
      });
    });
    
    expect(screen.getByText('Notification preferences saved successfully!')).toBeInTheDocument();
  });

  it('handles save errors', async () => {
    mockSupabase.auth.updateUser.mockResolvedValueOnce({
      error: { message: 'Update failed' },
    });
    
    render(<NotificationSettings user={mockUser} />);
    
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));
    
    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeInTheDocument();
    });
  });

  it('updates slack webhook URL', async () => {
    mockSupabase.auth.updateUser.mockResolvedValueOnce({ error: null });
    
    render(<NotificationSettings user={mockUser} />);
    
    // Enable Slack notifications
    fireEvent.click(screen.getByLabelText(/enable slack notifications/i));
    
    // Enter webhook URL
    const webhookInput = screen.getByLabelText(/slack webhook url/i);
    fireEvent.change(webhookInput, {
      target: { value: 'https://hooks.slack.com/services/test' },
    });
    
    // Save preferences
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));
    
    await waitFor(() => {
      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
        data: {
          notification_preferences: expect.objectContaining({
            slack_enabled: true,
            slack_webhook_url: 'https://hooks.slack.com/services/test',
          }),
        },
      });
    });
  });

  it('shows notification timing information', () => {
    render(<NotificationSettings user={mockUser} />);
    
    expect(screen.getByText(/immediate notification/i)).toBeInTheDocument();
    expect(screen.getByText(/9:00 AM in your timezone/i)).toBeInTheDocument();
    expect(screen.getByText(/sent on mondays/i)).toBeInTheDocument();
    expect(screen.getByText(/maximum once per hour/i)).toBeInTheDocument();
  });

  it('includes link to slack webhook documentation', () => {
    render(<NotificationSettings user={mockUser} />);
    
    // Enable Slack to show the webhook field
    fireEvent.click(screen.getByLabelText(/enable slack notifications/i));
    
    const slackLink = screen.getByRole('link', { name: /incoming webhooks/i });
    expect(slackLink).toHaveAttribute('href', 'https://api.slack.com/messaging/webhooks');
    expect(slackLink).toHaveAttribute('target', '_blank');
  });

  it('loads preferences from user metadata', () => {
    const userWithCustomPrefs = {
      ...mockUser,
      user_metadata: {
        notification_preferences: {
          email_enabled: false,
          critical_warnings: false,
          daily_summary: true,
          slack_enabled: true,
          slack_webhook_url: 'https://example.com/webhook',
        },
      },
    };
    
    render(<NotificationSettings user={userWithCustomPrefs} />);
    
    expect(screen.getByLabelText(/enable email notifications/i)).not.toBeChecked();
    expect(screen.getByLabelText(/daily summary report/i)).toBeChecked();
    expect(screen.getByLabelText(/enable slack notifications/i)).toBeChecked();
    expect(screen.getByDisplayValue('https://example.com/webhook')).toBeInTheDocument();
  });
});