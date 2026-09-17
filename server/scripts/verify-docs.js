/*
 * Verifies that the documentation matches the implementation.
 *
 * Three checks:
 *   1. every route in `src/routes` appears in `docs/openapi.json`, and nothing
 *      is documented that does not exist
 *   2. every `$ref` in the document resolves
 *   3. every operation is structurally complete (tag, summary, responses)
 *
 * Exits non-zero on any failure, so this is safe to run in CI.
 *
 *   node scripts/verify-docs.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import buildInventory from './route-inventory.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const SPEC = path.join(root, 'docs', 'openapi.json');

const problems = [];
const notes = [];

const readSpec = () => {
  if (!fs.existsSync(SPEC)) {
    console.error(`Missing ${path.relative(root, SPEC)} — run: npm run docs:generate`);
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(SPEC, 'utf8'));
};

/** Express path -> OpenAPI path template. */
const toTemplate = (expressPath) => expressPath.replace(/:([A-Za-z]+)/g, '{$1}');

/* ---------------- 1. route coverage ---------------- */
const checkCoverage = (spec, inventory) => {
  const documented = new Set();

  for (const [template, operations] of Object.entries(spec.paths)) {
    for (const method of Object.keys(operations)) {
      documented.add(`${method.toUpperCase()} ${template}`);
    }
  }

  const actual = new Set(inventory.map((r) => `${r.method} ${toTemplate(r.path)}`));

  const missing = [...actual].filter((key) => !documented.has(key));
  const extra = [...documented].filter((key) => !actual.has(key));

  for (const key of missing) problems.push(`Not documented: ${key}`);
  for (const key of extra) problems.push(`Documented but no such route: ${key}`);

  notes.push(`Routes in code: ${actual.size}`);
  notes.push(`Operations documented: ${documented.size}`);
};

/* ---------------- 2. reference integrity ---------------- */
const checkRefs = (spec) => {
  const refs = [];

  const walk = (node, at) => {
    if (node === null || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${at}[${i}]`));
      return;
    }

    if (typeof node.$ref === 'string') refs.push({ ref: node.$ref, at });

    for (const [key, value] of Object.entries(node)) walk(value, `${at}.${key}`);
  };

  walk(spec, 'spec');

  const resolve = (pointer) => {
    if (!pointer.startsWith('#/')) return null;

    return pointer
      .slice(2)
      .split('/')
      .reduce((node, segment) => (node === undefined ? undefined : node[segment]), spec);
  };

  const broken = refs.filter(({ ref }) => resolve(ref) === undefined);

  for (const { ref, at } of broken) problems.push(`Broken $ref "${ref}" at ${at}`);

  notes.push(`References checked: ${refs.length}`);
};

/* ---------------- 3. operation completeness ---------------- */
const checkOperations = (spec, inventory) => {
  const guardByKey = new Map(inventory.map((r) => [`${r.method} ${toTemplate(r.path)}`, r.guards]));

  for (const [template, operations] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      const where = `${method.toUpperCase()} ${template}`;

      if (!operation.summary) problems.push(`${where}: missing summary`);
      if (!operation.tags?.length) problems.push(`${where}: missing tag`);
      if (!operation.responses || Object.keys(operation.responses).length === 0) {
        problems.push(`${where}: no responses documented`);
      }

      const success = Object.keys(operation.responses ?? {}).filter((code) => /^2/.test(code));

      if (success.length === 0) problems.push(`${where}: no success response documented`);

      // Authentication must be reflected in the security requirement.
      const guards = guardByKey.get(where) ?? [];
      const requiresAuth = guards.includes('authenticate');

      if (requiresAuth && !operation.security?.length) {
        problems.push(`${where}: route requires authentication but the spec is public`);
      }

      if (!requiresAuth && operation.security?.length) {
        problems.push(`${where}: route is public but the spec requires authentication`);
      }

      // A protected route must document 401.
      if (requiresAuth && !operation.responses?.['401']) {
        problems.push(`${where}: authenticated route without a documented 401`);
      }
    }
  }
};

/* ---------------- run ---------------- */
const spec = readSpec();
const inventory = buildInventory();

checkCoverage(spec, inventory);
checkRefs(spec);
checkOperations(spec, inventory);

const operationCount = Object.values(spec.paths).reduce((n, p) => n + Object.keys(p).length, 0);

console.log('Documentation verification');
console.log('──────────────────────────');
for (const note of notes) console.log(`  ${note}`);
console.log(`  Paths documented: ${Object.keys(spec.paths).length}`);
console.log(`  Operations documented: ${operationCount}`);
console.log(`  Schemas: ${Object.keys(spec.components?.schemas ?? {}).length}`);

if (problems.length) {
  console.log(`\n✗ ${problems.length} problem(s):`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exit(1);
}

console.log('\n✓ Documentation matches the implementation.');
