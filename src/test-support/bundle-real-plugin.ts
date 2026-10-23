// Test support: the REAL plugin code (src/main.ts's ForgePlugin, src/output-view.ts's ForgeOutputView, src/forge-notice.ts) bundled for node with a stand-in `obsidian`, so a test can call the
// real `forgeNotice` and the real (private) `ForgePlugin.prototype.getOutputView` against a fake workspace and record what they do to it. Used by the M4 characterization test
// (drain 2026-10-21-2010): the tutorial vault's panel behaviour is pinned on the real functions, not on a re-implementation of them.
//
// The stand-in is generated: every name any src file imports from 'obsidian' becomes an empty class (capitalised) or a no-op function. Nothing here runs Obsidian; the test builds the objects
// it needs (`Object.create(ForgePlugin.prototype)`, a leaf whose view is `Object.create(ForgeOutputView.prototype)`), so no constructor of the real classes runs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();     // the tests run from the repo root (same as real-rhythm-engine.ts)

export interface RealPlugin {
  ForgePlugin: { prototype: any };
  ForgeOutputView: { prototype: any };
  forgeNotice: (app: any, text: string, kind?: 'info' | 'error' | 'success', snippetId?: string) => Promise<void>;
  /** The bundle's own instance of the shared delivery state (the test's import of the same file would be a different module instance). */
  messageDelivery: import('../score-first-messages-core.ts').MessageDelivery;
  /** The Score panel's message DOM, from the SAME bundle (so it talks to the bundle's `messageDelivery`). */
  mountScoreMessages: typeof import('../score-messages-dom.ts').mountScoreMessages;
  /** server.ts's host wiring (so a test can put a fake Pyodide host behind the real `connectVault`). */
  /** The stand-in `MarkdownView` class the bundle's own `instanceof MarkdownView` checks use (a test builds a view with `new real.MarkdownView()`). */
  MarkdownView: new () => any;
  TFile: new () => any;
  /** The header re-sync bus (header-resync.ts) from the SAME bundle. */
  headerResync: typeof import('../header-resync.ts').headerResync;
  setPyodideHost: typeof import('../server.ts').setPyodideHost;
  /** The real server.ts operations (so a test can drive each against a fake Pyodide host and a closed engine port). */
  connectVault: typeof import('../server.ts').connectVault;
  computeSnippet: typeof import('../server.ts').computeSnippet;
  freezeEdge: typeof import('../server.ts').freezeEdge;
  syncDependencies: typeof import('../server.ts').syncDependencies;
}

function obsidianNames(): string[] {
  const names = new Set<string>();
  for (const f of fs.readdirSync(path.join(ROOT, 'src'))) {
    if (!f.endsWith('.ts')) continue;
    const s = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
    for (const m of s.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'obsidian'/g)) {
      for (const n of m[1].split(',')) { const t = n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]; if (/^[A-Za-z_]\w*$/.test(t)) names.add(t); }
    }
  }
  return [...names].sort();
}

/** Bundle `src` (or another checkout's `src`, e.g. a worktree of an earlier commit) and import it. `client` defaults to this repo; `edition` to the committed lean one. */
export async function bundleRealPlugin(client: string = ROOT, edition: 'lean' | 'music' = 'lean'): Promise<RealPlugin> {
  const require = createRequire(path.join(ROOT, 'package.json'));
  const { build } = require('esbuild');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'real-plugin-'));
  const shim = path.join(tmp, 'obsidian-shim.js');
  fs.writeFileSync(shim, obsidianNames().map((n) => (/^[A-Z]/.test(n) ? `export class ${n} { constructor(...a) { this.args = a; (globalThis.__shimConstructed ??= []).push(['${n}', a]); } }` : `export const ${n} = (...a) => (globalThis.__shimFns?.['${n}'] ?? (() => undefined))(...a);`)).join('\n'));
  const entry = path.join(tmp, 'entry.ts');
  const src = path.join(client, 'src');
  fs.writeFileSync(entry, `export { default as ForgePlugin } from ${JSON.stringify(path.join(src, 'main.ts'))};\nexport { ForgeOutputView } from ${JSON.stringify(path.join(src, 'output-view.ts'))};\nexport { forgeNotice } from ${JSON.stringify(path.join(src, 'forge-notice.ts'))};\n${fs.existsSync(path.join(src, 'score-first-messages-core.ts')) ? `export { messageDelivery } from ${JSON.stringify(path.join(src, 'score-first-messages-core.ts'))};\nexport { mountScoreMessages } from ${JSON.stringify(path.join(src, 'score-messages-dom.ts'))};\n` : ''}export { MarkdownView, TFile } from 'obsidian';\nexport { headerResync } from ${JSON.stringify(path.join(src, 'header-resync.ts'))};\nexport { setPyodideHost, connectVault, computeSnippet, freezeEdge, syncDependencies } from ${JSON.stringify(path.join(src, 'server.ts'))};\n`);   // an earlier checkout (a worktree of 1300d14) has no such file
  const out = await build({
    entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error',
    // The music edition is the same redirect scripts/build-main.mjs makes: the ONE module the rest of the plugin imports the edition from points at music-edition.full.ts (default: the committed lean one).
    plugins: edition === 'music' ? [{ name: 'real-plugin-music-edition', setup: (b: any) => { b.onResolve({ filter: /(^|\/)music-edition-selected(\.ts)?$/ }, () => ({ path: path.join(client, 'src', 'music-edition.full.ts') })); b.onResolve({ filter: /(^|\/)edition-selected(\.ts)?$/ }, () => ({ path: path.join(client, 'src', 'edition-selected.music.ts') })); } }] : [],
    alias: { obsidian: shim }, loader: { '.wasm': 'binary' }, nodePaths: [path.join(ROOT, 'node_modules')], define: { 'process.env.NODE_ENV': '"production"' },
  });
  const file = path.join(tmp, 'bundle.mjs');
  fs.writeFileSync(file, out.outputFiles[0].text);
  return (await import(file)) as RealPlugin;
}
