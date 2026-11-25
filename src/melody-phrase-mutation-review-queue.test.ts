// 2026-11-24-1031 (pitch in bars, Stage 1b) - the mutation pass of the melody phrase answered (failed-prompt-view.ts): the review queue of unprocessed sentences reads the notes of the vault with the same lists as the composer, melody bars and melody phrases
// included, so a sentence about a melody phrase is checked against the vault that has them. The REAL src/failed-prompt-view.ts is bundled for node with a stand-in `obsidian` (the way test-support/bundle-real-plugin.ts does), and the
// vault list the queue hands to its checker (the `vault` port of createReview) is read from a fake app with every kind of file in it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

function obsidianNames(): string[] {
  const names = new Set<string>();
  for (const f of fs.readdirSync(SRC)) {
    if (!f.endsWith('.ts')) continue;
    for (const m of fs.readFileSync(path.join(SRC, f), 'utf8').matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'obsidian'/g)) {
      for (const n of m[1].split(',')) { const t = n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]; if (/^[A-Za-z_]\w*$/.test(t)) names.add(t); }
    }
  }
  return [...names].sort();
}

/** The real registerReviewQueue, bundled; `createReview` is the real one too, wrapped to keep what it was given. */
async function bundleReviewQueue(): Promise<{ registerReviewQueue: (plugin: unknown, setup: unknown) => unknown; reviewDeps: () => { vault(): Record<string, string[]> } }> {
  const require = createRequire(path.join(ROOT, 'package.json'));
  const { build } = require('esbuild');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-queue-'));
  const shim = path.join(tmp, 'obsidian-shim.js');
  fs.writeFileSync(shim, obsidianNames().map((n) => (/^[A-Z]/.test(n) ? `export class ${n} { constructor(...a) { this.args = a; } }` : `export const ${n} = () => undefined;`)).join('\n'));
  const setupCore = path.join(SRC, 'failed-prompt-setup-core.ts');
  const wrapper = path.join(tmp, 'setup-core-wrapper.ts');
  fs.writeFileSync(wrapper, `export * from ${JSON.stringify(setupCore)};\nimport { createReview as real } from ${JSON.stringify(setupCore)};\nexport const createReview: typeof real = (d) => { (globalThis as any).__reviewDeps = d; return real(d); };\n`);
  const entry = path.join(tmp, 'entry.ts');
  fs.writeFileSync(entry, `export { registerReviewQueue } from ${JSON.stringify(path.join(SRC, 'failed-prompt-view.ts'))};\n`);
  const out = await build({
    entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error',
    plugins: [{ name: 'review-queue-test', setup: (b: any) => {
      b.onResolve({ filter: /^obsidian$/ }, () => ({ path: shim }));
      b.onResolve({ filter: /failed-prompt-setup-core(\.ts)?$/ }, (a: any) => (a.importer === wrapper ? { path: setupCore } : { path: wrapper }));
    } }],
  });
  const file = path.join(tmp, 'review-queue.mjs');
  fs.writeFileSync(file, out.outputFiles[0].text);
  const mod = await import(pathToFileURL(file).href);
  return { registerReviewQueue: mod.registerReviewQueue, reviewDeps: () => (globalThis as any).__reviewDeps };
}

interface FakeFile { path: string; basename: string; extension: string }
const file = (p: string): FakeFile => { const base = path.basename(p); const ext = path.extname(base).slice(1); return { path: p, basename: base.slice(0, base.length - ext.length - 1), extension: ext }; };

test('the review queue reads the vault the way the composer does: a folder\'s notes (md only), no README, the melody bars and melody phrases by their front matter, arrangements and compositions and kits as they are', async () => {
  const { registerReviewQueue, reviewDeps } = await bundleReviewQueue();
  const melody = new Set(['bars/bar_021.md', 'bars/shot.png', 'phrases/phrase_101.md', 'phrases/loop.wav']);          // the notes (and two pictures and sounds) whose front matter says `melody: true`
  const files = ['bars/bar_001.md', 'bars/bar_021.md', 'bars/README.md', 'bars/shot.png', 'bars/other/bar_002.md', 'phrases/phrase_001.md', 'phrases/phrase_101.md', 'phrases/README.md', 'phrases/loop.wav', 'arrangements/arr_001.md', 'arrangements/README.md', 'compositions/comp_001.md', 'kits/rock.md', 'other/bar_900.md'].map(file);
  const adapter = { read: async () => '', write: async () => {}, append: async () => {}, exists: async () => false };
  const app = {
    vault: { adapter, configDir: '.obsidian', getFiles: () => files, cachedRead: async () => '' },
    metadataCache: { getFileCache: (f: FakeFile) => ({ frontmatter: melody.has(f.path) ? { melody: true } : { type: 'data' } }) },
    workspace: { getActiveFile: () => null, getLeavesOfType: () => [], on: () => ({}) },
  };
  const plugin = { app, manifest: { dir: '.obsidian/plugins/forge', id: 'forge' }, registerView: () => {}, addCommand: () => {} };
  registerReviewQueue(plugin, { enabled: () => false, build: () => 'test' });
  assert.deepEqual(reviewDeps().vault(), {
    bars: ['bar_001', 'bar_021', 'bar_002'],          // `bars/other/bar_002.md` is in the folder (a path that starts with it): the same as it was before the melody lists
    phrases: ['phrase_001', 'phrase_101'],
    arrangements: ['arr_001'], compositions: ['comp_001'], kits: ['rock'],
    melody: ['bar_021'],
    melodyPhrases: ['phrase_101'],
  });
});
