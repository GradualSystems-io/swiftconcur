/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  
  // Use Next.js ESLint configuration (includes TypeScript support)
  extends: [
    'next/core-web-vitals',
  ],
  
  // Custom rules for CI compatibility (only standard ESLint rules)
  rules: {
    // Allow console.log (useful for debugging)
    'no-console': 'off',
    
    // General best practices (warnings only to avoid blocking CI)
    'prefer-const': 'warn',
    'no-var': 'warn',
    'eqeqeq': 'warn',
    
    // React specific (reduce severity for CI)
    'react/jsx-key': 'warn',
    'react/no-unescaped-entities': 'off', // Too noisy for CI
    
    // Next.js specific (warnings only)
    '@next/next/no-img-element': 'warn',
    '@next/next/no-html-link-for-pages': 'warn',
  },
  
  // Override rules for specific file patterns
  overrides: [
    {
      files: ['**/*.test.{js,jsx,ts,tsx}', '**/*.spec.{js,jsx,ts,tsx}'],
      env: {
        jest: true,
      },
      rules: {
        // Relax rules for test files
        'no-console': 'off',
      },
    },
  ],
  
  // Ignore patterns
  ignorePatterns: [
    'node_modules/',
    '.next/',
    'out/',
    'build/',
    'dist/',
    '*.min.js',
    'public/',
    'coverage/',
    '.eslintcache',
  ],
};