import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        '.wrangler/',
        'coverage/',
        '**/*.d.ts',
        '**/*.config.*',
        'src/index.ts' // Entry point
      ],
      include: [
        'src/**/*.{js,ts}',
        '!src/**/*.test.{js,ts}',
        '!src/**/*.spec.{js,ts}'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        // Service-specific thresholds
        'src/services/**/*.{js,ts}': {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
        'src/handlers/**/*.{js,ts}': {
          branches: 75,
          functions: 75,
          lines: 75,
          statements: 75,
        }
      },
      all: true,
      skipFull: false
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});