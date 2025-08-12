import { POST } from '@/app/api/auth/resend-verification/route';
import { createClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';

// Mock Supabase server client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

const mockSupabase = {
  auth: {
    getUser: jest.fn(),
    resend: jest.fn(),
  },
};

const mockRequest = {} as NextRequest;

describe('/api/auth/resend-verification', () => {
  beforeEach(() => {
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    mockSupabase.auth.getUser.mockClear();
    mockSupabase.auth.resend.mockClear();
    
    // Mock environment variable
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it('successfully resends verification email', async () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      email_confirmed_at: null,
    };
    
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: mockUser },
      error: null,
    });
    
    mockSupabase.auth.resend.mockResolvedValueOnce({
      error: null,
    });
    
    const response = await POST(mockRequest);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.message).toBe('Verification email sent successfully');
    
    expect(mockSupabase.auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'test@example.com',
      options: {
        emailRedirectTo: 'https://example.com/auth/confirm',
      },
    });
  });

  it('returns error when user is not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });
    
    const response = await POST(mockRequest);
    const data = await response.json();
    
    expect(response.status).toBe(401);
    expect(data.error).toBe('Not authenticated');
  });

  it('returns success when email is already verified', async () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      email_confirmed_at: '2023-01-01T00:00:00Z',
    };
    
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: mockUser },
      error: null,
    });
    
    const response = await POST(mockRequest);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.message).toBe('Email is already verified');
    
    // Should not call resend
    expect(mockSupabase.auth.resend).not.toHaveBeenCalled();
  });

  it('handles resend errors', async () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      email_confirmed_at: null,
    };
    
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: mockUser },
      error: null,
    });
    
    mockSupabase.auth.resend.mockResolvedValueOnce({
      error: { message: 'Email service unavailable' },
    });
    
    const response = await POST(mockRequest);
    const data = await response.json();
    
    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to send verification email');
  });

  it('uses localhost fallback when APP_URL not set', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      email_confirmed_at: null,
    };
    
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: mockUser },
      error: null,
    });
    
    mockSupabase.auth.resend.mockResolvedValueOnce({
      error: null,
    });
    
    await POST(mockRequest);
    
    expect(mockSupabase.auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'test@example.com',
      options: {
        emailRedirectTo: 'http://localhost:3000/auth/confirm',
      },
    });
  });

  it('handles unexpected errors', async () => {
    mockSupabase.auth.getUser.mockRejectedValueOnce(new Error('Database error'));
    
    const response = await POST(mockRequest);
    const data = await response.json();
    
    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
  });
});