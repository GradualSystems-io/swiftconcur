/**
 * Unit tests for GitHub App installation callback API route
 */

import { GET } from '@/app/api/github/install/route';
import { NextRequest } from 'next/server';

// Mock authentication functions
jest.mock('@/lib/github/auth', () => ({
  linkGitHubUser: jest.fn(),
  syncUserRepositories: jest.fn(),
}));

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: jest.fn(),
  },
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabaseClient,
}));

const mockLinkGitHubUser = require('@/lib/github/auth').linkGitHubUser;
const mockSyncUserRepositories = require('@/lib/github/auth').syncUserRepositories;

// Mock environment variables
const originalEnv = process.env;
beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_APP_URL: 'https://example.com',
  };

  // Default mocks
  mockSupabaseClient.auth.getUser.mockResolvedValue({
    data: { user: { id: 'test-user-uuid', email: 'test@example.com' } },
    error: null,
  });
  mockLinkGitHubUser.mockResolvedValue(undefined);
  mockSyncUserRepositories.mockResolvedValue([]);
});

afterEach(() => {
  process.env = originalEnv;
});

function createMockRequest(searchParams: Record<string, string>): NextRequest {
  const url = new URL('https://example.com/api/github/install');
  Object.entries(searchParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return {
    nextUrl: url,
  } as NextRequest;
}

describe('/api/github/install', () => {
  describe('GET', () => {
    it('handles new installation successfully', async () => {
      const request = createMockRequest({
        installation_id: '12345',
        setup_action: 'install',
      });

      const response = await GET(request);

      expect(response.status).toBe(302); // Redirect
      expect(response.headers.get('Location')).toContain('/repositories?installation=success');
      expect(mockLinkGitHubUser).toHaveBeenCalledWith('test-user-uuid', 0, 12345);
    });

    it('handles installation update successfully', async () => {
      const request = createMockRequest({
        installation_id: '12345',
        setup_action: 'update',
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/repositories?installation=updated');
      expect(mockSyncUserRepositories).toHaveBeenCalledWith('test-user-uuid');
    });

    it('handles missing installation_id', async () => {
      const request = createMockRequest({
        setup_action: 'install',
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('error=installation_failed');
    });

    it('handles invalid installation_id', async () => {
      const request = createMockRequest({
        installation_id: 'invalid',
        setup_action: 'install',
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('error=installation_failed');
    });

    it('redirects unauthenticated users to login', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      const request = createMockRequest({
        installation_id: '12345',
        setup_action: 'install',
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/auth/login');
      expect(response.headers.get('Location')).toContain('redirect=');
    });

    it('handles authentication errors', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired' },
      });

      const request = createMockRequest({
        installation_id: '12345',
        setup_action: 'install',
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/auth/login');
    });

    it('handles linking errors gracefully', async () => {
      mockLinkGitHubUser.mockRejectedValue(new Error('Installation not found'));

      const request = createMockRequest({
        installation_id: '12345',
        setup_action: 'install',
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('error=installation_failed');
      expect(response.headers.get('Location')).toContain('message=Installation%20not%20found');
    });

    it('handles sync errors during update', async () => {
      mockSyncUserRepositories.mockRejectedValue(new Error('GitHub API error'));

      const request = createMockRequest({
        installation_id: '12345',
        setup_action: 'update',
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('error=installation_failed');
      expect(response.headers.get('Location')).toContain('message=GitHub%20API%20error');
    });

    it('handles unknown setup_action', async () => {
      const request = createMockRequest({
        installation_id: '12345',
        setup_action: 'unknown',
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('https://example.com/repositories');
    });

    it('handles missing setup_action', async () => {
      const request = createMockRequest({
        installation_id: '12345',
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('https://example.com/repositories');
    });

    it('uses correct app URL from environment', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://custom-domain.com';

      const request = createMockRequest({
        installation_id: '12345',
        setup_action: 'install',
      });

      const response = await GET(request);

      expect(response.headers.get('Location')).toContain('https://custom-domain.com');
    });

    it('falls back to localhost when app URL not set', async () => {
      delete process.env.NEXT_PUBLIC_APP_URL;

      const request = createMockRequest({
        installation_id: '12345',
        setup_action: 'install',
      });

      const response = await GET(request);

      expect(response.headers.get('Location')).toContain('http://localhost:3000');
    });

    it('logs installation activity', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const request = createMockRequest({
        installation_id: '12345',
        setup_action: 'install',
      });

      await GET(request);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Linking installation 12345 to user test-user-uuid'
      );

      consoleSpy.mockRestore();
    });

    it('validates installation ID is positive integer', async () => {
      const negativeId = createMockRequest({
        installation_id: '-12345',
        setup_action: 'install',
      });

      const response = await GET(negativeId);
      expect(response.headers.get('Location')).toContain('error=installation_failed');

      const zeroId = createMockRequest({
        installation_id: '0',
        setup_action: 'install',
      });

      const response2 = await GET(zeroId);
      expect(response2.headers.get('Location')).toContain('error=installation_failed');
    });

    it('handles very large installation IDs', async () => {
      const request = createMockRequest({
        installation_id: '999999999999999999', // Very large number
        setup_action: 'install',
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(mockLinkGitHubUser).toHaveBeenCalledWith(
        'test-user-uuid',
        0,
        999999999999999999
      );
    });

    it('preserves return URL in login redirect', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const request = createMockRequest({
        installation_id: '12345',
        setup_action: 'install',
      });

      const response = await GET(request);

      const location = response.headers.get('Location') || '';
      const redirectUrl = new URL(location);
      const returnUrl = redirectUrl.searchParams.get('redirect');

      expect(returnUrl).toBe(request.url);
    });
  });

  describe('Error Handling', () => {
    it('handles network timeouts', async () => {
      mockLinkGitHubUser.mockImplementation(() => new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Network timeout')), 1000);
      }));

      const request = createMockRequest({
        installation_id: '12345',
        setup_action: 'install',
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('error=installation_failed');
    });

    it('handles rate limiting errors', async () => {
      mockLinkGitHubUser.mockRejectedValue({
        status: 429,
        message: 'API rate limit exceeded',
      });

      const request = createMockRequest({
        installation_id: '12345',
        setup_action: 'install',
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('error=installation_failed');
    });

    it('sanitizes error messages in redirects', async () => {
      mockLinkGitHubUser.mockRejectedValue(new Error('Database error: connection string contains password'));

      const request = createMockRequest({
        installation_id: '12345',
        setup_action: 'install',
      });

      const response = await GET(request);

      const location = response.headers.get('Location') || '';
      expect(location).not.toContain('password');
      expect(location).not.toContain('connection string');
    });

    it('handles concurrent installation requests', async () => {
      const request1 = createMockRequest({
        installation_id: '12345',
        setup_action: 'install',
      });

      const request2 = createMockRequest({
        installation_id: '67890',
        setup_action: 'install',
      });

      const [response1, response2] = await Promise.all([
        GET(request1),
        GET(request2),
      ]);

      expect(response1.status).toBe(302);
      expect(response2.status).toBe(302);
      expect(mockLinkGitHubUser).toHaveBeenCalledTimes(2);
    });
  });

  describe('Security Tests', () => {
    it('prevents installation ID injection attacks', async () => {
      const maliciousRequest = createMockRequest({
        installation_id: '12345; DROP TABLE installations;',
        setup_action: 'install',
      });

      const response = await GET(maliciousRequest);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('error=installation_failed');
      expect(mockLinkGitHubUser).not.toHaveBeenCalled();
    });

    it('validates user session integrity', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user1' } },
        error: null,
      });

      // Simulate session tampering
      mockLinkGitHubUser.mockImplementation((userId) => {
        if (userId !== 'user1') {
          throw new Error('Session mismatch');
        }
        return Promise.resolve();
      });

      const request = createMockRequest({
        installation_id: '12345',
        setup_action: 'install',
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(mockLinkGitHubUser).toHaveBeenCalledWith('user1', 0, 12345);
    });

    it('handles URL parameter pollution', async () => {
      const url = new URL('https://example.com/api/github/install');
      url.searchParams.append('installation_id', '12345');
      url.searchParams.append('installation_id', '67890'); // Duplicate parameter

      const request = { nextUrl: url } as NextRequest;
      const response = await GET(request);

      // Should handle gracefully, typically taking the first value
      expect(response.status).toBe(302);
    });
  });

  describe('Integration Tests', () => {
    it('completes full installation flow', async () => {
      const request = createMockRequest({
        installation_id: '12345',
        setup_action: 'install',
      });

      const response = await GET(request);

      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled();
      expect(mockLinkGitHubUser).toHaveBeenCalledWith('test-user-uuid', 0, 12345);
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('installation=success');
    });

    it('completes full update flow', async () => {
      mockSyncUserRepositories.mockResolvedValue([
        { name: 'repo1', fullName: 'user/repo1' },
        { name: 'repo2', fullName: 'user/repo2' },
      ]);

      const request = createMockRequest({
        installation_id: '12345',
        setup_action: 'update',
      });

      const response = await GET(request);

      expect(mockSyncUserRepositories).toHaveBeenCalledWith('test-user-uuid');
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('installation=updated');
    });
  });
});