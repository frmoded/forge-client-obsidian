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
async function world(real: RealPlugin, toml: string | null, opts: { restored: string | null; restoredType?: string; dropSwaps?: number }) {
  const states: any[] = []; const handlers = new Map<string, Array<() => void>>();
  const rootSplit = {}; const leftSplit = {}; const popout = {}; let root: object = rootSplit;
  const vaultHandlers = new Map<string, Array<(f: any) => void>>(); const profile = { on: true };
  const el = () => { const a: any = (globalThis as any).document.createElement('div'); a.addClass = () => {}; a.removeClass = () => {}; return a; };
  const markdownOn = (file: string) => { const v = new real.MarkdownView(); v.file = { path: file, extension: 'md' }; v.leaf = leaf; v.containerEl = el(); v.getViewType = () => 'markdown'; v.addAction = () => el(); return v; };
  let drop = opts.dropSwaps ?? 0;
  const leaf: any = {
    setViewState: async (s: any) => {
      states.push(s);
      if (s.type === PHRASE_VIEW_TYPE) { if (drop > 0) { drop--; return; } leaf.view = { getViewType: () => PHRASE_VIEW_TYPE, file: { path: s.state.file } }; }
      else if (s.type === 'markdown') leaf.view = markdownOn(s.state.file);
    },
    getRoot: () => root,
    getViewState: () => (opts.restored ? { type: opts.restoredType ?? 'markdown', state: { file: opts.restored } } : { type: 'empty', state: {} }),
  };
  leaf.view = opts.restored ? markdownOn(opts.restored) : { getViewType: () => 'empty' };
  const tfile = Object.assign(new real.TFile(), { path: PHRASE, extension: 'md', basename: 'phrase_001' });
  const toml0 = toml;
  const app: any = {
    vault: {
      adapter: { exists: async (p: string) => p === 'forge.toml' && toml0 !== null && profile.on, read: async (p: string) => (p === 'forge.toml' && toml0 !== null && profile.on ? toml0 : '') },
      on: (name: string, cb: (f: any) => void) => { (vaultHandlers.get(name) ?? vaultHandlers.set(name, []).get(name)!).push(cb); return {}; }, getMarkdownFiles: () => [], getFiles: () => [], getAbstractFileByPath: (p: string) => (p === PHRASE ? tfile : null), create: async () => {}, createFolder: async () => {}, read: async () => '', configDir: '.obsidian',
    },
    workspace: {
      rootSplit, leftSplit, rightSplit: {},
      onLayoutReady: (cb: () => void) => { cb(); },
      on: (name: string, cb: () => void) => { (handlers.get(name) ?? handlers.set(name, []).get(name)!).push(cb); return {}; },
      getLeavesOfType: (t: string) => (t === 'markdown' && leaf.view.getViewType() === 'markdown' ? [leaf] : []),
      iterateAllLeaves: (cb: (l: any) => void) => { cb(leaf); },
      getActiveViewOfType: (cls: unknown) => (cls === real.MarkdownView && leaf.view.getViewType() === 'markdown' ? leaf.view : null),
      getActiveFile: () => null, revealLeaf: () => {},
    },
    metadataCache: { on: () => ({}), getFileCache: () => ({ frontmatter: { type: 'data', content_type: 'json' } }) }, plugins: {},
  };
  const plugin = await loadRealOnload(real, app);
  await tick();
  const lines: string[] = [];
  const saved = console.info; console.info = (...a: unknown[]) => { if (String(a[0]).startsWith('[forge-phrase]')) lines.push(String(a[0])); };
  return {
    plugin, leaf, states, lines, tfile,
    showText: (file: string) => { leaf.view = markdownOn(file); },
    /** a background tab whose view has not loaded yet (Obsidian's deferred view): it reports the markdown type but is not a MarkdownView */
    showDeferred: (file: string) => { leaf.view = { getViewType: () => 'markdown', file: { path: file } }; },
    setRoot: (where: 'main' | 'left' | 'popout') => { root = where === 'main' ? rootSplit : where === 'left' ? leftSplit : popout; },
    /** forge.toml reads back without the profile (mid-write, unreadable): the vault is no longer known to be score-first */
    loseProfile: async () => { profile.on = false; vaultHandlers.get('modify')?.forEach((f) => f({ path: 'forge.toml' })); await tick(); },
    fire: async (...names: string[]) => { for (const n of names) handlers.get(n)?.forEach((f) => f()); await tick(); },
    done: () => { console.info = saved; real.messageDelivery.setScoreFirst(false); real.messageDelivery.resetForTests(); },
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
}

test('MECHANISM PIN: the router is created after the profile gate; Open as Score forgets the JSON choice; Open as JSON tells the router before it switches the tab', () => {
  const sf = fs.readFileSync(path.join(ROOT, 'src/score-first.ts'), 'utf8');
  assert.ok(sf.indexOf('createPhraseRouter<') > sf.indexOf('registerView') - 2500 && sf.indexOf('createPhraseRouter<') < sf.indexOf('plugin.registerView(PHRASE_VIEW_TYPE'), 'created before the view factory that uses it');
  assert.match(sf, /const openScore = \(leaf: WorkspaceLeaf, file: TFile\) => \{ router\.setMark\(leaf, file\.path, null\); return openPhraseInLeaf\(app, leaf, file\); \}/);
  assert.equal((sf.match(/openPhraseInLeaf\(/g) ?? []).length, 1, 'the only caller is openScore');
  const pv = fs.readFileSync(path.join(ROOT, 'src/phrase-view.ts'), 'utf8');
  assert.ok(pv.indexOf('this.chooseJson?.(this.leaf, file.path)') > 0 && pv.indexOf('this.chooseJson?.(this.leaf, file.path)') < pv.indexOf("this.leaf.setViewState({ type: 'markdown'"), 'the mark is set BEFORE the switch');
});
