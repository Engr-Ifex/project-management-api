/*
 * Exact per-module bundle report.
 *
 * Uses Vite's programmatic build with `write: false` and reads Rollup's own
 * `renderedLength` for every module in every chunk. That figure is computed by
 * Rollup as it renders, so it is authoritative — unlike a sourcemap-derived
 * attribution, which over-attributes badly on minified output because a single
 * mapping can span a large generated range belonging to another module.
 *
 * That mistake was made first, here: an early sourcemap-based pass reported
 * `react-remove-scroll-bar` at 143 KB when the file on disk is 3.4 KB. The
 * numbers below are the corrected ones.
 *
 *   node dev/bundle-report.mjs            # top modules per chunk
 *   node dev/bundle-report.mjs --chunk ui # one chunk
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const chunkFilter = (() => {
  const index = process.argv.indexOf('--chunk');

  return index === -1 ? null : process.argv[index + 1];
})();

/** Reduce a module id to the package or app area it belongs to. */
const groupOf = (id) => {
  const normalized = id.replace(/\\/g, '/').split('?')[0];

  const nodeModules = normalized.lastIndexOf('node_modules/');

  if (nodeModules !== -1) {
    const rest = normalized.slice(nodeModules + 'node_modules/'.length);
    const parts = rest.split('/');

    return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  }

  const src = normalized.lastIndexOf('/src/');

  if (src !== -1) return `app:${normalized.slice(src + 5)}`;

  return normalized.split('/').slice(-2).join('/');
};

const report = () => ({
  name: 'bundle-report',
  generateBundle(_options, bundle) {
    const chunks = Object.values(bundle).filter((item) => item.type === 'chunk');

    const rows = chunks.map((chunk) => {
      const modules = Object.entries(chunk.modules ?? {}).map(([id, info]) => ({
        id,
        size: info.renderedLength ?? 0,
      }));

      const total = modules.reduce((sum, module) => sum + module.size, 0);

      return { chunk, modules, total };
    });

    rows.sort((a, b) => b.total - a.total);

    console.log('\n================ chunk sizes (rendered) ================\n');

    for (const { chunk, total } of rows) {
      console.log(`  ${(total / 1024).toFixed(1).padStart(8)} KB  ${chunk.fileName}`);
    }

    const grand = rows.reduce((sum, row) => sum + row.total, 0);

    console.log(`\n  ${(grand / 1024).toFixed(1).padStart(8)} KB  TOTAL (all chunks)`);

    for (const { chunk, modules, total } of rows) {
      if (chunkFilter && !chunk.fileName.includes(chunkFilter)) continue;
      if (!chunkFilter && total < 20 * 1024) continue;

      const grouped = new Map();

      for (const module of modules) {
        const group = groupOf(module.id);

        grouped.set(group, (grouped.get(group) ?? 0) + module.size);
      }

      console.log(`\n--- ${chunk.fileName}  (${(total / 1024).toFixed(1)} KB) ---`);

      for (const [group, size] of [...grouped].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
        const share = ((size / total) * 100).toFixed(1);

        console.log(
          `    ${(size / 1024).toFixed(1).padStart(7)} KB  ${share.padStart(5)}%  ${group}`
        );
      }

      if (chunkFilter) {
        console.log('\n    largest individual modules:');

        for (const module of [...modules].sort((a, b) => b.size - a.size).slice(0, 20)) {
          const short = module.id.replace(/\\/g, '/').split('/').slice(-3).join('/');

          console.log(`      ${(module.size / 1024).toFixed(1).padStart(7)} KB  ${short}`);
        }
      }
    }

    console.log('');
  },
});

await build({
  root,
  logLevel: 'warn',
  build: { write: false, sourcemap: false },
  plugins: [report()],
});
