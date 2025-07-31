import { vi } from 'vitest';

// Mock Cloudflare runtime globals
Object.assign(global, {
  crypto: {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
    subtle: {
      digest: vi.fn().mockImplementation((algorithm: string, data: ArrayBuffer) => {
        // Simple mock implementation
        const mockHash = new Uint8Array(32).fill(0);
        return Promise.resolve(mockHash.buffer);
      }),
    },
  },
  
  // Mock WebSocket
  WebSocketPair: vi.fn().mockImplementation(() => ({
    0: {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      readyState: 1, // OPEN
    },
    1: {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      readyState: 1, // OPEN
    },
  })),
  
  WebSocket: {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  },
});

// Mock fetch
global.fetch = vi.fn();

// Mock console to reduce noise in tests
global.console = {
  ...global.console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Helper function to create mock environment
export function createMockEnv(): any {
  return {
    RATE_LIMIT: {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
    API_TOKENS: {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
    XCRESULT_BUCKET: {
      put: vi.fn(),
      get: vi.fn(),
      head: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    },
    REPO_SHARD: {
      idFromName: vi.fn(),
      get: vi.fn(),
    },
    AI_QUEUE: {
      send: vi.fn(),
    },
    ENVIRONMENT: 'test',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_KEY: 'test-key',
    OPENAI_API_KEY: 'test-openai-key',
    SLACK_WEBHOOK_URL: 'https://hooks.slack.com/test',
    TEAMS_WEBHOOK_URL: 'https://outlook.office.com/test',
  };
}

// Helper function to create mock request
export function createMockRequest(
  url: string,
  options: RequestInit & { repoId?: string } = {}
): any {
  const { repoId, ...requestOptions } = options;
  
  const request = {
    url,
    method: options.method || 'GET',
    headers: new Map(Object.entries(options.headers || {})),
    ...requestOptions,
  };
  
  if (repoId) {
    request.repoId = repoId;
  }
  
  return request;
}

// Helper function to create mock execution context
export function createMockContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
}