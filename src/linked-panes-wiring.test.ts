// score_first M12 (drain 2026-10-26-1250, DEMO profile) — "Open Score with notes" on the REAL wiring: the real `ForgePlugin.prototype.onload` from the real bundle (both editions), a score-first vault, the real `PhraseView`
// class and a stand-in workspace that records what the plugin does to it (the split it asks for, the view state it gives the notes leaf, the focus it moves). The decisions are proven in linked-panes-core.test.ts and the pin
// notification in phrase-lineage-dom.test.ts; this proves they are connected, only in a score-first vault, and that closing a pane never throws or touches another tab. What it cannot see is Obsidian itself (the real split,
// the reading view): that is the driver's D2-D8. It pins the MECHANISM that the notes leaf is marked as text for both default-view routers before it navigates, and that the command reads the tab from the active view: if
// the design moves this SHOULD go red — reassess, do not just rewrite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, before } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { realNoteAt } from './test-support/score-first-notes.ts';
import { PAIR_SETTLE_MS } from './linked-panes-core.ts';
import { setTimeout as realSetTimeout } from 'node:timers';
import { installHostClock, iterateAllLeavesLikeObsidian, type HostClock } from './test-support/host-workspace.ts';
import { PHRASE_VIEW_TYPE } from './phrase-core.ts';
import { RHYTHM_EDIT_VIEW_TYPE } from './rhythm-edit-core.ts';
import { RHYTHM_SCORE_VIEW_TYPE } from './rhythm-mode-core.ts';
import { ARRANGEMENT_VIEW_TYPE } from './arrangement-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FX = path.join(ROOT, 'test/fixtures/score-first');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(FX, 'music-playground.forge.toml'), 'utf8');
const TUTORIAL_TOML = 'name = "forge-tutorial"\nversion = "0.1.0"\ndescription = "x"\ndomains = []\n';
const MUSIC_THEORY_TOML = 'name = "music-theory"\nversion = "0.1.0"\ndescription = "x"\ndomains = ["music"]\n';
const PAIR = 'open-score-with-notes';
const PHRASE = 'phrases/phrase_001.md';
const ARR = 'arrangements/arr_001.md';
const SRC = import.meta.dirname;
const code = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

const realSleep = (ms: number): Promise<void> => new Promise<void>((resolve) => { realSetTimeout(resolve, ms); });
for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  let win: any;
  before(async () => {
    win = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  });

  async function world(toml: string | null, opts: { restored?: (h: { makeLeaf: (type?: string, file?: string, mode?: string) => any }) => void } = {}) {
    real ??= await bundleRealPlugin(ROOT, edition);
    const clock: HostClock = installHostClock(win);          // time moves only when a test moves it; layout-change arrives after the host's settle (test-support/host-workspace.ts)
    const tick = (ms = 60) => clock.advance(ms);
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const leaves = new Set<any>();
    const log = { getLeafCalls: [] as any[], splits: [] as unknown[][], activated: [] as any[], errors: [] as unknown[][], lines: [] as string[], handlers: new Map<string, Array<() => void>>() };
    const makeLeaf = (type = 'empty', file?: string, mode?: string) => {
      const leaf: any = { states: [] as any[], view: { getViewType: () => type, file: file ? tf(file) : undefined, contentEl: (() => { const el = (globalThis as any).document.createElement('div'); el.appendChild((globalThis as any).document.createElement('span')); return el; })() } };
      leaf.setViewState = async (s: any) => { leaf.states.push(s); leaf.view = { getViewType: () => s.type, file: s.state?.file ? tf(s.state.file) : undefined }; };
      leaf.mode = mode;
      leaf.getViewState = () => ({ type: leaf.view.getViewType(), state: leaf.view.file ? { file: leaf.view.file.path, ...(leaf.mode ? { mode: leaf.mode } : {}) } : {} });
      leaf.getRoot = () => ({});
      leaves.add(leaf);
      return leaf;
    };
    const deliver = (name: string) => { if (name === 'layout-change') clock.deliverAfterSettle(log.handlers.get(name)); else log.handlers.get(name)?.forEach((f) => f()); };
    let active: { phrase?: any; text?: any; arrangement?: any } = {};
    let recent: any = null;
    const resolvedLinks: Record<string, Record<string, number>> = {};
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => p === 'forge.toml' && toml !== null, read: async (p: string) => (p === 'forge.toml' && toml !== null ? toml : '') },
        on: () => ({}), getMarkdownFiles: () => [], configDir: '.obsidian', getFiles: () => [],
        getAbstractFileByPath: (p: string) => (/^(bars|phrases|kits|arrangements)\/.*\.md$/.test(p) ? tf(p) : null), read: async () => '', create: async () => {}, createFolder: async () => {},
      },
      workspace: {
        rootSplit: {}, leftSplit: {}, rightSplit: {},
        onLayoutReady: (cb: () => void) => { cb(); },
        iterateAllLeaves: iterateAllLeavesLikeObsidian<any>(() => ({ root: [...leaves] })),        // the shared host-faithful walk (it stops on a truthy return: the 2026-10-26-1545 incident)
        on: (name: string, cb: () => void) => { (log.handlers.get(name) ?? log.handlers.set(name, []).get(name)!).push(cb); return {}; },
        getLeavesOfType: () => [], getActiveFile: () => null,
        getActiveViewOfType: (cls: unknown) => (cls === real.PhraseView ? active.phrase ?? null : cls === real.MarkdownView ? active.text ?? null : cls === real.ArrangementView ? active.arrangement ?? null : null),
        getMostRecentLeaf: () => recent,
        createLeafBySplit: (score: any, direction: string, before: boolean) => { log.splits.push([score, direction, before]); return makeLeaf(); },
        setActiveLeaf: (l: any) => { log.activated.push(l); }, revealLeaf: () => {}, getLeaf: () => { const leaf = makeLeaf(); log.getLeafCalls.push(leaf); return leaf; },
      },
      metadataCache: { resolvedLinks, on: (name: string, cb: () => void) => { (log.handlers.get(`mc:${name}`) ?? log.handlers.set(`mc:${name}`, []).get(`mc:${name}`)!).push(cb); return {}; } }, plugins: {},
    };
    const savedInfo = console.info, savedError = console.error;
    console.info = (...a: unknown[]) => { if (/^\[forge-(panes|strip)\]/.test(String(a[0]))) log.lines.push(String(a[0])); };
    console.error = (...a: unknown[]) => { log.errors.push(a); };
    opts.restored?.({ makeLeaf });                                           // 2026-11-04-1175 (B): a reload: the layout's leaves exist BEFORE the plugin loads
    const plugin = await loadRealOnload(real, app);
    await tick();
    (Object.prototype as any).addAction = function () { return { remove() {} }; };       // the stand-in view base has no addAction
    /** A phrase tab in `leaf`: the REAL PhraseView built by the registered factory. */
    const phraseTab = (leaf: any, file = PHRASE) => { const v: any = plugin.views.get(PHRASE_VIEW_TYPE)!(leaf); v.file = tf(file); v.leaf = leaf; leaf.view = v; v.getViewType = () => PHRASE_VIEW_TYPE; return v; };
    /** An arrangement tab in `leaf`: the REAL ArrangementView built by the registered factory (its note is not loaded: the tab's Score is drawn by code this wiring does not exercise). */
    const arrangementTab = (leaf: any, file = ARR) => { const v: any = plugin.views.get(ARRANGEMENT_VIEW_TYPE)!(leaf); v.file = tf(file); v.leaf = leaf; leaf.view = v; v.getViewType = () => ARRANGEMENT_VIEW_TYPE; return v; };
    const textTab = (leaf: any, file: string) => { const v: any = new real.MarkdownView(); v.file = tf(file); v.leaf = leaf; return v; };
    return {
      plugin, app, leaves, log, makeLeaf, phraseTab, arrangementTab, textTab, resolvedLinks, tick, clock,
      fire: async (...names: string[]) => { for (const n of names) deliver(n); await tick(); },
      setActive: (a: typeof active) => { active = a; },
      setRecent: (l: any) => { recent = l; },
      offered: () => plugin.commands.get(PAIR)?.checkCallback?.(true) ?? false,
      run: async () => { plugin.commands.get(PAIR)!.checkCallback!(false); await tick(); },
      layoutChange: async () => { deliver('layout-change'); await tick(); },
      done: () => { clock.restore(); console.info = savedInfo; console.error = savedError; delete (Object.prototype as any).addAction; real.messageDelivery.setScoreFirst(false); real.messageDelivery.resetForTests(); },
    };
  }

  test(`[${edition}] a score-first vault: "Open Score with notes" exists and is offered on a phrase tab, a phrase's JSON text tab and a bar's Beat Box tab, and nowhere else`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      assert.equal(w.plugin.commands.get(PAIR)?.name, 'Open Score with notes');
      assert.equal(w.offered(), false, 'no tab');
      const leaf = w.makeLeaf();
      w.setActive({ phrase: w.phraseTab(leaf) }); assert.equal(w.offered(), true, 'a phrase Score tab');
      w.setActive({ text: w.textTab(leaf, PHRASE) }); assert.equal(w.offered(), true, 'a phrase as its JSON text');
      w.setActive({ text: w.textTab(leaf, 'notes/plain.md') }); assert.equal(w.offered(), false, 'a note outside phrases/');
      w.setActive({ text: w.textTab(leaf, 'bars/bar_005.md') }); assert.equal(w.offered(), false, 'a bar as text is not one of the three tabs');
      w.setActive({});
      w.setRecent(w.makeLeaf(RHYTHM_EDIT_VIEW_TYPE, 'bars/bar_005.md')); assert.equal(w.offered(), true, "a bar's Beat Box tab");
      w.setRecent(w.makeLeaf(RHYTHM_EDIT_VIEW_TYPE, 'notes/plain.md')); assert.equal(w.offered(), false, 'a Beat Box on a note that is not a bar');
      w.setRecent(w.makeLeaf('markdown', 'bars/bar_005.md')); assert.equal(w.offered(), false, 'the most recent leaf is plain text');
    } finally { w.done(); }
  });

  for (const [label, toml] of [['the tutorial vault (no profile)', TUTORIAL_TOML], ['music-theory (no profile)', MUSIC_THEORY_TOML], ['a vault with no forge.toml', null]] as const) {
    test(`[${edition}] P3 — ${label}: no "Open Score with notes" command, no split ever asked for`, async () => {
      const w = await world(toml);
      try {
        assert.equal(w.plugin.commands.has(PAIR), false);
        assert.ok(![...w.plugin.commands.values()].some((c) => /with notes/i.test(String(c.name))), 'no command is named for the pair');
        assert.deepEqual(w.log.splits, []);
      } finally { w.done(); }
    });
  }

  test(`[${edition}] running it on a phrase tab: ONE split to the right of that tab, the notes leaf shows the phrase note in READING view, one evidence line; again: the pair is focused, no third pane`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const score = w.makeLeaf(); w.setActive({ phrase: w.phraseTab(score) });
      await w.run();
      assert.equal(w.log.splits.length, 1);
      assert.deepEqual([w.log.splits[0][0] === score, w.log.splits[0][1], w.log.splits[0][2]], [true, 'vertical', false], 'split beside the Score tab, to its right');
      const notes = [...w.leaves].find((l) => l !== score)!;
      assert.deepEqual(notes.states, [{ type: 'markdown', active: false, state: { file: PHRASE, mode: 'preview' } }], 'reading view, not edit, focus stays in the Score');
      assert.deepEqual(w.log.lines, [`[forge-panes] opened pair (score ${PHRASE}, notes ${PHRASE})`]);
      await w.run();
      assert.equal(w.log.splits.length, 1, 'no third pane');
      assert.deepEqual(w.log.activated, [score], 'the pair is focused');
      assert.deepEqual(w.log.errors, []);
    } finally { w.done(); }
  });

  test(`[${edition}] a pin in the Score (the REAL PhraseView's notification) sends the notes pane to the note that made the bar, the release sends it home; a pin on a Score with no pair does nothing`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const score = w.makeLeaf(); const view = w.phraseTab(score); w.setActive({ phrase: view });
      assert.equal(typeof view.onPin, 'function', 'the view was given the pin callback');
      view.onPin(score, { noteId: 'bars/bar_005', reason: 'pinned bar 2' }); await w.tick();
      assert.deepEqual(w.log.lines, [], 'no pair yet: nothing happens');
      await w.run();
      const notes = [...w.leaves].find((l) => l !== score)!;
      view.onPin(score, { noteId: 'bars/bar_005', reason: 'pinned bar 2' }); await w.tick();
      assert.deepEqual(notes.states.at(-1), { type: 'markdown', active: false, state: { file: 'bars/bar_005.md', mode: 'preview' } });
      view.onPin(score, { noteId: 'bars/bar_009', reason: 'forked' }); await w.tick();
      assert.equal(notes.states.at(-1).state.file, 'bars/bar_009.md');
      view.onPin(score, null); await w.tick();
      assert.equal(notes.states.at(-1).state.file, PHRASE);
      assert.deepEqual(w.log.lines.slice(1), [
        '[forge-panes] notes pane -> bars/bar_005.md (reason: pinned bar 2)',
        '[forge-panes] notes pane -> bars/bar_009.md (reason: forked)',
        `[forge-panes] notes pane -> ${PHRASE} (reason: released)`,
      ]);
      assert.deepEqual(w.log.errors, []);
    } finally { w.done(); }
  });

  test(`[${edition}] on a phrase's JSON text tab the same tab becomes the Score first, then the pair is made; on a bar's Beat Box tab the notes pane shows the bar's own note`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const text = w.makeLeaf('markdown', PHRASE); w.setActive({ text: w.textTab(text, PHRASE) });
      await w.run();
      assert.deepEqual(text.states.map((s: any) => s.type), [PHRASE_VIEW_TYPE], 'the text tab was switched to the Score');
      assert.equal(w.log.splits.length, 1);
      assert.equal(w.log.splits[0][0], text);
      const bar = w.makeLeaf(RHYTHM_EDIT_VIEW_TYPE, 'bars/bar_005.md'); w.setActive({}); w.setRecent(bar);
      await w.run();
      assert.equal(w.log.splits.length, 2);
      const notes = [...w.leaves].filter((l) => l !== text && l !== bar).at(-1)!;
      assert.equal(notes.states[0].state.file, 'bars/bar_005.md');
      assert.deepEqual(w.log.errors, []);
    } finally { w.done(); }
  });

  // ---- 2026-11-04-1175 (B): the pair after a reload. The link is in memory (linked-panes-core `pairs`); a reload restores the leaves (a Score tab, a reading pane) and nothing else. ----
  const READING_PHRASE_PANES = (h: { makeLeaf: (type?: string, file?: string, mode?: string) => any }) => ({ score: h.makeLeaf(PHRASE_VIEW_TYPE, PHRASE), notes: h.makeLeaf('markdown', PHRASE, 'preview') });
  test(`[${edition}] RELOAD: a restored Score tab and the reading pane on the same note are one pair again when the layout is ready (one evidence line); a pin then moves that pane; "Open Score with notes" focuses it and opens no second pane`, async () => {
    let score: any, notes: any;
    const w = await world(SCORE_FIRST_TOML, { restored: (h) => { ({ score, notes } = READING_PHRASE_PANES(h)); } });
    try {
      const view = w.phraseTab(score); w.setActive({ phrase: view });          // (the evidence line is written while the plugin loads, before a test can listen: the "REUSES" test below reads the same line)
      view.onPin(score, { noteId: 'bars/bar_005', reason: 'pinned bar 2' }); await w.tick();
      assert.equal(notes.states.at(-1).state.file, 'bars/bar_005.md', 'the restored notes pane follows the pin');
      await w.run();
      assert.equal(w.log.splits.length, 0, 'no second notes pane');
      assert.deepEqual(w.log.activated, [score], 'the pair is focused');
      assert.deepEqual(w.log.errors, []);
    } finally { w.done(); }
  });

  test(`[${edition}] RELOAD controls: a reading pane on ANOTHER note, an EDITING pane on the same note, and a Score with no pane beside it are not a pair; the command then makes a fresh pair as before`, async () => {
    let score: any;
    const w = await world(SCORE_FIRST_TOML, { restored: (h) => { score = h.makeLeaf(PHRASE_VIEW_TYPE, PHRASE); h.makeLeaf('markdown', 'phrases/phrase_002.md', 'preview'); h.makeLeaf('markdown', PHRASE, 'source'); } });
    try {
      assert.deepEqual(w.log.lines, [], 'nothing re-linked');
      w.setActive({ phrase: w.phraseTab(score) });
      await w.run();
      assert.equal(w.log.splits.length, 1, 'a fresh pair, as before');
      assert.deepEqual(w.log.lines, [`[forge-panes] opened pair (score ${PHRASE}, notes ${PHRASE})`]);
    } finally { w.done(); }
  });

  test(`[${edition}] RELOAD: two restored Scores of different notes each get their own reading pane (a pane is claimed once); a reading pane of the same note as two Scores belongs to the first only`, async () => {
    let a: any, an: any, b: any, bn: any;
    const w = await world(SCORE_FIRST_TOML, { restored: (h) => { a = h.makeLeaf(PHRASE_VIEW_TYPE, PHRASE); an = h.makeLeaf('markdown', PHRASE, 'preview'); b = h.makeLeaf(PHRASE_VIEW_TYPE, 'phrases/phrase_002.md'); bn = h.makeLeaf('markdown', 'phrases/phrase_002.md', 'preview'); h.makeLeaf(PHRASE_VIEW_TYPE, PHRASE); } });
    try {
      const viewA = w.phraseTab(a), viewB = w.phraseTab(b, 'phrases/phrase_002.md'); w.setActive({ phrase: viewA });
      viewA.onPin(a, { noteId: 'bars/bar_005', reason: 'pinned bar 2' }); viewB.onPin(b, { noteId: 'bars/bar_006', reason: 'pinned bar 1' }); await w.tick();
      assert.equal(an.states.at(-1).state.file, 'bars/bar_005.md');
      assert.equal(bn.states.at(-1).state.file, 'bars/bar_006.md');
      const third = [...w.leaves].find((l) => l.view.getViewType() === PHRASE_VIEW_TYPE && l !== a && l !== b)!;
      w.setActive({ phrase: w.phraseTab(third) }); await w.run();
      assert.equal(w.log.splits.length, 1, 'the third Score has no pane of its own: the command makes one');
      assert.deepEqual(w.log.errors, []);
    } finally { w.done(); }
  });

  test(`[${edition}] "Open Score with notes" REUSES a reading pane on the same note that is in no pair (a layout the plugin did not link) instead of opening a second one; a pane in another pair is not taken`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const score = w.makeLeaf(PHRASE_VIEW_TYPE, PHRASE); const notes = w.makeLeaf('markdown', PHRASE, 'preview');
      w.setActive({ phrase: w.phraseTab(score) });
      await w.run();
      assert.equal(w.log.splits.length, 0, 'no second notes pane');
      assert.deepEqual(w.log.lines, [`[forge-panes] re-linked pair (score ${PHRASE}, notes ${PHRASE})`]);
      const other = w.makeLeaf(PHRASE_VIEW_TYPE, PHRASE); w.setActive({ phrase: w.phraseTab(other) });
      await w.run();
      assert.equal(w.log.splits.length, 1, 'the one pane belongs to the first pair: the second Score gets its own');
      assert.notEqual(w.log.splits[0][0], notes);
    } finally { w.done(); }
  });

  test(`[${edition}] P3: a vault that is not score-first never links, adopts or traces a pane, whatever its layout holds`, async () => {
    const w = await world(TUTORIAL_TOML, { restored: (h) => { READING_PHRASE_PANES(h); } });
    try { assert.deepEqual(w.log.lines, []); assert.deepEqual(w.log.splits, []); } finally { w.done(); }
  });

  // ---- 2026-11-05-1177: the `# Cache` section is folded the first time a leaf shows a score-first note ----------------------------------------------------------------------------------------------
  const CACHE_NOTE = ['---', 'type: data', '---', '', '# Description', '', 'Extend bar_006.', '', '# Cache', '', '<!-- derived from the Description above; edit the Description, not this -->', '', '```json', '{ "kind": "extend" }', '```', ''].join('\n');
  const CACHE_FOLD = { folds: [{ from: 8, to: 15 }], lines: 16 };
  /** A markdown tab with a fake fold-capable view: `applies` records what the plugin gave `currentMode.applyFoldInfo`, `folded` is what `getFoldInfo` answers (the person's own folds, or an unfold). */
  function foldView(w: any, leaf: any, file: string, text = CACHE_NOTE, mode: 'preview' | 'source' = 'preview') {
    const v: any = w.textTab(leaf, file);
    const st = { applies: [] as any[], folded: { folds: [] as any[], lines: text.split('\n').length }, text, mode, editorText: text };
    v.getViewType = () => 'markdown'; v.getViewData = () => st.text; v.getMode = () => st.mode; v.editor = { getValue: () => st.editorText };
    v.currentMode = { getFoldInfo: () => st.folded, applyFoldInfo: (i: any) => { st.applies.push(i); } };
    leaf.view = v; leaf.getViewState = () => ({ type: 'markdown', state: { file: v.file.path, mode: st.mode } });
    return { v, st };
  }
  const countWrites = (w: any) => { const calls: string[] = []; for (const m of ['modify', 'create', 'process', 'trash', 'delete', 'rename']) w.app.vault[m] = async () => { calls.push(m); }; return calls; };

  test(`[${edition}] a phrase, arrangement, composition, kit and bar note with a # Cache heading is opened with it folded - once per leaf and note; a person's unfold is kept; the note is never written`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const writes = countWrites(w);
      const seen: Array<[string, ReturnType<typeof foldView>]> = [];
      for (const f of [PHRASE, ARR, 'compositions/comp_001.md', 'kits/rock.md', 'bars/bar_006.md']) { const leaf = w.makeLeaf('markdown', f); seen.push([f, foldView(w, leaf, f)]); }
      await w.fire('layout-change');
      for (const [f, { st }] of seen) assert.deepEqual(st.applies, [CACHE_FOLD], `${f}: folded once, on the Cache heading, with the line count the view has`);
      await w.fire('layout-change', 'active-leaf-change', 'file-open');
      for (const [f, { st }] of seen) assert.equal(st.applies.length, 1, `${f}: never folded a second time`);
      // the person unfolds (their fold state is empty, the heading line is not in it): kept open while the note stays open
      const [, one] = seen[0]; one.st.folded = { folds: [], lines: 16 };
      await w.fire('layout-change');
      assert.equal(one.st.applies.length, 1, 'an unfold is kept');
      assert.deepEqual(writes, [], 'no vault write of any kind');
      assert.equal(one.v.getViewData(), CACHE_NOTE, 'the text is as it was (byte for byte)');
    } finally { w.done(); }
  });

  test(`[${edition}] the same leaf shows another note: that note is folded once too; back to the first it is NOT folded again; the person's other folds are kept`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const leaf = w.makeLeaf('markdown', PHRASE); const { v, st } = foldView(w, leaf, PHRASE);
      st.folded = { folds: [{ from: 4, to: 6 }], lines: 16 };
      await w.fire('layout-change');
      assert.deepEqual(st.applies, [{ folds: [{ from: 4, to: 6 }, { from: 8, to: 15 }], lines: 16 }], "the person's Description fold stays");
      v.file = Object.assign(v.file, { path: 'phrases/phrase_002.md', basename: 'phrase_002' });
      await w.fire('file-open');
      assert.equal(st.applies.length, 2, 'the second note, folded');
      v.file = Object.assign(v.file, { path: PHRASE, basename: 'phrase_001' });
      await w.fire('file-open');
      assert.equal(st.applies.length, 2, 'back to the first: its one chance is used');
    } finally { w.done(); }
  });

  test(`[${edition}] a note that is not one of the five kinds (a plain note with a # Cache heading, a README) and a note with no # Cache heading are not touched; a heading that appears later is not folded`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const plain = foldView(w, w.makeLeaf('markdown', 'notes/plain.md'), 'notes/plain.md');
      const readme = foldView(w, w.makeLeaf('markdown', 'phrases/README.md'), 'phrases/README.md');
      const bare = foldView(w, w.makeLeaf('markdown', PHRASE), PHRASE, '# Description\n\nx\n');
      await w.fire('layout-change');
      assert.deepEqual([plain.st.applies, readme.st.applies, bare.st.applies], [[], [], []]);
      bare.st.text = CACHE_NOTE; bare.st.editorText = CACHE_NOTE; bare.st.folded = { folds: [], lines: 16 };
      await w.fire('layout-change');
      assert.deepEqual(bare.st.applies, [], 'its chance went with the first look: it appears later, it stays as it is');
    } finally { w.done(); }
  });

  test(`[${edition}] a view whose text is not loaded yet (or whose editor does not hold it yet) is looked at again a moment later and then folded once`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const empty = foldView(w, w.makeLeaf('markdown', PHRASE), PHRASE, '');
      const editing = foldView(w, w.makeLeaf('markdown', ARR), ARR, CACHE_NOTE, 'source'); editing.st.editorText = '';
      await w.fire('layout-change');
      assert.deepEqual([empty.st.applies, editing.st.applies], [[], []], 'not ready: nothing, and no chance used');
      empty.st.text = CACHE_NOTE; empty.st.folded = { folds: [], lines: 16 }; editing.st.editorText = CACHE_NOTE;
      await w.tick(400); await realSleep(400);                      // the retry rides window.setTimeout: this edition's host clock, or (the global window belongs to the last edition set up) real time
      assert.deepEqual([empty.st.applies, editing.st.applies], [[CACHE_FOLD], [CACHE_FOLD]]);
      await w.tick(2000); await realSleep(400);
      assert.deepEqual([empty.st.applies.length, editing.st.applies.length], [1, 1], 'and once');
    } finally { w.done(); }
  });

  test(`[${edition}] P3: a vault that is not score-first folds nothing - a phrase note with a # Cache heading stays as it opens, and nothing is written`, async () => {
    for (const toml of [TUTORIAL_TOML, MUSIC_THEORY_TOML, null]) {
      const w = await world(toml);
      try {
        const writes = countWrites(w);
        const { st } = foldView(w, w.makeLeaf('markdown', PHRASE), PHRASE);
        await w.fire('layout-change', 'file-open', 'active-leaf-change'); await w.tick(500);
        assert.deepEqual(st.applies, []); assert.deepEqual(writes, []);
      } finally { w.done(); }
    }
  });

  test(`[${edition}] a view without the fold API (a future Obsidian) is left alone: no throw, no error line, the chance is used`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const { v } = foldView(w, w.makeLeaf('markdown', PHRASE), PHRASE);
      v.currentMode = {};
      await w.fire('layout-change');
      v.currentMode = { getFoldInfo: () => { throw new Error('boom'); }, applyFoldInfo: () => { throw new Error('boom'); } };
      await w.fire('layout-change');
      assert.ok(w.log.errors.length === 0 || w.log.errors.every((e: unknown[]) => /foldCaches/.test(String(e[0]))), `only the plugin's own labelled errors: ${JSON.stringify(w.log.errors)}`);
    } finally { w.done(); }
  });

  test(`[${edition}] closing the notes pane or the Score never throws and never touches another tab; the pair is dropped with one line and the command makes a fresh one`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const score = w.makeLeaf(); const other = w.makeLeaf('markdown', 'notes/other.md'); const view = w.phraseTab(score); w.setActive({ phrase: view });
      await w.run();
      const notes = [...w.leaves].find((l) => l !== score && l !== other)!;
      const otherStates = other.states.length;
      await w.layoutChange(); await w.layoutChange();
      assert.deepEqual(w.log.lines.slice(1), [], 'layout-changes with both panes on screen close nothing (the 1545 incident)');
      w.leaves.delete(notes); await w.layoutChange(); await w.layoutChange();
      assert.deepEqual(w.log.lines.slice(1), [], 'one look is not enough');
      await w.tick(PAIR_SETTLE_MS + 120);
      assert.equal(w.log.lines.slice(1).length, 1);
      assert.match(w.log.lines[1]!, /^\[forge-panes\] pair closed \(notes pane; reason: leaf missing from iterateAllLeaves on layout-change #\d+, leaves=\d+, leafId=/);
      view.onPin(score, { noteId: 'bars/bar_005', reason: 'pinned bar 1' }); await w.tick();
      await w.run();
      assert.equal(w.log.splits.length, 2, 'a fresh pair');
      const notes2 = [...w.leaves].find((l) => l !== score && l !== other)!;
      w.leaves.delete(score); await w.layoutChange(); await w.tick(PAIR_SETTLE_MS + 120);
      assert.match(w.log.lines.at(-1)!, /^\[forge-panes\] pair closed \(score pane; reason: leaf missing/);
      assert.ok(w.leaves.has(notes2) && w.leaves.has(other), 'no other tab was closed');
      assert.equal(other.states.length, otherStates, 'no other tab was touched');
      assert.deepEqual(w.log.errors, []);
    } finally { w.done(); }
  });

  test(`[${edition}] the strip's hooks on the REAL PhraseView: a chip click sends the pair's notes pane to that note (a missing note is ONE Notice, handled); without a pair the answer is false; the person navigating the notes pane is heard once, the Score's own show is not echoed`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    const savedConstructed = (globalThis as any).__shimConstructed; (globalThis as any).__shimConstructed = [];
    try {
      const score = w.makeLeaf(); const view = w.phraseTab(score); w.setActive({ phrase: view });
      assert.equal(typeof view.structure?.goto, 'function', 'the view was given the strip hooks');
      assert.equal(await view.structure.goto(score, 'bars/bar_008'), false, 'no pair yet: the tab opens the note itself');
      await w.run();
      const notes = [...w.leaves].find((l) => l !== score)!;
      assert.equal(await view.structure.goto(score, 'bars/bar_008'), true);
      assert.equal(notes.states.at(-1).state.file, 'bars/bar_008.md');
      assert.equal(await view.structure.goto(score, 'notes/missing'), true, 'a note that is not there is handled with a Notice');
      const notices = ((globalThis as any).__shimConstructed as Array<[string, unknown[]]>).filter(([n]) => n === 'Notice').map(([, a]) => String(a[0]));
      assert.deepEqual(notices, ['Could not open notes/missing: that note is not in this vault.']);
      assert.equal(notes.states.at(-1).state.file, 'bars/bar_008.md', 'the pane stayed where it was');
      const heard: string[] = [];
      view.structure.onNotesNavigated(score, (p: string) => heard.push(p));
      await w.fire('file-open', 'active-leaf-change', 'layout-change');
      assert.deepEqual(heard, [], 'the Score moved the pane: no echo');
      notes.view = { getViewType: () => 'markdown', file: Object.assign(new real.TFile(), { path: 'bars/bar_007.md', extension: 'md', basename: 'bar_007' }) };   // the person clicked [[bar_007]] in the Recipe
      await w.fire('file-open'); await w.fire('layout-change');
      assert.deepEqual(heard, ['bars/bar_007.md'], 'heard once');
      assert.deepEqual(w.log.errors, []);
    } finally { (globalThis as any).__shimConstructed = savedConstructed; w.done(); }
  });

  test(`[${edition}] 2026-11-05-1189: a bar's tab (Beat Box AND Score) has NO "used by" strip, however many phrases use the bar and however often the workspace moves; the strip is still on the phrase tab (it is mounted by the phrase view, not from here)`, async () => {
    // (this was the 2026-10-26-1270 test "a bar's tab shows the phrases that use it as chips above it"; the driver asked for the strip to go off the bar's tabs - R1 of 1189. The chips of a PHRASE tab are pinned in phrase-lineage-dom.test.ts.)
    const w = await world(SCORE_FIRST_TOML);
    try {
      const bar = w.makeLeaf(RHYTHM_EDIT_VIEW_TYPE, 'bars/bar_005.md');
      const score = w.makeLeaf(RHYTHM_SCORE_VIEW_TYPE, 'bars/bar_005.md');
      w.resolvedLinks['phrases/phrase_003.md'] = { 'bars/bar_005.md': 1, 'bars/bar_001.md': 1 };
      w.resolvedLinks['phrases/phrase_001.md'] = { 'bars/bar_005.md': 1 };
      w.resolvedLinks['notes/other.md'] = { 'bars/bar_005.md': 1 };
      await w.fire('layout-change');
      await w.fire('layout-change', 'file-open', 'active-leaf-change');
      for (const [name, leaf] of [['Beat Box', bar], ['Score', score]] as const) {
        assert.equal(leaf.view.contentEl.querySelector('.forge-structure-strip'), null, `${name}: no strip`);
        assert.equal(leaf.view.contentEl.querySelectorAll('.forge-structure-chip').length, 0, `${name}: no chips`);
      }
      assert.deepEqual(w.log.lines.filter((l) => l.startsWith('[forge-strip]') && l.includes('used by')), [], 'and no "used by" evidence line');
      assert.deepEqual(w.log.errors, []);
    } finally { w.done(); }
  });

  test(`[${edition}] P3 — a vault that is not score-first: a bar's tab gets no strip, the workspace events do nothing`, async () => {
    const w = await world(TUTORIAL_TOML);
    try {
      const bar = w.makeLeaf(RHYTHM_EDIT_VIEW_TYPE, 'bars/bar_005.md');
      w.resolvedLinks['phrases/phrase_001.md'] = { 'bars/bar_005.md': 1 };
      await w.fire('layout-change', 'file-open', 'active-leaf-change');
      assert.equal(bar.view.contentEl.querySelector('.forge-structure-strip'), null);
    } finally { w.done(); }
  });

  // 2026-10-29-0830 (M10 slice 1 polish): the arrangement tab is a fourth source of the pair. The notes pane shows the ARRANGEMENT NOTE itself (its Description / Recipe / Python are what the person reads); the combined bars carry no
  // pin lineage, so a click on a bar of the Score has nothing to send the pane to and the pane stays where it is.
  test(`[${edition}] "Open Score with notes" is offered on an ARRANGEMENT's Score tab (score-first only), not on its JSON text tab, and the other three tabs are unchanged`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const leaf = w.makeLeaf();
      w.setActive({ arrangement: w.arrangementTab(leaf) }); assert.equal(w.offered(), true, "an arrangement's Score tab");
      w.setActive({ text: w.textTab(leaf, ARR) }); assert.equal(w.offered(), false, 'an arrangement as its JSON text is not a Score tab');
      w.setActive({ text: w.textTab(leaf, 'kits/rock.md') }); assert.equal(w.offered(), false, 'a kit note');
      w.setActive({ phrase: w.phraseTab(leaf) }); assert.equal(w.offered(), true, 'a phrase Score tab, as before');
      w.setActive({}); assert.equal(w.offered(), false, 'no tab');
    } finally { w.done(); }
  });

  test(`[${edition}] running it on an arrangement tab: ONE split to the right, the notes leaf shows the ARRANGEMENT note in READING view, one evidence line; again: focused, no third pane; a workspace event alone sends the pane nowhere; 2026-10-30-1000: a pinned ROW of the Score (the REAL ArrangementView's notification) sends it to the note that row came from and the release sends it home`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const score = w.makeLeaf(); const view = w.arrangementTab(score); w.setActive({ arrangement: view });
      await w.run();
      assert.equal(w.log.splits.length, 1);
      assert.deepEqual([w.log.splits[0][0] === score, w.log.splits[0][1], w.log.splits[0][2]], [true, 'vertical', false], 'split beside the Score tab, to its right');
      const notes = [...w.leaves].find((l) => l !== score)!;
      assert.deepEqual(notes.states, [{ type: 'markdown', active: false, state: { file: ARR, mode: 'preview' } }], 'the arrangement note, reading view, focus stays in the Score');
      assert.deepEqual(w.log.lines, [`[forge-panes] opened pair (score ${ARR}, notes ${ARR})`]);
      await w.run();
      assert.equal(w.log.splits.length, 1, 'no third pane');
      assert.deepEqual(w.log.activated, [score], 'the pair is focused');
      // 2026-10-30-1000 (slice 3, DELIBERATE: this line used to say the arrangement tab has NO pin, because the combined bars carried no lineage; the engine has said it since 0910): the tab is given the pin callback of a phrase tab
      assert.equal(typeof view.onPin, 'function', 'the arrangement tab was given the pin callback');
      await w.fire('file-open', 'active-leaf-change', 'layout-change');
      assert.equal(notes.states.length, 1, 'a workspace event moved nothing: only a pin does');
      view.onPin(score, { noteId: 'bars/bar_008', reason: 'pinned bar 2' }); await w.tick();
      assert.deepEqual(notes.states.at(-1), { type: 'markdown', active: false, state: { file: 'bars/bar_008.md', mode: 'preview' } }, 'a pinned row of the latin kit: the bar note its phrase got that bar from');
      view.onPin(score, { noteId: 'phrases/phrase_009', reason: 'phrase ended' }); await w.tick();
      assert.equal(notes.states.at(-1).state.file, 'phrases/phrase_009.md', 'a row past its phrase\'s end: that phrase\'s own note');
      view.onPin(score, null); await w.tick();
      assert.equal(notes.states.at(-1).state.file, ARR, 'let go: home, the arrangement note');
      assert.deepEqual(w.log.lines.slice(1), [
        '[forge-panes] notes pane -> bars/bar_008.md (reason: pinned bar 2)',
        '[forge-panes] notes pane -> phrases/phrase_009.md (reason: phrase ended)',
        `[forge-panes] notes pane -> ${ARR} (reason: released)`,
      ]);
      assert.deepEqual(w.log.errors, []);
    } finally { w.done(); }
  });

  test(`[${edition}] the arrangement pair keeps the HOLD rules of 1800: a link the person opened in the notes pane is heard once and shown as the reading view again; closing the pane drops the pair with one line and the command makes a fresh one`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const score = w.makeLeaf(); const view = w.arrangementTab(score); w.setActive({ arrangement: view });
      await w.run();
      const notes = [...w.leaves].find((l) => l !== score)!;
      const heard: string[] = [];
      view.structure.onNotesNavigated(score, (p: string) => heard.push(p));
      notes.view = { getViewType: () => 'markdown', file: Object.assign(new real.TFile(), { path: 'kits/rock.md', extension: 'md', basename: 'rock' }) };       // the person clicked [[rock]] in the Recipe
      await w.fire('file-open'); await w.fire('layout-change');
      assert.deepEqual(heard, ['kits/rock.md'], 'heard once');
      assert.deepEqual(notes.states.at(-1), { type: 'markdown', active: false, state: { file: 'kits/rock.md', mode: 'preview' } }, 'shown as the reading view again');
      assert.deepEqual(w.log.lines.slice(1), ['[forge-panes] notes pane -> kits/rock.md (reason: navigated in the pane)', '[forge-panes] notes pane -> kits/rock.md (reason: kept as the reading view)']);
      w.leaves.delete(notes); await w.layoutChange(); await w.layoutChange();
      await w.tick(PAIR_SETTLE_MS + 120);
      assert.match(w.log.lines.at(-1)!, /^\[forge-panes\] pair closed \(notes pane; reason: leaf missing/);
      await w.run();
      assert.equal(w.log.splits.length, 2, 'a fresh pair');
      assert.deepEqual(w.log.errors, []);
    } finally { w.done(); }
  });

  test(`[${edition}] the arrangement tab's strip hooks: a chip click sends the pair's notes pane to that note (false without a pair: the tab opens the note itself)`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const score = w.makeLeaf(); const view = w.arrangementTab(score); w.setActive({ arrangement: view });
      assert.equal(typeof view.structure?.goto, 'function', 'the view was given the strip hooks');
      assert.equal(await view.structure.goto(score, 'kits/rock'), false, 'no pair yet');
      await w.run();
      const notes = [...w.leaves].find((l) => l !== score)!;
      assert.equal(await view.structure.goto(score, 'phrases/phrase_003'), true);
      assert.equal(notes.states.at(-1).state.file, 'phrases/phrase_003.md');
      assert.deepEqual(w.log.errors, []);
    } finally { w.done(); }
  });

  // ---- 2026-10-30-1010 (0900 item (d)): "New phrase from a sentence" while a pair is open --------------------------------------------------------------------------------------------------------
  /** The sentence dialog on the pair world: a vault with a bar and a phrase that records what is created, the dialog's Modal stand-in, and /plan answered with an extend of bar_005 to 8 bars. */
  function sentenceWorld(w: Awaited<ReturnType<typeof world>>) {
    const store = new Map<string, string>([['bars/bar_005.md', realNoteAt('bars/bar_005.md')], ['phrases/phrase_001.md', realNoteAt('phrases/phrase_001.md')]]);
    w.app.vault.read = async (f: any) => store.get(f.path) ?? '';
    const tfp = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    w.app.vault.getFiles = () => [...store.keys()].map(tfp);
    w.app.vault.getAbstractFileByPath = (p: string) => (store.has(p) || ['bars', 'phrases', 'kits', 'arrangements'].includes(p) ? tfp(p) : null);
    w.app.vault.create = async (p: string, c: string) => { if (store.has(p)) throw new Error('File already exists.'); store.set(p, c); return tfp(p); };
    (globalThis as any).__shimFns = { requestUrl: async (req: any) => (String(req.url).endsWith('/plan') ? { status: 200, json: { ok: true, parsed_ok: true, plan: { kind: 'extend', bar: 'bar_005', bars: 8 }, error: null } } : undefined) };
    w.plugin.target.settings.transpileServiceUrl = 'https://svc.example'; w.plugin.target.settings.transpileServiceToken = 'tok-123'; w.plugin.target.settings.useOwnAnthropicKey = false; w.plugin.target.settings.ownAnthropicKey = '';
    const doc = win.document, proto = real.Modal.prototype, saved = { open: proto.open, close: proto.close }, modals: any[] = [];
    proto.open = function () { this.contentEl = doc.createElement('div'); this.contentEl.empty = function () { this.textContent = ''; }; doc.body.appendChild(this.contentEl); modals.push(this); this.onOpen(); };
    proto.close = function () { this.closed = true; this.onClose(); this.contentEl.remove(); };
    const q = (sel: string) => modals.at(-1)?.contentEl.querySelector(sel) as any;
    return {
      store, modals,
      /** Run the command, type the sentence, Plan, Create. */
      async createFromSentence() {
        w.plugin.commands.get('new-phrase-from-sentence')!.checkCallback!(false); await w.tick(5);
        const box = q('textarea'); box.value = 'extend bar_005 to 8 bars'; box.dispatchEvent(new win.Event('input', { bubbles: true }));
        q('.forge-sentence-plan-plan').click(); await w.tick(5);
        q('.forge-sentence-plan-create').click(); await w.tick(5);
      },
      restore() { proto.open = saved.open; proto.close = saved.close; delete (globalThis as any).__shimFns; },
    };
  }

  test(`[${edition}] a phrase made from a sentence while a pair is open: the pair's notes pane shows the NEW phrase's note (the pair's own read-only show), once, with its own evidence line; the new phrase still opens as a Score`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    const s = sentenceWorld(w);
    try {
      const score = w.makeLeaf(); w.setActive({ phrase: w.phraseTab(score) });
      await w.run();
      const notes = [...w.leaves].find((l) => l !== score)!;
      assert.equal(notes.states.length, 1, 'the pair\'s notes pane shows the phrase it was made for');
      await s.createFromSentence();
      assert.deepEqual([...s.store.keys()].filter((k) => k.startsWith('phrases/')).sort(), ['phrases/phrase_001.md', 'phrases/phrase_002.md']);
      assert.deepEqual(notes.states.at(-1), { type: 'markdown', active: false, state: { file: 'phrases/phrase_002.md', mode: 'preview' } }, 'read-only, the reading view, focus stays where it was');
      assert.equal(notes.states.length, 2, 'one show, no more');
      assert.ok(w.log.lines.includes('[forge-panes] notes pane -> phrases/phrase_002.md (reason: new phrase)'), w.log.lines.join(' | '));
      assert.deepEqual(score.states.at(-1), { type: PHRASE_VIEW_TYPE, active: true, state: { file: 'phrases/phrase_002.md' } }, '2026-10-31-1110: and the new phrase is opened as the Score in the pair\'s Score leaf (not a tab of its own: the pair would not follow it)');
      assert.deepEqual([...w.leaves].filter((l) => l !== notes && l !== score), [], 'no leaf besides the pair\'s two');
      assert.equal(w.log.splits.length, 1, 'no third pane');
      assert.deepEqual(w.log.errors, []);
    } finally { s.restore(); w.done(); }
  });

  test(`[${edition}] a phrase made from a sentence with NO pair open changes nothing else: no pane is made, no notes pane is shown, no pair line is written (P3 for the pair: it only exists once the person asked for it)`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    const s = sentenceWorld(w);
    try {
      const score = w.makeLeaf(); w.setActive({ phrase: w.phraseTab(score) });         // a phrase tab is active, but "Open Score with notes" was never run
      await s.createFromSentence();
      assert.ok(s.store.has('phrases/phrase_002.md'));
      assert.equal(w.log.splits.length, 0);
      assert.deepEqual(w.log.lines.filter((l) => l.startsWith('[forge-panes]')), []);
      assert.deepEqual(w.log.errors, []);
    } finally { s.restore(); w.done(); }
  });

  test(`[${edition}] a phrase made from a sentence follows only the pair of the tab the person STARTED from: another Score's pair is not moved, and a command run from a tab that has no pair moves none`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    const s = sentenceWorld(w);
    try {
      const a = w.makeLeaf(); const b = w.makeLeaf();
      w.setActive({ phrase: w.phraseTab(a) }); await w.run();                  // a pair for tab a
      const notesA = [...w.leaves].find((l) => l !== a && l !== b)!;
      w.setActive({ phrase: w.phraseTab(b, 'phrases/phrase_003.md') });          // the person is on tab b, which has no pair
      await s.createFromSentence();
      assert.equal(notesA.states.length, 1, 'tab a\'s pair was not touched by a command run from tab b');
      w.setActive({});                                                          // no Score at all (the palette from a note)
      await s.createFromSentence();
      assert.equal(notesA.states.length, 1);
      assert.deepEqual(w.log.errors, []);
    } finally { s.restore(); w.done(); }
  });

  // ---- 2026-10-31-1110 item 1 (CCQA smoke 9): Create must follow INTO the pair, whichever pane of the pair the person started from. Obsidian's getLeaf(true) opens a tab in the ACTIVE leaf's group: with the notes pane active that is the
  // notes pane's group, so the Score never moved. This pins the MECHANISM (Create opens the new phrase in the pair's Score leaf, explicitly); if the design moves this SHOULD go red — reassess, do not just rewrite.
  test(`[${edition}] a phrase made from a sentence with the NOTES pane active: the new phrase opens as the Score in the pair's SCORE leaf (no new tab through getLeaf), the notes pane shows its note`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    const s = sentenceWorld(w);
    try {
      const score = w.makeLeaf(); w.setActive({ phrase: w.phraseTab(score) });
      await w.run();
      const notes = [...w.leaves].find((l) => l !== score)!;
      w.setActive({ text: w.textTab(notes, PHRASE) });                         // the person clicked into the notes pane (a phrase note as reading text), then ran the command
      await s.createFromSentence();
      assert.ok(s.store.has('phrases/phrase_002.md'));
      assert.deepEqual(score.states.at(-1), { type: PHRASE_VIEW_TYPE, active: true, state: { file: 'phrases/phrase_002.md' } }, 'the Score leaf of the pair shows the new phrase');
      assert.deepEqual(w.log.getLeafCalls, [], 'no tab was asked of the active leaf\'s group (that is the notes pane\'s)');
      assert.deepEqual(notes.states.at(-1), { type: 'markdown', active: false, state: { file: 'phrases/phrase_002.md', mode: 'preview' } }, 'the notes pane shows the new phrase\'s note, read-only');
      assert.equal(w.log.splits.length, 1, 'no third pane');
      assert.deepEqual(w.log.errors, []);
    } finally { s.restore(); w.done(); }
  });

  test(`[${edition}] 2026-11-03-1155-8 D2: a notes pane that is BUSY when Create moves it (Obsidian drops setViewState on a working leaf) still ends on the new phrase's note - the show waits for the leaf, checks the result and retries`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    const s = sentenceWorld(w);
    try {
      const score = w.makeLeaf(); w.setActive({ phrase: w.phraseTab(score) });
      await w.run();
      const notes = [...w.leaves].find((l) => l !== score)!;
      const original = notes.setViewState; const dropped: unknown[] = [];
      notes.working = true; setTimeout(() => { notes.working = false; }, 70);                        // the pane is in the middle of a change when Create asks it to move
      notes.setViewState = async (st: any) => { if (notes.working) { dropped.push(st); return; } return original(st); };
      await s.createFromSentence();
      for (let i = 0; i < 40 && notes.states.at(-1)?.state?.file !== 'phrases/phrase_002.md'; i++) { await w.tick(30); await realSleep(10); }          // the retry waits on `window.setTimeout` (60 ms steps): the host clock where it is faked, real time where `window` is another edition's (`before` hooks run first) - both are moved
      assert.ok(dropped.length >= 1, 'non-vacuity: the busy leaf really did drop a call');
      assert.deepEqual(notes.states.at(-1), { type: 'markdown', active: false, state: { file: 'phrases/phrase_002.md', mode: 'preview' } }, 'the notes pane shows the new phrase\'s note');
      assert.deepEqual(notes.getViewState().state, { file: 'phrases/phrase_002.md' });
    } finally { s.restore(); w.done(); }
  });

  test(`[${edition}] a phrase made from a sentence with the SCORE active and a pair open: the new phrase opens in the Score leaf too (the same rule from either pane), the old tab is replaced, not duplicated`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    const s = sentenceWorld(w);
    try {
      const score = w.makeLeaf(); w.setActive({ phrase: w.phraseTab(score) });
      await w.run();
      const notes = [...w.leaves].find((l) => l !== score)!;
      await s.createFromSentence();
      assert.deepEqual(score.states.at(-1), { type: PHRASE_VIEW_TYPE, active: true, state: { file: 'phrases/phrase_002.md' } });
      assert.deepEqual(w.log.getLeafCalls, []);
      assert.equal(notes.states.at(-1).state.file, 'phrases/phrase_002.md');
      assert.deepEqual(w.log.errors, []);
    } finally { s.restore(); w.done(); }
  });

  // ---- 2026-10-30-1010 (0900 item (e)): the tab title of a transform ----------------------------------------------------------------------------------------------------------------------------
  test(`[${edition}] the REAL PhraseView's tab title: a transform says what it is a transform of, any other phrase (and a tab not read yet) is its file name; the leaf is asked to read the title again, defensively`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const leaf = w.makeLeaf();
      const view = w.phraseTab(leaf, 'phrases/phrase_011.md');
      assert.equal(view.getDisplayText(), 'phrase_011', 'before the note is read: the file name');
      view.handle = { params: () => ({ kind: 'transform', source: 'phrases/phrase_003', ops: [] }) };
      assert.equal(view.getDisplayText(), 'phrase_011 · transform of phrase_003');
      view.handle = { params: () => ({ kind: 'extend', source: 'bar_007', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 }) };
      assert.equal(view.getDisplayText(), 'phrase_011', 'an extend is its file name');
      view.handle = { params: () => null };
      assert.equal(view.getDisplayText(), 'phrase_011', 'a note that could not be read');
      let asked = 0; leaf.updateHeader = () => { asked++; };
      view.refreshTitle(); assert.equal(asked, 1, 'Obsidian is asked to draw the tab header again');
      leaf.updateHeader = () => { throw new Error('header gone'); };
      view.refreshTitle();                                                     // a host that throws is logged, not propagated (console.error is recorded by the world)
      assert.equal(w.log.errors.length, 1);
      delete leaf.updateHeader;
      view.refreshTitle();                                                     // a host without updateHeader keeps the old title until the tab is next drawn: no throw
      assert.equal(w.log.errors.length, 1);
    } finally { w.done(); }
  });

  test(`[${edition}] MECHANISM PIN 2026-10-30-1010 (if the design moves this SHOULD go red — reassess, do not just rewrite): the phrase tab asks the surface to tell it when its title changes and asks the leaf to read it again; the title is made by the pure core from what the surface shows`, () => {
    const pv = code('phrase-view.ts');
    assert.match(pv, /titleChanged: \(\) => \{ this\.refreshTitle\(\); \},/);
    assert.match(pv, /getDisplayText\(\): string \{ return this\.file \? phraseTabTitle\(this\.file\.basename, this\.handle\?\.params\(\) \?\? null\) : super\.getDisplayText\(\); \}/);
    assert.match(pv, /leaf\.updateHeader\?\.\(\);/);
    assert.match(code('phrase-dom.ts'), /if \(title !== shownTitle\) \{ shownTitle = title; ports\.titleChanged\?\.\(\); \}/);
  });

  test(`[${edition}] MECHANISM PIN (if the design moves this SHOULD go red — reassess, do not just rewrite): the notes leaf is marked as text for BOTH default-view routers before every navigation, and the PhraseView hands its pin to the plugin with its own leaf`, () => {
    const sf = code('score-first.ts');
    // 2026-10-26-1545: the mark now says WHO set it ('plugin'), so the evidence line does not claim a person chose Open as JSON; the mechanism (mark both routers before the navigation) is unchanged
    assert.match(sf, /router\.setMark\(leaf, path, 'markdown', 'plugin'\);\s*\n\s*hooks\.markRhythmText\?\.\(leaf, path\);\s*\n\s*await leaf\.setViewState\(/);
    assert.match(sf, /createLeafBySplit\(score, 'vertical', false\)/);
    assert.match(sf, /\(l, pin\) => \{ void linker\.pinned\(l, pin\); \}, structureHooks(, notebookFor)?\)\);/);   // 2026-10-27-1030, deliberate: + the notebook's vault ports as the view's last argument; the pin and the strip hooks are what they were
    assert.match(code('phrase-view.ts'), /onPin: this\.onPin \? \(pin\) => \{ this\.onPin!\(this\.leaf, pin\); \} : undefined/);
    assert.match(code('main.ts'), /markRhythmText: \(leaf, path\) => \{ this\.rhythmEdit\?\.markAsText\(leaf, path\); \}/);
  });

  test(`[${edition}] MECHANISM PIN 2026-10-29-0830 (if the design moves this SHOULD go red — reassess, do not just rewrite): the arrangement tab draws its strip from its own note and sends a chip to the pair through the SAME hooks as a phrase tab; the command finds the tab from the active view`, () => {
    const ka = code('kits-arrangements.ts');
    assert.match(ka, /this\.strip = mountArrangementStrip\(this\.contentEl, \{ goto: \(noteId\) => structure\.goto\(leaf, noteId\), openNote, onHover: [^\n]*\}\);\s*\n\s*this\.strip\.show\(text\);/);       // 2026-10-30-1000, deliberate: + the hover that lights the rows of a kit or phrase
    // 2026-10-31-1110 (reassessed, deliberate): the chips are redrawn with the sentence and the controls, and the Score follows: at once when nothing plays, else after the debounce
    assert.match(ka, /this\.strip\?\.show\(text\);\s*\n[^\n]*\n[^\n]*this\.area\?\.update\(text\);/, 'a change to the note redraws the chips with the Score');
    assert.match(ka, /new ArrangementView\(leaf, opts\.plan, opts\.structure, opts\.openNote, opts\.onPin\)/);       // 2026-10-30-1000, deliberate: + the pin hook of a phrase tab as the view's last argument
    const sf = code('score-first.ts');
    assert.match(sf, /registerKitsAndArrangements\(plugin, \{ plan, scoreFirst: \(\) => scoreFirst, structure: structureHooks, openNote, onPin: \(l, pin\) => \{ void linker\.pinned\(l, pin\); \} \}\);/);
    assert.match(sf, /const arrangement = app\.workspace\.getActiveViewOfType\(ArrangementView\);/);
    assert.match(sf, /return \{ kind: 'arrangement', leaf: arrangement\.leaf, file: arrangement\.file \};/);
  });

  test(`[${edition}] MECHANISM PIN 2026-10-26-1800 (if the design moves this SHOULD go red — reassess, do not just rewrite): the pair HOLDS its notes pane as reading text for BOTH default-view routers, and shows a link the person opened for editing as the reading view again`, () => {
    const sf = code('score-first.ts');
    assert.match(sf, /isReading: \(leaf\) => \(leaf\.getViewState\(\)\.state as \{ mode\?: unknown \} \| undefined\)\?\.mode === 'preview',/);
    assert.match(sf, /hold: \(leaf, on\) => \{ router\.hold\(leaf, on\); hooks\.holdRhythmText\?\.\(leaf, on\); \},/);
    assert.match(code('main.ts'), /holdRhythmText: \(leaf, on\) => \{ this\.rhythmEdit\?\.holdAsText\(leaf, on\); \}/);
    assert.match(code('rhythm-edit-view.ts'), /holdAsText: \(leaf: WorkspaceLeaf, on: boolean\) => defaultView\.hold\(leaf, on\)/);
  });
}
