import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Ignore unused capitalized identifiers in both variable declarations
      // and function arguments — this covers JSX component references (like
      // `{ Icon }` destructured from a data array and used as `<Icon />`),
      // which ESLint's no-unused-vars can't detect as "used" without the
      // react plugin's jsx-uses-vars rule.
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]' },
      ],
    },
  },
  {
    // Vercel serverless functions — Node runtime, not the browser.
    files: ['api/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, Response: 'readonly' },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
  },
  {
    // Vercel Edge Middleware — runs in a V8 isolate with process.env available.
    files: ['middleware.{js,ts}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, Response: 'readonly', URL: 'readonly', crypto: 'readonly' },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
  },
])
