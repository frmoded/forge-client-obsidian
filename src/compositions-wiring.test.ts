// 2026-10-31-1100 (score_first M17b) - compositions on the REAL wiring: the real `ForgePlugin.prototype.onload` from the real bundle (both editions), the real commands, the real dialog and the real flow, over a vault that records what the plugin does
// (host-faithful, card 12: a create on a path that exists throws, the workspace walk is the shared one, Modal gets open/close the way Obsidian's does). The decisions are proven in composition-core / composition-flow-core / composition-root-core and the
// DOM in composition-dialog-dom / composition-strip-dom; this proves they are CONNECTED: only in a score-first vault (P3), "New composition" makes compositions/comp_001.md (marked root when it is the first) and opens it in the composition tab,
// "Open composition as Score" switches a composition note to the tab, "Open the piece" opens the ROOT composition and says so when there is none or more than one, "Make this composition the root" moves the mark, and "Refresh note links" reaches compositions.
import assert from 'node:assert/strict';
import { facetHashSync } from './facet-sync-hash-core.ts';
import { pythonTextOf } from './phrase-notes-core.ts';
import fs from 'node:fs';
import path from 'node:path';
import { before, test } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { installHostClock, iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { COMPOSITION_VIEW_TYPE, newCompositionNote, readCompositionNote } from './composition-core.ts';
import { isRootNote } from './composition-root-core.ts';
import { noteContentFor, type PhraseParams } from './phrase-core.ts';

/** 2026-11-02-1155 (M16b, deliberate): a STALE derived Python that nobody edited (what an older plugin version wrote): the text changed AND `python_hash` re-stamped to it, so the note does not read as a hand edit (a hand-edited Python is a source now and a refresh refuses it). */
const staleDerived = (text: string): string => { const t = text.replace('```python\n', '```python\n# typed here\n'); return t.replace(/^python_hash: .*$/m, `python_hash: ${facetHashSync(pythonTextOf(t) ?? '')}`); };

const ROOT = path.resolve(import.meta.dirname, '..');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const TUTORIAL_TOML = 'name = "forge-tutorial"\nversion = "0.1.0"\ndescription = "x"\ndomains = []\n';
const MUSIC_THEORY_TOML = 'name = "music-theory"\nversion = "0.1.0"\ndescription = "x"\ndomains = ["music"]\n';
const [NEW_COMP, OPEN_COMP, OPEN_PIECE, MAKE_ROOT, REFRESH] = ['new-composition', 'open-composition-as-score', 'open-the-piece', 'make-composition-root', 'refresh-note-links'];
const COMMANDS = [NEW_COMP, OPEN_COMP, OPEN_PIECE, MAKE_ROOT];
const P = (...sources: string[]) => ({ kind: 'composition' as const, sections: sources.map((source) => ({ source })) });

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  let win: any;
  before(async () => {
    win = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  });

  async function world(toml: string | null, files: Record<string, string> = {}, active: string | null = null) {
    real ??= await bundleRealPlugin(ROOT, edition);
    const clock = installHostClock(win);
    const doc = win.document;
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const store = new Map<string, string>(Object.entries({ 'bars/bar_005.md': '', 'bars/README.md': '', ...files }));
    const folders = new Set(['bars', 'phrases']);
    const created: Array<[string, string]> = [];
    const madeFolders: string[] = [];
    const touched: string[] = [];
    const leaves: any[] = [];
    const notices: string[] = [];
    const makeLeaf = () => { const l: any = { states: [] as any[], opened: [] as string[], setViewState: async (s: any) => { l.states.push(s); }, getViewState: () => ({ type: l.states.at(-1)?.type, state: { file: l.states.at(-1)?.state?.file } }), openFile: async (f: any) => { l.opened.push(f.path); } }; leaves.push(l); return l; };
    let activeFile: string | null = active;
    let activeView: any = null;
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => p === 'forge.toml' && toml !== null, read: async (p: string) => (p === 'forge.toml' && toml !== null ? toml : '') },
        on: () => ({}), configDir: '.obsidian',
        getFiles: () => [...store.keys()].map(tf),
        getMarkdownFiles: () => [...store.keys()].map(tf),
        getAbstractFileByPath: (p: string) => { if (/compositions/.test(p)) touched.push(p); return store.has(p) || folders.has(p) ? tf(p) : null; },
        read: async (f: any) => store.get(f.path) ?? '',
        process: async (f: any, fn: (t: string) => string) => { store.set(f.path, fn(store.get(f.path) ?? '')); },
        createFolder: async (p: string) => { madeFolders.push(p); folders.add(p); },
        create: async (p: string, c: string) => { if (store.has(p)) throw new Error('File already exists.'); store.set(p, c); created.push([p, c]); return tf(p); },
      },
      workspace: {
        rootSplit: {}, leftSplit: {}, rightSplit: {},
        onLayoutReady: (cb: () => void) => { cb(); },
        iterateAllLeaves: iterateAllLeavesLikeObsidian<any>(() => ({ root: leaves })),
        on: () => ({}), getLeavesOfType: () => [], getActiveViewOfType: (cls: any) => (activeView !== null && activeView instanceof cls ? activeView : null), getMostRecentLeaf: () => null,
        getActiveFile: () => (activeFile === null ? null : tf(activeFile)),
        getLeaf: () => makeLeaf(), createLeafBySplit: () => makeLeaf(), revealLeaf: () => {}, setActiveLeaf: () => {},
      },
      metadataCache: { resolvedLinks: {}, on: () => ({}) }, plugins: {},
    };
    const plugin = await loadRealOnload(real, app);
    await clock.advance(60);
    const modals: any[] = [];
    const proto = real.Modal.prototype;
    const saved = { open: proto.open, close: proto.close };
    proto.open = function () { this.contentEl = doc.createElement('div'); this.contentEl.empty = function () { this.textContent = ''; }; doc.body.appendChild(this.contentEl); modals.push(this); this.onOpen(); };
    proto.close = function () { this.closed = true; this.onClose(); this.contentEl.remove(); };
    const lines: string[] = [];
    const savedInfo = console.info, savedError = console.error;
    console.info = (...a: unknown[]) => { if (/^\[forge-/.test(String(a[0]))) lines.push(String(a[0])); };
    console.error = () => {};
    const savedNotice = (real as any).Notice;
    const flush = () => clock.advance(5);
    const q = (sel: string) => modals.at(-1)?.contentEl.querySelector(sel) as any;
    const click = (e: any) => e.dispatchEvent(new win.Event('click', { bubbles: true }));
    return {
      plugin, app, real, store, created, madeFolders, touched, modals, lines, leaves, notices, q, click, flush,
      setActive: (p: string | null) => { activeFile = p; },
      setActiveView: (v: any) => { activeView = v; },
      offered: (id: string) => plugin.commands.get(id)?.checkCallback?.(true) ?? false,
      run: async (id: string) => { plugin.commands.get(id)!.checkCallback!(false); await flush(); await flush(); },
      done: () => { clock.restore(); proto.open = saved.open; proto.close = saved.close; console.info = savedInfo; console.error = savedError; void savedNotice; delete (globalThis as any).__shimFns; real.messageDelivery.resetForTests(); },
    };
  }

  // 2026-10-31-1135: Create now asks the engine's producers about the prospective note first, so the phrases a composition plays are REAL phrases of a real bar (a placeholder 'p' is a note that cannot be drawn)
  const BAR = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/bar_007.md'), 'utf8');
  const EXTEND = (source: string): PhraseParams => ({ kind: 'extend', source, bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 } as PhraseParams);
  const PHRASES = { 'bars/bar_005.md': BAR, 'phrases/phrase_003.md': noteContentFor('phrase_003', EXTEND('bar_005')), 'phrases/phrase_004.md': noteContentFor('phrase_004', EXTEND('bar_005')) };

  test(`[${edition}] a score-first vault: the four commands and the composition view are registered; "New composition" needs a phrase or an arrangement, "Open composition as Score" and "Make ... the root" only on a composition note, "Open the piece" only when the vault has a composition`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      assert.equal(w.plugin.commands.get(NEW_COMP)?.name, 'New composition');
      assert.equal(w.plugin.commands.get(OPEN_COMP)?.name, 'Open composition as Score');
      assert.equal(w.plugin.commands.get(OPEN_PIECE)?.name, 'Open the piece');
      assert.equal(w.plugin.commands.get(MAKE_ROOT)?.name, 'Make this composition the root of the piece');
      assert.ok(w.plugin.views.has(COMPOSITION_VIEW_TYPE), 'the composition view type is registered');
      for (const id of COMMANDS) assert.equal(w.offered(id), false, `${id}: nothing to play and no composition yet`);
    } finally { w.done(); }
    const some = await world(SCORE_FIRST_TOML, { ...PHRASES, 'compositions/comp_001.md': newCompositionNote('comp_001', P('phrases/phrase_003')) }, 'compositions/comp_001.md');
    try {
      assert.equal(some.offered(NEW_COMP), true, 'a phrase: offered');
      assert.equal(some.offered(OPEN_COMP), true); assert.equal(some.offered(MAKE_ROOT), true); assert.equal(some.offered(OPEN_PIECE), true);
      for (const p of ['compositions/README.md', 'phrases/phrase_003.md', null]) { some.setActive(p); assert.equal(some.offered(OPEN_COMP), false, String(p)); assert.equal(some.offered(MAKE_ROOT), false, String(p)); }
    } finally { some.done(); }
  });

  for (const [label, toml] of [['the tutorial vault (no profile)', TUTORIAL_TOML], ['music-theory (no profile)', MUSIC_THEORY_TOML], ['a vault with no forge.toml', null]] as const) {
    test(`[${edition}] P3 - ${label}: no composition command, no composition view, nothing looks at compositions/, nothing is written`, async () => {
      const w = await world(toml, { ...PHRASES, 'compositions/comp_001.md': newCompositionNote('comp_001', P('phrases/phrase_003')) }, 'compositions/comp_001.md');
      try {
        for (const id of COMMANDS) assert.equal(w.plugin.commands.has(id), false, id);
        assert.equal(w.plugin.views.has(COMPOSITION_VIEW_TYPE), false);
        assert.deepEqual(w.touched, [], 'nothing looked at compositions/');
        assert.deepEqual(w.created.map(([p]) => p).filter((p) => p.startsWith('compositions')), [], 'no composition written');         // (the plugin may write its own Welcome.md in a vault with no forge.toml: that is not ours)
        assert.deepEqual(w.madeFolders.filter((f) => f.startsWith('compositions')), []);
      } finally { w.done(); }
    });
  }

  test(`[${edition}] "New composition": the dialog lists the vault's phrases, Create makes compositions/comp_001.md in the Forge shape (the first composition is marked the root), prints the evidence line, opens it in the composition tab and closes the dialog`, async () => {
    const w = await world(SCORE_FIRST_TOML, PHRASES);
    try {
      await w.run(NEW_COMP);
      assert.equal(w.modals.length, 1);
      const options = [...w.modals[0].contentEl.querySelectorAll('.forge-comp-note option')].map((o: any) => o.value);
      assert.deepEqual(options, ['phrases/phrase_003', 'phrases/phrase_004']);
      assert.equal(w.q('.forge-comp-root').checked, true, 'no root yet: this one is the root by default');
      w.q('.forge-comp-length').value = '8';
      w.click(w.q('.forge-comp-add'));
      const rows = w.modals[0].contentEl.querySelectorAll('.forge-comp-section');
      assert.equal(rows.length, 2);
      rows[1].querySelector('.forge-comp-note').value = 'phrases/phrase_004';
      rows[1].querySelector('.forge-comp-repeat').value = '2';
      w.click(w.q('.forge-comp-create'));
      await w.flush(); await w.flush();
      assert.deepEqual(w.madeFolders, ['compositions']);
      assert.equal(w.created.length, 1);
      const [created, text] = w.created[0];
      assert.equal(created, 'compositions/comp_001.md');
      const read = readCompositionNote(text);
      assert.ok(read.ok);
      if (read.ok) assert.deepEqual(read.value.sections, [{ source: 'phrases/phrase_003', length: 8 }, { source: 'phrases/phrase_004', repeat: 2 }]);
      assert.ok(isRootNote(text), 'marked as the root');
      assert.match(text, /# Description\n\nPlay \[\[phrase_003\]\] for 8 bars\. Then play \[\[phrase_004\]\]\. Repeat that 2 more times\.\n/);
      assert.deepEqual(w.lines.filter((l) => l.startsWith('[forge-composition]')), ['[forge-composition] created compositions/comp_001.md sections=phrase_003:8,phrase_004x3']);
      // 2026-10-31-1135 (CCQA smoke 10, B1): the composition is the root of the piece, so it opens WITH its notes: the Score, and the notes pane beside it showing the new note (it was the Score alone, 'Open Score with notes' needed)
      assert.deepEqual(w.leaves.flatMap((l) => l.states).map((s: any) => [s.type, s.state.file]), [[COMPOSITION_VIEW_TYPE, 'compositions/comp_001.md'], ['markdown', 'compositions/comp_001.md']]);
      assert.equal(w.leaves.length, 2, 'two panes: the Score and its notes');
      assert.equal(w.modals[0].closed, true);
    } finally { w.done(); }
  });

  test(`[${edition}] "New composition" with a pair ALREADY open (smoke 10, B4): the new composition takes the Score's pane and the notes pane moves to the new note - no third pane, the notes pane does not stay on the previous composition`, async () => {
    const w = await world(SCORE_FIRST_TOML, { ...PHRASES, 'compositions/comp_001.md': newCompositionNote('comp_001', P('phrases/phrase_003'), ['root: true']) });
    try {
      const leaf: any = { states: [] as any[], opened: [] as string[], setViewState: async (s: any) => { leaf.states.push(s); }, getViewState: () => ({ type: leaf.states.at(-1)?.type, state: { file: leaf.states.at(-1)?.state?.file } }), openFile: async (f: any) => { leaf.opened.push(f.path); }, containerEl: win.document.createElement('div') };
      (Object.prototype as any).addAction = function () { return { remove() {} }; };
      const view: any = w.plugin.views.get(COMPOSITION_VIEW_TYPE)!(leaf);
      view.leaf = leaf; view.app = w.app;
      view.file = Object.assign(new (w.real as any).TFile(), { path: 'compositions/comp_001.md', extension: 'md', basename: 'comp_001' });
      w.setActiveView(view);
      await w.run('open-score-with-notes');                                          // the pair of comp_001: its Score (leaf) and a notes pane
      const panes = () => w.leaves.filter((l: any) => l !== leaf && l.states.some((s: any) => s.type === 'markdown'));
      assert.equal(panes().length, 1, 'the pair is open');
      const before = w.leaves.length;
      await w.run(NEW_COMP);
      w.q('.forge-comp-root').checked = false;
      w.click(w.q('.forge-comp-create'));
      await w.flush(); await w.flush();
      assert.equal(w.created.length, 1); assert.equal(w.created[0][0], 'compositions/comp_002.md');
      assert.equal(w.leaves.length, before, `no third pane: ${JSON.stringify(w.leaves.map((l: any) => l.states.map((s: any) => [s.type, s.state?.file])))}`);
      assert.deepEqual(leaf.states.at(-1), { type: COMPOSITION_VIEW_TYPE, active: true, state: { file: 'compositions/comp_002.md' } }, 'the Score pane now shows the new composition');
      const shown = panes().flatMap((l: any) => [...l.states.map((s: any) => s.state?.file), ...l.opened]);
      assert.equal(String(shown.at(-1)), 'compositions/comp_002.md', `the notes pane moved to the new note, not left on comp_001: ${JSON.stringify(shown)}`);
    } finally { delete (Object.prototype as any).addAction; w.done(); }
  });

  test(`[${edition}] a second composition is not the root by default, and ticking the root box moves the mark: the first one loses it`, async () => {
    const first = newCompositionNote('comp_001', P('phrases/phrase_003'), ['root: true']);
    const w = await world(SCORE_FIRST_TOML, { ...PHRASES, 'compositions/comp_001.md': first });
    try {
      await w.run(NEW_COMP);
      assert.equal(w.q('.forge-comp-root').checked, false, 'there is a root already');
      w.q('.forge-comp-root').checked = true;
      w.click(w.q('.forge-comp-create'));
      await w.flush(); await w.flush();
      assert.equal(w.created[0][0], 'compositions/comp_002.md');
      assert.ok(isRootNote(w.store.get('compositions/comp_002.md')!));
      assert.ok(!isRootNote(w.store.get('compositions/comp_001.md')!), 'the first composition lost the mark');
    } finally { w.done(); }
  });

  test(`[${edition}] "Open composition as Score" switches a composition note to the composition tab; "Refresh note links" reaches compositions (stale derived text regenerated, current notes not written)`, async () => {
    const note = newCompositionNote('comp_001', P('phrases/phrase_003'));
    const stale = { ...PHRASES, 'compositions/comp_001.md': staleDerived(note) };       // 2026-10-31-1140 (M16a): the PYTHON is the derived text a refresh regenerates; a typed Recipe is a source now (recipe-apply-core.test.ts)
    const w = await world(SCORE_FIRST_TOML, stale, 'compositions/comp_001.md');
    try {
      await w.run(OPEN_COMP);
      const states = w.leaves.flatMap((l) => l.states).map((s: any) => [s.type, s.state.file]);
      assert.deepEqual(states.filter(([type]) => type === COMPOSITION_VIEW_TYPE), [[COMPOSITION_VIEW_TYPE, 'compositions/comp_001.md']]);
      assert.ok(states.some(([type, file]) => type === 'markdown' && file === 'compositions/comp_001.md'), `the notes pane opened beside the Score: ${JSON.stringify(states)}`);
      await w.run(REFRESH);
      assert.ok(!w.store.get('compositions/comp_001.md')!.includes('typed here'));
      assert.ok(w.lines.some((l) => /^\[forge-notes\] refresh note links: .*, compositions 1 \(1 updated, 0 already current\)(?:, \d+ skipped)?$/.test(l)), w.lines.join(' | '));
    } finally { w.done(); }
  });

  test(`[${edition}] "Open the piece" opens the root composition, and says why not when there is none or more than one; "Make this composition the root" moves the mark`, async () => {
    const a = newCompositionNote('comp_001', P('phrases/phrase_003')), b = newCompositionNote('comp_002', P('phrases/phrase_004'));
    const none = await world(SCORE_FIRST_TOML, { ...PHRASES, 'compositions/comp_001.md': a, 'compositions/comp_002.md': b });
    try {
      await none.run(OPEN_PIECE);
      assert.deepEqual(none.leaves.flatMap((l) => l.states), [], 'no root: nothing opened');
      none.setActive('compositions/comp_002.md');
      await none.run(MAKE_ROOT);
      assert.ok(isRootNote(none.store.get('compositions/comp_002.md')!) && !isRootNote(none.store.get('compositions/comp_001.md')!));
      await none.run(OPEN_PIECE);
      assert.deepEqual(none.leaves.flatMap((l) => l.states).map((s: any) => [s.type, s.state.file]).filter(([type]) => type === COMPOSITION_VIEW_TYPE), [[COMPOSITION_VIEW_TYPE, 'compositions/comp_002.md']], 'the root is the piece');
      assert.ok(none.leaves.flatMap((l) => l.states).some((s: any) => s.type === 'markdown' && s.state.file === 'compositions/comp_002.md'), 'with its notes pane beside it');
      none.setActive('compositions/comp_001.md');
      await none.run(MAKE_ROOT);
      assert.ok(isRootNote(none.store.get('compositions/comp_001.md')!) && !isRootNote(none.store.get('compositions/comp_002.md')!), 'the mark moved');
    } finally { none.done(); }
    const many = await world(SCORE_FIRST_TOML, { ...PHRASES, 'compositions/comp_001.md': newCompositionNote('comp_001', P('phrases/phrase_003'), ['root: true']), 'compositions/comp_002.md': newCompositionNote('comp_002', P('phrases/phrase_004'), ['root: true']) });
    try {
      await many.run(OPEN_PIECE);
      assert.deepEqual(many.leaves.flatMap((l) => l.states), [], 'two roots: nothing opened');
    } finally { many.done(); }
  });
  test(`[${edition}] a composition tab pairs with a notes pane: the palette command is offered on it and opens the pane beside it, and a pinned bar sends that pane to the note its section plays`, async () => {
    const w = await world(SCORE_FIRST_TOML, { ...PHRASES, 'compositions/comp_001.md': newCompositionNote('comp_001', P('phrases/phrase_003')) });
    try {
      assert.equal(w.offered('open-score-with-notes'), false, 'no composition tab, no pair');
      const leaf: any = { states: [] as any[], opened: [] as string[], setViewState: async (s: any) => { leaf.states.push(s); }, getViewState: () => ({ type: leaf.states.at(-1)?.type, state: { file: leaf.states.at(-1)?.state?.file } }), openFile: async (f: any) => { leaf.opened.push(f.path); }, containerEl: win.document.createElement('div') };
      (Object.prototype as any).addAction = function () { return { remove() {} }; };          // the stand-in view base has no addAction (as in kits-arrangements-wiring.test.ts and linked-panes-wiring.test.ts)
      const view: any = w.plugin.views.get(COMPOSITION_VIEW_TYPE)!(leaf);
      view.leaf = leaf; view.app = w.app;
      view.file = Object.assign(new (w.real as any).TFile(), { path: 'compositions/comp_001.md', extension: 'md', basename: 'comp_001' });
      w.setActiveView(view);
      assert.equal(w.offered('open-score-with-notes'), true, 'the composition tab is a pair target');
      await w.run('open-score-with-notes');
      const panes = () => w.leaves.filter((l: any) => l.states.some((s: any) => s.type === 'markdown'));
      assert.equal(panes().length, 1, `the notes pane opened beside the Score: ${JSON.stringify(w.leaves.map((l: any) => l.states))}`);
      view.onPin(leaf, { noteId: 'phrases/phrase_003', reason: 'section 1' });
      await w.flush(); await w.flush();
      const states = panes().flatMap((l: any) => l.states.map((s: any) => s.state?.file)).concat(panes().flatMap((l: any) => l.opened));
      assert.ok(states.some((f: string) => /phrase_003/.test(String(f))), `the pinned bar sent the notes pane to the phrase: ${JSON.stringify(states)}`);
    } finally { delete (Object.prototype as any).addAction; w.done(); }
  });

}
