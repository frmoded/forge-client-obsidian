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
import { PHRASE_VIEW_TYPE } from './phrase-core.ts';
import { RHYTHM_EDIT_VIEW_TYPE } from './rhythm-edit-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FX = path.join(ROOT, 'test/fixtures/score-first');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(FX, 'music-playground.forge.toml'), 'utf8');
const TUTORIAL_TOML = 'name = "forge-tutorial"\nversion = "0.1.0"\ndescription = "x"\ndomains = []\n';
const MUSIC_THEORY_TOML = 'name = "music-theory"\nversion = "0.1.0"\ndescription = "x"\ndomains = ["music"]\n';
const PAIR = 'open-score-with-notes';
const PHRASE = 'phrases/phrase_001.md';
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const SRC = import.meta.dirname;
const code = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  before(async () => {
    const win: any = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  });

  async function world(toml: string | null) {
    real ??= await bundleRealPlugin(ROOT, edition);
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const leaves = new Set<any>();
    const log = { splits: [] as unknown[][], activated: [] as any[], errors: [] as unknown[][], lines: [] as string[], handlers: new Map<string, Array<() => void>>() };
    const makeLeaf = (type = 'empty', file?: string) => {
      const leaf: any = { states: [] as any[], view: { getViewType: () => type, file: file ? tf(file) : undefined } };
      leaf.setViewState = async (s: any) => { leaf.states.push(s); leaf.view = { getViewType: () => s.type, file: s.state?.file ? tf(s.state.file) : undefined }; };
      leaf.getViewState = () => ({ type: leaf.view.getViewType(), state: leaf.view.file ? { file: leaf.view.file.path } : {} });
      leaf.getRoot = () => ({});
      leaves.add(leaf);
      return leaf;
    };
    let active: { phrase?: any; text?: any } = {};
    let recent: any = null;
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => p === 'forge.toml' && toml !== null, read: async (p: string) => (p === 'forge.toml' && toml !== null ? toml : '') },
        on: () => ({}), getMarkdownFiles: () => [], configDir: '.obsidian', getFiles: () => [],
        getAbstractFileByPath: (p: string) => (/^(bars|phrases)\/.*\.md$/.test(p) ? tf(p) : null), read: async () => '', create: async () => {}, createFolder: async () => {},
      },
      workspace: {
        rootSplit: {}, leftSplit: {}, rightSplit: {},
        onLayoutReady: (cb: () => void) => { cb(); },
        iterateAllLeaves: (cb: (l: any) => void) => { [...leaves].forEach(cb); },
        on: (name: string, cb: () => void) => { (log.handlers.get(name) ?? log.handlers.set(name, []).get(name)!).push(cb); return {}; },
        getLeavesOfType: () => [], getActiveFile: () => null,
        getActiveViewOfType: (cls: unknown) => (cls === real.PhraseView ? active.phrase ?? null : cls === real.MarkdownView ? active.text ?? null : null),
        getMostRecentLeaf: () => recent,
        createLeafBySplit: (score: any, direction: string, before: boolean) => { log.splits.push([score, direction, before]); return makeLeaf(); },
        setActiveLeaf: (l: any) => { log.activated.push(l); }, revealLeaf: () => {}, getLeaf: () => makeLeaf(),
      },
      metadataCache: { on: () => ({}) }, plugins: {},
    };
    const plugin = await loadRealOnload(real, app);
    await tick();
    (Object.prototype as any).addAction = function () { return { remove() {} }; };       // the stand-in view base has no addAction
    const savedInfo = console.info, savedError = console.error;
    console.info = (...a: unknown[]) => { if (String(a[0]).startsWith('[forge-panes]')) log.lines.push(String(a[0])); };
    console.error = (...a: unknown[]) => { log.errors.push(a); };
    /** A phrase tab in `leaf`: the REAL PhraseView built by the registered factory. */
    const phraseTab = (leaf: any, file = PHRASE) => { const v: any = plugin.views.get(PHRASE_VIEW_TYPE)!(leaf); v.file = tf(file); v.leaf = leaf; leaf.view = v; v.getViewType = () => PHRASE_VIEW_TYPE; return v; };
    const textTab = (leaf: any, file: string) => { const v: any = new real.MarkdownView(); v.file = tf(file); v.leaf = leaf; return v; };
    return {
      plugin, app, leaves, log, makeLeaf, phraseTab, textTab,
      setActive: (a: typeof active) => { active = a; },
      setRecent: (l: any) => { recent = l; },
      offered: () => plugin.commands.get(PAIR)?.checkCallback?.(true) ?? false,
      run: async () => { plugin.commands.get(PAIR)!.checkCallback!(false); await tick(); },
      layoutChange: async () => { log.handlers.get('layout-change')?.forEach((f) => f()); await tick(); },
      done: () => { console.info = savedInfo; console.error = savedError; delete (Object.prototype as any).addAction; real.messageDelivery.setScoreFirst(false); real.messageDelivery.resetForTests(); },
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
      view.onPin(score, { noteId: 'bars/bar_005', reason: 'pinned bar 2' }); await tick();
      assert.deepEqual(w.log.lines, [], 'no pair yet: nothing happens');
      await w.run();
      const notes = [...w.leaves].find((l) => l !== score)!;
      view.onPin(score, { noteId: 'bars/bar_005', reason: 'pinned bar 2' }); await tick();
      assert.deepEqual(notes.states.at(-1), { type: 'markdown', active: false, state: { file: 'bars/bar_005.md', mode: 'preview' } });
      view.onPin(score, { noteId: 'bars/bar_009', reason: 'forked' }); await tick();
      assert.equal(notes.states.at(-1).state.file, 'bars/bar_009.md');
      view.onPin(score, null); await tick();
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

  test(`[${edition}] closing the notes pane or the Score never throws and never touches another tab; the pair is dropped with one line and the command makes a fresh one`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const score = w.makeLeaf(); const other = w.makeLeaf('markdown', 'notes/other.md'); const view = w.phraseTab(score); w.setActive({ phrase: view });
      await w.run();
      const notes = [...w.leaves].find((l) => l !== score && l !== other)!;
      const otherStates = other.states.length;
      w.leaves.delete(notes); await w.layoutChange(); await w.layoutChange();
      assert.deepEqual(w.log.lines.slice(1), ['[forge-panes] pair closed (notes pane)']);
      view.onPin(score, { noteId: 'bars/bar_005', reason: 'pinned bar 1' }); await tick();
      await w.run();
      assert.equal(w.log.splits.length, 2, 'a fresh pair');
      const notes2 = [...w.leaves].find((l) => l !== score && l !== other)!;
      w.leaves.delete(score); await w.layoutChange();
      assert.equal(w.log.lines.at(-1), '[forge-panes] pair closed (score pane)');
      assert.ok(w.leaves.has(notes2) && w.leaves.has(other), 'no other tab was closed');
      assert.equal(other.states.length, otherStates, 'no other tab was touched');
      assert.deepEqual(w.log.errors, []);
    } finally { w.done(); }
  });

  test(`[${edition}] MECHANISM PIN (if the design moves this SHOULD go red — reassess, do not just rewrite): the notes leaf is marked as text for BOTH default-view routers before every navigation, and the PhraseView hands its pin to the plugin with its own leaf`, () => {
    const sf = code('score-first.ts');
    assert.match(sf, /router\.setMark\(leaf, path, 'markdown'\);\s*\n\s*hooks\.markRhythmText\?\.\(leaf, path\);\s*\n\s*await leaf\.setViewState\(/);
    assert.match(sf, /createLeafBySplit\(score, 'vertical', false\)/);
    assert.match(sf, /\(l, pin\) => \{ void linker\.pinned\(l, pin\); \}\)\);/);
    assert.match(code('phrase-view.ts'), /onPin: this\.onPin \? \(pin\) => \{ this\.onPin!\(this\.leaf, pin\); \} : undefined/);
    assert.match(code('main.ts'), /markRhythmText: \(leaf, path\) => \{ this\.rhythmEdit\?\.markAsText\(leaf, path\); \}/);
  });
}
