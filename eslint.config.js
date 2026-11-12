// Flat config: @eslint/js recommended + typescript-eslint recommended, not pedantic.
// Type-aware rules are off (the repo is on TypeScript 7; typescript-eslint's project service doesn't support it yet).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'dist-sim/**', 'dev-dist/**', 'node_modules/**', 'tools/**', 'public/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // The codebase passes Game/World handles around and narrows at use; unused args are prefixed _.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // `any` is a review item (docs/REVIEW.md), not a build breaker.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off', // used deliberately on elements the module itself created
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Tests and scripts run in node but pass callbacks into the page (page.evaluate), so both global sets apply.
    files: ['tests/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // game.eval callbacks follow a fixed (g, w, s, arg) signature whether or not a given test uses every handle.
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['*.ts', '*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
