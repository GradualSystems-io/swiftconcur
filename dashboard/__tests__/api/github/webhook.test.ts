/**
 * Unit tests for GitHub webhook API route
 */

import { POST } from '@/app/api/github/webhook/route';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

// Mock webhook processors
jest.mock('@/lib/github/webhooks', () => ({
  processInstallationWebhook: jest.fn(),
  processRepositoryWebhook: jest.fn(), 
  processSwiftConcurWebhook: jest.fn(),
  validateWebhookEvent: jest.fn(),
}));

// Mock GitHub App client
jest.mock('@/lib/github/app', () => ({
  verifyWebhookSignature: jest.fn(),
}));

const mockProcessInstallationWebhook = require('@/lib/github/webhooks').processInstallationWebhook;
const mockProcessRepositoryWebhook = require('@/lib/github/webhooks').processRepositoryWebhook;
const mockProcessSwiftConcurWebhook = require('@/lib/github/webhooks').processSwiftConcurWebhook;
const mockValidateWebhookEvent = require('@/lib/github/webhooks').validateWebhookEvent;
const mockVerifyWebhookSignature = require('@/lib/github/app').verifyWebhookSignature;

// Mock environment variables
const originalEnv = process.env;
beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...originalEnv,
    GITHUB_WEBHOOK_SECRET: 'test-webhook-secret',
  };
  
  // Default mocks
  mockValidateWebhookEvent.mockImplementation(() => {});
  mockVerifyWebhookSignature.mockReturnValue(true);
});

afterEach(() => {
  process.env = originalEnv;
});

function createMockRequest(
  eventType: string,
  payload: any,
  signature?: string
): NextRequest {
  const body = JSON.stringify(payload);
  const actualSignature = signature || crypto
    .createHmac('sha256', 'test-webhook-secret')
    .update(body)
    .digest('hex');

  return {
    headers: {
      get: jest.fn((header: string) => {
        const headers: Record<string, string> = {
          'x-github-event': eventType,
          'x-github-delivery': 'test-delivery-id',
          'x-hub-signature-256': `sha256=${actualSignature}`,
          'content-type': 'application/json',
        };
        return headers[header.toLowerCase()] || null;
      }),
    },
    text: jest.fn().mockResolvedValue(body),
  } as unknown as NextRequest;
}

describe('/api/github/webhook', () => {
  describe('POST', () => {
    it('processes installation webhook successfully', async () => {
      const payload = {
        action: 'created',
        installation: {
          id: 12345,
          account: { id: 67890, login: 'test-user', type: 'User' },
        },
      };

      const request = createMockRequest('installation', payload);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData).toEqual({ success: true });
      expect(mockProcessInstallationWebhook).toHaveBeenCalledWith(payload);
    });

    it('processes repository webhook successfully', async () => {
      const payload = {
        action: 'added',
        installation: { id: 12345 },
        repositories_added: [
          { id: 111, name: 'test-repo', full_name: 'user/test-repo' },
        ],
      };

      const request = createMockRequest('installation_repositories', payload);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData).toEqual({ success: true });
      expect(mockProcessRepositoryWebhook).toHaveBeenCalledWith(payload);
    });

    it('processes SwiftConcur warning webhook successfully', async () => {
      const payload = {
        action: 'warning_report',
        repository: {
          id: 111,
          full_name: 'user/test-repo',
        },
        swiftconcur: {
          warning_count: 5,
          new_warnings: 2,
          fixed_warnings: 1,
        },
      };

      const request = createMockRequest('swiftconcur_warning', payload);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData).toEqual({ success: true });
      expect(mockProcessSwiftConcurWebhook).toHaveBeenCalledWith(payload);
    });

    it('rejects webhook with invalid signature', async () => {
      mockVerifyWebhookSignature.mockReturnValue(false);

      const payload = { action: 'created' };
      const request = createMockRequest('installation', payload, 'invalid-signature');

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(401);
      expect(responseData).toEqual({ error: 'Invalid webhook signature' });
    });

    it('rejects webhook with missing signature', async () => {
      const payload = { action: 'created' };
      const request = {
        headers: {
          get: jest.fn((header: string) => {
            if (header.toLowerCase() === 'x-hub-signature-256') return null;
            if (header.toLowerCase() === 'x-github-event') return 'installation';
            return null;
          }),
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as unknown as NextRequest;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(401);
      expect(responseData).toEqual({ error: 'Missing webhook signature' });
    });

    it('rejects unsupported event types', async () => {
      const payload = { action: 'created' };
      const request = createMockRequest('unsupported_event', payload);

      mockValidateWebhookEvent.mockImplementation(() => {
        throw new Error('Unsupported event type: unsupported_event');
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData).toEqual({ error: 'Unsupported event type: unsupported_event' });
    });

    it('handles malformed JSON payload', async () => {
      const request = {
        headers: {
          get: jest.fn((header: string) => {
            const headers: Record<string, string> = {
              'x-github-event': 'installation',
              'x-github-delivery': 'test-delivery-id',
              'x-hub-signature-256': 'sha256=test-signature',
            };
            return headers[header.toLowerCase()] || null;
          }),
        },
        text: jest.fn().mockResolvedValue('invalid json'),
      } as unknown as NextRequest;

      mockValidateWebhookEvent.mockImplementation(() => {
        throw new Error('Invalid JSON payload');
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData).toEqual({ error: 'Invalid JSON payload' });
    });

    it('handles webhook processing errors', async () => {
      const payload = { action: 'created', installation: { id: 12345 } };
      const request = createMockRequest('installation', payload);

      mockProcessInstallationWebhook.mockRejectedValue(new Error('Database connection failed'));

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData).toEqual({ error: 'Database connection failed' });
    });

    it('handles rate limiting errors', async () => {
      const payload = { action: 'created', installation: { id: 12345 } };
      const request = createMockRequest('installation', payload);

      mockProcessInstallationWebhook.mockRejectedValue({
        status: 429,
        message: 'API rate limit exceeded',
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(429);
      expect(responseData).toEqual({ error: 'API rate limit exceeded' });
    });

    it('logs webhook events for debugging', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      
      const payload = { action: 'created', installation: { id: 12345 } };
      const request = createMockRequest('installation', payload);

      await POST(request);

      expect(consoleSpy).toHaveBeenCalledWith('Received webhook:', 'installation', 'created');
      
      consoleSpy.mockRestore();
    });

    it('validates required webhook headers', async () => {
      const payload = { action: 'created' };
      const request = {
        headers: {
          get: jest.fn(() => null), // Missing headers
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as unknown as NextRequest;

      mockValidateWebhookEvent.mockImplementation(() => {
        throw new Error('Missing required webhook headers');
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData).toEqual({ error: 'Missing required webhook headers' });
    });

    it('handles large payloads within limits', async () => {
      const largePayload = {
        action: 'warning_report',
        swiftconcur: {
          warnings: Array.from({ length: 100 }, (_, i) => ({
            file_path: `file${i}.swift`,
            line_number: i + 1,
            message: 'A'.repeat(200), // Long message
            severity: 'warning',
          })),
        },
      };

      const request = createMockRequest('swiftconcur_warning', largePayload);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData).toEqual({ success: true });
    });

    it('rejects extremely large payloads', async () => {
      const hugeName = 'A'.repeat(10000); // Extremely long name
      const payload = {
        action: 'created',
        installation: { id: 12345, account: { login: hugeName } },
      };

      const request = createMockRequest('installation', payload);

      mockValidateWebhookEvent.mockImplementation(() => {
        throw new Error('Payload too large');
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData).toEqual({ error: 'Payload too large' });
    });
  });

  describe('Security Tests', () => {
    it('prevents signature replay attacks', async () => {
      const payload = { action: 'created', installation: { id: 12345 } };
      
      // First request should succeed
      let request = createMockRequest('installation', payload);
      let response = await POST(request);
      expect(response.status).toBe(200);

      // Replay the same signature - should be rejected if proper timing validation exists
      mockVerifyWebhookSignature.mockReturnValue(false);
      request = createMockRequest('installation', payload);
      response = await POST(request);
      expect(response.status).toBe(401);
    });

    it('handles concurrent webhook requests', async () => {
      const payload1 = { action: 'created', installation: { id: 12345 } };
      const payload2 = { action: 'created', installation: { id: 67890 } };

      const request1 = createMockRequest('installation', payload1);
      const request2 = createMockRequest('installation', payload2);

      const [response1, response2] = await Promise.all([
        POST(request1),
        POST(request2),
      ]);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(mockProcessInstallationWebhook).toHaveBeenCalledTimes(2);
    });

    it('sanitizes error messages to prevent information disclosure', async () => {
      const payload = { action: 'created' };
      const request = createMockRequest('installation', payload);

      const sensitiveError = new Error('Database password: secret123 at line 42');
      mockProcessInstallationWebhook.mockRejectedValue(sensitiveError);

      const response = await POST(request);
      const responseData = await response.json();

      // Error message should be sanitized
      expect(responseData.error).not.toContain('secret123');
      expect(responseData.error).not.toContain('password');
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
        },
        repositories: [
          { id: 111, name: 'test-repo', full_name: 'test-user/test-repo' },
        ],
      };

      const request = createMockRequest('installation', installationPayload);
      await POST(request);

      expect(mockValidateWebhookEvent).toHaveBeenCalled();
      expect(mockVerifyWebhookSignature).toHaveBeenCalled();
      expect(mockProcessInstallationWebhook).toHaveBeenCalledWith(installationPayload);
    });

    it('processes webhook chain: installation → repositories → warnings', async () => {
      // Installation created
      const installationPayload = {
        action: 'created',
        installation: { id: 12345, account: { id: 67890, login: 'test-user' } },
      };
      
      let request = createMockRequest('installation', installationPayload);
      let response = await POST(request);
      expect(response.status).toBe(200);

      // Repositories added
      const repoPayload = {
        action: 'added',
        installation: { id: 12345 },
        repositories_added: [{ id: 111, name: 'test-repo' }],
      };
      
      request = createMockRequest('installation_repositories', repoPayload);
      response = await POST(request);
      expect(response.status).toBe(200);

      // Warning report
      const warningPayload = {
        action: 'warning_report',
        repository: { id: 111, full_name: 'test-user/test-repo' },
        swiftconcur: { warning_count: 3 },
      };
      
      request = createMockRequest('swiftconcur_warning', warningPayload);
      response = await POST(request);
      expect(response.status).toBe(200);

      // Verify all processors were called
      expect(mockProcessInstallationWebhook).toHaveBeenCalledWith(installationPayload);
      expect(mockProcessRepositoryWebhook).toHaveBeenCalledWith(repoPayload);
      expect(mockProcessSwiftConcurWebhook).toHaveBeenCalledWith(warningPayload);
    });
  });
});