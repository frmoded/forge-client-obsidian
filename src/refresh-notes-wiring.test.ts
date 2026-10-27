// score_first M7b (a) (drain 2026-10-26-1260, DEMO profile) — "Refresh note links" on the REAL wiring (the real ForgePlugin.onload from the real bundle, both editions): the command exists only in a score-first vault, running it
// upgrades the stale phrase and bar notes through vault.process and tells the person in one Notice, a second run writes nothing, README.md is never touched, and the phrase tab's control writes carry the note's name (so the derived
// parts follow the json). The rules are proven in phrase-notes-core.test.ts and refresh-notes-core.test.ts; this proves they are connected.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, before } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { formatPhraseJson } from './phrase-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FX = path.join(ROOT, 'test/fixtures/score-first');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(FX, 'music-playground.forge.toml'), 'utf8');
const TUTORIAL_TOML = 'name = "forge-tutorial"\nversion = "0.1.0"\ndescription = "x"\ndomains = []\n';
const REFRESH = 'refresh-note-links';
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const OLD_PHRASE = `---\ntype: data\ncontent_type: json\ndescription: "phrase_001 — old."\n---\n\n\`\`\`json\n${formatPhraseJson({ kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 3, order: 'musical', seed: 0 })}\n\`\`\`\n`;
const code = (f: string) => fs.readFileSync(path.join(import.meta.dirname, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  before(async () => {
    const win: any = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  });

  async function world(toml: string | null) {
    real ??= await bundleRealPlugin(ROOT, edition);
    const files = new Map<string, string>([
      ['phrases/phrase_001.md', OLD_PHRASE], ['phrases/README.md', '# phrases\n'],
      ['bars/bar_005.md', fs.readFileSync(path.join(FX, 'bar_005.md'), 'utf8')], ['bars/README.md', '# bars\n'],
    ]);
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const processed: string[] = []; const lines: string[] = [];
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => p === 'forge.toml' && toml !== null, read: async (p: string) => (p === 'forge.toml' && toml !== null ? toml : '') },
        on: () => ({}), getMarkdownFiles: () => [], configDir: '.obsidian',
        getFiles: () => [...files.keys()].map(tf),
        getAbstractFileByPath: (p: string) => (files.has(p) ? tf(p) : null),
        read: async (f: any) => files.get(f.path)!,
        process: async (f: any, fn: (t: string) => string) => { processed.push(f.path); files.set(f.path, fn(files.get(f.path)!)); },
        create: async () => {}, createFolder: async () => {},
      },
      workspace: { onLayoutReady: (cb: () => void) => { cb(); }, iterateAllLeaves: iterateAllLeavesLikeObsidian<unknown>(() => ({})), on: () => ({}), getLeavesOfType: () => [], getActiveFile: () => null, getActiveViewOfType: () => null, getMostRecentLeaf: () => null, revealLeaf: () => {}, getLeaf: () => ({}) },
      metadataCache: { on: () => ({}) }, plugins: {},
    };
    const plugin = await loadRealOnload(real, app);
    await tick();
    const savedInfo = console.info; console.info = (...a: unknown[]) => { if (String(a[0]).startsWith('[forge-notes]')) lines.push(String(a[0])); };
    const savedConstructed = (globalThis as any).__shimConstructed; (globalThis as any).__shimConstructed = [];
    const notices = () => ((globalThis as any).__shimConstructed as Array<[string, unknown[]]>).filter(([n]) => n === 'Notice').map(([, a]) => String(a[0]));
    return { plugin, files, processed, lines, notices, run: async () => { plugin.commands.get(REFRESH)!.checkCallback!(false); await tick(); }, done: () => { console.info = savedInfo; (globalThis as any).__shimConstructed = savedConstructed; real.messageDelivery.setScoreFirst(false); real.messageDelivery.resetForTests(); } };
  }

  test(`[${edition}] a score-first vault: "Refresh note links" is offered; running it upgrades the stale phrase and bar notes in ONE pass with one Notice and one evidence line; README.md is never touched; the second run writes nothing`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      assert.equal(w.plugin.commands.get(REFRESH)?.name, 'Refresh note links');
      assert.equal(w.plugin.commands.get(REFRESH)!.checkCallback!(true), true);
      await w.run();
      assert.deepEqual(w.processed.sort(), ['bars/bar_005.md', 'phrases/phrase_001.md']);
      assert.match(w.files.get('phrases/phrase_001.md')!, /links:\n {2}- "\[\[bar_005\]\]"\n {2}- "\[\[bar_006\]\]"\n---/);
      assert.match(w.files.get('phrases/phrase_001.md')!, /# Recipe\n\nTake \[\[bar_005\]\] and \[\[bar_006\]\]\.\nMorph from the first to the second over 3 bars,/);
      assert.equal(w.files.get('phrases/README.md'), '# phrases\n'); assert.equal(w.files.get('bars/README.md'), '# bars\n');
      assert.equal(w.lines.length, 1); assert.match(w.lines[0], /^\[forge-notes\] refresh note links: phrases 1 \(1 updated, 0 already current\), bars 1 /);
      assert.equal(w.notices().length, 1); assert.match(w.notices()[0], /^Refresh note links: 1 phrase note\(s\) and \d+ bar note\(s\) updated\.$/);
      const snapshot = JSON.stringify([...w.files]);
      w.processed.length = 0;
      await w.run();
      assert.deepEqual(w.processed, [], 'idempotent: nothing written');
      assert.equal(JSON.stringify([...w.files]), snapshot);
      assert.match(w.notices().at(-1)!, /already up to date/);
    } finally { w.done(); }
  });

  test(`[${edition}] P3 — the tutorial vault (no profile) and a vault with no forge.toml: no "Refresh note links" command, nothing read or written`, async () => {
    for (const toml of [TUTORIAL_TOML, null]) {
      const w = await world(toml);
      try {
        assert.equal(w.plugin.commands.has(REFRESH), false);
        assert.ok(![...w.plugin.commands.values()].some((c) => /note links/i.test(String(c.name))));
        assert.deepEqual(w.processed, []);
      } finally { w.done(); }
    }
  });

  test(`[${edition}] MECHANISM PIN (if the design moves this SHOULD go red — reassess, do not just rewrite): the phrase tab's control write passes the note's name, so the derived parts follow the json`, () => {
    assert.match(code('phrase-view.ts'), /applyPhraseWrite\(text, params, file\.basename\)/);
  });
}
