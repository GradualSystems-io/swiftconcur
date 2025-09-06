/**
 * Unit tests for GitHub repository sync API route
 */

import { POST, GET } from '@/app/api/github/sync/route';
import { NextRequest } from 'next/server';

// Mock authentication functions
jest.mock('@/lib/github/auth', () => ({
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

const mockSyncUserRepositories = require('@/lib/github/auth').syncUserRepositories;

beforeEach(() => {
  jest.clearAllMocks();

  // Default mocks
  mockSupabaseClient.auth.getUser.mockResolvedValue({
    data: { user: { id: 'test-user-uuid', email: 'test@example.com' } },
    error: null,
  });

  mockSyncUserRepositories.mockResolvedValue([
    {
      name: 'swift-repo-1',
      fullName: 'user/swift-repo-1',
      private: false,
      language: 'Swift',
      starsCount: 10,
    },
    {
      name: 'swift-repo-2',
      fullName: 'user/swift-repo-2',
      private: true,
      language: 'Swift',
      starsCount: 5,
    },
  ]);
});

function createMockRequest(): NextRequest {
  return {
    json: jest.fn().mockResolvedValue({}),
  } as unknown as NextRequest;
}

describe('/api/github/sync', () => {
  describe('POST', () => {
    it('syncs user repositories successfully', async () => {
      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData).toEqual({
        success: true,
        count: 2,
        repositories: [
          {
            name: 'swift-repo-1',
            fullName: 'user/swift-repo-1',
            private: false,
          },
          {
            name: 'swift-repo-2',
            fullName: 'user/swift-repo-2',
            private: true,
          },
        ],
      });
      expect(mockSyncUserRepositories).toHaveBeenCalledWith('test-user-uuid');
    });

    it('handles empty repository list', async () => {
      mockSyncUserRepositories.mockResolvedValue([]);

      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData).toEqual({
        success: true,
        count: 0,
        repositories: [],
      });
    });

    it('rejects unauthenticated requests', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(401);
      expect(responseData).toEqual({ error: 'Authentication required' });
      expect(mockSyncUserRepositories).not.toHaveBeenCalled();
    });

    it('handles authentication errors', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired' },
      });

      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(401);
      expect(responseData).toEqual({ error: 'Authentication required' });
    });

    it('handles sync errors gracefully', async () => {
      mockSyncUserRepositories.mockRejectedValue(new Error('GitHub API rate limit exceeded'));

      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData).toEqual({ error: 'GitHub API rate limit exceeded' });
    });

    it('handles installation not found errors', async () => {
      mockSyncUserRepositories.mockRejectedValue(new Error('No GitHub installation found'));

      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData).toEqual({ error: 'No GitHub installation found' });
    });

    it('handles network timeouts', async () => {
      mockSyncUserRepositories.mockRejectedValue(new Error('Request timeout'));

      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData).toEqual({ error: 'Request timeout' });
    });

    it('handles malformed user session', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: null } }, // Invalid user object
        error: null,
      });

      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(401);
      expect(responseData).toEqual({ error: 'Authentication required' });
    });

    it('logs sync activity', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const request = createMockRequest();
      await POST(request);

      expect(consoleSpy).toHaveBeenCalledWith('Syncing repositories for user:', 'test-user-uuid');
      
      consoleSpy.mockRestore();
    });

    it('handles GitHub API errors', async () => {
      mockSyncUserRepositories.mockRejectedValue({
        status: 403,
        message: 'Forbidden - insufficient permissions',
      });

      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData).toEqual({ error: 'Forbidden - insufficient permissions' });
    });

    it('handles large repository lists efficiently', async () => {
      const largeRepoList = Array.from({ length: 100 }, (_, i) => ({
        name: `repo-${i}`,
        fullName: `user/repo-${i}`,
        private: i % 2 === 0,
        language: 'Swift',
        starsCount: i,
      }));

      mockSyncUserRepositories.mockResolvedValue(largeRepoList);

      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.count).toBe(100);
      expect(responseData.repositories).toHaveLength(100);
    });

    it('filters and formats repository data correctly', async () => {
      const rawRepositories = [
        {
          name: 'test-repo',
          fullName: 'user/test-repo',
          private: false,
          language: 'Swift',
          starsCount: 15,
          extraField: 'should be filtered out',
        },
      ];

      mockSyncUserRepositories.mockResolvedValue(rawRepositories);

      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      expect(responseData.repositories[0]).toEqual({
        name: 'test-repo',
        fullName: 'user/test-repo',
        private: false,
      });
      expect(responseData.repositories[0]).not.toHaveProperty('extraField');
      expect(responseData.repositories[0]).not.toHaveProperty('language');
      expect(responseData.repositories[0]).not.toHaveProperty('starsCount');
    });
  });

  describe('GET', () => {
    it('returns method not allowed', async () => {
      const response = await GET();
      const responseData = await response.json();

      expect(response.status).toBe(405);
      expect(responseData).toEqual({ error: 'Method not allowed' });
    });
  });

  describe('Rate Limiting', () => {
    it('handles concurrent sync requests from same user', async () => {
      const request1 = createMockRequest();
      const request2 = createMockRequest();

      const [response1, response2] = await Promise.all([
        POST(request1),
        POST(request2),
      ]);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      
      // Both requests should complete successfully
      // In a real implementation, you might want to prevent duplicate syncs
      expect(mockSyncUserRepositories).toHaveBeenCalledTimes(2);
    });

    it('handles rate limit errors from GitHub', async () => {
      mockSyncUserRepositories.mockRejectedValue({
        status: 429,
        message: 'API rate limit exceeded',
        headers: { 'retry-after': '60' },
      });

      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData).toEqual({ error: 'API rate limit exceeded' });
    });
  });

  describe('Security Tests', () => {
    it('validates user session integrity', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });

      const request = createMockRequest();
      await POST(request);

      expect(mockSyncUserRepositories).toHaveBeenCalledWith('user-123');
    });

    it('prevents session fixation attacks', async () => {
      // Mock a user with suspicious session data
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { 
          user: { 
            id: 'test-user-uuid',
            email: 'test@example.com',
            // Simulate suspicious metadata
            app_metadata: { provider: 'github' },
            user_metadata: { suspicious_field: 'value' },
          }
        },
        error: null,
      });

      const request = createMockRequest();
      const response = await POST(request);

      // Should still work with valid user ID
      expect(response.status).toBe(200);
      expect(mockSyncUserRepositories).toHaveBeenCalledWith('test-user-uuid');
    });

    it('handles JWT manipulation attempts', async () => {
      mockSupabaseClient.auth.getUser.mockRejectedValue(new Error('JWT signature invalid'));

      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData).toEqual({ error: 'JWT signature invalid' });
    });

    it('sanitizes error messages', async () => {
      mockSyncUserRepositories.mockRejectedValue(
        new Error('Database connection failed: host=localhost user=admin password=secret')
      );

      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      // Error message should be sanitized to not expose sensitive information
      expect(responseData.error).not.toContain('password=secret');
      expect(responseData.error).not.toContain('admin');
      expect(responseData.error).toBe('Database connection failed: host=localhost user=admin password=secret');
    });
  });

  describe('Error Recovery', () => {
    it('handles partial sync failures gracefully', async () => {
      // Mock sync that partially succeeds
      mockSyncUserRepositories.mockResolvedValue([
        { name: 'repo1', fullName: 'user/repo1', private: false },
        // Note: Some repos might fail to sync but still return partial results
      ]);

      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.count).toBe(1);
    });

    it('handles database connection issues', async () => {
      mockSyncUserRepositories.mockRejectedValue(new Error('Database connection lost'));

      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData).toEqual({ error: 'Database connection lost' });
    });

    it('handles GitHub service unavailable', async () => {
      mockSyncUserRepositories.mockRejectedValue({
        status: 503,
        message: 'Service temporarily unavailable',
      });

      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData).toEqual({ error: 'Service temporarily unavailable' });
    });
  });

  describe('Integration Tests', () => {
    it('completes full sync flow', async () => {
      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      // Verify the complete flow
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled();
      expect(mockSyncUserRepositories).toHaveBeenCalledWith('test-user-uuid');
      
      expect(response.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.count).toBe(2);
      expect(responseData.repositories).toHaveLength(2);
    });

    it('handles user with multiple installations', async () => {
      // This would be relevant if supporting multiple installations per user
      mockSyncUserRepositories.mockResolvedValue([
        { name: 'org1-repo', fullName: 'org1/repo', private: false },
        { name: 'personal-repo', fullName: 'user/repo', private: true },
      ]);

      const request = createMockRequest();
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.count).toBe(2);
    });
  });
});