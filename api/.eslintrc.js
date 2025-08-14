module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended'],
  globals: {
    // Cloudflare Workers globals
    addEventListener: 'readonly',
    caches: 'readonly',
    crypto: 'readonly',
    fetch: 'readonly',
    Request: 'readonly',
    Response: 'readonly',
    Headers: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',
    ReadableStream: 'readonly',
    WritableStream: 'readonly',
    TransformStream: 'readonly',
    WebSocket: 'readonly',
    DurableObjectState: 'readonly',
    DurableObject: 'readonly',
    ExecutionContext: 'readonly',
    MessageBatch: 'readonly',
    ScheduledEvent: 'readonly',
    console: 'readonly',
  },
  root: true,
  env: {
    node: true,
    es6: true,
  },
  ignorePatterns: [
    '.eslintrc.js',
    'dist/',
    'node_modules/',
    '*.config.*',
  ],
  rules: {
    // Disable some ESLint rules that conflict with TypeScript
    'no-unused-vars': 'off',
    'no-undef': 'off', // TypeScript handles this
    
    // TypeScript specific rules
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'error',
    
    // General rules
    'no-console': 'off', // Allow console.log for debugging in Workers
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': 'error',
    'curly': 'error',
    'no-throw-literal': 'error',
    'prefer-promise-reject-errors': 'error',
    
    // Security rules
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    
    // Best practices
    'no-unused-expressions': 'error',
    'no-useless-return': 'error',
    'no-useless-concat': 'error',
    'prefer-template': 'error',
    'object-shorthand': 'error',
    'arrow-body-style': ['error', 'as-needed'],
    'max-depth': ['error', 4],
    'max-lines-per-function': ['warn', 150],
    'complexity': ['warn', 25],
    'no-await-in-loop': 'warn',
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/__tests__/**/*.ts'],
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
  ],
};