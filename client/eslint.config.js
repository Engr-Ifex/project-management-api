import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/*
 * ESLint for the client.
 *
 * `tsc` already enforces what types can prove — unused locals, unused
 * parameters, strict null checks. This config deliberately does not repeat any
 * of that. It exists for the class of mistake types cannot see: a hook called
 * conditionally, a missing effect dependency, a `useState` read that never
 * updates.
 *
 * Flat config, matching `server/eslint.config.js` in shape so the two halves of
 * the repo are not configured in two different dialects.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**'],
  },

  /* ---------------------------------------------------------------- app code */
  {
    files: ['**/*.{ts,tsx}'],

    extends: [js.configs.recommended, ...tseslint.configs.recommended],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },

    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },

    rules: {
      ...reactHooks.configs.recommended.rules,

      /*
       * Fast-refresh warns when a module exports a component alongside anything
       * else, because the non-component export can defeat hot reloading.
       *
       * Left as a warning rather than an error, and not suppressed: the design
       * system exports a component *and* its cva styles from one file on
       * purpose (see `components/ui/Button.tsx`), and so do the layouts. That is
       * a deliberate pattern, but the warning is still worth seeing, so a new
       * accidental mixed export is not silently added to the pile.
       */
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // `console.error` in the error boundary is the only sink for an unhandled
      // render error; there is no reporting service. Matches the server config.
      'no-console': 'off',

      /*
       * `useAsync` holds its loader in a ref and spreads a caller-supplied deps
       * array, so the exhaustive-deps rule cannot verify it statically. That one
       * call site carries a targeted disable comment with the reasoning; this
       * keeps the rule on everywhere else.
       */
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  /* --------------------------------------------------- dev tooling (Node) */
  {
    files: ['dev/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
    },
  }
);
