import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/*
 * The API is proxied rather than called cross-origin, and that is load-bearing.
 *
 * The session is an httpOnly cookie with `SameSite=Strict`. A frontend on :5173
 * calling an API on :5000 is a different *origin*, so:
 *
 *   1. the browser would refuse the response unless the origin is in the
 *      server's `CORS_ORIGINS` allow-list — which is currently **unset**, so
 *      cross-origin requests are refused outright; and
 *   2. the cookie would not be sent.
 *
 * Proxying `/api` makes the browser talk to its own origin, so neither applies.
 * The client's base URL stays relative (`/api/v1`), which means the same code
 * works in production behind any single-origin reverse proxy, and the backend
 * needs no change at all.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    // Root-relative, so the config needs no Node type definitions.
    alias: {
      '@': '/src',
    },
  },

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        // Keep the Host header as the browser sent it. The backend does not
        // check it, but rewriting it would make the request look cross-origin
        // to anything downstream that does.
        changeOrigin: false,
      },
    },
  },

  /*
   * The same proxy for `vite preview`, so the production build can be exercised
   * locally against the real API. Without it, previewing the build would show
   * every request failing for a reason that has nothing to do with the build.
   */
  preview: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: false,
      },
    },
  },
});
