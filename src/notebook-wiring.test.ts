// 2026-10-27-1030 (M14 slice 1): the notebook on the REAL wiring: the real `ForgePlugin.prototype.onload` from the real bundle (both editions), the real phrase view factory, the real vault ports of score-first.ts over a stand-in
// vault that records what the plugin does. Proves: only a score-first vault has the phrase view (and so a notebook); the view is given the notebook; Run writes the phrase and the cell through app.vault.create and opens the phrase;
// Delete cell closes the tabs that show the derived phrase BEFORE trashing it, checks it is gone, and never touches the source. Time is the shared host clock; the workspace walk is the shared host-faithful one.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { before, test } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { installHostClock, iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { PHRASE_VIEW_TYPE, noteContentFor } from './phrase-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const TUTORIAL_TOML = 'name = "forge-tutorial"\nversion = "0.1.0"\ndescription = "x"\ndomains = []\n';
const BAR = `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array(16).fill(false) } })}\n\`\`\`\n`;

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  let win: any;
  before(async () => {
    win = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  });

  async function world(toml: string | null) {
    real ??= await bundleRealPlugin(ROOT, edition);
    const clock = installHostClock(win);
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const files = new Map<string, string>([['bars/bar_005.md', BAR], ['phrases/phrase_006.md', noteContentFor('phrase_006', { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 })], ['notebook/README.md', 'Notebook.']]);
    const log = { trashed: [] as string[], removed: [] as string[], detached: [] as string[], states: [] as any[], order: [] as string[] };
    const leaves: any[] = [];
    const makeLeaf = (file?: string) => {
      const l: any = { view: file ? { file: tf(file), getViewType: () => PHRASE_VIEW_TYPE } : { getViewType: () => 'empty' }, states: [] as any[], setViewState: async (s: any) => { l.states.push(s); log.states.push(s); if (s.state?.file) { const f = s.state.file; l.view = { file: tf(f), getViewType: () => s.type }; l.detach = () => { log.detached.push(f); log.order.push(`detach ${f}`); leaves.splice(leaves.indexOf(l), 1); }; } }, detach: () => { log.detached.push(file ?? ''); log.order.push(`detach ${file}`); leaves.splice(leaves.indexOf(l), 1); } };
      leaves.push(l);
      return l;
    };
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => (p === 'forge.toml' ? toml !== null : files.has(p)), read: async (p: string) => (p === 'forge.toml' && toml !== null ? toml : ''), remove: async (p: string) => { files.delete(p); log.removed.push(p); } },
        on: () => ({}), configDir: '.obsidian',
        getFiles: () => [...files.keys()].map(tf), getMarkdownFiles: () => [...files.keys()].map(tf),
        getAbstractFileByPath: (p: string) => (files.has(p) || ['phrases', 'bars', 'notebook'].includes(p) ? tf(p) : null),
        read: async (f: any) => files.get(f.path) ?? '', createFolder: async () => {},
        create: async (p: string, c: string) => { if (files.has(p)) throw new Error('File already exists.'); files.set(p, c); return tf(p); },
        process: async (f: any, fn: (t: string) => string) => { files.set(f.path, fn(files.get(f.path) ?? '')); },
        trash: async (f: any) => { log.order.push(`trash ${f.path}`); log.trashed.push(f.path); files.delete(f.path); },
      },
      workspace: {
        rootSplit: {}, leftSplit: {}, rightSplit: {},
        onLayoutReady: (cb: () => void) => { cb(); },
        iterateAllLeaves: iterateAllLeavesLikeObsidian<any>(() => ({ root: leaves })),
        on: () => ({}), getLeavesOfType: (t: string) => leaves.filter((l) => l.view.getViewType() === t), getActiveFile: () => null, getActiveViewOfType: () => null, getMostRecentLeaf: () => null,
        getLeaf: () => makeLeaf(), revealLeaf: () => {}, setActiveLeaf: () => {},
      },
      metadataCache: { resolvedLinks: {}, on: () => ({}) }, plugins: {},
    };
    const plugin = await loadRealOnload(real, app);
    await clock.advance(60);
    (Object.prototype as any).addAction = function () { return { remove() {} }; };       // the stand-in view base has no addAction
    const lines: string[] = [];
    const savedInfo = console.info, savedError = console.error;
    console.info = (...a: unknown[]) => { if (/^\[forge-/.test(String(a[0]))) lines.push(String(a[0])); };
    console.error = () => {};
    return { plugin, files, log, lines, leaves, makeLeaf, tf, done: () => { delete (Object.prototype as any).addAction; clock.restore(); console.info = savedInfo; console.error = savedError; real.messageDelivery.setScoreFirst(false); real.messageDelivery.resetForTests(); } };
  }

  test(`[${edition}] P3: a vault that is not score-first has no phrase view, so no notebook; a score-first vault has the view, and the view is given the notebook`, async () => {
    const off = await world(TUTORIAL_TOML);
    try { assert.equal(off.plugin.views.has(PHRASE_VIEW_TYPE), false); } finally { off.done(); }
    const on = await world(SCORE_FIRST_TOML);
    try {
      assert.equal(on.plugin.views.has(PHRASE_VIEW_TYPE), true);
      const view: any = on.plugin.views.get(PHRASE_VIEW_TYPE)!(on.makeLeaf());
      assert.equal(typeof view.notebookFor, 'function');
      const ports = view.notebookFor(on.tf('phrases/phrase_006.md'));
      assert.equal(typeof ports.notebook.run, 'function');
      assert.deepEqual(await ports.notebook.cells(), { cells: [], problems: [] }, 'only the README: no cells');
    } finally { on.done(); }
  });

  test(`[${edition}] Run on the real vault ports: the transform phrase and the cell are created with app.vault.create, the phrase is opened as a Score, the evidence line is said; the source is not touched`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const view: any = w.plugin.views.get(PHRASE_VIEW_TYPE)!(w.makeLeaf());
      const { notebook } = view.notebookFor(w.tf('phrases/phrase_006.md'));
      const sourceBefore = w.files.get('phrases/phrase_006.md');
      const res = await notebook.run({ bars: [3, 4, 5], row: 'kick' }, 'thin_out', 0.5);
      assert.deepEqual(res, { ok: true, cellPath: 'notebook/cell_001.md', phrasePath: 'phrases/phrase_007.md' });
      assert.ok(w.files.has('phrases/phrase_007.md') && w.files.has('notebook/cell_001.md'));
      assert.deepEqual(w.leaves.flatMap((l: any) => l.states), [{ type: PHRASE_VIEW_TYPE, active: true, state: { file: 'phrases/phrase_007.md' } }], 'opened as the Score');
      assert.equal(w.files.get('phrases/phrase_006.md'), sourceBefore);
      assert.ok(w.lines.includes('[forge-notebook] ran cell_001: bars 3 to 5, kick row -> thin_out -> phrases/phrase_007.md'));
      const listed = await notebook.cells();
      assert.deepEqual(listed.cells.map((c: any) => [c.id, c.role]), [['cell_001', 'source']]);
    } finally { w.done(); }
  });

  test(`[${edition}] Delete cell on the real vault ports: the tab showing the derived phrase is closed BEFORE the note is trashed, the trash is checked, the cell goes after the phrase, the source stays`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const view: any = w.plugin.views.get(PHRASE_VIEW_TYPE)!(w.makeLeaf());
      const { notebook } = view.notebookFor(w.tf('phrases/phrase_006.md'));
      await notebook.run({ bars: [3], row: null }, 'double_up', 16);
      w.log.order.length = 0;
      const cell = (await notebook.cells()).cells[0];
      assert.deepEqual(await notebook.deleteCell(cell), { ok: true });
      assert.deepEqual(w.log.order, ['detach phrases/phrase_007.md', 'trash phrases/phrase_007.md', 'trash notebook/cell_001.md'], 'tabs closed first, then the phrase, then the cell');
      assert.ok(!w.files.has('phrases/phrase_007.md') && !w.files.has('notebook/cell_001.md') && w.files.has('phrases/phrase_006.md') && w.files.has('notebook/README.md'));
      assert.ok(w.lines.includes('[forge-notebook] deleted cell_001 (phrases/phrase_007.md)'));
    } finally { w.done(); }
  });

  test(`[${edition}] a note the trash silently leaves behind (L12) is removed through the adapter; one that is still there after that is a refusal naming it`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const view: any = w.plugin.views.get(PHRASE_VIEW_TYPE)!(w.makeLeaf());
      const { notebook } = view.notebookFor(w.tf('phrases/phrase_006.md'));
      await notebook.run({ bars: [3], row: null }, 'thin_out', 0.5);
      const app = (w.plugin.target as any).app;
      const realTrash = app.vault.trash;
      app.vault.trash = async () => {};                       // Obsidian's trash that does nothing while a view holds the note
      const cell = (await notebook.cells()).cells[0];
      assert.deepEqual(await notebook.deleteCell(cell), { ok: true });
      assert.deepEqual(w.log.removed, ['phrases/phrase_007.md', 'notebook/cell_001.md'], 'the adapter removed them');
      app.vault.trash = realTrash;
      await notebook.run({ bars: [1], row: null }, 'thin_out', 0.5);
      app.vault.trash = async () => {}; app.vault.adapter.remove = async () => {};
      const stuck = (await notebook.cells()).cells[0];
      const res = await notebook.deleteCell(stuck);
      assert.equal(res.ok, false);
      assert.match(res.message, /Could not delete cell_001: phrases\/phrase_007\.md is still there/);
    } finally { w.done(); }
  });
}
