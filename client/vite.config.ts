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
 *
 * `/uploads` is proxied for the same reason, and it is not optional: avatars are
 * served by the API at `/uploads/avatars/<file>`, and the API stores that
 * relative path on the user. The browser then requests it from the *frontend*
 * origin, where an unproxied path falls through to the SPA history fallback and
 * returns `index.html` with a 200 — so the `<img>` receives HTML, fails to
 * decode, and the avatar silently reverts to initials. The upload itself
 * succeeds, which is what made this look like a broken upload rather than a
 * broken URL.
 */
const uploadsProxy = {
  '/uploads': {
    target: 'http://localhost:5000',
    changeOrigin: false,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    // Root-relative, so the config needs no Node type definitions.
    alias: {
      '@': '/src',
    },
  },

  build: {
    rollupOptions: {
      output: {},
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
      ...uploadsProxy,
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
      ...uploadsProxy,
    },
  },
});
