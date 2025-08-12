import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SecuritySection } from '@/app/(dashboard)/profile/components/SecuritySection';
import { createClient } from '@/lib/supabase/client';

// Mock Supabase client
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(),
}));

const mockSupabase = {
  auth: {
    updateUser: jest.fn(),
    resetPasswordForEmail: jest.fn(),
  },
};

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  email_confirmed_at: '2023-01-01T00:00:00Z',
  app_metadata: {
    provider: 'email',
    providers: ['email'],
  },
};

describe('SecuritySection', () => {
  beforeEach(() => {
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    mockSupabase.auth.updateUser.mockClear();
    mockSupabase.auth.resetPasswordForEmail.mockClear();
    
    // Mock window.location.origin
    Object.defineProperty(window, 'location', {
      value: {
        origin: 'http://localhost:3000'
      },
      writable: true
    });
  });

  it('renders security status correctly for verified email user', () => {
    render(<SecuritySection user={mockUser} hasPassword={true} oauthProviders={['email']} />);
    
    expect(screen.getByText('Email Verification')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('Password')).toBeInTheDocument();
    expect(screen.getByText('Set')).toBeInTheDocument();
  });

  it('renders unverified email status', () => {
    const unverifiedUser = { ...mockUser, email_confirmed_at: null };
    
    render(<SecuritySection user={unverifiedUser} hasPassword={true} oauthProviders={['email']} />);
    
    expect(screen.getByText('Pending verification')).toBeInTheDocument();
    expect(screen.getByText('Unverified')).toBeInTheDocument();
  });

  it('shows OAuth providers when connected', () => {
    render(<SecuritySection user={mockUser} hasPassword={true} oauthProviders={['email', 'github']} />);
    
    expect(screen.getByText('Connected Accounts')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('allows password change for users with password', async () => {
    mockSupabase.auth.updateUser.mockResolvedValueOnce({ error: null });
    
    render(<SecuritySection user={mockUser} hasPassword={true} oauthProviders={['email']} />);
    
    // Click change password button
    fireEvent.click(screen.getByText('Change Password'));
    
    // Fill out password form
    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: 'currentpass' }
    });
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'newpassword123' }
    });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: 'newpassword123' }
    });
    
    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    
    await waitFor(() => {
      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
        password: 'newpassword123'
      });
    });
    
    expect(screen.getByText('Password updated successfully!')).toBeInTheDocument();
  });

  it('validates password requirements', async () => {
    render(<SecuritySection user={mockUser} hasPassword={true} oauthProviders={['email']} />);
    
    // Click change password button
    fireEvent.click(screen.getByText('Change Password'));
    
    // Try with short password
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'short' }
    });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: 'short' }
    });
    
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    
    await waitFor(() => {
      expect(screen.getByText('New password must be at least 8 characters long')).toBeInTheDocument();
    });
  });

  it('validates password confirmation match', async () => {
    render(<SecuritySection user={mockUser} hasPassword={true} oauthProviders={['email']} />);
    
    // Click change password button
    fireEvent.click(screen.getByText('Change Password'));
    
    // Use mismatched passwords
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'newpassword123' }
    });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: 'different123' }
    });
    
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    
    await waitFor(() => {
      expect(screen.getByText('New passwords do not match')).toBeInTheDocument();
    });
  });

  it('sends password reset email', async () => {
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValueOnce({ error: null });
    
    render(<SecuritySection user={mockUser} hasPassword={true} oauthProviders={['email']} />);
    
    fireEvent.click(screen.getByText('Send Reset Email'));
    
    await waitFor(() => {
      expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'test@example.com',
        {
          redirectTo: 'http://localhost:3000/auth/callback?type=recovery'
        }
      );
    });
    
    expect(screen.getByText('Password reset email sent! Check your inbox.')).toBeInTheDocument();
  });

  it('handles password reset errors', async () => {
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValueOnce({ 
      error: { message: 'Reset failed' } 
    });
    
    render(<SecuritySection user={mockUser} hasPassword={true} oauthProviders={['email']} />);
    
    fireEvent.click(screen.getByText('Send Reset Email'));
    
    await waitFor(() => {
      expect(screen.getByText('Reset failed')).toBeInTheDocument();
    });
  });

  it('allows canceling password form', () => {
    render(<SecuritySection user={mockUser} hasPassword={true} oauthProviders={['email']} />);
    
    // Click change password button
    fireEvent.click(screen.getByText('Change Password'));
    
    // Should show form
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    
    // Click cancel
    fireEvent.click(screen.getByText('Cancel'));
    
    // Should hide form
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
  });
});