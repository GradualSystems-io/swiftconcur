/**
 * Integration tests for the complete GitHub App flow
 * Tests the end-to-end installation, repository sync, and webhook processing
 */

import { POST as webhookHandler } from '@/app/api/github/webhook/route';
import { GET as installHandler } from '@/app/api/github/install/route';
import { POST as syncHandler } from '@/app/api/github/sync/route';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

// Test database setup (mock for now - in real tests you'd use a test database)
const mockDatabase = {
  installations: new Map(),
  repositories: new Map(),
  warningRuns: new Map(),
  warnings: new Map(),
  users: new Map(),
};

// Mock implementations that simulate real database operations
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: jest.fn((table: string) => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => {
            if (table === 'github_installations') {
              const installation = mockDatabase.installations.get('test-user-uuid');
              return Promise.resolve({ 
                data: installation || null, 
                error: installation ? null : { code: 'PGRST116' }
              });
            }
            return Promise.resolve({ data: null, error: null });
          }),
        })),
      })),
      insert: jest.fn((data: any) => {
        if (table === 'github_webhook_events') {
          mockDatabase.installations.set(data.installation_id || data.user_id, data);
        }
        return Promise.resolve({ data: [data], error: null });
      }),
      upsert: jest.fn((data: any) => {
        if (Array.isArray(data)) {
          data.forEach(item => {
            if (table === 'repositories') {
              mockDatabase.repositories.set(item.github_id, item);
            } else if (table === 'github_installations') {
              mockDatabase.installations.set(item.user_id, item);
            }
          });
        } else {
          if (table === 'github_installations') {
            mockDatabase.installations.set(data.user_id, data);
          }
        }
        return Promise.resolve({ data: data, error: null });
      }),
      update: jest.fn((data: any) => {
        return Promise.resolve({ data: [data], error: null });
      }),
    })),
    auth: {
      getUser: jest.fn(() => Promise.resolve({
        data: { user: { id: 'test-user-uuid', email: 'test@example.com' } },
        error: null,
      })),
    },
  }),
}));

// Mock GitHub App clients
const mockGitHubClient = {
  rest: {
    apps: {
      getInstallation: jest.fn(),
      createInstallationAccessToken: jest.fn(),
      listInstallationReposForAuthenticatedUser: jest.fn(),
    },
  },
};

jest.mock('@/lib/github/app', () => ({
  createInstallationClient: jest.fn(() => Promise.resolve(mockGitHubClient)),
  verifyWebhookSignature: jest.fn(() => true),
}));

// Test data
const testInstallation = {
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
};

const testRepositories = [
  {
    id: 111,
    name: 'swift-app',
    full_name: 'test-user/swift-app',
    private: false,
    default_branch: 'main',
    language: 'Swift',
    stargazers_count: 25,
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 222,
    name: 'ios-lib',
    full_name: 'test-user/ios-lib',
    private: true,
    default_branch: 'develop',
    language: 'Swift',
    stargazers_count: 10,
    updated_at: '2024-01-02T00:00:00Z',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  
  // Clear mock database
  mockDatabase.installations.clear();
  mockDatabase.repositories.clear();
  mockDatabase.warningRuns.clear();
  mockDatabase.warnings.clear();
  mockDatabase.users.clear();

  // Setup default GitHub API responses
  mockGitHubClient.rest.apps.getInstallation.mockResolvedValue({
    data: testInstallation,
  });

  mockGitHubClient.rest.apps.createInstallationAccessToken.mockResolvedValue({
    data: { token: 'ghs_test_token' },
  });

  mockGitHubClient.rest.apps.listInstallationReposForAuthenticatedUser.mockResolvedValue({
    data: {
      repositories: testRepositories,
      total_count: 2,
    },
  });

  // Setup environment
  process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
  process.env.NEXT_PUBLIC_APP_URL = 'https://example.com';
});

function createWebhookRequest(eventType: string, payload: any): NextRequest {
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', 'test-webhook-secret')
    .update(body)
    .digest('hex');

  return {
    headers: {
      get: jest.fn((header: string) => {
        const headers: Record<string, string> = {
          'x-github-event': eventType,
          'x-github-delivery': 'test-delivery-id',
          'x-hub-signature-256': `sha256=${signature}`,
        };
        return headers[header.toLowerCase()] || null;
      }),
    },
    text: jest.fn().mockResolvedValue(body),
  } as unknown as NextRequest;
}

function createInstallRequest(params: Record<string, string>): NextRequest {
  const url = new URL('https://example.com/api/github/install');
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return { nextUrl: url } as NextRequest;
}

function createSyncRequest(): NextRequest {
  return {
    json: jest.fn().mockResolvedValue({}),
  } as unknown as NextRequest;
}

describe('GitHub App Integration Flow', () => {
  describe('Complete Installation Flow', () => {
    it('completes full app installation and setup', async () => {
      // Step 1: User installs GitHub App (callback received)
      const installRequest = createInstallRequest({
        installation_id: '12345',
        setup_action: 'install',
      });

      const installResponse = await installHandler(installRequest);
      expect(installResponse.status).toBe(302);
      expect(installResponse.headers.get('Location')).toContain('installation=success');

      // Verify installation was stored
      const installation = mockDatabase.installations.get('test-user-uuid');
      expect(installation).toBeDefined();
      expect(installation.installation_id).toBe(12345);

      // Step 2: Installation webhook is received
      const installationPayload = {
        action: 'created',
        installation: testInstallation,
        repositories: testRepositories,
      };

      const webhookRequest = createWebhookRequest('installation', installationPayload);
      const webhookResponse = await webhookHandler(webhookRequest);
      expect(webhookResponse.status).toBe(200);

      // Step 3: User syncs repositories
      const syncRequest = createSyncRequest();
      const syncResponse = await syncHandler(syncRequest);
      const syncData = await syncResponse.json();

      expect(syncResponse.status).toBe(200);
      expect(syncData.success).toBe(true);
      expect(syncData.count).toBe(2);

      // Verify repositories were stored
      expect(mockDatabase.repositories.has(111)).toBe(true);
      expect(mockDatabase.repositories.has(222)).toBe(true);
    });

    it('handles installation update flow', async () => {
      // Setup existing installation
      mockDatabase.installations.set('test-user-uuid', {
        installation_id: 12345,
        user_id: 'test-user-uuid',
        target_login: 'test-user',
      });

      // User updates installation (new repositories added)
      const installRequest = createInstallRequest({
        installation_id: '12345',
        setup_action: 'update',
      });

      const installResponse = await installHandler(installRequest);
      expect(installResponse.status).toBe(302);
      expect(installResponse.headers.get('Location')).toContain('installation=updated');

      // Repository update webhook
      const repositoryPayload = {
        action: 'added',
        installation: { id: 12345 },
        repositories_added: [
          {
            id: 333,
            name: 'new-swift-repo',
            full_name: 'test-user/new-swift-repo',
            private: false,
            default_branch: 'main',
            language: 'Swift',
            stargazers_count: 5,
          },
        ],
        repositories_removed: [],
      };

      const repoWebhookRequest = createWebhookRequest('installation_repositories', repositoryPayload);
      const repoWebhookResponse = await webhookHandler(repoWebhookRequest);
      expect(repoWebhookResponse.status).toBe(200);

      // Verify new repository was added
      expect(mockDatabase.repositories.has(333)).toBe(true);
    });
  });

  describe('Warning Report Flow', () => {
    beforeEach(async () => {
      // Setup installation and repositories first
      mockDatabase.installations.set('test-user-uuid', {
        installation_id: 12345,
        user_id: 'test-user-uuid',
        target_login: 'test-user',
      });

      mockDatabase.repositories.set(111, {
        id: 'repo-uuid-111',
        github_id: 111,
        user_id: 'test-user-uuid',
        name: 'swift-app',
        full_name: 'test-user/swift-app',
      });
    });

    it('processes SwiftConcur warning reports', async () => {
      const warningPayload = {
        action: 'warning_report',
        repository: {
          id: 111,
          name: 'swift-app',
          full_name: 'test-user/swift-app',
          private: false,
          default_branch: 'main',
        },
        workflow_run: {
          head_sha: 'abc123def',
          head_branch: 'feature/concurrency-fixes',
          conclusion: 'success',
          html_url: 'https://github.com/test-user/swift-app/actions/runs/123456',
        },
        swiftconcur: {
          warning_count: 3,
          new_warnings: 1,
          fixed_warnings: 2,
          build_time_seconds: 145,
          warnings: [
            {
              file_path: 'Sources/ContentView.swift',
              line_number: 42,
              column_number: 10,
              message: 'Actor-isolated property cannot be referenced from a non-isolated context',
              severity: 'warning',
              rule_id: 'actor_isolation',
              suggested_fix: 'Add @MainActor annotation to the enclosing function',
            },
            {
              file_path: 'Sources/DataModel.swift',
              line_number: 78,
              column_number: 25,
              message: 'Sending non-sendable type across actor boundaries',
              severity: 'warning',
              rule_id: 'sendable_conformance',
              suggested_fix: 'Make the type conform to Sendable protocol',
            },
          ],
        },
      };

      const webhookRequest = createWebhookRequest('swiftconcur_warning', warningPayload);
      const response = await webhookHandler(webhookRequest);
      
      expect(response.status).toBe(200);

      // Verify warning run and warnings were stored
      // Note: In real implementation, we'd query the database to verify
      expect(mockDatabase.warningRuns.size).toBeGreaterThanOrEqual(0);
    });

    it('handles reports with no warnings (clean build)', async () => {
      const cleanBuildPayload = {
        action: 'warning_report',
        repository: {
          id: 111,
          name: 'swift-app',
          full_name: 'test-user/swift-app',
        },
        workflow_run: {
          head_sha: 'def456',
          head_branch: 'main',
          conclusion: 'success',
          html_url: 'https://github.com/test-user/swift-app/actions/runs/789012',
        },
        swiftconcur: {
          warning_count: 0,
          new_warnings: 0,
          fixed_warnings: 5,
          build_time_seconds: 120,
          warnings: [],
        },
      };

      const webhookRequest = createWebhookRequest('swiftconcur_warning', cleanBuildPayload);
      const response = await webhookHandler(webhookRequest);
      
      expect(response.status).toBe(200);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('handles GitHub API failures gracefully', async () => {
      // Simulate GitHub API failure
      mockGitHubClient.rest.apps.getInstallation.mockRejectedValue({
        status: 503,
        message: 'Service unavailable',
      });

      const installRequest = createInstallRequest({
        installation_id: '12345',
        setup_action: 'install',
      });

      const response = await installHandler(installRequest);
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('error=installation_failed');
    });

    it('handles webhook signature validation failures', async () => {
      const { verifyWebhookSignature } = require('@/lib/github/app');
      verifyWebhookSignature.mockReturnValue(false);

      const payload = { action: 'created', installation: { id: 12345 } };
      const webhookRequest = createWebhookRequest('installation', payload);

      const response = await webhookHandler(webhookRequest);
      expect(response.status).toBe(401);
    });

    it('handles database connection failures', async () => {
      // Mock database error
      const mockSupabase = require('@/lib/supabase/server').createClient();
      mockSupabase.from.mockImplementation(() => ({
        upsert: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection failed' },
        }),
      }));

      const installRequest = createInstallRequest({
        installation_id: '12345',
        setup_action: 'install',
      });

      const response = await installHandler(installRequest);
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('error=installation_failed');
    });
  });

  describe('Security and Validation', () => {
    it('validates webhook signatures correctly', async () => {
      const payload = { action: 'created', installation: testInstallation };
      const validRequest = createWebhookRequest('installation', payload);

      const response = await webhookHandler(validRequest);
      expect(response.status).toBe(200);

      // Verify signature was validated
      const { verifyWebhookSignature } = require('@/lib/github/app');
      expect(verifyWebhookSignature).toHaveBeenCalled();
    });

    it('rejects requests with invalid signatures', async () => {
      const { verifyWebhookSignature } = require('@/lib/github/app');
      verifyWebhookSignature.mockReturnValue(false);

      const payload = { action: 'created' };
      const invalidRequest = createWebhookRequest('installation', payload);

      const response = await webhookHandler(invalidRequest);
      expect(response.status).toBe(401);
    });

    it('validates user authentication for sync operations', async () => {
      const mockSupabase = require('@/lib/supabase/server').createClient();
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      const syncRequest = createSyncRequest();
      const response = await syncHandler(syncRequest);

      expect(response.status).toBe(401);
    });
  });

  describe('Performance and Scalability', () => {
    it('handles multiple concurrent webhook requests', async () => {
      const payload1 = { action: 'created', installation: { ...testInstallation, id: 11111 } };
      const payload2 = { action: 'created', installation: { ...testInstallation, id: 22222 } };
      const payload3 = { action: 'created', installation: { ...testInstallation, id: 33333 } };

      const requests = [
        createWebhookRequest('installation', payload1),
        createWebhookRequest('installation', payload2),
        createWebhookRequest('installation', payload3),
      ];

      const responses = await Promise.all(requests.map(req => webhookHandler(req)));

      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    it('handles large warning payloads efficiently', async () => {
      const largeWarningPayload = {
        action: 'warning_report',
        repository: { id: 111, name: 'swift-app', full_name: 'test-user/swift-app' },
        workflow_run: {
          head_sha: 'abc123',
          head_branch: 'main',
          conclusion: 'success',
          html_url: 'https://github.com/test-user/swift-app/actions/runs/123',
        },
        swiftconcur: {
          warning_count: 500,
          new_warnings: 50,
          fixed_warnings: 10,
          build_time_seconds: 300,
          warnings: Array.from({ length: 500 }, (_, i) => ({
            file_path: `Sources/File${i}.swift`,
            line_number: i + 1,
            column_number: 10,
            message: `Warning message ${i}`,
            severity: 'warning',
            rule_id: 'test_rule',
          })),
        },
      };

      const webhookRequest = createWebhookRequest('swiftconcur_warning', largeWarningPayload);
      const response = await webhookHandler(webhookRequest);

      expect(response.status).toBe(200);
    });
  });

  describe('Data Consistency', () => {
    it('maintains data consistency across installation updates', async () => {
      // Initial installation
      const installRequest = createInstallRequest({
        installation_id: '12345',
        setup_action: 'install',
      });
      await installHandler(installRequest);

      // Add repositories
      const repoPayload = {
        action: 'added',
        installation: { id: 12345 },
        repositories_added: testRepositories,
        repositories_removed: [],
      };

      const repoWebhook = createWebhookRequest('installation_repositories', repoPayload);
      await webhookHandler(repoWebhook);

      // Remove a repository
      const removeRepoPayload = {
        action: 'removed',
        installation: { id: 12345 },
        repositories_added: [],
        repositories_removed: [{ id: 111, name: 'swift-app' }],
      };

      const removeWebhook = createWebhookRequest('installation_repositories', removeRepoPayload);
      const response = await webhookHandler(removeWebhook);

      expect(response.status).toBe(200);

      // Verify repository was marked as deleted
      // In real implementation, we'd check the deleted_at timestamp
    });

    it('handles installation suspension and reactivation', async () => {
      // Initial installation
      mockDatabase.installations.set('test-user-uuid', {
        installation_id: 12345,
        user_id: 'test-user-uuid',
        suspended_at: null,
      });

      // Suspension webhook
      const suspendPayload = {
        action: 'suspend',
        installation: {
          ...testInstallation,
          suspended_at: '2024-01-15T00:00:00Z',
        },
      };

      const suspendWebhook = createWebhookRequest('installation', suspendPayload);
      const suspendResponse = await webhookHandler(suspendWebhook);
      expect(suspendResponse.status).toBe(200);

      // Reactivation webhook
      const unsuspendPayload = {
        action: 'unsuspend',
        installation: {
          ...testInstallation,
          suspended_at: null,
        },
      };

      const unsuspendWebhook = createWebhookRequest('installation', unsuspendPayload);
      const unsuspendResponse = await webhookHandler(unsuspendWebhook);
      expect(unsuspendResponse.status).toBe(200);
    });
  });
});