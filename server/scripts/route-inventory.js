/*
 * Route inventory.
 *
 * Parses every `src/routes/*.routes.js` file and emits a machine-readable list
 * of the API surface: method, full path, guard chain, validator, and the
 * controller handler that serves it.
 *
 * This exists so the documentation cannot drift from the implementation. It is
 * consumed by `scripts/verify-docs.js`, which asserts that every route appears
 * in `docs/openapi.json`, and it can be printed for a quick review:
 *
 *   node scripts/route-inventory.js            # human-readable table
 *   node scripts/route-inventory.js --json     # JSON
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const routesDir = path.join(here, '..', 'src', 'routes');

const HTTP_METHODS = ['get', 'post', 'patch', 'put', 'delete'];

/** Every router is served under this base path. */
const API_BASE = '/api/v1';

/**
 * Resolve the mount prefix for each router by reading `index.routes.js`, so
 * the prefixes are never hard-coded here.
 */
const readMounts = () => {
  const source = fs.readFileSync(path.join(routesDir, 'index.routes.js'), 'utf8');
  const mounts = new Map();
  const re = /router\.use\(\s*'([^']*)'\s*,\s*(\w+)\s*\)/g;

  let match = re.exec(source);

  while (match) {
    const [, prefix, importName] = match;
    mounts.set(importName, prefix === '/' ? '' : prefix);
    match = re.exec(source);
  }

  // Map the imported identifier (e.g. taskRoutes) to its file.
  const importRe = /import\s+(\w+)\s+from\s+'\.\/([\w.]+)'/g;
  const files = new Map();

  match = importRe.exec(source);

  while (match) {
    files.set(match[1], match[2]);
    match = importRe.exec(source);
  }

  const byFile = new Map();

  for (const [importName, file] of files) {
    if (mounts.has(importName)) byFile.set(file, mounts.get(importName));
  }

  return byFile;
};

/**
 * Routers mounted directly in `app.js` rather than inside `index.routes.js`.
 *
 * The health probes are mounted this way — deliberately, so they sit ahead of
 * the API rate limiter. Without reading app.js their mount prefix would be
 * guessed as empty and the reported paths would only be correct by accident of
 * both bases happening to be `/api/v1`.
 */
const readAppMounts = () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const mounts = new Map();

  const importRe = /import\s+(\w+)\s+from\s+'\.\/src\/routes\/([\w.]+)'/g;
  const files = new Map();

  let match = importRe.exec(source);

  while (match) {
    files.set(match[1], match[2]);
    match = importRe.exec(source);
  }

  const useRe = /app\.use\(\s*'([^']*)'\s*,\s*(\w+)\s*\)/g;

  match = useRe.exec(source);

  while (match) {
    const [, prefix, importName] = match;

    if (files.has(importName)) mounts.set(files.get(importName), prefix === '/' ? '' : prefix);

    match = useRe.exec(source);
  }

  return mounts;
};

/** Split a router file into one block per route registration. */
const splitRoutes = (source) =>
  source.split(new RegExp(`(?=router\\.(?:${HTTP_METHODS.join('|')})\\()`)).slice(1);

const parseGuards = (block) => {
  const guards = [];

  if (/\bauthenticate\b/.test(block)) guards.push('authenticate');

  const wsPermission = block.match(/requireWorkspacePermission\(\s*WORKSPACE_PERMISSIONS\.(\w+)/);

  if (wsPermission) guards.push(`workspace:${wsPermission[1]}`);

  const wsRole = block.match(/requireWorkspaceRole\(([^)]*)\)/);

  if (wsRole) {
    // e.g. WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN -> OWNER|ADMIN
    const roles = [...wsRole[1].matchAll(/WORKSPACE_ROLES\.(\w+)/g)].map(([, r]) => r);

    guards.push(`workspaceRole:${roles.length ? roles.join('|') : wsRole[1].trim()}`);
  }

  /*
   * There are three membership variants — plain, archived-only, and
   * any-state — so match the whole family rather than just the plain one.
   */
  const membership = block.match(
    /\b(requireArchivedWorkspaceMember|requireWorkspaceMemberAnyState|requireWorkspaceMember)\b/
  );

  if (membership) guards.push(membership[1]);

  const projectPermission = block.match(/requireProjectPermission\(\s*'([^']+)'/);

  if (projectPermission) guards.push(`project:${projectPermission[1]}`);

  const upload = block.match(/(attachmentUpload|upload)\.(single|array|fields)\(/);

  if (upload) guards.push(`upload:${upload[1]}.${upload[2]}`);

  return guards;
};

/**
 * Routes declared inline on the index router.
 *
 * `index.routes.js` defines a couple of endpoints directly (the API index and
 * the health check) rather than delegating to a `*.routes.js` file, so scanning
 * the mounted routers alone would miss them entirely.
 */
const readInlineRoutes = () => {
  const source = fs.readFileSync(path.join(routesDir, 'index.routes.js'), 'utf8');
  const inline = [];
  const re = new RegExp(`router\\.(${HTTP_METHODS.join('|')})\\(\\s*'([^']*)'`, 'g');

  let match = re.exec(source);

  while (match) {
    const [, method, routePath] = match;

    inline.push({
      method: method.toUpperCase(),
      path: `/api/v1${routePath}`,
      guards: [],
      validator: null,
      controller: null,
      file: 'index.routes.js',
    });

    match = re.exec(source);
  }

  return inline;
};

export const buildInventory = () => {
  const mounts = readMounts();
  const appMounts = readAppMounts();
  const inventory = [...readInlineRoutes()];

  const files = fs
    .readdirSync(routesDir)
    .filter((file) => file.endsWith('.routes.js') && file !== 'index.routes.js');

  for (const file of files) {
    /*
     * A router mounted in app.js is served at that absolute prefix. Anything
     * else is mounted inside index.routes.js, whose own prefix is relative to
     * the API base.
     */
    const prefix = appMounts.has(file) ? appMounts.get(file) : API_BASE + (mounts.get(file) ?? '');

    const source = fs.readFileSync(path.join(routesDir, file), 'utf8');

    for (const block of splitRoutes(source)) {
      const head = block.match(new RegExp(`^router\\.(${HTTP_METHODS.join('|')})\\(\\s*'([^']*)'`));

      if (!head) continue;

      const [, method, routePath] = head;
      const validator = block.match(/validate\((\w+)\)/);
      const controller = block.match(/(\w+Controller)\.(\w+)/);

      const full = `${prefix}${routePath === '/' ? '' : routePath}` || '/';

      inventory.push({
        method: method.toUpperCase(),
        path: full,
        guards: parseGuards(block),
        validator: validator ? validator[1] : null,
        controller: controller ? `${controller[1]}.${controller[2]}` : null,
        file,
      });
    }
  }

  return inventory;
};

const asTable = (inventory) => {
  const width = Math.max(...inventory.map((r) => r.path.length));

  return inventory
    .map((r) =>
      [
        r.method.padEnd(6),
        r.path.padEnd(width),
        (r.guards.length ? r.guards.join(' | ') : '(public)').padEnd(46),
        r.validator ?? '-',
      ].join(' ')
    )
    .join('\n');
};

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));

if (isMain) {
  const inventory = buildInventory();

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(inventory, null, 2));
  } else {
    console.log(asTable(inventory));
    console.log(`\nTotal routes: ${inventory.length}`);
  }
}

export default buildInventory;
