import { describe, it, expect } from 'vitest';
import { RepositoryService } from '../../src/models/repository';

describe('RepositoryService', () => {
  describe('getPlanLimits', () => {
    it('should return correct limits for free tier', () => {
      const limits = RepositoryService.getPlanLimits('free');
      
      expect(limits).toEqual({
        requestsPerHour: 100,
        maxWarningsPerRun: 100,
        maxRunsStored: 30,
        aiSummaryEnabled: false,
        notificationsEnabled: false,
      });
    });
    
    it('should return correct limits for pro tier', () => {
      const limits = RepositoryService.getPlanLimits('pro');
      
      expect(limits).toEqual({
        requestsPerHour: 1000,
        maxWarningsPerRun: 1000,
        maxRunsStored: 365,
        aiSummaryEnabled: true,
        notificationsEnabled: true,
      });
    });
    
    it('should return correct limits for enterprise tier', () => {
      const limits = RepositoryService.getPlanLimits('enterprise');
      
      expect(limits).toEqual({
        requestsPerHour: 10000,
        maxWarningsPerRun: 10000,
        maxRunsStored: -1,
        aiSummaryEnabled: true,
        notificationsEnabled: true,
      });
    });
  });
  
  describe('validateRepositoryAccess', () => {
    it('should allow access within free tier limits', () => {
      const result = RepositoryService.validateRepositoryAccess(
        'repo-id',
        'free',
        50 // Within 100 warning limit
      );
      
      expect(result).toBe(true);
    });
    
    it('should deny access exceeding free tier limits', () => {
      const result = RepositoryService.validateRepositoryAccess(
        'repo-id',
        'free',
        150 // Exceeds 100 warning limit
      );
      
      expect(result).toBe(false);
    });
    
    it('should allow access within pro tier limits', () => {
      const result = RepositoryService.validateRepositoryAccess(
        'repo-id',
        'pro',
        500 // Within 1000 warning limit
      );
      
      expect(result).toBe(true);
    });
    
    it('should deny access exceeding pro tier limits', () => {
      const result = RepositoryService.validateRepositoryAccess(
        'repo-id',
        'pro',
        1500 // Exceeds 1000 warning limit
      );
      
      expect(result).toBe(false);
    });
    
    it('should allow access within enterprise tier limits', () => {
      const result = RepositoryService.validateRepositoryAccess(
        'repo-id',
        'enterprise',
        5000 // Within 10000 warning limit
      );
      
      expect(result).toBe(true);
    });
    
    it('should deny access exceeding enterprise tier limits', () => {
      const result = RepositoryService.validateRepositoryAccess(
        'repo-id',
        'enterprise',
        15000 // Exceeds 10000 warning limit
      );
      
      expect(result).toBe(false);
    });
    
    it('should handle edge case at exact limit', () => {
      const result = RepositoryService.validateRepositoryAccess(
        'repo-id',
        'free',
        100 // Exactly at limit
      );
      
      expect(result).toBe(true);
    });
    
    it('should handle zero warnings', () => {
      const result = RepositoryService.validateRepositoryAccess(
        'repo-id',
        'free',
        0
      );
      
      expect(result).toBe(true);
    });
  });
});