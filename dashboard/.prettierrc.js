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
  
  // Use single quotes in JSX
  jsxSingleQuote: true,
  
  // Trailing commas where valid in ES5 (objects, arrays, etc.)
  trailingComma: 'all',
  
  // Spaces between brackets in object literals
  bracketSpacing: true,
  
  // Put the > of a multi-line JSX element at the end of the last line
  bracketSameLine: false,
  
  // Include parentheses around a sole arrow function parameter
  arrowParens: 'avoid',
  
  // Format only a segment of a file
  rangeStart: 0,
  rangeEnd: Infinity,
  
  // Specify which parser to use
  parser: undefined,
  
  // Specify the file path to use to infer which parser to use
  filepath: undefined,
  
  // Prettier can restrict itself to only format files that contain a special comment
  requirePragma: false,
  
  // Prettier can insert a special @format marker at the top of files
  insertPragma: false,
  
  // Prose wrapping
  proseWrap: 'preserve',
  
  // HTML whitespace sensitivity
  htmlWhitespaceSensitivity: 'css',
  
  // Vue files script and style tags indentation
  vueIndentScriptAndStyle: false,
  
  // Line endings
  endOfLine: 'lf',
  
  // Control whether Prettier formats quoted code embedded in the file
  embeddedLanguageFormatting: 'auto',
  
  // Enforce single attribute per line in HTML, Vue and JSX
  singleAttributePerLine: false,
  
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
      files: '*.yml',
      options: {
        tabWidth: 2,
        singleQuote: false,
      },
    },
    {
      files: '*.yaml',
      options: {
        tabWidth: 2,
        singleQuote: false,
      },
    },
  ],
}