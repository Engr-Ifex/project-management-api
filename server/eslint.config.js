import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,

  {
    files: ['**/*.js'],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',

      globals: {
        ...globals.node,
      },
    },

    rules: {
      /*
       * Function arguments prefixed with `_` are intentionally unused. The
       * case that needs this is Express's error handler, which MUST declare
       * four parameters — `(err, req, res, next)` — because Express identifies
       * it by arity. Dropping `next` silently turns it into ordinary
       * middleware that never runs, so it is kept and prefixed instead.
       */
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-undef': 'error',
    },
  },
];
