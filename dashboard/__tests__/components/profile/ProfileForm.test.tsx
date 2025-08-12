import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileForm } from '@/app/(dashboard)/profile/components/ProfileForm';
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
    full_name: 'John Doe',
    display_name: 'John',
    company: 'Test Company',
    location: 'San Francisco, CA',
    website: 'https://johndoe.com',
    bio: 'Software developer',
  },
};

describe('ProfileForm', () => {
  beforeEach(() => {
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    mockSupabase.auth.updateUser.mockClear();
  });

  it('renders profile form with user data', () => {
    render(<ProfileForm user={mockUser} />);
    
    expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('John')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Company')).toBeInTheDocument();
    expect(screen.getByDisplayValue('San Francisco, CA')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://johndoe.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Software developer')).toBeInTheDocument();
  });

  it('shows email as disabled', () => {
    render(<ProfileForm user={mockUser} />);
    
    const emailInput = screen.getByDisplayValue('test@example.com');
    expect(emailInput).toBeDisabled();
  });

  it('updates profile successfully', async () => {
    mockSupabase.auth.updateUser.mockResolvedValueOnce({ error: null });
    
    render(<ProfileForm user={mockUser} />);
    
    const fullNameInput = screen.getByDisplayValue('John Doe');
    fireEvent.change(fullNameInput, { target: { value: 'John Smith' } });
    
    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
        data: {
          full_name: 'John Smith',
          display_name: 'John',
          company: 'Test Company',
          location: 'San Francisco, CA',
          website: 'https://johndoe.com',
          bio: 'Software developer',
        },
      });
    });
    
    expect(screen.getByText('Profile updated successfully!')).toBeInTheDocument();
  });

  it('handles update errors', async () => {
    mockSupabase.auth.updateUser.mockResolvedValueOnce({ 
      error: { message: 'Update failed' } 
    });
    
    render(<ProfileForm user={mockUser} />);
    
    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeInTheDocument();
    });
  });

  it('trims whitespace from input values', async () => {
    mockSupabase.auth.updateUser.mockResolvedValueOnce({ error: null });
    
    render(<ProfileForm user={mockUser} />);
    
    const fullNameInput = screen.getByDisplayValue('John Doe');
    fireEvent.change(fullNameInput, { target: { value: '  John Smith  ' } });
    
    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
        data: expect.objectContaining({
          full_name: 'John Smith', // Trimmed
        }),
      });
    });
  });

  it('enforces character limits', () => {
    render(<ProfileForm user={mockUser} />);
    
    const fullNameInput = screen.getByLabelText(/full name/i);
    expect(fullNameInput).toHaveAttribute('maxLength', '100');
    
    const displayNameInput = screen.getByLabelText(/display name/i);
    expect(displayNameInput).toHaveAttribute('maxLength', '50');
    
    const bioTextarea = screen.getByLabelText(/bio/i);
    expect(bioTextarea).toHaveAttribute('maxLength', '500');
  });

  it('shows bio character count', () => {
    render(<ProfileForm user={mockUser} />);
    
    expect(screen.getByText('17/500 characters')).toBeInTheDocument();
  });
});