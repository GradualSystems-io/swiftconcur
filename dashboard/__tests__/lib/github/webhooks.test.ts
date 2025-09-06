/**
 * Unit tests for GitHub webhook event processing
 */

import {
  processInstallationWebhook,
  processRepositoryWebhook,
  processSwiftConcurWebhook,
  validateWebhookEvent
} from '@/lib/github/webhooks';

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn(() => mockSupabaseClient),
  select: jest.fn(() => mockSupabaseClient),
  insert: jest.fn(() => mockSupabaseClient),
  update: jest.fn(() => mockSupabaseClient),
  upsert: jest.fn(() => mockSupabaseClient),
  delete: jest.fn(() => mockSupabaseClient),
  eq: jest.fn(() => mockSupabaseClient),
  single: jest.fn(() => ({ data: null, error: null })),
  then: jest.fn((callback) => callback({ data: [], error: null })),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabaseClient,
}));

// Mock GitHub App client
const mockGitHubClient = {
  rest: {
    apps: {
      getInstallation: jest.fn(),
    },
    repos: {
      get: jest.fn(),
    },
  },
};

jest.mock('@/lib/github/app', () => ({
  createInstallationClient: jest.fn(() => Promise.resolve(mockGitHubClient)),
  verifyWebhookSignature: jest.fn(() => true),
}));

beforeEach(() => {
  jest.clearAllMocks();
  
  // Reset mock return values
  mockSupabaseClient.single.mockResolvedValue({ data: null, error: null });
  mockSupabaseClient.insert.mockResolvedValue({ data: [], error: null });
  mockSupabaseClient.update.mockResolvedValue({ data: [], error: null });
  mockSupabaseClient.upsert.mockResolvedValue({ data: [], error: null });
});

describe('GitHub Webhook Processing', () => {
  describe('validateWebhookEvent', () => {
    it('validates required webhook headers', () => {
      const validEvent = {
        headers: {
          'x-github-event': 'installation',
          'x-github-delivery': 'abc123',
          'x-hub-signature-256': 'sha256=signature',
        },
        body: '{"action":"created"}',
      };

      expect(() => validateWebhookEvent(validEvent)).not.toThrow();
    });

    it('throws error for missing headers', () => {
      const invalidEvent = {
        headers: {},
        body: '{"action":"created"}',
      };

      expect(() => validateWebhookEvent(invalidEvent)).toThrow('Missing required webhook headers');
    });

    it('throws error for invalid JSON body', () => {
      const invalidEvent = {
        headers: {
          'x-github-event': 'installation',
          'x-github-delivery': 'abc123',
          'x-hub-signature-256': 'sha256=signature',
        },
        body: 'invalid json',
      };

      expect(() => validateWebhookEvent(invalidEvent)).toThrow('Invalid JSON payload');
    });

    it('validates specific event types', () => {
      const supportedEvents = ['installation', 'installation_repositories', 'repository', 'swiftconcur_warning'];
      
      supportedEvents.forEach(eventType => {
        const event = {
          headers: {
            'x-github-event': eventType,
            'x-github-delivery': 'abc123',
            'x-hub-signature-256': 'sha256=signature',
          },
          body: '{"action":"created"}',
        };

        expect(() => validateWebhookEvent(event)).not.toThrow();
      });
    });

    it('rejects unsupported event types', () => {
      const unsupportedEvent = {
        headers: {
          'x-github-event': 'unsupported_event',
          'x-github-delivery': 'abc123',
          'x-hub-signature-256': 'sha256=signature',
        },
        body: '{"action":"created"}',
      };

      expect(() => validateWebhookEvent(unsupportedEvent)).toThrow('Unsupported event type');
    });
  });

  describe('processInstallationWebhook', () => {
    const mockInstallationPayload = {
      action: 'created',
      installation: {
        id: 12345,
        account: {
          id: 67890,
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
      repositories: [
        {
          id: 111,
          name: 'test-repo',
          full_name: 'test-user/test-repo',
          private: false,
        },
      ],
    };

    it('processes installation created event', async () => {
      mockGitHubClient.rest.apps.getInstallation.mockResolvedValue({
        data: mockInstallationPayload.installation,
      });

      await processInstallationWebhook(mockInstallationPayload);

      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          installation_id: 12345,
          target_id: 67890,
          target_login: 'test-user',
          target_type: 'User',
        })
      );
    });

    it('processes installation deleted event', async () => {
      const deletedPayload = {
        ...mockInstallationPayload,
        action: 'deleted',
      };

      await processInstallationWebhook(deletedPayload);

      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        deleted_at: expect.any(String),
      });
    });

    it('processes installation suspended event', async () => {
      const suspendedPayload = {
        ...mockInstallationPayload,
        action: 'suspend',
        installation: {
          ...mockInstallationPayload.installation,
          suspended_at: '2024-01-01T00:00:00Z',
        },
      };

      await processInstallationWebhook(suspendedPayload);

      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        suspended_at: '2024-01-01T00:00:00Z',
      });
    });

    it('handles installation not found errors', async () => {
      mockGitHubClient.rest.apps.getInstallation.mockRejectedValue({
        status: 404,
        message: 'Not Found',
      });

      await expect(processInstallationWebhook(mockInstallationPayload)).rejects.toThrow();
    });

    it('handles database errors gracefully', async () => {
      mockSupabaseClient.upsert.mockResolvedValue({
        data: null,
        error: { message: 'Database error', code: 'DB_ERROR' },
      });

      await expect(processInstallationWebhook(mockInstallationPayload)).rejects.toThrow('Database error');
    });
  });

  describe('processRepositoryWebhook', () => {
    const mockRepositoryPayload = {
      action: 'added',
      installation: { id: 12345 },
      repositories_added: [
        {
          id: 111,
          name: 'test-repo',
          full_name: 'test-user/test-repo',
          private: false,
          default_branch: 'main',
          language: 'Swift',
          stargazers_count: 10,
        },
      ],
      repositories_removed: [],
    };

    it('processes repository added event', async () => {
      await processRepositoryWebhook(mockRepositoryPayload);

      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            github_id: 111,
            name: 'test-repo',
            full_name: 'test-user/test-repo',
            is_private: false,
            default_branch: 'main',
            language: 'Swift',
            stars_count: 10,
            installation_id: 12345,
          }),
        ])
      );
    });

    it('processes repository removed event', async () => {
      const removedPayload = {
        ...mockRepositoryPayload,
        action: 'removed',
        repositories_added: [],
        repositories_removed: [{ id: 111, name: 'test-repo' }],
      };

      await processRepositoryWebhook(removedPayload);

      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        deleted_at: expect.any(String),
      });
    });

    it('handles mixed add/remove operations', async () => {
      const mixedPayload = {
        ...mockRepositoryPayload,
        repositories_added: [
          {
            id: 222,
            name: 'new-repo',
            full_name: 'test-user/new-repo',
            private: true,
            default_branch: 'main',
            language: 'Swift',
            stargazers_count: 5,
          },
        ],
        repositories_removed: [{ id: 111, name: 'old-repo' }],
      };

      await processRepositoryWebhook(mixedPayload);

      expect(mockSupabaseClient.upsert).toHaveBeenCalled();
      expect(mockSupabaseClient.update).toHaveBeenCalled();
    });

    it('handles empty repository lists', async () => {
      const emptyPayload = {
        ...mockRepositoryPayload,
        repositories_added: [],
        repositories_removed: [],
      };

      await processRepositoryWebhook(emptyPayload);

      expect(mockSupabaseClient.upsert).not.toHaveBeenCalled();
      expect(mockSupabaseClient.update).not.toHaveBeenCalled();
    });
  });

  describe('processSwiftConcurWebhook', () => {
    const mockSwiftConcurPayload = {
      action: 'warning_report',
      repository: {
        id: 111,
        name: 'test-repo',
        full_name: 'test-user/test-repo',
        private: false,
        default_branch: 'main',
      },
      workflow_run: {
        head_sha: 'abc123',
        head_branch: 'main',
        conclusion: 'success',
        html_url: 'https://github.com/test-user/test-repo/actions/runs/123',
      },
      swiftconcur: {
        warning_count: 5,
        new_warnings: 2,
        fixed_warnings: 1,
        build_time_seconds: 120,
        warnings: [
          {
            file_path: 'src/ContentView.swift',
            line_number: 42,
            column_number: 10,
            message: 'Actor-isolated property cannot be referenced from a non-isolated context',
            severity: 'warning',
            rule_id: 'actor_isolation',
            suggested_fix: 'Add @MainActor annotation',
          },
        ],
      },
    };

    it('processes SwiftConcur warning report', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: { id: 'repo-uuid', user_id: 'user-uuid' },
        error: null,
      });

      await processSwiftConcurWebhook(mockSwiftConcurPayload);

      // Should insert warning run
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          repository_id: 'repo-uuid',
          commit_sha: 'abc123',
          branch: 'main',
          warning_count: 5,
          new_warnings: 2,
          fixed_warnings: 1,
          build_time_seconds: 120,
          build_url: 'https://github.com/test-user/test-repo/actions/runs/123',
        })
      );

      // Should insert individual warnings
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            file_path: 'src/ContentView.swift',
            line_number: 42,
            column_number: 10,
            message: 'Actor-isolated property cannot be referenced from a non-isolated context',
            severity: 'warning',
            rule_id: 'actor_isolation',
            suggested_fix: 'Add @MainActor annotation',
          }),
        ])
      );
    });

    it('handles repository not found in database', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Repository not found' },
      });

      await expect(processSwiftConcurWebhook(mockSwiftConcurPayload)).rejects.toThrow('Repository not found');
    });

    it('processes report with no warnings', async () => {
      const noWarningsPayload = {
        ...mockSwiftConcurPayload,
        swiftconcur: {
          warning_count: 0,
          new_warnings: 0,
          fixed_warnings: 3,
          build_time_seconds: 90,
          warnings: [],
        },
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: { id: 'repo-uuid', user_id: 'user-uuid' },
        error: null,
      });

      await processSwiftConcurWebhook(noWarningsPayload);

      // Should still insert warning run
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          warning_count: 0,
          new_warnings: 0,
          fixed_warnings: 3,
        })
      );
    });

    it('validates warning data structure', async () => {
      const invalidPayload = {
        ...mockSwiftConcurPayload,
        swiftconcur: {
          warning_count: 'invalid', // Should be number
          new_warnings: 2,
          fixed_warnings: 1,
          build_time_seconds: 120,
        },
      };

      await expect(processSwiftConcurWebhook(invalidPayload)).rejects.toThrow();
    });

    it('handles database transaction failures', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: { id: 'repo-uuid', user_id: 'user-uuid' },
        error: null,
      });

      mockSupabaseClient.insert.mockResolvedValueOnce({
        data: null,
        error: { message: 'Transaction failed', code: 'DB_ERROR' },
      });

      await expect(processSwiftConcurWebhook(mockSwiftConcurPayload)).rejects.toThrow('Transaction failed');
    });
  });

  describe('Integration Tests', () => {
    it('processes complete installation flow', async () => {
      const installationPayload = {
        action: 'created',
        installation: {
          id: 12345,
          account: { id: 67890, login: 'test-user', type: 'User' },
          permissions: { contents: 'read', issues: 'write' },
          suspended_at: null,
        },
        repositories: [
          {
            id: 111,
            name: 'test-repo',
            full_name: 'test-user/test-repo',
            private: false,
          },
        ],
      };

      await processInstallationWebhook(installationPayload);

      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          installation_id: 12345,
          target_login: 'test-user',
        })
      );
    });

    it('handles webhook signature verification', () => {
      const { verifyWebhookSignature } = require('@/lib/github/app');
      
      expect(verifyWebhookSignature).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });
  });
});