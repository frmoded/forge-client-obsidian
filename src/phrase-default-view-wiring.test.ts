// 2026-10-23-0630 — the phrase default-view router on the REAL wiring (the real ForgePlugin.onload from the real bundle, both editions): events the workspace fires, a leaf that shows a phrase note's text,
// and what the real code does to that leaf. The decisions are proven in phrase-default-view-core.test.ts; this proves they are connected, and only in a score-first vault.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, before } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { PHRASE_VIEW_TYPE } from './phrase-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const TUTORIAL_TOML = 'name = "forge-tutorial"\nversion = "0.1.0"\ndescription = "x"\ndomains = []\n';
const MUSIC_THEORY_TOML = 'name = "music-theory"\nversion = "0.1.0"\ndescription = "x"\ndomains = ["music"]\n';
const PHRASE = 'phrases/phrase_001.md';
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/** A vault with ONE main-area leaf. `restored` = the file that leaf showed when the plugin loaded (the layout), `shows` = what it shows from then on. `dropSwaps` = setViewState calls Obsidian ignores. */
async function world(real: RealPlugin, toml: string | null, opts: { restored: string | null; restoredType?: string; dropSwaps?: number; holder?: { kind: 'score' | 'text'; file: string }; backHistory?: number; siblings?: number; born?: boolean; others?: Array<{ type: string; file: string }> }) {
  const states: any[] = []; const handlers = new Map<string, Array<() => void>>();
  const rootSplit = {}; const leftSplit = {}; const popout = {}; let root: object = rootSplit;
  const vaultHandlers = new Map<string, Array<(f: any) => void>>(); const profile = { on: true };
  const el = () => { const a: any = (globalThis as any).document.createElement('div'); a.addClass = () => {}; a.removeClass = () => {}; return a; };
  const markdownOn = (file: string) => { const v = new real.MarkdownView(); v.file = { path: file, extension: 'md' }; v.leaf = leaf; v.containerEl = el(); v.getViewType = () => 'markdown'; v.addAction = () => el(); return v; };
  let drop = opts.dropSwaps ?? 0; let dropAnyN = 0;
  let visible = !opts.born;                         // a leaf the gesture itself makes (a new tab) does not exist until the open
  const leaf: any = {
    working: false,                                  // Obsidian: while a leaf changes its view, setViewState is silently ignored (`if (this.working) return`)
    setViewState: async (s: any) => {
      states.push(s);
      if (leaf.working || dropAnyN > 0) { if (dropAnyN > 0 && !leaf.working) dropAnyN--; log.dropped.push(s); return; }
      if (s.type === PHRASE_VIEW_TYPE) { if (drop > 0) { drop--; return; } leaf.view = { getViewType: () => PHRASE_VIEW_TYPE, file: { path: s.state.file } }; }
      else if (s.type === 'markdown') leaf.view = markdownOn(s.state.file);
      else if (s.type === 'empty') leaf.view = { getViewType: () => 'empty' };
      else leaf.view = { getViewType: () => s.type, file: s.state?.file ? { path: s.state.file } : undefined };
    },
    getRoot: () => root,
    // what the layout saved when the plugin loaded; afterwards what the leaf shows NOW (as Obsidian's getViewState does), so a leaf that opens the phrase reports the phrase
    getViewState: () => {
      if (ready && leaf.view?.file?.path) return { type: leaf.view.getViewType(), state: { file: leaf.view.file.path } };
      return opts.restored ? { type: opts.restoredType ?? 'markdown', state: { file: opts.restored } } : { type: 'empty', state: {} };
    },
  };
  let ready = false;
  leaf.view = opts.restored ? (opts.restoredType === PHRASE_VIEW_TYPE ? { getViewType: () => PHRASE_VIEW_TYPE, file: { path: opts.restored } } : markdownOn(opts.restored)) : { getViewType: () => 'empty' };
  // 2026-10-24-0900 (one tab per phrase): this leaf's history and pane, and a SECOND leaf that already shows a phrase (its Score, or its text)
  const log = { backs: 0, detached: false, activated: [] as any[], dropped: [] as any[], revealed: [] as any[], errors: [] as unknown[], newLeaves: [] as unknown[] };
  leaf.history = { backHistory: new Array(opts.backHistory ?? 0).fill({}), back: async () => { log.backs++; leaf.view = markdownOn('notes/previous.md'); } };
  leaf.detach = () => { log.detached = true; leaf.view = { getViewType: () => 'empty' }; };
  leaf.parent = { children: new Array(opts.siblings ?? 2).fill({}) };
  const holderLeaf: any = opts.holder ? {
    getRoot: () => rootSplit, setViewState: async () => {},
    getViewState: () => ({ type: opts.holder!.kind === 'score' ? PHRASE_VIEW_TYPE : 'markdown', state: { file: opts.holder!.file } }),
    view: opts.holder.kind === 'score' ? { getViewType: () => PHRASE_VIEW_TYPE, file: { path: opts.holder.file } } : null,
  } : null;
  if (holderLeaf && opts.holder!.kind === 'text') { const v = new real.MarkdownView(); v.file = { path: opts.holder!.file, extension: 'md' }; v.leaf = holderLeaf; v.containerEl = el(); v.getViewType = () => 'markdown'; v.addAction = () => el(); holderLeaf.view = v; }
  const otherLeaves: any[] = (opts.others ?? []).map((o) => ({ getRoot: () => rootSplit, setViewState: async () => {}, getViewState: () => ({ type: o.type, state: { file: o.file } }), view: { getViewType: () => o.type, file: { path: o.file } } }));
  const tfile = Object.assign(new real.TFile(), { path: PHRASE, extension: 'md', basename: 'phrase_001' });
  const toml0 = toml;
  const app: any = {
    vault: {
      adapter: { exists: async (p: string) => p === 'forge.toml' && toml0 !== null && profile.on, read: async (p: string) => (p === 'forge.toml' && toml0 !== null && profile.on ? toml0 : '') },
      on: (name: string, cb: (f: any) => void) => { (vaultHandlers.get(name) ?? vaultHandlers.set(name, []).get(name)!).push(cb); return {}; }, getMarkdownFiles: () => [], getFiles: () => [], getAbstractFileByPath: (p: string) => /^(bars|phrases)\/.*\.md$/.test(p) && p !== PHRASE ? Object.assign(new real.TFile(), { path: p, extension: 'md', basename: p.replace(/^.*\//, '').replace(/\.md$/, '') }) : (p === PHRASE ? tfile : null), create: async () => {}, createFolder: async () => {}, read: async () => '', configDir: '.obsidian',
    },
    workspace: {
      rootSplit, leftSplit, rightSplit: {},
      onLayoutReady: (cb: () => void) => { cb(); },
      on: (name: string, cb: () => void) => { (handlers.get(name) ?? handlers.set(name, []).get(name)!).push(cb); return {}; },
      getLeavesOfType: (t: string) => ([leaf, holderLeaf, ...otherLeaves].filter((l) => l && (l !== leaf || visible) && l.view?.getViewType() === t)),
      iterateAllLeaves: (cb: (l: any) => void) => { if (visible) cb(leaf); if (holderLeaf) cb(holderLeaf); otherLeaves.forEach(cb); },
      setActiveLeaf: (l: any) => { log.activated.push(l); },
      getActiveViewOfType: (cls: unknown) => (cls === real.MarkdownView && leaf.view.getViewType() === 'markdown' ? leaf.view : null),
      getActiveFile: () => null, revealLeaf: (l: any) => { log.revealed.push(l); },
      // asking Obsidian for a NEW tab: recorded, so "reused" is proven by no tab being requested, not only by the focus moving. The stub leaf accepts anything the Beat Box opener does to it.
      getLeaf: (how: unknown) => { log.newLeaves.push(how); return new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : k === 'view' ? { getViewType: () => 'empty' } : k === 'getViewState' ? () => ({ type: 'empty', state: {} }) : async () => undefined) }); },
    },
    metadataCache: { on: () => ({}), getFileCache: () => ({ frontmatter: { type: 'data', content_type: 'json' } }) }, plugins: {},
  };
  const plugin = await loadRealOnload(real, app);
  ready = true;
  await tick();
  const lines: string[] = [];
  const saved = console.info; console.info = (...a: unknown[]) => { if (String(a[0]).startsWith('[forge-phrase]')) lines.push(String(a[0])); };
  const savedError = console.error; console.error = (...a: unknown[]) => { log.errors.push(a); };
  return {
    plugin, leaf, states, lines, tfile, holderLeaf, log,
    dropAny: (n: number) => { dropAnyN = n; },
    showText: (file: string) => { visible = true; leaf.view = markdownOn(file); },
    /** What the explorer's click does in Obsidian 1.14.5 (read from its app.js): openFile REPLACES the active leaf's view and the leaf is busy until setViewState ends; `file-open` fires INSIDE it, and the replaced view
     *  goes into the leaf's back history only at the END (so the back stack is still empty when we are told). `busyMs` = how long that takes. */
    click: async (file: string, busyMs = 40) => {
      visible = true; leaf.working = true; leaf.view = markdownOn(file);
      const backs = leaf.history.backHistory.length;
      setTimeout(() => { leaf.working = false; leaf.history.backHistory.push({}); }, busyMs);
      for (const n of ['file-open', 'active-leaf-change', 'layout-change']) handlers.get(n)?.forEach((f) => f());
      await tick(busyMs + 400);
      return { backsBefore: backs };
    },
    /** a background tab whose view has not loaded yet (Obsidian's deferred view): it reports the markdown type but is not a MarkdownView */
    showDeferred: (file: string) => { leaf.view = { getViewType: () => 'markdown', file: { path: file } }; },
    setRoot: (where: 'main' | 'left' | 'popout') => { root = where === 'main' ? rootSplit : where === 'left' ? leftSplit : popout; },
    /** forge.toml reads back without the profile (mid-write, unreadable): the vault is no longer known to be score-first */
    loseProfile: async () => { profile.on = false; vaultHandlers.get('modify')?.forEach((f) => f({ path: 'forge.toml' })); await tick(); },
    fire: async (...names: string[]) => { for (const n of names) handlers.get(n)?.forEach((f) => f()); await tick(); },
    done: () => { console.info = saved; console.error = savedError; real.messageDelivery.setScoreFirst(false); real.messageDelivery.resetForTests(); },
  };
}

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  before(async () => {
    const win: any = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
    real ??= await bundleRealPlugin(ROOT, edition);
  });

  test(`[${edition}] (a) in a score-first vault a leaf that comes to show a phrase's text (explorer click, link, quick switcher: all end in file-open) is switched to the phrase tab, history untouched, with one evidence line`, async () => {
    const w = await world(real, SCORE_FIRST_TOML, { restored: 'notes/old.md' });
    try {
      w.showText(PHRASE);
      await w.fire('file-open', 'active-leaf-change', 'layout-change');
      assert.equal(w.states.length, 1, 'three events, one swap');
      assert.equal(w.states[0].type, PHRASE_VIEW_TYPE);
      assert.deepEqual(w.states[0].state, { file: PHRASE });
      assert.equal(w.states[0].popstate, true, 'kept out of the navigation history');
      assert.equal(w.leaf.view.getViewType(), PHRASE_VIEW_TYPE);
      assert.deepEqual(w.lines, [`[forge-phrase] routed ${PHRASE} -> score (a new open in a score-first vault)`]);
    } finally { w.done(); }
  });

  for (const [name, toml] of [['tutorial', TUTORIAL_TOML], ['music-theory', MUSIC_THEORY_TOML], ['no forge.toml', null]] as const) {
    test(`[${edition}] (b) P3: in a vault that is not score-first (${name}) a phrase note opens as markdown exactly as before: nothing is switched, nothing is said`, async () => {
      const w = await world(real, toml, { restored: 'notes/old.md' });
      try {
        w.showText(PHRASE);
        await w.fire('file-open', 'active-leaf-change', 'layout-change');
        assert.deepEqual(w.states, []);
        assert.deepEqual(w.lines, []);
        assert.equal(w.leaf.view.getViewType(), 'markdown');
      } finally { w.done(); }
    });
  }

  test(`[${edition}] (c) Open as JSON: the tab switches to the note's text and STAYS there through the +150 / +600 ms header re-syncs and every workspace event; navigating elsewhere and back is a new open`, async () => {
    const w = await world(real, SCORE_FIRST_TOML, { restored: 'notes/old.md' });
    // the shim's View classes are empty: give the one PhraseView a addAction for the length of this test and catch the header icon it adds
    const icons: Array<{ title: string; cb: () => void }> = [];
    (Object.prototype as any).addAction = function (_i: string, title: string, cb: () => void) { icons.push({ title, cb }); return { remove() {} }; };
    try {
      w.showText(PHRASE);
      await w.fire('file-open');                                                       // the Score, by default
      assert.equal(w.leaf.view.getViewType(), PHRASE_VIEW_TYPE);
      const view: any = w.plugin.views.get(PHRASE_VIEW_TYPE)!(w.leaf);
      view.leaf = w.leaf; view.file = w.tfile;
      icons.find((i) => i.title === 'Open as JSON')!.cb();
      await tick(30);
      assert.equal(w.leaf.view.getViewType(), 'markdown', 'the text is showing');
      const before = w.states.length;
      real.headerResync.request('test');
      for (let i = 0; i < 4; i++) { await w.fire('file-open', 'active-leaf-change', 'layout-change'); await tick(200); }       // > 600 ms: the +150 and +600 re-syncs have fired
      assert.equal(w.states.length, before, 'no bounce back to the Score');
      assert.equal(w.leaf.view.getViewType(), 'markdown');
      assert.equal(w.lines.filter((l) => /-> json \(the person chose Open as JSON\)/.test(l)).length, 1, `one evidence line: ${w.lines.join(' | ')}`);
      w.showText('notes/other.md'); await w.fire('file-open');
      w.showText(PHRASE); await w.fire('file-open');
      assert.equal(w.leaf.view.getViewType(), PHRASE_VIEW_TYPE, 'the choice ended when the tab navigated away');
    } finally { delete (Object.prototype as any).addAction; w.done(); }
  });

  test(`[${edition}] (d) only phrase notes: phrases/README.md and a bar stay markdown`, async () => {
    const w = await world(real, SCORE_FIRST_TOML, { restored: 'notes/old.md' });
    try {
      for (const p of ['phrases/README.md', 'bars/bar_005.md', 'bars/README.md']) { w.showText(p); await w.fire('file-open', 'layout-change'); }
      assert.deepEqual(w.states, []);
      assert.equal(w.leaf.view.getViewType(), 'markdown');
    } finally { w.done(); }
  });

  test(`[${edition}] (e) a tab restored with the layout keeps showing its phrase's text, through every event; the next phrase opened in it is switched`, async () => {
    const w = await world(real, SCORE_FIRST_TOML, { restored: PHRASE });
    try {
      await w.fire('file-open', 'active-leaf-change', 'layout-change', 'file-open');
      assert.deepEqual(w.states, []);
      assert.equal(w.leaf.view.getViewType(), 'markdown');
      w.showText('phrases/phrase_002.md'); await w.fire('file-open');
      assert.equal(w.states.length, 1);
      assert.deepEqual(w.states[0].state, { file: 'phrases/phrase_002.md' });
    } finally { w.done(); }
  });

  test(`[${edition}] a swap Obsidian ignores is retried and lands`, async () => {
    const w = await world(real, SCORE_FIRST_TOML, { restored: 'notes/old.md', dropSwaps: 2 });
    try {
      w.showText(PHRASE);
      await w.fire('file-open'); await tick(600);
      assert.equal(w.states.length, 3);
      assert.equal(w.leaf.view.getViewType(), PHRASE_VIEW_TYPE);
    } finally { w.done(); }
  });

  for (const ev of ['file-open', 'active-leaf-change', 'layout-change']) {
    test(`[${edition}] the ${ev} event alone is enough to route a newly opened phrase`, async () => {
      const w = await world(real, SCORE_FIRST_TOML, { restored: 'notes/old.md' });
      try {
        w.showText(PHRASE); await w.fire(ev);
        assert.equal(w.leaf.view.getViewType(), PHRASE_VIEW_TYPE);
      } finally { w.done(); }
    });
  }

  test(`[${edition}] the main area and the sidebars are routed; a leaf anywhere else (a pop-out, a hover preview) is left alone`, async () => {
    for (const [where, routed] of [['main', true], ['left', true], ['popout', false]] as const) {
      const w = await world(real, SCORE_FIRST_TOML, { restored: 'notes/old.md' });
      try {
        w.setRoot(where); w.showText(PHRASE); await w.fire('file-open');
        assert.equal(w.leaf.view.getViewType() === PHRASE_VIEW_TYPE, routed, where);
      } finally { w.done(); }
    }
  });

  test(`[${edition}] a view that is not a loaded markdown view (a deferred background tab) is not touched, whatever file it will show`, async () => {
    const w = await world(real, SCORE_FIRST_TOML, { restored: 'notes/old.md' });
    try {
      w.showDeferred(PHRASE); await w.fire('file-open', 'layout-change');
      assert.deepEqual(w.states, []);
    } finally { w.done(); }
  });

  test(`[${edition}] a restored view state of another kind (not markdown) protects nothing: the phrase opened in that leaf later is routed`, async () => {
    const w = await world(real, SCORE_FIRST_TOML, { restored: PHRASE, restoredType: 'canvas' });
    try {
      w.showText(PHRASE); await w.fire('file-open');
      assert.equal(w.leaf.view.getViewType(), PHRASE_VIEW_TYPE);
    } finally { w.done(); }
  });

  test(`[${edition}] the router follows the LIVE profile answer: once forge.toml no longer reads as score-first, a phrase opens as markdown again`, async () => {
    const w = await world(real, SCORE_FIRST_TOML, { restored: 'notes/old.md' });
    try {
      await w.loseProfile();
      w.showText(PHRASE); await w.fire('file-open');
      assert.deepEqual(w.states, []);
    } finally { w.done(); }
  });

  // ---- 2026-10-25-0800: the reported bug, in Obsidian's real order (read from 1.14.5's app.js): the explorer REPLACES the active tab's view, the leaf is busy until setViewState ends, `file-open` fires inside it,
  // and the replaced view reaches the leaf's back history only at the END. The old dismiss found an empty back stack and closed the person's tab (Obsidian then logs a RangeError from saveHistory).
  const P1 = 'phrases/phrase_001.md'; const P2 = 'phrases/phrase_002.md';
  for (const [name, clickedBefore, holderKind] of [['Score -> Score', 'score', 'score'], ['JSON text -> Score', 'text', 'score'], ['Score -> JSON text', 'score', 'text']] as const) {
    test(`[${edition}] (0800) ${name}: tab 2 shows phrase_002 and is active, phrase_001 is open in tab 1; clicking phrase_001 in the explorer focuses tab 1, BOTH tabs stay, tab 2 shows phrase_002 again, our path logs no error`, async () => {
      const w = await world(real, SCORE_FIRST_TOML, { restored: P2, restoredType: clickedBefore === 'score' ? PHRASE_VIEW_TYPE : 'markdown', holder: { kind: holderKind, file: P1 }, siblings: 2 });
      try {
        const c = await w.click(P1);
        assert.equal(c.backsBefore, 0, 'precondition: the back stack is still empty when file-open fires (this is what the old dismiss mistook for "nothing to go back to")');
        assert.equal(w.log.detached, false, 'the tab is not closed');
        assert.equal(w.log.backs, 0, 'Obsidian\'s history.back is not used');
        assert.equal(w.leaf.view.getViewType(), clickedBefore === 'score' ? PHRASE_VIEW_TYPE : 'markdown', 'tab 2 shows what it showed');
        assert.equal(w.leaf.view.file?.path, P2, 'tab 2 shows phrase_002 again');
        assert.deepEqual(w.log.activated, [w.holderLeaf], 'tab 1 is focused');
        assert.equal(w.log.dropped.length, 0, 'nothing was asked of the busy leaf: we waited for it to be idle');
        assert.deepEqual(w.log.errors, [], 'no console error from our path');
        assert.ok(w.lines.includes(`[forge-phrase] reused ${P1} (focused existing tab; restored ${P2} in the clicked tab)`), w.lines.join(' | '));
        if (clickedBefore === 'text') assert.equal(w.states.filter((x) => x.type === PHRASE_VIEW_TYPE).length, 0, 'a phrase that was showing as text stays text: it is not swapped to a Score');
      } finally { w.done(); }
    });
  }

  test(`[${edition}] (0800) the restore does not take the focus: it asks for the previous view with active: false (the focus stays on the tab that was reused)`, async () => {
    const w = await world(real, SCORE_FIRST_TOML, { restored: P2, restoredType: PHRASE_VIEW_TYPE, holder: { kind: 'score', file: P1 }, siblings: 2 });
    try {
      await w.click(P1);
      const restore = w.states.filter((x) => x.state?.file === P2);
      assert.ok(restore.length >= 1, 'a restore was asked for');
      assert.ok(restore.every((x) => x.active === false), 'never active: ' + JSON.stringify(restore.map((x) => x.active)));
    } finally { w.done(); }
  });

  test(`[${edition}] (0800) a phrase that was showing as JSON text and is put back stays text through the events that follow (it is not swapped to a Score again)`, async () => {
    const w = await world(real, SCORE_FIRST_TOML, { restored: P2, restoredType: 'markdown', holder: { kind: 'score', file: P1 }, siblings: 2 });
    try {
      await w.click(P1);
      await w.fire('layout-change', 'active-leaf-change', 'file-open'); await tick(120);
      assert.equal(w.leaf.view.getViewType(), 'markdown', 'still the text');
      assert.equal(w.states.filter((x) => x.type === PHRASE_VIEW_TYPE).length, 0, 'never swapped to a Score');
    } finally { w.done(); }
  });

  test(`[${edition}] (0800) events that change nothing do not forget what a tab showed before: after several of them the clicked tab still gets phrase_002 back`, async () => {
    const w = await world(real, SCORE_FIRST_TOML, { restored: P2, restoredType: PHRASE_VIEW_TYPE, holder: { kind: 'score', file: P1 }, siblings: 2 });
    try {
      await w.fire('layout-change', 'active-leaf-change', 'layout-change', 'file-open');
      await w.click(P1);
      assert.equal(w.log.detached, false, 'the tab is not closed');
      assert.equal(w.leaf.view.file.path, P2, 'tab 2 shows phrase_002 again');
    } finally { w.done(); }
  });

  test(`[${edition}] (0800) a leaf that stays busy for a while is waited for, not talked over: the restore lands once it is idle, with no call dropped`, async () => {
    const w = await world(real, SCORE_FIRST_TOML, { restored: P2, restoredType: PHRASE_VIEW_TYPE, holder: { kind: 'score', file: P1 }, siblings: 2 });
    try {
      await w.click(P1, 300);
      assert.equal(w.leaf.view.getViewType(), PHRASE_VIEW_TYPE); assert.equal(w.leaf.view.file.path, P2);
      assert.equal(w.log.dropped.length, 0);
      assert.equal(w.log.detached, false);
    } finally { w.done(); }
  });

  test(`[${edition}] (0800) a restore Obsidian drops (the leaf flickers busy) is retried and lands; and if it never lands the tab is still not lost: the clicked tab shows the Score, a second tab, never a closed one`, async () => {
    const flicker = await world(real, SCORE_FIRST_TOML, { restored: P2, restoredType: PHRASE_VIEW_TYPE, holder: { kind: 'score', file: P1 }, siblings: 2 });
    try {
      flicker.dropAny(2);
      await flicker.click(P1);
      assert.equal(flicker.leaf.view.file.path, P2); assert.equal(flicker.leaf.view.getViewType(), PHRASE_VIEW_TYPE);
      assert.equal(flicker.log.dropped.length, 2); assert.equal(flicker.log.detached, false);
    } finally { flicker.done(); }
    const never = await world(real, SCORE_FIRST_TOML, { restored: P2, restoredType: PHRASE_VIEW_TYPE, holder: { kind: 'score', file: P1 }, siblings: 2 });
    try {
      never.dropAny(99);
      await never.click(P1, 40); await tick(2200);
      assert.equal(never.log.detached, false, 'never closed');
      assert.deepEqual(never.log.activated, [], 'the focus did not move: nothing was given way');
      assert.equal(never.leaf.view.file.path, P1, 'still showing what was opened (a second tab on the same phrase), not lost');
    } finally { never.done(); }
  });

  test(`[${edition}] (0800) the only tab: clicking the phrase it already shows does nothing (the tab shows the Score again, nothing is closed, no reuse line)`, async () => {
    const w = await world(real, SCORE_FIRST_TOML, { restored: P1, restoredType: PHRASE_VIEW_TYPE, siblings: 1 });
    try {
      await w.click(P1);
      assert.equal(w.leaf.view.getViewType(), PHRASE_VIEW_TYPE); assert.equal(w.leaf.view.file.path, P1);
      assert.equal(w.log.detached, false);
      assert.deepEqual(w.log.activated, []);
      assert.ok(!w.lines.some((l) => /reused/.test(l)), w.lines.join(' | '));
      assert.deepEqual(w.log.errors, []);
    } finally { w.done(); }
  });

  for (const [name, toml] of [['tutorial', TUTORIAL_TOML], ['no forge.toml', null]] as const) {
    test(`[${edition}] (0800) P3: in a vault that is not score-first (${name}) the same explorer click changes nothing of ours: nothing restored, closed or focused`, async () => {
      const w = await world(real, toml, { restored: P2, restoredType: PHRASE_VIEW_TYPE, holder: { kind: 'score', file: P1 }, siblings: 2 });
      try {
        await w.click(P1);
        assert.deepEqual(w.states, []); assert.deepEqual(w.log.activated, []); assert.equal(w.log.detached, false); assert.deepEqual(w.lines, []);
      } finally { w.done(); }
    });
  }

  test(`[${edition}] (0800) the fork's "Open note" (and a lineage link) on a bar or phrase that is already open focuses that tab (its Beat Box, its Score view, its text, or a phrase's JSON text) instead of opening another`, async () => {
    const w = await world(real, SCORE_FIRST_TOML, { restored: 'notes/old.md', holder: { kind: 'text', file: P2 }, siblings: 2, others: [{ type: 'forge-rhythm-edit', file: 'bars/bar_007.md' }, { type: 'forge-rhythm-score', file: 'bars/bar_008.md' }] });
    (Object.prototype as any).addAction = function () { return { remove() {} }; };
    try {
      const view: any = w.plugin.views.get(PHRASE_VIEW_TYPE)!(w.leaf);
      view.openNote('bars/bar_007'); assert.equal(w.log.activated.length, 1, 'the Beat Box tab of bar_007 is focused');
      view.openNote('bars/bar_008'); assert.equal(w.log.activated.length, 2, 'so is a Score view of bar_008');
      assert.deepEqual(w.log.newLeaves, [], 'and no new tab was asked for');
      assert.deepEqual(w.lines.filter((l) => /reused bars/.test(l)), ['[forge-phrase] reused bars/bar_007.md (focused existing tab)', '[forge-phrase] reused bars/bar_008.md (focused existing tab)']);
      view.openNote('phrases/phrase_002'); await tick();
      assert.deepEqual(w.log.revealed, [w.holderLeaf], 'a phrase open as its JSON text is revealed, not opened again');
      const before = w.log.activated.length;
      view.openNote('bars/bar_099'); await tick();
      assert.equal(w.log.activated.length, before, 'a bar that is not open anywhere is not "reused"');
      assert.equal(w.log.newLeaves.length, 1, 'it is opened the old way: a new tab');
    } finally { delete (Object.prototype as any).addAction; w.done(); }
  });

  // ---- 2026-10-24-0900: one tab per phrase ---------------------------------------------------------------------------------------------------------------------------------------------------
  for (const kind of ['score', 'text'] as const) {
    test(`[${edition}] (a/b) a phrase already open in another tab (${kind === 'score' ? 'its Score' : 'its JSON text'}) is focused there; a tab the gesture ITSELF just made (a new tab) is closed, nothing is opened beside it`, async () => {
      const w = await world(real, SCORE_FIRST_TOML, { restored: null, born: true, holder: { kind, file: PHRASE }, siblings: 2 });
      try {
        w.showText(PHRASE); await w.fire('file-open', 'active-leaf-change');
        assert.deepEqual(w.log.activated, [w.holderLeaf], 'the existing tab is focused');
        assert.equal(w.log.detached, true, 'the tab that just opened it is closed');
        assert.deepEqual(w.states, [], 'no second Score');
        assert.deepEqual(w.lines.filter((l) => /reused/.test(l)), [`[forge-phrase] reused ${PHRASE} (focused existing tab; closed the new tab)`], `one reuse line: ${w.lines.join(' | ')}`);
        assert.ok(!w.lines.some((l) => /-> score/.test(l)), 'and no Score was routed');
      } finally { w.done(); }
    });
  }

  test(`[${edition}] a tab that had something else before is PUT BACK to it (setViewState to the recorded view, never Obsidian's history, never closed) while the existing phrase tab is focused`, async () => {
    const w = await world(real, SCORE_FIRST_TOML, { restored: 'notes/old.md', holder: { kind: 'score', file: PHRASE }, backHistory: 1 });
    try {
      w.showText(PHRASE); await w.fire('file-open');
      assert.equal(w.log.backs, 0, 'Obsidian\'s history is not used');
      assert.equal(w.log.detached, false);
      assert.deepEqual(w.states.map((s) => [s.type, s.state.file, s.popstate]), [['markdown', 'notes/old.md', true]]);
      assert.equal(w.leaf.view.file.path, 'notes/old.md');
      assert.deepEqual(w.log.activated, [w.holderLeaf]);
      assert.ok(w.lines.includes(`[forge-phrase] reused ${PHRASE} (focused existing tab; restored notes/old.md in the clicked tab)`), w.lines.join(' | '));
    } finally { w.done(); }
  });

  test(`[${edition}] (c) a DIFFERENT phrase still gets its own tab`, async () => {
    const w = await world(real, SCORE_FIRST_TOML, { restored: 'notes/old.md', holder: { kind: 'score', file: PHRASE } });
    try {
      w.showText('phrases/phrase_002.md'); await w.fire('file-open');
      assert.equal(w.states.length, 1);
      assert.deepEqual(w.states[0].state, { file: 'phrases/phrase_002.md' });
      assert.deepEqual(w.log.activated, []);
      assert.equal(w.log.detached, false);
    } finally { w.done(); }
  });

  test(`[${edition}] a NEW tab that is the only one of its pane cannot give way (nothing to restore it to, and it is not closed): it shows the Score itself (a second tab, as before), the existing tab keeps the focus it had`, async () => {
    const w = await world(real, SCORE_FIRST_TOML, { restored: null, born: true, holder: { kind: 'score', file: PHRASE }, siblings: 1 });
    try {
      w.showText(PHRASE); await w.fire('file-open');
      assert.equal(w.states.length, 1);
      assert.equal(w.leaf.view.getViewType(), PHRASE_VIEW_TYPE);
      assert.deepEqual(w.log.activated, []);
      assert.equal(w.log.detached, false);
    } finally { w.done(); }
  });

  for (const [name, toml] of [['tutorial', TUTORIAL_TOML], ['no forge.toml', null]] as const) {
    test(`[${edition}] (d) P3: in a vault that is not score-first (${name}) nothing is focused, closed or moved, whatever tabs show`, async () => {
      const w = await world(real, toml, { restored: 'notes/old.md', holder: { kind: 'text', file: PHRASE } });
      try {
        w.showText(PHRASE); await w.fire('file-open', 'active-leaf-change', 'layout-change');
        assert.deepEqual(w.states, []);
        assert.deepEqual(w.log.activated, []);
        assert.equal(w.log.detached, false);
        assert.equal(w.log.backs, 0);
        assert.deepEqual(w.lines, []);
      } finally { w.done(); }
    });
  }
}

test('MECHANISM PIN: the router is created after the profile gate; Open as Score forgets the JSON choice; Open as JSON tells the router before it switches the tab', () => {
  const sf = fs.readFileSync(path.join(ROOT, 'src/score-first.ts'), 'utf8');
  assert.ok(sf.indexOf('createPhraseRouter<') > sf.indexOf('const plan = scorePanelPlan') && sf.indexOf('createPhraseRouter<') < sf.indexOf('plugin.registerView(PHRASE_VIEW_TYPE'), 'created inside the gate, before the view factory that uses it');
  assert.match(sf, /const openScore = \(leaf: WorkspaceLeaf, file: TFile\) => \{ router\.setMark\(leaf, file\.path, null\); return openPhraseInLeaf\(app, leaf, file\); \}/);
  assert.equal((sf.match(/openPhraseInLeaf\(/g) ?? []).length, 1, 'the only caller is openScore');
  const pv = fs.readFileSync(path.join(ROOT, 'src/phrase-view.ts'), 'utf8');
  assert.ok(pv.indexOf('this.chooseJson?.(this.leaf, file.path)') > 0 && pv.indexOf('this.chooseJson?.(this.leaf, file.path)') < pv.indexOf("this.leaf.setViewState({ type: 'markdown'"), 'the mark is set BEFORE the switch');
});
