import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIService } from '../../src/services/openai';
import { createMockEnv } from '../setup';

// Mock OpenAI
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {    
        create: vi.fn(),
      },
    },
  })),
}));

describe('OpenAIService', () => {
  let mockEnv: any;
  let openaiService: OpenAIService;
  let mockOpenAI: any;
  
  beforeEach(() => {
    mockEnv = createMockEnv();
    openaiService = new OpenAIService(mockEnv);
    mockOpenAI = (openaiService as any).client;
    vi.clearAllMocks();
  });
  
  describe('generateSummary', () => {
    const mockWarningData = {
      repo_id: '123e4567-e89b-12d3-a456-426614174000',
      run_id: '987fcdeb-51a2-43d8-b765-789012345678',
      warnings: [
        {
          type: 'actor_isolation' as const,
          severity: 'high' as const,
          file_path: 'MyViewController.swift',
          line_number: 42,
          column_number: 8,
          message: 'actor-isolated property can not be referenced',
          code_context: {
            before: ['class MyViewController {'],
            line: 'let name = actor.name',
            after: ['}'],
          },
        },
        {
          type: 'data_race' as const,
          severity: 'critical' as const,
          file_path: 'DataManager.swift',
          line_number: 15,
          message: 'data race detected in async context',
          code_context: {
            before: ['func updateData() {'],
            line: 'sharedData.value = newValue',
            after: ['}'],
          },
        },
      ],
      metadata: {
        commit_sha: 'abc123def456',
        branch: 'main',
        scheme: 'MyApp',
        swift_version: '5.9',
      },
    };
    
    it('should generate AI summary successfully', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '🎯 **Summary:** Found 2 Swift concurrency warnings requiring attention.\n\n🔍 **Key Patterns:**\n- Actor isolation violations\n- Critical data race conditions\n\n💡 **Recommendations:**\n1. Use await for actor properties\n2. Implement proper synchronization\n3. Review shared data access\n\n⚠️ **Risk Level:** High - Critical issues detected',
          },
        }],
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      
      const summary = await openaiService.generateSummary(mockWarningData);
      
      expect(summary).toContain('🎯 **Summary:**');
      expect(summary).toContain('actor isolation');
      expect(summary).toContain('data race');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4o',
        messages: expect.arrayContaining([
          { role: 'system', content: expect.any(String) },
          { role: 'user', content: expect.any(String) },
        ]),
        temperature: 0.3,
        max_tokens: 500,
        top_p: 0.9,
        frequency_penalty: 0.1,
        presence_penalty: 0.1,
      });
    });
    
    it('should handle OpenAI API error with fallback', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));
      
      const summary = await openaiService.generateSummary(mockWarningData);
      
      expect(summary).toContain('🎯 **Summary:**');
      expect(summary).toContain('2 Swift concurrency warnings');
      expect(summary).toContain('actor isolation');
    });
    
    it('should handle empty response with fallback', async () => {
      const mockResponse = {
        choices: [{ message: { content: null } }],
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      
      const summary = await openaiService.generateSummary(mockWarningData);
      
      expect(summary).toContain('🎯 **Summary:**');
      expect(summary).toContain('fallback');
    });
    
    it('should analyze warnings correctly', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'Test summary' },
        }],
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      
      await openaiService.generateSummary(mockWarningData);
      
      const callArgs = mockOpenAI.chat.completions.create.mock.calls[0][0];
      const userPrompt = callArgs.messages[1].content;
      
      expect(userPrompt).toContain('Total: 2 warnings');
      expect(userPrompt).toContain('Critical: 1');
      expect(userPrompt).toContain('High: 1');
      expect(userPrompt).toContain('Actor Isolation: 1');
      expect(userPrompt).toContain('Data Race: 1');
    });
  });
  
  describe('generateWarningFix', () => {
    it('should generate fix for actor isolation warning', async () => {
      const warning = {
        type: 'actor_isolation' as const,
        severity: 'high' as const,
        file_path: 'test.swift',
        line_number: 10,
        message: 'actor-isolated property can not be referenced',
        code_context: {
          before: [],
          line: 'let value = actor.property',
          after: [],
        },
      };
      
      const mockResponse = {
        choices: [{
          message: {
            content: 'Use await to access the actor-isolated property: await actor.property',
          },
        }],
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      
      const fix = await openaiService.generateWarningFix(warning);
      
      expect(fix).toContain('await');
      expect(fix).toContain('actor');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          temperature: 0.2,
          max_tokens: 150,
        })
      );
    });
    
    it('should handle fix generation error', async () => {
      const warning = {
        type: 'sendable' as const,
        severity: 'high' as const,
        file_path: 'test.swift',
        line_number: 10,
        message: 'Type does not conform to Sendable',
        code_context: {
          before: [],
          line: 'struct MyType {}',
          after: [],
        },
      };
      
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));
      
      const fix = await openaiService.generateWarningFix(warning);
      
      expect(fix).toBe('Review concurrency patterns and consider using proper isolation mechanisms.');
    });
  });
  
  describe('healthCheck', () => {
    it('should return true for successful health check', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'OK' },
        }],
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      
      const result = await openaiService.healthCheck();
      
      expect(result).toBe(true);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 5,
      });
    });
    
    it('should return false for failed health check', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));
      
      const result = await openaiService.healthCheck();
      
      expect(result).toBe(false);
    });
    
    it('should return false for empty response', async () => {
      const mockResponse = {
        choices: [{ message: { content: null } }],
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);
      
      const result = await openaiService.healthCheck();
      
      expect(result).toBe(false);
    });
  });
  
  describe('analyzeWarnings', () => {
    it('should correctly analyze warning patterns', () => {
      const warnings = [
        {
          type: 'actor_isolation' as const,
          severity: 'high' as const,
          file_path: 'File1.swift',
          line_number: 10,
          message: 'message 1',
          code_context: { before: [], line: '', after: [] },
        },
        {
          type: 'actor_isolation' as const,
          severity: 'medium' as const,
          file_path: 'File1.swift',
          line_number: 20,
          message: 'message 2',
          code_context: { before: [], line: '', after: [] },
        },
        {
          type: 'data_race' as const,
          severity: 'critical' as const,
          file_path: 'File2.swift',
          line_number: 5,
          message: 'message 3',
          code_context: { before: [], line: '', after: [] },
        },
      ];
      
      const analysis = (openaiService as any).analyzeWarnings(warnings);
      
      expect(analysis.totalCount).toBe(3);
      expect(analysis.severityCounts.critical).toBe(1);
      expect(analysis.severityCounts.high).toBe(1);
      expect(analysis.severityCounts.medium).toBe(1);
      expect(analysis.typeCounts.actor_isolation).toBe(2);
      expect(analysis.typeCounts.data_race).toBe(1);
      expect(analysis.fileGroups.get('File1.swift')).toBe(2);
      expect(analysis.fileGroups.get('File2.swift')).toBe(1);
      expect(analysis.mostCritical).toHaveLength(2); // critical + high
    });
  });
});