import { vi } from 'vitest';
import type { Env, RequestWithRepo } from '../src/types';

// Mock Cloudflare runtime globals
const mockCrypto = {
  getRandomValues: (arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  },
  subtle: {
    digest: vi.fn().mockImplementation((_algorithm: string, data: ArrayBuffer) => {
      // Generate different hashes for different inputs
      const view = new Uint8Array(data);
      const mockHash = new Uint8Array(32);
      
      // Simple hash based on input content
      let seed = 0;
      for (let i = 0; i < view.length; i++) {
        seed += view[i];
      }
      
      for (let i = 0; i < 32; i++) {
        mockHash[i] = (seed + i) % 256;
      }
      
      return Promise.resolve(mockHash.buffer);
    }),
  },
};

// Only assign crypto if it doesn't exist or is configurable
if (!global.crypto) {
  Object.defineProperty(global, 'crypto', {
    value: mockCrypto,
    writable: true,
    configurable: true,
  });
} else {
  // If crypto exists but we need to override it for tests
  try {
    Object.assign(global.crypto, mockCrypto);
  } catch {
    // If assignment fails, try to redefine
    Object.defineProperty(global, 'crypto', {
      value: mockCrypto,
      writable: true,
      configurable: true,
    });
  }
}

Object.assign(global, {
  
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
export function createMockEnv(): Env {
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
): RequestWithRepo {
  const { repoId, ...requestOptions } = options;
  
  const request = new Request(url, requestOptions) as RequestWithRepo;
  
  if (repoId) {
    request.repoId = repoId;
  }
  
  return request;
}

// Helper function to create mock execution context
export function createMockContext(): any {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
}