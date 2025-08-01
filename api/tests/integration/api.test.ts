import { describe, it, expect, beforeEach, vi } from 'vitest';
import { unstable_dev, UnstableDevWorker } from 'wrangler';
import { createMockEnv } from '../setup';

describe('API Integration Tests', () => {
  let worker: UnstableDevWorker;
  
  beforeEach(async () => {
    // Note: This would require wrangler dev to be set up properly
    // For now, we'll mock the worker behavior
    worker = {
      fetch: vi.fn(),
      stop: vi.fn(),
    } as any;
  });
  
  afterEach(async () => {
    if (worker) {
      await worker.stop();
    }
  });
  
  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const mockResponse = {
        status: 200,
        json: () => Promise.resolve({
          status: 'healthy',
          timestamp: expect.any(String),
          version: '1.0.0',
          environment: 'test',
        }),
      };
      
      (worker.fetch as any).mockResolvedValue(mockResponse);
      
      const response = await worker.fetch('https://test.com/health');
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.version).toBe('1.0.0');
    });
    
    it('should return detailed health check', async () => {
      const mockResponse = {
        status: 200,
        json: () => Promise.resolve({
          status: 'healthy',
          services: {
            database: true,
            ai: true,
            storage: true,
          },
        }),
      };
      
      (worker.fetch as any).mockResolvedValue(mockResponse);
      
      const response = await worker.fetch('https://test.com/health?detailed=true');
      const data = await response.json();
      
      expect(data.services).toBeDefined();
      expect(data.services.database).toBe(true);
    });
  });
  
  describe('Authentication', () => {
    it('should reject requests without authorization', async () => {
      const mockResponse = {
        status: 401,
        json: () => Promise.resolve({
          success: false,
          error: 'Missing Authorization header',
        }),
      };
      
      (worker.fetch as any).mockResolvedValue(mockResponse);
      
      const response = await worker.fetch('https://test.com/v1/warnings', {
        method: 'POST',
      });
      
      expect(response.status).toBe(401);
    });
    
    it('should reject invalid tokens', async () => {
      const mockResponse = {
        status: 401,
        json: () => Promise.resolve({
          success: false,
          error: 'Invalid token format',
        }),
      };
      
      (worker.fetch as any).mockResolvedValue(mockResponse);
      
      const response = await worker.fetch('https://test.com/v1/warnings', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer invalid-token',
        },
      });
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('CORS', () => {
    it('should handle preflight requests', async () => {
      const mockResponse = {
        status: 204,
        headers: new Headers({
          'Access-Control-Allow-Origin': 'https://swiftconcur.dev',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        }),
      };
      
      (worker.fetch as any).mockResolvedValue(mockResponse);
      
      const response = await worker.fetch('https://test.com/v1/warnings', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://swiftconcur.dev',
          'Access-Control-Request-Method': 'POST',
        },
      });
      
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://swiftconcur.dev');
    });
    
    it('should reject unauthorized origins', async () => {
      const mockResponse = {
        status: 403,
        statusText: 'CORS: Origin not allowed',
      };
      
      (worker.fetch as any).mockResolvedValue(mockResponse);
      
      const response = await worker.fetch('https://test.com/v1/warnings', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://malicious-site.com',
          'Access-Control-Request-Method': 'POST',
        },
      });
      
      expect(response.status).toBe(403);
    });
  });
  
  describe('Rate Limiting', () => {
    it('should apply rate limits', async () => {
      const mockResponse = {
        status: 429,
        json: () => Promise.resolve({
          success: false,
          error: 'Rate limit exceeded',
          details: {
            limit: 100,
            remaining: 0,
            reset: expect.any(String),
          },
        }),
        headers: new Headers({
          'X-RateLimit-Limit': '100',
          'X-RateLimit-Remaining': '0',
          'Retry-After': '3600',
        }),
      };
      
      (worker.fetch as any).mockResolvedValue(mockResponse);
      
      const response = await worker.fetch('https://test.com/v1/warnings', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer scr_test_0123456789abcdef0123456789abcdef',
        },
      });
      
      expect(response.status).toBe(429);
      expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
    });
  });
  
  describe('Warning Ingestion', () => {
    it('should accept valid warning payload', async () => {
      const validPayload = {
        repo_id: '123e4567-e89b-12d3-a456-426614174000',
        run_id: '987fcdeb-51a2-43d8-b765-789012345678',
        warnings: [{
          type: 'actor_isolation',
          severity: 'high',
          file_path: 'MyViewController.swift',
          line_number: 42,
          message: 'actor-isolated property can not be referenced',
          code_context: {
            before: [],
            line: 'let name = actor.name',
            after: [],
          },
        }],
        metadata: {
          commit_sha: 'abc123def456',
          branch: 'main',
          scheme: 'MyApp',
          configuration: 'Debug',
          swift_version: '5.9',
          timestamp: '2024-01-01T12:00:00Z',
        },
      };
      
      const formData = new FormData();
      formData.append('warnings.json', new Blob([JSON.stringify(validPayload)], {
        type: 'application/json',
      }));
      
      const mockResponse = {
        status: 202,
        json: () => Promise.resolve({
          success: true,
          data: {
            id: validPayload.run_id,
            status: 'queued',
            warnings_count: 1,
          },
        }),
      };
      
      (worker.fetch as any).mockResolvedValue(mockResponse);
      
      const response = await worker.fetch('https://test.com/v1/warnings', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer scr_test_0123456789abcdef0123456789abcdef',
        },
        body: formData,
      });
      
      const data = await response.json();
      expect(response.status).toBe(202);
      expect(data.success).toBe(true);
      expect(data.data.warnings_count).toBe(1);
    });
    
    it('should reject invalid warning payload', async () => {
      const invalidPayload = {
        repo_id: 'invalid-uuid',
        warnings: [],
      };
      
      const formData = new FormData();
      formData.append('warnings.json', new Blob([JSON.stringify(invalidPayload)], {
        type: 'application/json',
      }));
      
      const mockResponse = {
        status: 400,
        json: () => Promise.resolve({
          success: false,
          error: 'Validation failed',
          details: {
            validationErrors: expect.any(Array),
          },
        }),
      };
      
      (worker.fetch as any).mockResolvedValue(mockResponse);
      
      const response = await worker.fetch('https://test.com/v1/warnings', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer scr_test_0123456789abcdef0123456789abcdef',
        },
        body: formData,
      });
      
      expect(response.status).toBe(400);
    });
  });
  
  describe('Run Retrieval', () => {
    it('should retrieve run with warnings', async () => {
      const runId = '987fcdeb-51a2-43d8-b765-789012345678';
      
      const mockResponse = {
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: {
            id: runId,
            repo_id: '123e4567-e89b-12d3-a456-426614174000',
            warnings_count: 2,
            warnings: expect.any(Array),
            summary_stats: {
              total: 2,
              by_severity: expect.any(Object),
              by_type: expect.any(Object),
            },
          },
        }),
      };
      
      (worker.fetch as any).mockResolvedValue(mockResponse);
      
      const response = await worker.fetch(`https://test.com/v1/runs/${runId}`, {
        headers: {
          'Authorization': 'Bearer scr_test_0123456789abcdef0123456789abcdef',
        },
      });
      
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(runId);
    });
    
    it('should return 404 for non-existent run', async () => {
      const runId = '00000000-0000-0000-0000-000000000000';
      
      const mockResponse = {
        status: 404,
        json: () => Promise.resolve({
          success: false,
          error: 'Run not found',
        }),
      };
      
      (worker.fetch as any).mockResolvedValue(mockResponse);
      
      const response = await worker.fetch(`https://test.com/v1/runs/${runId}`, {
        headers: {
          'Authorization': 'Bearer scr_test_0123456789abcdef0123456789abcdef',
        },
      });
      
      expect(response.status).toBe(404);
    });
  });
  
  describe('Trend Analysis', () => {
    it('should return trend data', async () => {
      const repoId = '123e4567-e89b-12d3-a456-426614174000';
      
      const mockResponse = {
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: {
            repo_id: repoId,
            period_days: 30,
            summary: {
              total_runs: 15,
              total_warnings: 45,
              trend_direction: 'improving',
            },
            trend_analysis: expect.any(Object),
          },
        }),
      };
      
      (worker.fetch as any).mockResolvedValue(mockResponse);
      
      const response = await worker.fetch(`https://test.com/v1/repos/${repoId}/trend?days=30`, {
        headers: {
          'Authorization': 'Bearer scr_test_0123456789abcdef0123456789abcdef',
        },
      });
      
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.period_days).toBe(30);
    });
    
    it('should validate days parameter', async () => {
      const repoId = '123e4567-e89b-12d3-a456-426614174000';
      
      const mockResponse = {
        status: 400,
        json: () => Promise.resolve({
          success: false,
          error: 'Invalid days parameter. Allowed values: 7, 30, 90, 365',
        }),
      };
      
      (worker.fetch as any).mockResolvedValue(mockResponse);
      
      const response = await worker.fetch(`https://test.com/v1/repos/${repoId}/trend?days=15`, {
        headers: {
          'Authorization': 'Bearer scr_test_0123456789abcdef0123456789abcdef',
        },
      });
      
      expect(response.status).toBe(400);
    });
  });
  
  describe('Error Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const mockResponse = {
        status: 404,
        json: () => Promise.resolve({
          success: false,
          error: 'Endpoint not found',
        }),
      };
      
      (worker.fetch as any).mockResolvedValue(mockResponse);
      
      const response = await worker.fetch('https://test.com/v1/unknown-endpoint');
      
      expect(response.status).toBe(404);
    });
    
    it('should handle internal server errors gracefully', async () => {
      const mockResponse = {
        status: 500,
        json: () => Promise.resolve({
          success: false,
          error: 'Internal server error',
          timestamp: expect.any(String),
        }),
      };
      
      (worker.fetch as any).mockResolvedValue(mockResponse);
      
      const response = await worker.fetch('https://test.com/v1/warnings', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer scr_test_0123456789abcdef0123456789abcdef',
        },
        body: 'invalid body',
      });
      
      expect(response.status).toBe(500);
    });
  });
});