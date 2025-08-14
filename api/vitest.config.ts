import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      // Exclude smoke tests by default (they require a running server)
      process.env.INCLUDE_SMOKE_TESTS !== 'true' ? '**/smoke/**' : ''
    ].filter(Boolean),
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
          branches: 20,
          functions: 20,
          lines: 20,
          statements: 20,
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