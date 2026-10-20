// Bundle the REAL RhythmEditView (src/rhythm-edit-view.ts) for a browser page: esbuild + a tiny Obsidian shim + stubs for the three Node/Obsidian-only seams.
// usage: [CLIENT=<repo or worktree>] [EDITION=music|lean] OUT=<file.js> node scripts/dev/browser/build.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(here, '../../..');
const CLIENT = process.env.CLIENT || REPO;
const require = createRequire(path.join(REPO, 'package.json'));      // esbuild from the repo's node_modules (a worktree under test may only symlink it)
const { build } = require('esbuild');
const EDITION = process.env.EDITION || 'music';
const OUT = process.env.OUT;
if (!OUT) { console.error('build.mjs: OUT=<file.js> is required'); process.exit(2); }
await build({
  entryPoints: [path.join(here, 'entry.ts')], bundle: true, format: 'iife', outfile: OUT, platform: 'browser', logLevel: 'error',
  loader: { '.wasm': 'binary' }, nodePaths: [path.join(REPO, 'node_modules')],
  alias: { obsidian: path.join(here, 'obsidian-shim.ts'), '@client': path.join(CLIENT, 'src') },
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
