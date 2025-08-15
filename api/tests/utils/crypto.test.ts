import { describe, it, expect } from 'vitest';
import { CryptoUtils } from '../../src/utils/crypto';

describe('CryptoUtils', () => {
  describe('generateSecureToken', () => {
    it('should generate token of correct length', async () => {
      const token = await CryptoUtils.generateSecureToken(16);
      expect(token).toHaveLength(32); // 16 bytes = 32 hex characters
    });
    
    it('should generate different tokens on each call', async () => {
      const token1 = await CryptoUtils.generateSecureToken(16);
      const token2 = await CryptoUtils.generateSecureToken(16);
      
      expect(token1).not.toBe(token2);
    });
    
    it('should generate token with default length', async () => {
      const token = await CryptoUtils.generateSecureToken();
      expect(token).toHaveLength(64); // 32 bytes = 64 hex characters
    });
    
    it('should only contain valid hex characters', async () => {
      const token = await CryptoUtils.generateSecureToken(8);
      expect(token).toMatch(/^[0-9a-f]+$/);
    });
  });
  
  describe('generateRepoToken', () => {
    it('should generate token with correct format', async () => {
      const repoId = '123e4567-e89b-12d3-a456-426614174000';
      const token = await CryptoUtils.generateRepoToken(repoId);
      
      expect(token).toMatch(/^scr_[a-z0-9]+_[a-f0-9]{32}$/);
    });
    
    it('should generate different tokens for same repo', async () => {
      const repoId = '123e4567-e89b-12d3-a456-426614174000';
      const token1 = await CryptoUtils.generateRepoToken(repoId);
      const token2 = await CryptoUtils.generateRepoToken(repoId);
      
      expect(token1).not.toBe(token2);
    });
    
    it('should include timestamp component', async () => {
      const repoId = '123e4567-e89b-12d3-a456-426614174000';
      const token = await CryptoUtils.generateRepoToken(repoId);
      
      const parts = token.split('_');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('scr');
      expect(parts[1]).toMatch(/^[a-z0-9]+$/); // Timestamp in base36
      expect(parts[2]).toMatch(/^[a-f0-9]{32}$/); // Random hex
    });
  });
  
  describe('validateTokenFormat', () => {
    it('should validate correct token format', () => {
      const validToken = 'scr_abc123_0123456789abcdef0123456789abcdef';
      expect(CryptoUtils.validateTokenFormat(validToken)).toBe(true);
    });
    
    it('should reject token without prefix', () => {
      const invalidToken = 'abc123_0123456789abcdef0123456789abcdef';
      expect(CryptoUtils.validateTokenFormat(invalidToken)).toBe(false);
    });
    
    it('should reject token with wrong prefix', () => {
      const invalidToken = 'wrong_abc123_0123456789abcdef0123456789abcdef';
      expect(CryptoUtils.validateTokenFormat(invalidToken)).toBe(false);
    });
    
    it('should reject token with invalid hex portion', () => {
      const invalidToken = 'scr_abc123_invalidhexstring';
      expect(CryptoUtils.validateTokenFormat(invalidToken)).toBe(false);
    });
    
    it('should reject token with wrong structure', () => {
      const invalidToken = 'scr_onlyonepart';
      expect(CryptoUtils.validateTokenFormat(invalidToken)).toBe(false);
    });
    
    it('should reject empty token', () => {
      expect(CryptoUtils.validateTokenFormat('')).toBe(false);
    });
    
    it('should reject token with uppercase letters in hex', () => {
      const invalidToken = 'scr_abc123_0123456789ABCDEF0123456789ABCDEF';
      expect(CryptoUtils.validateTokenFormat(invalidToken)).toBe(false);
    });
  });
  
  describe('sha256', () => {
    it('should generate consistent hash for same input', async () => {
      const input = 'test string';
      const hash1 = await CryptoUtils.sha256(input);
      const hash2 = await CryptoUtils.sha256(input);
      
      expect(hash1).toBe(hash2);
    });
    
    it('should generate different hashes for different inputs', async () => {
      const hash1 = await CryptoUtils.sha256('input1');
      const hash2 = await CryptoUtils.sha256('input2');
      
      expect(hash1).not.toBe(hash2);
    });
    
    it('should generate 64-character hex string', async () => {
      const hash = await CryptoUtils.sha256('test');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
    
    it('should handle empty string', async () => {
      const hash = await CryptoUtils.sha256('');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });
  
  describe('timingSafeEqual', () => {
    it('should return true for identical strings', () => {
      const str = 'test string';
      expect(CryptoUtils.timingSafeEqual(str, str)).toBe(true);
    });
    
    it('should return false for different strings', () => {
      expect(CryptoUtils.timingSafeEqual('test1', 'test2')).toBe(false);
    });
    
    it('should return false for different length strings', () => {
      expect(CryptoUtils.timingSafeEqual('short', 'much longer string')).toBe(false);
    });
    
    it('should return true for empty strings', () => {
      expect(CryptoUtils.timingSafeEqual('', '')).toBe(true);
    });
    
    it('should be case sensitive', () => {
      expect(CryptoUtils.timingSafeEqual('Test', 'test')).toBe(false);
    });
    
    it('should handle unicode characters', () => {
      const str = 'test 🚀 string';
      expect(CryptoUtils.timingSafeEqual(str, str)).toBe(true);
      expect(CryptoUtils.timingSafeEqual(str, 'test 🔥 string')).toBe(false);
    });
  });
  
  describe('generateRateLimitKey', () => {
    it('should generate correct rate limit key format', () => {
      const key = CryptoUtils.generateRateLimitKey('rate_limit', 'user123');
      expect(key).toBe('rate_limit:user123');
    });
    
    it('should handle different prefixes', () => {
      const key = CryptoUtils.generateRateLimitKey('api_calls', 'repo456');
      expect(key).toBe('api_calls:repo456');
    });
    
    it('should handle empty identifier', () => {
      const key = CryptoUtils.generateRateLimitKey('prefix', '');
      expect(key).toBe('prefix:');
    });
    
    it('should handle special characters in identifier', () => {
      const key = CryptoUtils.generateRateLimitKey('prefix', 'user@domain.com');
      expect(key).toBe('prefix:user@domain.com');
    });
  });
});