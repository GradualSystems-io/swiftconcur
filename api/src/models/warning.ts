import { z } from 'zod';
import type { WarningType, WarningSeverity } from '../types';

export const CodeContextSchema = z.object({
  before: z.array(z.string()),
  line: z.string(),
  after: z.array(z.string()),
});

export const WarningSchema = z.object({
  type: z.enum(['actor_isolation', 'sendable', 'data_race', 'performance'] as const),
  severity: z.enum(['critical', 'high', 'medium', 'low'] as const),
  file_path: z.string().min(1, 'File path is required'),
  line_number: z.number().int().positive('Line number must be positive'),
  column_number: z.number().int().positive().optional(),
  message: z.string().min(1, 'Message is required'),
  code_context: CodeContextSchema,
  suggested_fix: z.string().optional(),
});

export const MetadataSchema = z.object({
  commit_sha: z.string().regex(/^[a-f0-9]{7,40}$/, 'Invalid commit SHA'),
  branch: z.string().min(1, 'Branch is required'),
  pull_request: z.number().int().positive().optional(),
  scheme: z.string().min(1, 'Scheme is required'),
  configuration: z.string().min(1, 'Configuration is required'),
  swift_version: z.string().regex(/^\d+\.\d+(\.\d+)?$/, 'Invalid Swift version format'),
  timestamp: z.string().datetime('Invalid timestamp format'),
});

export const WarningPayloadSchema = z.object({
  repo_id: z.string().uuid('Invalid repository ID'),
  run_id: z.string().uuid('Invalid run ID'),
  warnings: z.array(WarningSchema).max(1000, 'Too many warnings (max 1000)'),
  metadata: MetadataSchema,
});

export type CodeContext = z.infer<typeof CodeContextSchema>;
export type Warning = z.infer<typeof WarningSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type WarningPayload = z.infer<typeof WarningPayloadSchema>;

export class WarningProcessor {
  static categorizeWarning(message: string): { type: WarningType; severity: WarningSeverity } {
    const lowerMessage = message.toLowerCase();
    
    // Data race detection (most critical)
    if (lowerMessage.includes('data race') || lowerMessage.includes('race condition')) {
      return { type: 'data_race', severity: 'critical' };
    }
    
    // Actor isolation violations
    if (lowerMessage.includes('actor-isolated') || lowerMessage.includes('isolated')) {
      return { type: 'actor_isolation', severity: 'high' };
    }
    
    // Sendable conformance issues
    if (lowerMessage.includes('sendable') || lowerMessage.includes('conform')) {
      return { type: 'sendable', severity: 'high' };
    }
    
    // Performance warnings
    if (lowerMessage.includes('performance') || lowerMessage.includes('optimization')) {
      return { type: 'performance', severity: 'medium' };
    }
    
    // Default fallback
    return { type: 'actor_isolation', severity: 'medium' };
  }
  
  static generateSuggestedFix(warning: Warning): string | undefined {
    const { type, message } = warning;
    
    switch (type) {
      case 'actor_isolation':
        if (message.includes('can not be referenced')) {
          return 'Consider using await to access actor-isolated properties or move the code inside the actor.';
        }
        return 'Review actor isolation boundaries and ensure proper async/await usage.';
        
      case 'sendable':
        return 'Make the type conform to Sendable protocol or use @unchecked Sendable if thread-safety is guaranteed.';
        
      case 'data_race':
        return 'Use proper synchronization mechanisms like actors, locks, or atomic operations.';
        
      case 'performance':
        return 'Consider optimizing async operations or reducing unnecessary context switches.';
        
      default:
        return undefined;
    }
  }
  
  static validateWarningPayload(data: unknown): WarningPayload {
    return WarningPayloadSchema.parse(data);
  }
}