import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authMiddleware, generateApiToken, revokeApiToken } from '../../src/middleware/auth';
import { createMockEnv, createMockRequest, createMockContext } from '../setup';

describe('authMiddleware', () => {
  let mockEnv: any;
  let mockContext: any;
  
  beforeEach(() => {
    mockEnv = createMockEnv();
    mockContext = createMockContext();
    vi.clearAllMocks();
  });
  
  it('should skip auth for health check endpoint', async () => {
    const request = createMockRequest('https://api.test.com/health');
    
    const result = await authMiddleware(request, mockEnv, mockContext);
    
    expect(result).toBeUndefined();
    expect(mockEnv.API_TOKENS.get).not.toHaveBeenCalled();
  });
  
  it('should skip auth for OPTIONS requests', async () => {
    const request = createMockRequest('https://api.test.com/v1/warnings', {
      method: 'OPTIONS',
    });
    
    const result = await authMiddleware(request, mockEnv, mockContext);
    
    expect(result).toBeUndefined();
    expect(mockEnv.API_TOKENS.get).not.toHaveBeenCalled();
  });
  
  it('should return 401 for missing Authorization header', async () => {
    const request = createMockRequest('https://api.test.com/v1/warnings');
    
    const result = await authMiddleware(request, mockEnv, mockContext);
    
    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(401);
    
    const body = await result.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Missing Authorization header');
  });
  
  it('should return 401 for invalid Authorization header format', async () => {
    const request = createMockRequest('https://api.test.com/v1/warnings', {
      headers: {
        'Authorization': 'Basic invalid-format',
      },
    });
    
    const result = await authMiddleware(request, mockEnv, mockContext);
    
    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(401);
    
    const body = await result.json();
    expect(body.error).toContain('Invalid Authorization header format');
  });
  
  it('should return 401 for invalid token format', async () => {
    const request = createMockRequest('https://api.test.com/v1/warnings', {
      headers: {
        'Authorization': 'Bearer invalid-token-format',
      },
    });
    
    const result = await authMiddleware(request, mockEnv, mockContext);
    
    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(401);
    
    const body = await result.json();
    expect(body.error).toBe('Invalid token format');
  });
  
  it('should return 401 for non-existent token', async () => {
    const validToken = 'scr_abc123_0123456789abcdef0123456789abcdef';
    mockEnv.API_TOKENS.get.mockResolvedValue(null);
    
    const request = createMockRequest('https://api.test.com/v1/warnings', {
      headers: {
        'Authorization': `Bearer ${validToken}`,
      },
    });
    
    const result = await authMiddleware(request, mockEnv, mockContext);
    
    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(401);
    expect(mockEnv.API_TOKENS.get).toHaveBeenCalledWith(validToken);
    
    const body = await result.json();
    expect(body.error).toBe('Invalid or expired token');
  });
  
  it('should return 401 for invalid repo ID format', async () => {
    const validToken = 'scr_abc123_0123456789abcdef0123456789abcdef';
    mockEnv.API_TOKENS.get.mockResolvedValue('invalid-repo-id');
    
    const request = createMockRequest('https://api.test.com/v1/warnings', {
      headers: {
        'Authorization': `Bearer ${validToken}`,
      },
    });
    
    const result = await authMiddleware(request, mockEnv, mockContext);
    
    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(401);
    
    const body = await result.json();
    expect(body.error).toBe('Invalid token data');
  });
  
  it('should successfully authenticate with valid token', async () => {
    const validToken = 'scr_abc123_0123456789abcdef0123456789abcdef';
    const repoId = '123e4567-e89b-12d3-a456-426614174000';
    mockEnv.API_TOKENS.get.mockResolvedValue(repoId);
    
    const request = createMockRequest('https://api.test.com/v1/warnings', {
      headers: {
        'Authorization': `Bearer ${validToken}`,
      },
    });
    
    const result = await authMiddleware(request, mockEnv, mockContext);
    
    expect(result).toBeUndefined();
    expect(request.repoId).toBe(repoId);
    expect(mockEnv.API_TOKENS.get).toHaveBeenCalledWith(validToken);
  });
  
  it('should handle KV lookup timeout', async () => {
    const validToken = 'scr_abc123_0123456789abcdef0123456789abcdef';
    mockEnv.API_TOKENS.get.mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 6000)) // 6 second delay
    );
    
    const request = createMockRequest('https://api.test.com/v1/warnings', {
      headers: {
        'Authorization': `Bearer ${validToken}`,
      },
    });
    
    const result = await authMiddleware(request, mockEnv, mockContext);
    
    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(503);
    
    const body = await result.json();
    expect(body.error).toBe('Authentication service unavailable');
  });
  
  it('should handle KV lookup error', async () => {
    const validToken = 'scr_abc123_0123456789abcdef0123456789abcdef';
    mockEnv.API_TOKENS.get.mockRejectedValue(new Error('KV error'));
    
    const request = createMockRequest('https://api.test.com/v1/warnings', {
      headers: {
        'Authorization': `Bearer ${validToken}`,
      },
    });
    
    const result = await authMiddleware(request, mockEnv, mockContext);
    
    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(503);
    
    const body = await result.json();
    expect(body.error).toBe('Authentication service unavailable');
  });
});

describe('generateApiToken', () => {
  let mockEnv: any;
  
  beforeEach(() => {
    mockEnv = createMockEnv();
    vi.clearAllMocks();
  });
  
  it('should generate and store token', async () => {
    const repoId = '123e4567-e89b-12d3-a456-426614174000';
    mockEnv.API_TOKENS.put.mockResolvedValue(undefined);
    
    const token = await generateApiToken(mockEnv, repoId);
    
    expect(token).toMatch(/^scr_[a-z0-9]+_[a-f0-9]{32}$/);
    expect(mockEnv.API_TOKENS.put).toHaveBeenCalledWith(
      token,
      repoId,
      { expirationTtl: 365 * 24 * 60 * 60 }
    );
  });
  
  it('should generate different tokens for same repo', async () => {
    const repoId = '123e4567-e89b-12d3-a456-426614174000';
    mockEnv.API_TOKENS.put.mockResolvedValue(undefined);
    
    const token1 = await generateApiToken(mockEnv, repoId);
    const token2 = await generateApiToken(mockEnv, repoId);
    
    expect(token1).not.toBe(token2);
  });
});

describe('revokeApiToken', () => {
  let mockEnv: any;
  
  beforeEach(() => {
    mockEnv = createMockEnv();
    vi.clearAllMocks();
  });
  
  it('should successfully revoke token', async () => {
    const token = 'scr_abc123_0123456789abcdef0123456789abcdef';
    mockEnv.API_TOKENS.delete.mockResolvedValue(undefined);
    
    const result = await revokeApiToken(mockEnv, token);
    
    expect(result).toBe(true);
    expect(mockEnv.API_TOKENS.delete).toHaveBeenCalledWith(token);
  });
  
  it('should handle revocation error gracefully', async () => {
    const token = 'scr_abc123_0123456789abcdef0123456789abcdef';
    mockEnv.API_TOKENS.delete.mockRejectedValue(new Error('KV error'));
    
    const result = await revokeApiToken(mockEnv, token);
    
    expect(result).toBe(false);
  });
});