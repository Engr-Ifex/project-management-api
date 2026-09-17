import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Filesystem locations, resolved from this module rather than from the
 * process working directory.
 *
 * These paths were previously built with `path.join(process.cwd(), ...)`,
 * which silently breaks whenever the process is started from somewhere other
 * than the project root — `node server/server.js` from the repository root,
 * or a systemd unit without `WorkingDirectory` set, would read and write
 * uploads in the wrong place (and, for the static mount, serve a directory
 * that does not exist).
 *
 * Anchoring on `import.meta.url` makes the location a property of the code,
 * not of how it was launched.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

/** `server/` — the directory containing `app.js` and `package.json`. */
export const PROJECT_ROOT = path.resolve(here, '..', '..');

/** `server/src`. */
export const SRC_DIR = path.resolve(here, '..');

/** `server/src/uploads` — parent of every stored file. */
export const UPLOADS_DIR = path.join(SRC_DIR, 'uploads');

/*
 * Public avatars. This is the ONLY subtree mounted as static; attachments are
 * private and reachable only through the authenticated download endpoint.
 */
export const PUBLIC_AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars');

/** Private attachment store. Never served statically. */
export const PRIVATE_ATTACHMENTS_DIR = path.join(UPLOADS_DIR, 'attachments');

/** `server/docs` — generated OpenAPI document lives here. */
export const DOCS_DIR = path.join(PROJECT_ROOT, 'docs');

export default {
  PROJECT_ROOT,
  SRC_DIR,
  UPLOADS_DIR,
  PUBLIC_AVATARS_DIR,
  PRIVATE_ATTACHMENTS_DIR,
  DOCS_DIR,
};
