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
import { PAIR_SETTLE_MS } from './linked-panes-core.ts';
import { installHostClock, iterateAllLeavesLikeObsidian, type HostClock } from './test-support/host-workspace.ts';
import { PHRASE_VIEW_TYPE } from './phrase-core.ts';
import { RHYTHM_EDIT_VIEW_TYPE } from './rhythm-edit-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FX = path.join(ROOT, 'test/fixtures/score-first');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(FX, 'music-playground.forge.toml'), 'utf8');
const TUTORIAL_TOML = 'name = "forge-tutorial"\nversion = "0.1.0"\ndescription = "x"\ndomains = []\n';
const MUSIC_THEORY_TOML = 'name = "music-theory"\nversion = "0.1.0"\ndescription = "x"\ndomains = ["music"]\n';
const PAIR = 'open-score-with-notes';
const PHRASE = 'phrases/phrase_001.md';
const SRC = import.meta.dirname;
const code = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  let win: any;
  before(async () => {
    win = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  });

  async function world(toml: string | null) {
    real ??= await bundleRealPlugin(ROOT, edition);
    const clock: HostClock = installHostClock(win);          // time moves only when a test moves it; layout-change arrives after the host's settle (test-support/host-workspace.ts)
    const tick = (ms = 60) => clock.advance(ms);
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const leaves = new Set<any>();
    const log = { splits: [] as unknown[][], activated: [] as any[], errors: [] as unknown[][], lines: [] as string[], handlers: new Map<string, Array<() => void>>() };
    const makeLeaf = (type = 'empty', file?: string) => {
      const leaf: any = { states: [] as any[], view: { getViewType: () => type, file: file ? tf(file) : undefined, contentEl: (() => { const el = (globalThis as any).document.createElement('div'); el.appendChild((globalThis as any).document.createElement('span')); return el; })() } };
      leaf.setViewState = async (s: any) => { leaf.states.push(s); leaf.view = { getViewType: () => s.type, file: s.state?.file ? tf(s.state.file) : undefined }; };
      leaf.getViewState = () => ({ type: leaf.view.getViewType(), state: leaf.view.file ? { file: leaf.view.file.path } : {} });
      leaf.getRoot = () => ({});
      leaves.add(leaf);
      return leaf;
    };
    const deliver = (name: string) => { if (name === 'layout-change') clock.deliverAfterSettle(log.handlers.get(name)); else log.handlers.get(name)?.forEach((f) => f()); };
    let active: { phrase?: any; text?: any } = {};
    let recent: any = null;
    const resolvedLinks: Record<string, Record<string, number>> = {};
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => p === 'forge.toml' && toml !== null, read: async (p: string) => (p === 'forge.toml' && toml !== null ? toml : '') },
        on: () => ({}), getMarkdownFiles: () => [], configDir: '.obsidian', getFiles: () => [],
        getAbstractFileByPath: (p: string) => (/^(bars|phrases)\/.*\.md$/.test(p) ? tf(p) : null), read: async () => '', create: async () => {}, createFolder: async () => {},
      },
      workspace: {
        rootSplit: {}, leftSplit: {}, rightSplit: {},
        onLayoutReady: (cb: () => void) => { cb(); },
        iterateAllLeaves: iterateAllLeavesLikeObsidian<any>(() => ({ root: [...leaves] })),        // the shared host-faithful walk (it stops on a truthy return: the 2026-10-26-1545 incident)
        on: (name: string, cb: () => void) => { (log.handlers.get(name) ?? log.handlers.set(name, []).get(name)!).push(cb); return {}; },
        getLeavesOfType: () => [], getActiveFile: () => null,
        getActiveViewOfType: (cls: unknown) => (cls === real.PhraseView ? active.phrase ?? null : cls === real.MarkdownView ? active.text ?? null : null),
        getMostRecentLeaf: () => recent,
        createLeafBySplit: (score: any, direction: string, before: boolean) => { log.splits.push([score, direction, before]); return makeLeaf(); },
        setActiveLeaf: (l: any) => { log.activated.push(l); }, revealLeaf: () => {}, getLeaf: () => makeLeaf(),
      },
      metadataCache: { resolvedLinks, on: (name: string, cb: () => void) => { (log.handlers.get(`mc:${name}`) ?? log.handlers.set(`mc:${name}`, []).get(`mc:${name}`)!).push(cb); return {}; } }, plugins: {},
    };
    const plugin = await loadRealOnload(real, app);
    await tick();
    (Object.prototype as any).addAction = function () { return { remove() {} }; };       // the stand-in view base has no addAction
    const savedInfo = console.info, savedError = console.error;
    console.info = (...a: unknown[]) => { if (/^\[forge-(panes|strip)\]/.test(String(a[0]))) log.lines.push(String(a[0])); };
    console.error = (...a: unknown[]) => { log.errors.push(a); };
    /** A phrase tab in `leaf`: the REAL PhraseView built by the registered factory. */
    const phraseTab = (leaf: any, file = PHRASE) => { const v: any = plugin.views.get(PHRASE_VIEW_TYPE)!(leaf); v.file = tf(file); v.leaf = leaf; leaf.view = v; v.getViewType = () => PHRASE_VIEW_TYPE; return v; };
    const textTab = (leaf: any, file: string) => { const v: any = new real.MarkdownView(); v.file = tf(file); v.leaf = leaf; return v; };
    return {
      plugin, app, leaves, log, makeLeaf, phraseTab, textTab, resolvedLinks, tick, clock,
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

  test(`[${edition}] a bar's tab (Beat Box) shows the phrases that use it as chips above it, from the resolved links; a click opens that phrase; no phrase = no chips; it is not added twice`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const bar = w.makeLeaf(RHYTHM_EDIT_VIEW_TYPE, 'bars/bar_005.md');
      w.resolvedLinks['phrases/phrase_003.md'] = { 'bars/bar_005.md': 1, 'bars/bar_001.md': 1 };
      w.resolvedLinks['phrases/phrase_001.md'] = { 'bars/bar_005.md': 1 };
      w.resolvedLinks['notes/other.md'] = { 'bars/bar_005.md': 1 };
      await w.fire('layout-change');
      const host = bar.view.contentEl;
      assert.deepEqual([...host.querySelectorAll('.forge-structure-strip')].map((s: any) => s.textContent), ['used by:phrase_001phrase_003'], 'one strip');
      assert.equal(host.firstElementChild, host.querySelector('.forge-structure-strip'), 'above the view');
      await w.fire('layout-change', 'file-open');
      assert.equal(host.querySelectorAll('.forge-structure-strip').length, 1, 'not added twice');
      assert.deepEqual(w.log.lines.filter((l) => l.startsWith('[forge-strip]')), ['[forge-strip] bar_005 used by phrase_001, phrase_003'], 'one evidence line, said when the answer changed');
      host.querySelectorAll('button')[1].click(); await w.tick();
      assert.equal(w.log.splits.length, 0);
      const opened = [...w.leaves].flatMap((l) => l.states).filter((s: any) => s.type === PHRASE_VIEW_TYPE).map((s: any) => s.state.file);
      assert.deepEqual(opened, ['phrases/phrase_003.md'], 'the chip opens that phrase as a Score');
      const other = w.makeLeaf(RHYTHM_EDIT_VIEW_TYPE, 'bars/bar_099.md');
      await w.fire('layout-change');
      assert.equal(other.view.contentEl.querySelector('button'), null, 'a bar no phrase uses has no chips');
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

  test(`[${edition}] MECHANISM PIN (if the design moves this SHOULD go red — reassess, do not just rewrite): the notes leaf is marked as text for BOTH default-view routers before every navigation, and the PhraseView hands its pin to the plugin with its own leaf`, () => {
    const sf = code('score-first.ts');
    // 2026-10-26-1545: the mark now says WHO set it ('plugin'), so the evidence line does not claim a person chose Open as JSON; the mechanism (mark both routers before the navigation) is unchanged
    assert.match(sf, /router\.setMark\(leaf, path, 'markdown', 'plugin'\);\s*\n\s*hooks\.markRhythmText\?\.\(leaf, path\);\s*\n\s*await leaf\.setViewState\(/);
    assert.match(sf, /createLeafBySplit\(score, 'vertical', false\)/);
    assert.match(sf, /\(l, pin\) => \{ void linker\.pinned\(l, pin\); \}, structureHooks(, notebookFor)?\)\);/);   // 2026-10-27-1030, deliberate: + the notebook's vault ports as the view's last argument; the pin and the strip hooks are what they were
    assert.match(code('phrase-view.ts'), /onPin: this\.onPin \? \(pin\) => \{ this\.onPin!\(this\.leaf, pin\); \} : undefined/);
    assert.match(code('main.ts'), /markRhythmText: \(leaf, path\) => \{ this\.rhythmEdit\?\.markAsText\(leaf, path\); \}/);
  });

  test(`[${edition}] MECHANISM PIN 2026-10-26-1800 (if the design moves this SHOULD go red — reassess, do not just rewrite): the pair HOLDS its notes pane as reading text for BOTH default-view routers, and shows a link the person opened for editing as the reading view again`, () => {
    const sf = code('score-first.ts');
    assert.match(sf, /isReading: \(leaf\) => \(leaf\.getViewState\(\)\.state as \{ mode\?: unknown \} \| undefined\)\?\.mode === 'preview',/);
    assert.match(sf, /hold: \(leaf, on\) => \{ router\.hold\(leaf, on\); hooks\.holdRhythmText\?\.\(leaf, on\); \},/);
    assert.match(code('main.ts'), /holdRhythmText: \(leaf, on\) => \{ this\.rhythmEdit\?\.holdAsText\(leaf, on\); \}/);
    assert.match(code('rhythm-edit-view.ts'), /holdAsText: \(leaf: WorkspaceLeaf, on: boolean\) => defaultView\.hold\(leaf, on\)/);
  });
}
