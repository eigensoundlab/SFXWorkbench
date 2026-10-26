// SPDX-License-Identifier: Apache-2.0
import globals from 'globals';

export default [
  { ignores: ['dist/**', '_site/**', 'node_modules/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
    },
  },
  {
    files: ['src/dsp/**/*.js', 'src/io/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/app/**', '**/config/**'], message: 'DSP and IO modules must stay UI-free so they run in Node tests.' }] }],
    },
  },
  {
    files: ['scripts/**', 'tests/**'],
    languageOptions: { globals: { ...globals.node } },
  },
];
