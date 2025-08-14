/** @type {import('prettier').Config} */
module.exports = {
  // Print width - line length limit
  printWidth: 100,
  
  // Tab width - number of spaces per indentation level
  tabWidth: 2,
  
  // Use tabs instead of spaces
  useTabs: false,
  
  // Semicolons at the end of statements
  semi: false,
  
  // Use single quotes instead of double quotes
  singleQuote: true,
  
  // Quote properties in objects only when necessary
  quoteProps: 'as-needed',
  
  // Trailing commas where valid in ES5 (objects, arrays, etc.)
  trailingComma: 'all',
  
  // Spaces between brackets in object literals
  bracketSpacing: true,
  
  // Include parentheses around a sole arrow function parameter
  arrowParens: 'avoid',
  
  // Line endings
  endOfLine: 'lf',
  
  // Override specific file types
  overrides: [
    {
      files: '*.json',
      options: {
        printWidth: 200,
      },
    },
    {
      files: '*.md',
      options: {
        proseWrap: 'always',
        printWidth: 80,
      },
    },
    {
      files: ['*.yml', '*.yaml'],
      options: {
        tabWidth: 2,
        singleQuote: false,
      },
    },
    {
      files: 'wrangler.toml',
      options: {
        parser: 'toml',
      },
    },
  ],
}