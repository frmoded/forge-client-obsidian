// 2026-10-31-1120 (M15c) - "Update from Description" on the REAL wiring, both editions: the real ForgePlugin.onload from the real bundle, the real PhraseView built by the registered factory and a notes-pane text view, a vault whose `process` writes
// FIRST and delivers `modify` AFTER (to the controller, to the tab, in registration order: Obsidian's order, and our own write is heard too), and a clock the test moves. What this proves is that the pieces are CONNECTED: only in a score-first
// vault (P3), a hand edit that parses reaches the note, the tab's Bars control and the evidence line by itself; one that does not parse writes nothing and is said in the bar of BOTH panes; Revert, Update and the sentence service work through the
// buttons. It pins the MECHANISM (one controller, heard through vault `modify`, writing through `vault.process`); if the design moves this SHOULD go red - reassess, do not just rewrite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { installHostClock, iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { DESCRIPTION_DEBOUNCE_MS } from './description-apply-core.ts';
import { PHRASE_DEFAULTS, PHRASE_VIEW_TYPE, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { extractDescription, extractRecipeSection } from './v2-note-core.ts';
import { BOTH_EDITED } from './recipe-apply-core.ts';
import { asRecipeSourced } from './phrase-notes-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const TUTORIAL_TOML = 'name = "forge-tutorial"\nversion = "0.1.0"\ndescription = "x"\ndomains = []\n';
const barText = (n: string): string => fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first', `${n}.md`), 'utf8');
const PATH = 'phrases/phrase_001.md';
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 };
const edit = (text: string, from: string, to: string): string => { const d = extractDescription(text); return text.replace(d, d.replace(from, to)); };
const editRecipe = (text: string, from: string, to: string): string => { const x = extractRecipeSection(text) ?? ''; return text.replace(x, x.replace(from, to)); };

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  let win: any;

  async function world(toml: string, opts: { service?: boolean } = {}) {
    win ??= new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
    real ??= await bundleRealPlugin(ROOT, edition);
    const clock = installHostClock(win);
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const store = new Map<string, string>([['bars/bar_007.md', barText('bar_007')], ['bars/bar_008.md', barText('bar_008')], [PATH, noteContentFor('phrase_001', EXTEND)]]);
    const writes: string[] = [], handlers = new Map<string, Array<(f: any) => void>>(), wsHandlers = new Map<string, Array<(f: any) => void>>(), lines: string[] = [], leaves: any[] = [];
    let activeFile: string | null = null;
    const fire = (name: string, f: any) => { for (const cb of handlers.get(name) ?? []) cb(f); };
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => p === 'forge.toml', read: async () => toml },
        on: (name: string, cb: (f: any) => void) => { (handlers.get(name) ?? handlers.set(name, []).get(name)!).push(cb); return {}; }, configDir: '.obsidian',
        getFiles: () => [...store.keys()].map(tf), getMarkdownFiles: () => [...store.keys()].map(tf),
        getAbstractFileByPath: (p: string) => (store.has(p) ? tf(p) : null), read: async (f: any) => { const t = store.get(f.path); if (t === undefined) throw new Error('File not found'); return t; },
        // Obsidian writes the file first and tells the listeners afterwards (they must not hear it inside the call that caused it)
        process: async (f: any, fn: (t: string) => string) => { const cur = store.get(f.path)!; const next = fn(cur); if (next !== cur) { store.set(f.path, next); writes.push(f.path); setTimeout(() => fire('modify', tf(f.path)), 0); } return next; },
        create: async () => { throw new Error('not used'); }, createFolder: async () => {}, getRoot: () => ({ children: [] }),
      },
      workspace: {
        rootSplit: {}, leftSplit: {}, rightSplit: {}, onLayoutReady: (cb: () => void) => { cb(); },
        iterateAllLeaves: iterateAllLeavesLikeObsidian<any>(() => ({ root: leaves })),
        on: (name: string, cb: (f: any) => void) => { (wsHandlers.get(name) ?? wsHandlers.set(name, []).get(name)!).push(cb); return {}; },
        getLeavesOfType: () => [], getActiveViewOfType: () => null, getMostRecentLeaf: () => null, getActiveFile: () => (activeFile ? tf(activeFile) : null),
      },
      metadataCache: { resolvedLinks: {}, on: () => ({}), getFileCache: () => null }, plugins: {},
    };
    const savedInfo = console.info, savedError = console.error, savedDebug = console.debug;
    console.info = (...a: unknown[]) => { if (/^\[forge-(description|recipe)\]/.test(String(a[0]))) lines.push(String(a[0])); }; console.error = () => {}; console.debug = () => {};
    const HP = win.HTMLElement.prototype;
    const saved = ['createEl', 'createDiv', 'createSpan', 'setText', 'empty', 'addClass', 'removeClass'].map((k) => [k, HP[k]] as const);
    HP.createEl = function (tag: string, o: any = {}) { const e = win.document.createElement(tag); if (o.cls) e.className = o.cls; if (o.text) e.textContent = o.text; if (o.attr) for (const [k, v] of Object.entries(o.attr)) e.setAttribute(k, String(v)); this.appendChild(e); return e; };
    HP.createDiv = function (o: any = {}) { return this.createEl('div', o); };
    HP.createSpan = function (o: any = {}) { return this.createEl('span', o); };
    HP.setText = function (t: string) { this.textContent = t; };
    HP.empty = function () { this.textContent = ''; };
    HP.addClass = function (c: string) { this.classList.add(c); };
    HP.removeClass = function (c: string) { this.classList.remove(c); };
    const base: any = Object.getPrototypeOf(real.PhraseView.prototype);
    const savedBase = ['onLoadFile', 'onUnloadFile', 'onOpen', 'onClose'].map((k) => [k, base[k]] as const);
    for (const m of ['onLoadFile', 'onUnloadFile', 'onOpen', 'onClose']) base[m] = base[m] ?? (async function () {});
    (Object.prototype as any).addAction = function () { return { remove() {} }; };
    const g: any = globalThis; const savedRaf = g.requestAnimationFrame; g.requestAnimationFrame = (fn: () => void) => setImmediate(fn);
    const plan = { kind: 'extend', bar: 'bar_007', bars: 12, tempo_change_pct: -10 };
    (globalThis as any).__shimFns = { requestUrl: async (req: any) => (String(req.url).endsWith('/plan') ? { status: 200, json: { ok: true, parsed_ok: true, plan, error: null } } : undefined) };
    const plugin = await loadRealOnload(real, app);
    await clock.advance(60);
    if (opts.service) { plugin.target.settings.transpileServiceUrl = 'https://svc.example'; plugin.target.settings.transpileServiceToken = 'tok-123'; plugin.target.settings.useOwnAnthropicKey = false; plugin.target.settings.ownAnthropicKey = ''; }
    real.setPyodideHostSingleton({ getInstance: async () => ({ computePhraseScore: () => new Promise(() => {}) }) });
    const makeEl = () => { const el = win.document.createElement('div'); win.document.body.appendChild(el); return el; };
    const openTab = async () => {
      const leaf: any = { getViewState: () => ({ type: PHRASE_VIEW_TYPE, state: { file: PATH } }), getRoot: () => ({}) }; const view: any = plugin.views.get(PHRASE_VIEW_TYPE)!(leaf);
      view.app = app; view.file = tf(PATH); view.leaf = leaf; view.registerEvent = (e: unknown) => e; view.contentEl = makeEl(); leaf.view = view; leaves.push(leaf);
      await view.onOpen(); await view.onLoadFile(view.file); await clock.advance(20);
      return view;
    };
    const openNotesPane = () => { const leaf: any = { getViewState: () => ({ type: 'markdown', state: { file: PATH } }), getRoot: () => ({}) }; const view: any = new real.MarkdownView(); view.file = tf(PATH); view.leaf = leaf; view.contentEl = makeEl(); view.getViewType = () => 'markdown'; leaf.view = view; leaves.push(leaf); return view; };
    return {
      plugin, store, writes, lines, clock, openTab, openNotesPane, fire, tf,
      type: (text: string) => { store.set(PATH, text); fire('modify', tf(PATH)); },            // the person types: the file changes and the vault says so
      wait: async (ms = DESCRIPTION_DEBOUNCE_MS + 20) => { await clock.advance(ms); for (let i = 0; i < 20; i++) await Promise.resolve(); },
      workspaceEvent: (name: string, arg?: unknown) => { for (const cb of wsHandlers.get(name) ?? []) cb(arg); },
      setActive: (p: string | null) => { activeFile = p; },
      done: () => {
        console.info = savedInfo; console.error = savedError; console.debug = savedDebug;
        for (const [k, v] of saved) { if (v === undefined) delete HP[k]; else HP[k] = v; }
        for (const [k, v] of savedBase) { if (v === undefined) delete base[k]; }
        delete (Object.prototype as any).addAction; delete (globalThis as any).__shimFns; g.requestAnimationFrame = savedRaf; if (savedRaf === undefined) delete g.requestAnimationFrame; real.setPyodideHostSingleton(null); clock.restore();
      },
    };
  }

  test(`[${edition}] a hand edit "8 bars" -> "6 bars" is applied BY ITSELF after the person stops typing: the note, the Bars control and the evidence line follow, and the write's own modify finds nothing more to do`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const tab = await w.openTab();
      assert.equal(tab.contentEl.querySelector('.forge-phrase-bars').value, '8');
      w.type(edit(w.store.get(PATH)!, '8 bars', '6 bars'));
      await w.wait(DESCRIPTION_DEBOUNCE_MS - 100);
      assert.deepEqual(w.writes, [], 'the person is still within the wait: nothing written yet');
      await w.wait(150);
      assert.deepEqual(w.writes, [PATH], 'one write');
      assert.equal(w.store.get(PATH), noteContentFor('phrase_001', { ...EXTEND, bars: 6 }));
      assert.equal(tab.contentEl.querySelector('.forge-phrase-bars').value, '6', 'the Bars control reads the new value');
      assert.deepEqual(w.lines, ['[forge-description] applied phrase_001 (8 -> 6 bars)']);
      await w.wait(3000);
      assert.deepEqual(w.writes, [PATH]);
      assert.equal(tab.contentEl.querySelector('.forge-description-bar'), null, 'and no bar is left');
    } finally { w.done(); }
  });

  test(`[${edition}] a sentence that does not parse writes NOTHING and the sentence with its line and column is in the bar of the tab AND of the notes pane; Revert puts the last good Description back and takes both bars away`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const tab = await w.openTab(); const notes = w.openNotesPane();
      const good = w.store.get(PATH)!;
      w.type(edit(good, '8 bars', '8 barz'));
      await w.wait();
      assert.deepEqual(w.writes, []);
      for (const view of [tab, notes]) {
        const bar = view.contentEl.querySelector('.forge-description-bar');
        assert.ok(bar, 'a bar');
        assert.match(bar.querySelector('.forge-description-message').textContent, /^Description, line 1, column \d+: expected "bars", but found "barz"\.$/);
        assert.deepEqual([...bar.querySelectorAll('.forge-description-button')].map((b: any) => b.getAttribute('data-action')), ['revert'], 'no service configured: no Ask button');
      }
      assert.equal(tab.contentEl.querySelector('.forge-phrase-bars').value, '8', 'the last good cache still draws the tab');
      tab.contentEl.querySelector('.forge-description-bar').remove();                       // a pane that redrew itself (a reload of the tab) lost its bar ...
      w.workspaceEvent('layout-change'); await w.wait(50);
      assert.ok(tab.contentEl.querySelector('.forge-description-bar'), '... and the next time the workspace moves it is drawn again');
      assert.equal(tab.contentEl.querySelectorAll('.forge-description-bar').length, 1);
      (notes.contentEl.querySelector('[data-action="revert"]') as any).click(); await w.wait(100);
      assert.equal(w.store.get(PATH), good);
      assert.equal(tab.contentEl.querySelector('.forge-description-bar'), null); assert.equal(notes.contentEl.querySelector('.forge-description-bar'), null);
      assert.deepEqual(w.lines.at(-1), '[forge-description] reverted phrase_001 to the json cache');
    } finally { w.done(); }
  });

  test(`[${edition}] opening a note whose Description was edited while Obsidian was closed only LOOKS: the bar offers Update from Description, nothing is written, and the command "Update from Description" (offered only then) applies it`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const tab = await w.openTab();
      const cmd = w.plugin.commands.get('update-from-description');
      assert.ok(cmd, 'the command exists in a score-first vault'); w.setActive(PATH);
      assert.equal(cmd.checkCallback(true), false, 'nothing to update yet');
      w.store.set(PATH, edit(w.store.get(PATH)!, '8 bars', '5 bars'));                           // edited behind the plugin's back: no modify event
      w.workspaceEvent('file-open', w.tf(PATH)); await w.wait(100);
      assert.deepEqual(w.writes, [], 'looking is not writing');
      assert.deepEqual([...tab.contentEl.querySelectorAll('.forge-description-bar .forge-description-button')].map((b: any) => b.getAttribute('data-action')), ['update', 'revert']);
      assert.equal(cmd.checkCallback(true), true);
      cmd.checkCallback(false); await w.wait(100);
      assert.deepEqual(w.writes, [PATH]); assert.equal(tab.contentEl.querySelector('.forge-phrase-bars').value, '5');
      assert.equal(cmd.checkCallback(true), false);
    } finally { w.done(); }
  });

  test(`[${edition}] the sentence service, with a token: Ask shows Description + Recipe as a preview and writes nothing; Apply writes it and the Bars control reads 12; without a token the button is not there`, async () => {
    const w = await world(SCORE_FIRST_TOML, { service: true });
    try {
      const tab = await w.openTab();
      w.type(edit(w.store.get(PATH)!, 'to 8 bars, repeating with fills', 'to a dozen bars and a bit slower'));
      await w.wait();
      assert.deepEqual([...tab.contentEl.querySelectorAll('.forge-description-bar .forge-description-button')].map((b: any) => b.getAttribute('data-action')), ['revert', 'ask']);
      (tab.contentEl.querySelector('[data-action="ask"]') as any).click(); await w.wait(100);
      assert.deepEqual(w.writes, [], 'a preview writes nothing');
      assert.match(tab.contentEl.querySelector('.forge-description-preview-description').textContent, /12 bars/);
      (tab.contentEl.querySelector('[data-action="apply-preview"]') as any).click(); await w.wait(100);
      assert.deepEqual(w.writes, [PATH]); assert.equal(tab.contentEl.querySelector('.forge-phrase-bars').value, '12');
      assert.match(w.lines.join('\n'), /asked the service about phrase_001 -> extend/);
    } finally { w.done(); }
    const w2 = await world(SCORE_FIRST_TOML);
    try {
      const tab = await w2.openTab();
      w2.type(edit(w2.store.get(PATH)!, '8 bars', '8 barz')); await w2.wait();
      assert.deepEqual([...tab.contentEl.querySelectorAll('.forge-description-bar .forge-description-button')].map((b: any) => b.getAttribute('data-action')), ['revert']);
    } finally { w2.done(); }
  });

  // ---- 2026-10-31-1140 (M16a): the RECIPE is a source, on the same real wiring (the vault writes first and tells its listeners after, the tab and the notes pane both hear it) --------------------------------------------------------
  test(`[${edition}] a hand edit of the RECIPE "8 bars" -> "6 bars" is applied BY ITSELF after the person stops typing: the note (Recipe-sourced), the Bars control and the [forge-recipe] evidence line follow, and the write's own modify finds nothing more to do`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const tab = await w.openTab();
      w.type(editRecipe(w.store.get(PATH)!, '8 bars', '6 bars'));
      await w.wait(DESCRIPTION_DEBOUNCE_MS - 100);
      assert.deepEqual(w.writes, [], 'still within the wait');
      await w.wait(150);
      assert.deepEqual(w.writes, [PATH], 'one write');
      assert.equal(w.store.get(PATH), asRecipeSourced(noteContentFor('phrase_001', { ...EXTEND, bars: 6 })));
      assert.equal(tab.contentEl.querySelector('.forge-phrase-bars').value, '6');
      assert.deepEqual(w.lines, ['[forge-recipe] applied phrase_001 (8 -> 6 bars)']);
      await w.wait(3000);
      assert.deepEqual(w.writes, [PATH]);
      assert.equal(tab.contentEl.querySelector('.forge-description-bar'), null);
    } finally { w.done(); }
  });

  test(`[${edition}] a Recipe that does not parse writes NOTHING; "Recipe, line N, column M: ..." is in the bar of the tab AND of the notes pane with Revert only; Revert puts the last good note back and takes both bars away`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const tab = await w.openTab(); const notes = w.openNotesPane();
      const good = w.store.get(PATH)!;
      w.type(good.replace(extractRecipeSection(good) ?? '', 'Take [[bar_007]].\nRepeat it for 8 bars with fills.\nSprinkle [[bar_008]].'));
      await w.wait();
      assert.deepEqual(w.writes, []);
      for (const view of [tab, notes]) {
        const bar = view.contentEl.querySelector('.forge-description-bar');
        assert.ok(bar, 'a bar');
        assert.match(bar.querySelector('.forge-description-message').textContent, /^Recipe, line 3, column 1: I do not know the step 'Sprinkle'\./);
        assert.deepEqual([...bar.querySelectorAll('.forge-description-button')].map((b: any) => b.getAttribute('data-action')), ['revert']);
      }
      assert.equal(tab.contentEl.querySelector('.forge-phrase-bars').value, '8', 'the last good cache still draws the tab');
      (notes.contentEl.querySelector('[data-action="revert"]') as any).click(); await w.wait(100);
      assert.equal(w.store.get(PATH), good);
      assert.equal(tab.contentEl.querySelector('.forge-description-bar'), null); assert.equal(notes.contentEl.querySelector('.forge-description-bar'), null);
      assert.equal(w.lines.at(-1), '[forge-recipe] reverted phrase_001 to the json cache');
    } finally { w.done(); }
  });

  test(`[${edition}] Description AND Recipe both edited: nothing is written, both panes say so with Update from Description / Update from Recipe; pressing Update from Recipe in the notes pane keeps the Recipe and the tab's Bars control reads it`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const tab = await w.openTab(); const notes = w.openNotesPane();
      w.type(edit(editRecipe(w.store.get(PATH)!, '8 bars', '6 bars'), '8 bars', '5 bars'));
      await w.wait();
      assert.deepEqual(w.writes, []);
      for (const view of [tab, notes]) {
        const bar = view.contentEl.querySelector('.forge-description-bar');
        assert.equal(bar.querySelector('.forge-description-message').textContent, BOTH_EDITED);
        assert.deepEqual([...bar.querySelectorAll('.forge-description-button')].map((b: any) => [b.getAttribute('data-action'), b.textContent]), [['update', 'Update from Description'], ['update-recipe', 'Update from Recipe']]);
      }
      (notes.contentEl.querySelector('[data-action="update-recipe"]') as any).click(); await w.wait(100);
      assert.deepEqual(w.writes, [PATH]);
      assert.equal(tab.contentEl.querySelector('.forge-phrase-bars').value, '6');
      assert.equal(tab.contentEl.querySelector('.forge-description-bar'), null);
    } finally { w.done(); }
  });

  test(`[${edition}] after the Recipe is applied the note is Recipe-sourced: its stamps say so (source_facet: recipe, and the Description stamped as derived from that Recipe)`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      await w.openTab();
      w.type(editRecipe(w.store.get(PATH)!, '8 bars', '6 bars')); await w.wait();
      const done = w.store.get(PATH)!;
      assert.match(done, /^source_facet: recipe$/m);
      assert.match(done, /^description_derived_from_recipe_hash: [0-9a-f]{64}$/m);
    } finally { w.done(); }
  });

  test(`[${edition}] P3: a vault that is not score-first has no command, no listener on the phrase notes and no bar: a hand-edited phrase note is left exactly as typed`, async () => {
    const w = await world(TUTORIAL_TOML);
    try {
      assert.equal(w.plugin.commands.has('update-from-description'), false);
      const typed = edit(w.store.get(PATH)!, '8 bars', '6 bars');
      w.type(typed); await w.wait(3000);
      assert.deepEqual(w.writes, []); assert.equal(w.store.get(PATH), typed); assert.deepEqual(w.lines, []);
      const typedRecipe = editRecipe(w.store.get(PATH)!, '8 bars', '6 bars');
      w.type(typedRecipe); await w.wait(3000);
      assert.deepEqual(w.writes, [], '2026-10-31-1140: and a hand-edited Recipe is left exactly as typed too'); assert.equal(w.store.get(PATH), typedRecipe); assert.deepEqual(w.lines, []);
    } finally { w.done(); }
  });
}
