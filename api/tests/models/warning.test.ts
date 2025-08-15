import { describe, it, expect } from 'vitest';
import { WarningProcessor } from '../../src/models/warning';

describe('WarningProcessor', () => {
  describe('categorizeWarning', () => {
    it('should categorize data race warnings as critical', () => {
      const message = 'data race detected in async context';
      const result = WarningProcessor.categorizeWarning(message);
      
      expect(result.type).toBe('data_race');
      expect(result.severity).toBe('critical');
    });
    
    it('should categorize actor isolation warnings as high severity', () => {
      const message = 'actor-isolated property can not be referenced from non-isolated context';
      const result = WarningProcessor.categorizeWarning(message);
      
      expect(result.type).toBe('actor_isolation');
      expect(result.severity).toBe('high');
    });
    
    it('should categorize sendable warnings as high severity', () => {
      const message = 'Type UserSession does not conform to Sendable protocol';
      const result = WarningProcessor.categorizeWarning(message);
      
      expect(result.type).toBe('sendable');
      expect(result.severity).toBe('high');
    });
    
    it('should categorize performance warnings as medium severity', () => {
      const message = 'performance optimization needed for concurrent access';
      const result = WarningProcessor.categorizeWarning(message);
      
      expect(result.type).toBe('performance');
      expect(result.severity).toBe('medium');
    });
    
    it('should default to actor isolation medium for unknown warnings', () => {
      const message = 'some unknown swift warning';
      const result = WarningProcessor.categorizeWarning(message);
      
      expect(result.type).toBe('actor_isolation');
      expect(result.severity).toBe('medium');
    });
  });
  
  describe('generateSuggestedFix', () => {
    it('should suggest actor isolation fix for reference errors', () => {
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
      
      const fix = WarningProcessor.generateSuggestedFix(warning);
      expect(fix).toContain('await');
      expect(fix).toContain('actor');
    });
    
    it('should suggest sendable conformance fix', () => {
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
      
      const fix = WarningProcessor.generateSuggestedFix(warning);
      expect(fix).toContain('Sendable');
      expect(fix).toContain('conform');
    });
    
    it('should suggest data race fix', () => {
      const warning = {
        type: 'data_race' as const,
        severity: 'critical' as const,
        file_path: 'test.swift',
        line_number: 10,
        message: 'data race detected',
        code_context: {
          before: [],
          line: 'sharedVariable = newValue',
          after: [],
        },
      };
      
      const fix = WarningProcessor.generateSuggestedFix(warning);
      expect(fix).toContain('synchronization');
      expect(fix).toContain('actor');
    });
  });
  
  describe('validateWarningPayload', () => {
    const validPayload = {
      repo_id: '123e4567-e89b-12d3-a456-426614174000',
      run_id: '987fcdeb-51a2-43d8-b765-789012345678',
      warnings: [
        {
          type: 'actor_isolation',
          severity: 'high',
          file_path: 'MyViewController.swift',
          line_number: 42,
          column_number: 8,
          message: 'actor-isolated property can not be referenced',
          code_context: {
            before: ['class MyViewController {', '  func viewDidLoad() {'],
            line: '    let name = actor.name',
            after: ['  }', '}'],
          },
          suggested_fix: 'Use await to access actor-isolated properties',
        },
      ],
      metadata: {
        commit_sha: 'abc123def456',
        branch: 'main',
        scheme: 'MyApp',
        configuration: 'Debug',
        swift_version: '5.9',
        timestamp: '2024-01-01T12:00:00Z',
      },
    };
    
    it('should validate correct payload', () => {
      expect(() => {
        WarningProcessor.validateWarningPayload(validPayload);
      }).not.toThrow();
    });
    
    it('should reject invalid repo_id', () => {
      const invalidPayload = {
        ...validPayload,
        repo_id: 'invalid-uuid',
      };
      
      expect(() => {
        WarningProcessor.validateWarningPayload(invalidPayload);
      }).toThrow();
    });
    
    it('should reject invalid warning type', () => {
      const invalidPayload = {
        ...validPayload,
        warnings: [{
          ...validPayload.warnings[0],
          type: 'invalid_type',
        }],
      };
      
      expect(() => {
        WarningProcessor.validateWarningPayload(invalidPayload);
      }).toThrow();
    });
    
    it('should reject invalid severity', () => {
      const invalidPayload = {
        ...validPayload,
        warnings: [{
          ...validPayload.warnings[0],
          severity: 'invalid_severity',
        }],
      };
      
      expect(() => {
        WarningProcessor.validateWarningPayload(invalidPayload);
      }).toThrow();
    });
    
    it('should reject empty file path', () => {
      const invalidPayload = {
        ...validPayload,
        warnings: [{
          ...validPayload.warnings[0],
          file_path: '',
        }],
      };
      
      expect(() => {
        WarningProcessor.validateWarningPayload(invalidPayload);
      }).toThrow();
    });
    
    it('should reject invalid line number', () => {
      const invalidPayload = {
        ...validPayload,
        warnings: [{
          ...validPayload.warnings[0],
          line_number: -1,
        }],
      };
      
      expect(() => {
        WarningProcessor.validateWarningPayload(invalidPayload);
      }).toThrow();
    });
    
    it('should reject too many warnings', () => {
      const invalidPayload = {
        ...validPayload,
        warnings: Array(1001).fill(validPayload.warnings[0]),
      };
      
      expect(() => {
        WarningProcessor.validateWarningPayload(invalidPayload);
      }).toThrow();
    });
    
    it('should reject invalid commit SHA', () => {
      const invalidPayload = {
        ...validPayload,
        metadata: {
          ...validPayload.metadata,
          commit_sha: 'invalid-sha!@#',
        },
      };
      
      expect(() => {
        WarningProcessor.validateWarningPayload(invalidPayload);
      }).toThrow();
    });
    
    it('should reject invalid Swift version', () => {
      const invalidPayload = {
        ...validPayload,
        metadata: {
          ...validPayload.metadata,
          swift_version: 'invalid-version',
        },
      };
      
      expect(() => {
        WarningProcessor.validateWarningPayload(invalidPayload);
      }).toThrow();
    });
    
    it('should accept valid Swift versions', () => {
      const versions = ['5.9', '5.10', '5.9.1', '6.0'];
      
      versions.forEach(version => {
        const payload = {
          ...validPayload,
          metadata: {
            ...validPayload.metadata,
            swift_version: version,
          },
        };
        
        expect(() => {
          WarningProcessor.validateWarningPayload(payload);
        }).not.toThrow();
      });
    });
  });
});