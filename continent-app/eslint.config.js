import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// Flat config for the Vite + React 18 front end (plain JS/JSX, no TypeScript).
// The point of this config is to catch the bug classes that a plain build does
// NOT: undefined references (a `vite build` happily shipped a ReferenceError
// crash), stale-closure / missing hook dependencies, and dead bindings.
export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**', 'scripts/**', '*.config.js'] },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      // Real bugs -> errors (fail the build).
      'no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
      // Ramp-up rules -> warnings for now, so the guardrail lands without a big-
      // bang cleanup. Tighten to 'error' as the backlog is worked down.
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^[A-Z_]' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
];
