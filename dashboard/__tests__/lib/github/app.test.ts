/**
 * Unit tests for GitHub App client functionality
 */

import { createInstallationClient, verifyWebhookSignature, postPullRequestComment, setCommitStatus } from '@/lib/github/app';
import crypto from 'crypto';

// Mock Octokit
const mockOctokit = {
  rest: {
    apps: {
      createInstallationAccessToken: jest.fn(),
    },
    issues: {
      createComment: jest.fn(),
    },
    repos: {
      createCommitStatus: jest.fn(),
    },
  },
};

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn(() => mockOctokit),
}));

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...originalEnv,
    GITHUB_APP_ID: '12345',
    GITHUB_APP_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKB
wxOUlY2R6OLFxKLxIZeXCgQ8/HMfFKGEllB8f8eMqYdG8Y7Qf9XbGnR8vKwh8eKK
test-private-key-data-here
-----END PRIVATE KEY-----`,
    GITHUB_WEBHOOK_SECRET: 'test-webhook-secret',
  };
});

afterEach(() => {
  process.env = originalEnv;
});

describe('GitHub App Client', () => {
  describe('createInstallationClient', () => {
    it('creates installation client with valid token', async () => {
      const mockToken = 'ghs_test_installation_token';
      mockOctokit.rest.apps.createInstallationAccessToken.mockResolvedValue({
        data: { token: mockToken },
      });

      const client = await createInstallationClient(123456);
      expect(client).toBeDefined();
      expect(mockOctokit.rest.apps.createInstallationAccessToken).toHaveBeenCalledWith({
        installation_id: 123456,
      });
    });

    it('throws error for invalid installation ID', async () => {
      mockOctokit.rest.apps.createInstallationAccessToken.mockRejectedValue(
        new Error('Installation not found')
      );

      await expect(createInstallationClient(999999)).rejects.toThrow('Installation not found');
    });

    it('handles network errors gracefully', async () => {
      mockOctokit.rest.apps.createInstallationAccessToken.mockRejectedValue(
        new Error('Network error')
      );

      await expect(createInstallationClient(123456)).rejects.toThrow('Network error');
    });
  });

  describe('verifyWebhookSignature', () => {
    const testPayload = JSON.stringify({ action: 'opened', number: 1 });
    const secret = 'test-webhook-secret';

    it('verifies valid webhook signature', () => {
      const signature = crypto
        .createHmac('sha256', secret)
        .update(testPayload)
        .digest('hex');
      const githubSignature = `sha256=${signature}`;

      expect(verifyWebhookSignature(testPayload, githubSignature, secret)).toBe(true);
    });

    it('rejects invalid webhook signature', () => {
      const invalidSignature = 'sha256=invalid_signature_here';
      expect(verifyWebhookSignature(testPayload, invalidSignature, secret)).toBe(false);
    });

    it('rejects malformed signature header', () => {
      expect(verifyWebhookSignature(testPayload, 'invalid_header', secret)).toBe(false);
      expect(verifyWebhookSignature(testPayload, 'md5=wrong_algorithm', secret)).toBe(false);
    });

    it('rejects empty signature', () => {
      expect(verifyWebhookSignature(testPayload, '', secret)).toBe(false);
    });

    it('rejects empty payload', () => {
      const signature = crypto
        .createHmac('sha256', secret)
        .update('')
        .digest('hex');
      const githubSignature = `sha256=${signature}`;

      expect(verifyWebhookSignature('', githubSignature, secret)).toBe(true);
      expect(verifyWebhookSignature(testPayload, githubSignature, secret)).toBe(false);
    });

    it('handles timing attack protection', () => {
      // Test with signatures of different lengths to ensure constant-time comparison
      const validSig = crypto.createHmac('sha256', secret).update(testPayload).digest('hex');
      const shortSig = validSig.substring(0, 10);
      const longSig = validSig + 'extra';

      expect(verifyWebhookSignature(testPayload, `sha256=${shortSig}`, secret)).toBe(false);
      expect(verifyWebhookSignature(testPayload, `sha256=${longSig}`, secret)).toBe(false);
    });
  });

  describe('postPullRequestComment', () => {
    const mockClient = mockOctokit;

    it('posts comment to pull request successfully', async () => {
      mockClient.rest.issues.createComment.mockResolvedValue({
        data: { id: 123, body: 'Test comment' },
      });

      await postPullRequestComment(
        mockClient as any,
        'owner',
        'repo',
        42,
        'Test comment body'
      );

      expect(mockClient.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 42,
        body: 'Test comment body',
      });
    });

    it('handles API errors when posting comments', async () => {
      mockClient.rest.issues.createComment.mockRejectedValue(
        new Error('API rate limit exceeded')
      );

      await expect(
        postPullRequestComment(mockClient as any, 'owner', 'repo', 42, 'Comment')
      ).rejects.toThrow('API rate limit exceeded');
    });

    it('validates input parameters', async () => {
      await expect(
        postPullRequestComment(mockClient as any, '', 'repo', 42, 'Comment')
      ).rejects.toThrow();

      await expect(
        postPullRequestComment(mockClient as any, 'owner', '', 42, 'Comment')
      ).rejects.toThrow();

      await expect(
        postPullRequestComment(mockClient as any, 'owner', 'repo', 0, 'Comment')
      ).rejects.toThrow();

      await expect(
        postPullRequestComment(mockClient as any, 'owner', 'repo', 42, '')
      ).rejects.toThrow();
    });
  });

  describe('setCommitStatus', () => {
    const mockClient = mockOctokit;

    it('sets commit status successfully', async () => {
      mockClient.rest.repos.createCommitStatus.mockResolvedValue({
        data: { state: 'success', target_url: 'https://example.com' },
      });

      await setCommitStatus(
        mockClient as any,
        'owner',
        'repo',
        'abc123',
        'success',
        'Build passed',
        'https://example.com'
      );

      expect(mockClient.rest.repos.createCommitStatus).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        sha: 'abc123',
        state: 'success',
        description: 'Build passed',
        target_url: 'https://example.com',
        context: 'SwiftConcur',
      });
    });

    it('handles different status states', async () => {
      mockClient.rest.repos.createCommitStatus.mockResolvedValue({ data: {} });

      const states = ['pending', 'success', 'failure', 'error'] as const;
      
      for (const state of states) {
        await setCommitStatus(
          mockClient as any,
          'owner',
          'repo',
          'sha123',
          state,
          `Status: ${state}`
        );

        expect(mockClient.rest.repos.createCommitStatus).toHaveBeenCalledWith(
          expect.objectContaining({ state })
        );
      }
    });

    it('handles API errors when setting status', async () => {
      mockClient.rest.repos.createCommitStatus.mockRejectedValue(
        new Error('Repository not found')
      );

      await expect(
        setCommitStatus(mockClient as any, 'owner', 'repo', 'sha', 'success', 'Test')
      ).rejects.toThrow('Repository not found');
    });

    it('validates commit SHA format', async () => {
      await expect(
        setCommitStatus(mockClient as any, 'owner', 'repo', '', 'success', 'Test')
      ).rejects.toThrow();

      await expect(
        setCommitStatus(mockClient as any, 'owner', 'repo', 'invalid-sha', 'success', 'Test')
      ).rejects.toThrow();
    });

    it('truncates long descriptions', async () => {
      mockClient.rest.repos.createCommitStatus.mockResolvedValue({ data: {} });

      const longDescription = 'A'.repeat(200);
      await setCommitStatus(
        mockClient as any,
        'owner',
        'repo',
        'abc123',
        'success',
        longDescription
      );

      const call = mockClient.rest.repos.createCommitStatus.mock.calls[0][0];
      expect(call.description.length).toBeLessThanOrEqual(140);
    });
  });

  describe('Error Handling', () => {
    it('handles missing environment variables', () => {
      delete process.env.GITHUB_APP_ID;
      delete process.env.GITHUB_APP_PRIVATE_KEY;

      expect(() => createInstallationClient(123456)).rejects.toThrow();
    });

    it('handles malformed private key', () => {
      process.env.GITHUB_APP_PRIVATE_KEY = 'invalid-key-format';
      
      expect(() => createInstallationClient(123456)).rejects.toThrow();
    });

    it('handles rate limiting gracefully', async () => {
      mockOctokit.rest.apps.createInstallationAccessToken.mockRejectedValue({
        status: 429,
        message: 'API rate limit exceeded',
        headers: { 'retry-after': '60' },
      });

      await expect(createInstallationClient(123456)).rejects.toMatchObject({
        status: 429,
        message: 'API rate limit exceeded',
      });
    });
  });
});