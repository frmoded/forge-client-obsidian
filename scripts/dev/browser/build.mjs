// Bundle the REAL RhythmEditView (src/rhythm-edit-view.ts) for a browser page: esbuild + a tiny Obsidian shim + stubs for the three Node/Obsidian-only seams.
// usage: [CLIENT=<repo or worktree>] [EDITION=music|lean] OUT=<file.js> node scripts/dev/browser/build.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(here, '../../..');
const CLIENT = process.env.CLIENT || REPO;
const require = createRequire(path.join(REPO, 'package.json'));      // esbuild from the repo's node_modules (a worktree under test may only symlink it)
const { build } = require('esbuild');
const EDITION = process.env.EDITION || 'music';
const OUT = process.env.OUT;
const ENTRY = process.env.ENTRY || 'entry.ts';          // another page's entry in this folder (e.g. entry-panel.ts)
if (!OUT) { console.error('build.mjs: OUT=<file.js> is required'); process.exit(2); }
// The hand-written shim covers what the Beat Box tab needs. A bigger entry (the Forge output panel imports Modal, Setting, MarkdownRenderer, ...) gets the rest as empty classes / no-op
// functions: every name any src file imports from 'obsidian' that the shim does not already export.
const shimPath = (() => {
  const hand = fs.readFileSync(path.join(here, 'obsidian-shim.ts'), 'utf8');
  const have = new Set([...hand.matchAll(/export\s+(?:class|const|function|async function)\s+(\w+)/g)].map((m) => m[1]));
  const wanted = new Set();
  for (const f of fs.readdirSync(path.join(CLIENT, 'src'))) {
    if (!f.endsWith('.ts')) continue;
    for (const m of fs.readFileSync(path.join(CLIENT, 'src', f), 'utf8').matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'obsidian'/g)) {
      for (const n of m[1].split(',')) { const t = n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]; if (/^[A-Za-z_]\w*$/.test(t) && !have.has(t)) wanted.add(t); }
    }
  }
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-shim-')), 'shim.ts');
  fs.writeFileSync(out, `export * from ${JSON.stringify(path.join(here, 'obsidian-shim.ts'))};\n` + [...wanted].map((n) => (/^[A-Z]/.test(n) ? `export class ${n} { constructor(..._a: any[]) {} }` : `export const ${n}: any = () => undefined;`)).join('\n') + '\n');
  return out;
})();
await build({
  entryPoints: [path.join(here, ENTRY)], bundle: true, format: 'iife', outfile: OUT, platform: 'browser', logLevel: 'error',
  loader: { '.wasm': 'binary' }, nodePaths: [path.join(REPO, 'node_modules')],
  alias: { obsidian: shimPath, '@client': path.join(CLIENT, 'src') },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^(node:)?(fs|crypto|path)$/ }, () => ({ path: path.join(here, 'empty-node.cjs') }));          // Verovio's wasm loader requires them at load; unused in a browser
    b.onResolve({ filter: /\.\/restore-note-to-git\.ts$/ }, () => ({ path: path.join(here, 'stub-restore.ts') }));       // child_process
    b.onResolve({ filter: /\.\/bundled-widget-lookup\.ts$/ }, () => ({ path: path.join(here, 'stub-widget-lookup.ts') }));
    b.onResolve({ filter: /\.\/rhythm-score-engine\.ts$/ }, () => ({ path: path.join(here, 'stub-score-engine.ts') }));   // -> the real engine behind /compute
    b.onResolve({ filter: /\.\/music-edition-selected\.ts$/ }, () => ({ path: path.join(CLIENT, 'src', EDITION === 'music' ? 'music-edition.full.ts' : 'music-edition.lean.ts') }));
    b.onResolve({ filter: /\.\/edition-selected\.ts$/ }, () => ({ path: path.join(CLIENT, 'src', EDITION === 'music' ? 'edition-selected.music.ts' : 'edition-selected.ts') }));
  } }],
});
console.log('built', OUT);
