/**
 * Unit tests for GitHub authentication and user linking
 */

import { linkGitHubUser, syncUserRepositories } from '@/lib/github/auth';

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn(() => mockSupabaseClient),
  select: jest.fn(() => mockSupabaseClient),
  insert: jest.fn(() => mockSupabaseClient),
  update: jest.fn(() => mockSupabaseClient),
  upsert: jest.fn(() => mockSupabaseClient),
  delete: jest.fn(() => mockSupabaseClient),
  eq: jest.fn(() => mockSupabaseClient),
  in: jest.fn(() => mockSupabaseClient),
  single: jest.fn(() => ({ data: null, error: null })),
  then: jest.fn((callback) => callback({ data: [], error: null })),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabaseClient,
}));

// Mock GitHub App client
const mockInstallationClient = {
  rest: {
    apps: {
      getInstallation: jest.fn(),
      listInstallationReposForAuthenticatedUser: jest.fn(),
    },
  },
};

jest.mock('@/lib/github/app', () => ({
  createInstallationClient: jest.fn(() => Promise.resolve(mockInstallationClient)),
}));

beforeEach(() => {
  jest.clearAllMocks();
  
  // Reset mock return values
  mockSupabaseClient.single.mockResolvedValue({ data: null, error: null });
  mockSupabaseClient.insert.mockResolvedValue({ data: [], error: null });
  mockSupabaseClient.update.mockResolvedValue({ data: [], error: null });
  mockSupabaseClient.upsert.mockResolvedValue({ data: [], error: null });
  mockSupabaseClient.then.mockImplementation((callback) => callback({ data: [], error: null }));
});

describe('GitHub Authentication', () => {
  describe('linkGitHubUser', () => {
    const userId = 'test-user-uuid';
    const githubUserId = 12345;
    const installationId = 67890;

    it('links GitHub user to Supabase account', async () => {
      mockInstallationClient.rest.apps.getInstallation.mockResolvedValue({
        data: {
          id: installationId,
          account: {
            id: githubUserId,
            login: 'test-user',
            type: 'User',
          },
          permissions: {
            contents: 'read',
            issues: 'write',
            pull_requests: 'write',
          },
          suspended_at: null,
        },
      });

      await linkGitHubUser(userId, githubUserId, installationId);

      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: userId,
          installation_id: installationId,
          target_id: githubUserId,
          target_login: 'test-user',
          target_type: 'User',
        })
      );
    });

    it('handles installation not found', async () => {
      mockInstallationClient.rest.apps.getInstallation.mockRejectedValue({
        status: 404,
        message: 'Not Found',
      });

      await expect(linkGitHubUser(userId, githubUserId, installationId)).rejects.toThrow('Not Found');
    });

    it('validates user ID format', async () => {
      await expect(linkGitHubUser('', githubUserId, installationId)).rejects.toThrow();
      await expect(linkGitHubUser('invalid-uuid', githubUserId, installationId)).rejects.toThrow();
    });

    it('validates GitHub user ID', async () => {
      await expect(linkGitHubUser(userId, 0, installationId)).rejects.toThrow();
      await expect(linkGitHubUser(userId, -1, installationId)).rejects.toThrow();
    });

    it('validates installation ID', async () => {
      await expect(linkGitHubUser(userId, githubUserId, 0)).rejects.toThrow();
      await expect(linkGitHubUser(userId, githubUserId, -1)).rejects.toThrow();
    });

    it('handles database errors during linking', async () => {
      mockInstallationClient.rest.apps.getInstallation.mockResolvedValue({
        data: {
          id: installationId,
          account: { id: githubUserId, login: 'test-user', type: 'User' },
          permissions: {},
        },
      });

      mockSupabaseClient.upsert.mockResolvedValue({
        data: null,
        error: { message: 'Database constraint violation', code: 'DB_ERROR' },
      });

      await expect(linkGitHubUser(userId, githubUserId, installationId)).rejects.toThrow('Database constraint violation');
    });

    it('updates existing installation link', async () => {
      mockInstallationClient.rest.apps.getInstallation.mockResolvedValue({
        data: {
          id: installationId,
          account: { id: githubUserId, login: 'updated-user', type: 'User' },
          permissions: { contents: 'read' },
          suspended_at: '2024-01-01T00:00:00Z',
        },
      });

      await linkGitHubUser(userId, githubUserId, installationId);

      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          target_login: 'updated-user',
          suspended_at: '2024-01-01T00:00:00Z',
        })
      );
    });
  });

  describe('syncUserRepositories', () => {
    const userId = 'test-user-uuid';

    const mockInstallation = {
      id: 'installation-uuid',
      installation_id: 12345,
      user_id: userId,
      target_login: 'test-user',
    };

    const mockRepositories = [
      {
        id: 111,
        name: 'repo-1',
        full_name: 'test-user/repo-1',
        private: false,
        default_branch: 'main',
        language: 'Swift',
        stargazers_count: 10,
        updated_at: '2024-01-01T00:00:00Z',
      },
      {
        id: 222,
        name: 'repo-2',
        full_name: 'test-user/repo-2',
        private: true,
        default_branch: 'develop',
        language: 'Swift',
        stargazers_count: 5,
        updated_at: '2024-01-02T00:00:00Z',
      },
    ];

    beforeEach(() => {
      mockSupabaseClient.single.mockResolvedValue({
        data: mockInstallation,
        error: null,
      });

      mockInstallationClient.rest.apps.listInstallationReposForAuthenticatedUser.mockResolvedValue({
        data: {
          repositories: mockRepositories,
          total_count: 2,
        },
      });
    });

    it('syncs user repositories successfully', async () => {
      const result = await syncUserRepositories(userId);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        name: 'repo-1',
        fullName: 'test-user/repo-1',
        private: false,
        language: 'Swift',
      });

      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            github_id: 111,
            name: 'repo-1',
            full_name: 'test-user/repo-1',
            user_id: userId,
            installation_id: 12345,
          }),
          expect.objectContaining({
            github_id: 222,
            name: 'repo-2',
            full_name: 'test-user/repo-2',
            user_id: userId,
            installation_id: 12345,
          }),
        ])
      );
    });

    it('handles user with no GitHub installation', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No installation found' },
      });

      await expect(syncUserRepositories(userId)).rejects.toThrow('No GitHub installation found');
    });

    it('filters Swift repositories only', async () => {
      const mixedRepositories = [
        ...mockRepositories,
        {
          id: 333,
          name: 'js-repo',
          full_name: 'test-user/js-repo',
          private: false,
          default_branch: 'main',
          language: 'JavaScript',
          stargazers_count: 15,
          updated_at: '2024-01-03T00:00:00Z',
        },
      ];

      mockInstallationClient.rest.apps.listInstallationReposForAuthenticatedUser.mockResolvedValue({
        data: {
          repositories: mixedRepositories,
          total_count: 3,
        },
      });

      const result = await syncUserRepositories(userId);

      expect(result).toHaveLength(2); // Only Swift repos
      expect(result.every(repo => repo.language === 'Swift')).toBe(true);
    });

    it('handles empty repository list', async () => {
      mockInstallationClient.rest.apps.listInstallationReposForAuthenticatedUser.mockResolvedValue({
        data: {
          repositories: [],
          total_count: 0,
        },
      });

      const result = await syncUserRepositories(userId);

      expect(result).toHaveLength(0);
      expect(mockSupabaseClient.upsert).not.toHaveBeenCalled();
    });

    it('handles GitHub API errors', async () => {
      mockInstallationClient.rest.apps.listInstallationReposForAuthenticatedUser.mockRejectedValue({
        status: 403,
        message: 'Forbidden',
      });

      await expect(syncUserRepositories(userId)).rejects.toThrow('Forbidden');
    });

    it('handles paginated repository results', async () => {
      // Mock first page
      mockInstallationClient.rest.apps.listInstallationReposForAuthenticatedUser
        .mockResolvedValueOnce({
          data: {
            repositories: [mockRepositories[0]],
            total_count: 2,
          },
        })
        .mockResolvedValueOnce({
          data: {
            repositories: [mockRepositories[1]],
            total_count: 2,
          },
        });

      const result = await syncUserRepositories(userId);

      expect(result).toHaveLength(2);
      expect(mockInstallationClient.rest.apps.listInstallationReposForAuthenticatedUser).toHaveBeenCalledTimes(2);
    });

    it('updates repository metadata on sync', async () => {
      // First sync
      await syncUserRepositories(userId);

      // Update repository data
      const updatedRepo = {
        ...mockRepositories[0],
        stargazers_count: 20, // More stars
        updated_at: '2024-01-15T00:00:00Z',
      };

      mockInstallationClient.rest.apps.listInstallationReposForAuthenticatedUser.mockResolvedValue({
        data: {
          repositories: [updatedRepo],
          total_count: 1,
        },
      });

      // Second sync
      const result = await syncUserRepositories(userId);

      expect(result[0].starsCount).toBe(20);
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            stars_count: 20,
            updated_at: '2024-01-15T00:00:00Z',
          }),
        ])
      );
    });

    it('validates user ID format', async () => {
      await expect(syncUserRepositories('')).rejects.toThrow();
      await expect(syncUserRepositories('invalid-uuid')).rejects.toThrow();
    });

    it('handles database errors during sync', async () => {
      mockSupabaseClient.upsert.mockResolvedValue({
        data: null,
        error: { message: 'Unique constraint violation', code: 'DB_ERROR' },
      });

      await expect(syncUserRepositories(userId)).rejects.toThrow('Unique constraint violation');
    });
  });

  describe('Security and Validation', () => {
    it('prevents SQL injection in user IDs', async () => {
      const maliciousUserId = "'; DROP TABLE users; --";
      
      await expect(linkGitHubUser(maliciousUserId, 12345, 67890)).rejects.toThrow();
    });

    it('validates GitHub installation permissions', async () => {
      mockInstallationClient.rest.apps.getInstallation.mockResolvedValue({
        data: {
          id: 67890,
          account: { id: 12345, login: 'test-user', type: 'User' },
          permissions: {}, // No permissions
        },
      });

      await expect(linkGitHubUser('user-uuid', 12345, 67890)).rejects.toThrow();
    });

    it('handles rate limiting gracefully', async () => {
      mockInstallationClient.rest.apps.getInstallation.mockRejectedValue({
        status: 429,
        message: 'API rate limit exceeded',
        headers: { 'retry-after': '60' },
      });

      await expect(linkGitHubUser('user-uuid', 12345, 67890)).rejects.toMatchObject({
        status: 429,
        message: 'API rate limit exceeded',
      });
    });

    it('sanitizes repository data', async () => {
      const maliciousRepo = {
        id: 111,
        name: '<script>alert("xss")</script>',
        full_name: 'test-user/<script>alert("xss")</script>',
        private: false,
        default_branch: 'main',
        language: 'Swift',
        stargazers_count: 10,
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: { id: 'installation-uuid', installation_id: 12345, user_id: 'user-uuid' },
        error: null,
      });

      mockInstallationClient.rest.apps.listInstallationReposForAuthenticatedUser.mockResolvedValue({
        data: {
          repositories: [maliciousRepo],
          total_count: 1,
        },
      });

      await syncUserRepositories('user-uuid');

      // Should sanitize or reject malicious input
      const insertCall = mockSupabaseClient.upsert.mock.calls[0][0];
      expect(insertCall[0].name).not.toContain('<script>');
      expect(insertCall[0].full_name).not.toContain('<script>');
    });
  });
});