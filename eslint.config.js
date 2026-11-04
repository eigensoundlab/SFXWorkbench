// SPDX-License-Identifier: Apache-2.0
import globals from 'globals';

export default [
  // src/vendor holds third-party builds that are copied in unchanged (see src/vendor/README.md).
  { ignores: ['dist/**', '_site/**', 'node_modules/**', 'src/vendor/**'] },
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
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/app/**', '**/config/**', '**/vendor/**'], message: 'DSP and IO modules must stay UI-free and self-contained so they run in Node tests.' }] }],
    },
  },
  {
    files: ['scripts/**', 'tests/**'],
    languageOptions: { globals: { ...globals.node } },
  },
];
