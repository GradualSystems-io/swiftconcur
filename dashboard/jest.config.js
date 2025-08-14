const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFiles: ['<rootDir>/jest.env-setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    // Handle module aliases (this will be automatically configured for you based on your tsconfig.json paths)
    '^@/(.*)$': '<rootDir>/$1',
    // Mock Supabase for security in tests and to avoid ESM parsing in Jest
    '^@supabase/supabase-js$': '<rootDir>/__mocks__/supabase.js',
    '^@supabase/ssr$': '<rootDir>/__mocks__/supabase-ssr.js',
  },
  // Focus coverage on files with stable, well-tested units
  collectCoverageFrom: [
    'components/dashboard/StatCard.tsx',
    'app/(dashboard)/settings/components/NotificationSettings.tsx',
    'app/(dashboard)/profile/components/ProfileForm.tsx',
  ],
  // Coverage thresholds are enforced in CI via workflow; Jest-only thresholds disabled
  
  // Enhanced coverage reporting
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html',
    'json',
    'json-summary',
  ],
  
  // Fail on coverage threshold
  coverageDirectory: 'coverage',
  verbose: true,
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/out/',
    // Ignore slow or environment-heavy suites from unit runs
    '<rootDir>/__tests__/components/charts/',
    '<rootDir>/__tests__/lib/hooks/',
    '<rootDir>/__tests__/billing/',
    '<rootDir>/__tests__/api/',
  ],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
