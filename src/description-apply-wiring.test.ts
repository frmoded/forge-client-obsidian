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
import { asRecipeSourced, isCustomNote, pythonTextOf } from './phrase-notes-core.ts';
import { applyPythonText } from './description-apply-core.ts';
const THIN = "  bars[1] = thin_out_bars(bars=[bars[1]], first=1, last=1, amount=0.5)[0]\n  return bars";
const withPython = (text: string, edit: (py: string) => string): string => { const py = (text.match(/```python\n([\s\S]*?)\n```/) as RegExpMatchArray)[1]; return text.replace(py, edit(py)); };

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

  async function world(toml: string, opts: { service?: boolean; start?: string } = {}) {
    win ??= new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
    real ??= await bundleRealPlugin(ROOT, edition);
    const clock = installHostClock(win);
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const store = new Map<string, string>([['bars/bar_007.md', barText('bar_007')], ['bars/bar_008.md', barText('bar_008')], [PATH, opts.start ?? noteContentFor('phrase_001', EXTEND)]]);
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
      app, plugin, store, writes, lines, clock, openTab, openNotesPane, fire, tf, addLeaf: (l: any) => { leaves.push(l); },
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

  // 2026-11-03-1155-8 (C): the reload. A custom note's banner and Revert must not wait for a `modify`.
  test(`[${edition}] RELOAD: a custom note whose panes were restored shows the banner in the tab AND the notes pane when the layout settles (no modify, no file-open); the command "Revert custom Python to generated" is offered only then and reverts after the confirm`, async () => {
    const original = noteContentFor('phrase_001', EXTEND);
    const typed = withPython(original, (py) => py.replace('  return bars', THIN));
    const made = applyPythonText(typed, 'phrase_001', 'phrase', { bars: ['bar_007', 'bar_008'], phrases: ['phrase_001'], arrangements: [], compositions: [], kits: [] }, pythonTextOf(typed) as string);
    assert.equal(made.ok, true); const custom = (made as { text: string }).text; assert.equal(isCustomNote(custom), true);
    const w = await world(SCORE_FIRST_TOML, { start: custom });                                            // the note was made custom in an earlier session: this controller has never heard of it
    try {
      const tab = await w.openTab(); const notes = w.openNotesPane();                                      // "Reload app without saving": the panes come back, nothing is modified, no file-open names this note
      const cmd = w.plugin.commands.get('revert-custom-python');
      assert.ok(cmd, 'the second door exists in a score-first vault'); w.setActive(PATH);
      assert.equal(cmd.checkCallback(true), false, 'before the layout settles nothing is known');
      assert.equal(tab.contentEl.querySelector('.forge-description-bar'), null);
      w.workspaceEvent('layout-change'); await w.wait(100);
      for (const el of [tab.contentEl, notes.contentEl]) {
        assert.equal(el.querySelector('.forge-description-message').textContent, 'Custom Python: the controls are off for this note.');
        assert.deepEqual([...el.querySelectorAll('.forge-description-button')].map((b: any) => b.getAttribute('data-action')), ['revert-generated']);
      }
      assert.deepEqual(w.writes, [], 'looking is not writing');
      assert.equal(cmd.checkCallback(true), true);
      assert.equal(w.store.get(PATH), custom);
    } finally { w.done(); }
  });

  test(`[${edition}] P3: a vault that is not score-first has no "Revert custom Python to generated" command`, async () => {
    const w = await world(TUTORIAL_TOML);
    try { assert.equal(w.plugin.commands.has('revert-custom-python'), false); } finally { w.done(); }
  });

  // 2026-11-03-1155-8 (A and B, CCQA smoke 11 step 2): a control used inside the 600 ms wait of a hand-typed Recipe is refused (nothing half-typed is ever written by a control) - and the sentence must name buttons that are ON SCREEN; the red line goes when the note settles.
  const barsOf = (tab: any) => tab.contentEl.querySelector('.forge-phrase-bars');
  const statusOf = (tab: any): string => (tab.contentEl.querySelector('.forge-phrase-status')?.textContent ?? '').replace(/Copy$/, '').trim();
  const actionsOf = (tab: any): string[] => [...tab.contentEl.querySelectorAll('.forge-description-bar .forge-description-button')].map((b: any) => b.getAttribute('data-action'));
  const typeInto = (win: any, el: any, v: string) => { el.value = v; el.dispatchEvent(new win.Event('change')); };
  test(`[${edition}] A: a control used inside the wait of a hand-typed Recipe is refused AND the bar with Update from Recipe / Revert is on screen at once (the sentence names buttons that exist); nothing half-typed is written by the control`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const tab = await w.openTab();
      w.type(editRecipe(w.store.get(PATH)!, '8 bars', '6 bars'));
      await w.wait(100);
      assert.equal(tab.contentEl.querySelector('.forge-description-bar'), null, 'inside the wait there is no bar yet (that is the situation)');
      typeInto(win, barsOf(tab), '9'); await w.wait(50);
      assert.equal(statusOf(tab), 'Not saved: the Recipe was edited by hand; press Update from Recipe first or revert it.');
      assert.deepEqual(actionsOf(tab), ['update-recipe', 'revert'], 'the buttons the sentence names are there');
      assert.deepEqual(w.writes, [], 'the control wrote nothing, and nothing was applied before the person stopped typing');
    } finally { w.done(); }
  });

  test(`[${edition}] B: the red "Not saved" line goes when the note settles - after the bar's own apply, and after Revert`, async () => {
    for (const how of ['apply', 'revert'] as const) {
      const w = await world(SCORE_FIRST_TOML);
      try {
        const tab = await w.openTab();
        w.type(editRecipe(w.store.get(PATH)!, '8 bars', '6 bars')); await w.wait(100);
        typeInto(win, barsOf(tab), '9'); await w.wait(50);
        assert.match(statusOf(tab), /^Not saved: the Recipe was edited by hand/, how);
        if (how === 'apply') await w.wait(DESCRIPTION_DEBOUNCE_MS + 50);
        else { (tab.contentEl.querySelector('.forge-description-button[data-action="revert"]') as HTMLElement).click(); await w.wait(100); }
        assert.equal(w.writes.length, 1, `${how}: one write settled the note`);
        assert.equal(statusOf(tab), '', `${how}: the refusal of a state that no longer exists is gone`);
        assert.equal(tab.contentEl.querySelector('.forge-description-bar'), null, how);
      } finally { w.done(); }
    }
  });

  test(`[${edition}] B: a refusal that still holds is NOT cleared by an unrelated modify (a Recipe that is still hand-edited keeps its sentence)`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const tab = await w.openTab();
      w.type(editRecipe(w.store.get(PATH)!, '8 bars', 'eight bars of my own'));                    // does not parse: nothing is applied
      await w.wait(DESCRIPTION_DEBOUNCE_MS + 50);
      typeInto(win, barsOf(tab), '9'); await w.wait(50);
      assert.match(statusOf(tab), /^Not saved: the Recipe was edited by hand/);
      w.fire('modify', w.tf(PATH)); await w.wait(100);
      assert.match(statusOf(tab), /^Not saved: the Recipe was edited by hand/, 'the note is still hand-edited: the sentence is still true');
    } finally { w.done(); }
  });

  // 2026-11-03-1155-8 (D1): a restored tab that has not been opened is a DEFERRED leaf, titled with the view type until it loads.
  test(`[${edition}] RELOAD: a restored phrase tab that is still deferred is titled with its note's name when the layout settles (not "forge-phrase"); a tab of another view type is left alone; P3: nothing in a vault that is not score-first`, async () => {
    for (const toml of [SCORE_FIRST_TOML, TUTORIAL_TOML]) {
      const w = await world(toml);
      try {
        const mk = (type: string, file: string) => { const el = win.document.createElement('div'); el.textContent = type; return { el, leaf: { isDeferred: true, getViewState: () => ({ type, state: { file } }), getRoot: () => ({}), tabHeaderInnerTitleEl: el } }; };
        const phrase = mk(PHRASE_VIEW_TYPE, 'phrases/phrase_001.md'), other = mk('some-other-view', 'x/y.md');
        w.addLeaf(phrase.leaf); w.addLeaf(other.leaf);
        w.workspaceEvent('layout-change'); await w.wait(100);
        assert.equal(phrase.el.textContent, toml === SCORE_FIRST_TOML ? 'phrase_001' : PHRASE_VIEW_TYPE);
        assert.equal(other.el.textContent, 'some-other-view');
      } finally { w.done(); }
    }
  });

  // ---- 2026-11-03-1155-92 (R4, R5) -------------------------------------------------------------------------------------------------------------------------------------------------------------
  const captureActions = (make: () => unknown): Array<{ icon: string; title: string; cb: () => void }> => {
    const calls: Array<{ icon: string; title: string; cb: () => void }> = [];
    const keep = (Object.prototype as any).addAction, keepRegister = (Object.prototype as any).register;
    (Object.prototype as any).addAction = function (icon: string, title: string, cb: () => void) { calls.push({ icon, title, cb }); return { remove() {} }; };
    (Object.prototype as any).register = function () {};                                                  // Component.register: the shim view has none
    try { make(); } finally { (Object.prototype as any).addAction = keep; if (keepRegister === undefined) delete (Object.prototype as any).register; else (Object.prototype as any).register = keepRegister; }
    return calls;
  };
  test(`[${edition}] R5+R4: the phrase, arrangement and composition Score tabs say "Open as Forge note" (icon file-text) and carry "Restore to last commit" (icon history, to the left of it); the word JSON is in no header title; pressing Restore runs the one restore function`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    const infos: string[] = []; const savedInfo = console.info; console.info = (...a: unknown[]) => { infos.push(String(a[0])); };
    try {
      for (const type of [PHRASE_VIEW_TYPE, 'forge-arrangement-view', 'forge-composition-view']) {
        const factory = w.plugin.views.get(type); assert.ok(factory, `${type} is registered in a score-first vault`);
        let view: any; const actions = captureActions(() => { view = factory({ getViewState: () => ({ type, state: {} }), getRoot: () => ({}) }); view.app = w.app; view.file = w.tf(PATH); });
        assert.deepEqual(actions.map((a) => [a.icon, a.title]), [['file-text', 'Open as Forge note'], ['history', 'Restore to last commit']], `${type}: added right-to-left, so Restore renders to the left`);
        assert.equal(actions.some((a) => /json/i.test(a.title)), false, `${type}: no JSON in the header`);
        actions[1].cb(); await w.wait(20);
        assert.ok(infos.some((l) => /^\[forge-notice\] (Restore is desktop-only\.|No active note\.)/.test(l)), `${type}: Restore reached restoreNoteToLastCommit (it answers in a notice here: no git in a test)`);
        infos.length = 0;
      }
    } finally { console.info = savedInfo; w.done(); }
  });

  test(`[${edition}] R5: the Beat Box of a rhythm note keeps "Open as JSON" (it IS JSON); the three Score views have no "Open as JSON" literal left in their sources`, async () => {
    const { BEAT_BOX_ONLY_ACTIONS } = await import('./header-actions-core.ts');
    assert.ok(BEAT_BOX_ONLY_ACTIONS.some((a) => a.id === 'open-as-json' && a.title === 'Open as JSON'));
    for (const f of ['phrase-view.ts', 'compositions.ts', 'kits-arrangements.ts']) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'), /Open as JSON/, f);
  });

  test(`[${edition}] R4: Restore to last commit with a hand edit pending: the Score tab and the bar come back to the restored note, the pending edit is DROPPED (never applied), and nothing is written afterwards`, async () => {
    for (const how of ['bar-showing', 'timer-pending'] as const) {
      const w = await world(SCORE_FIRST_TOML);
      try {
        const original = w.store.get(PATH)!;
        const tab = await w.openTab(); const notes = w.openNotesPane();
        const edited = editRecipe(original, '8 bars', '6 bars');
        if (how === 'bar-showing') { w.store.set(PATH, edited); w.workspaceEvent('file-open', w.tf(PATH)); await w.wait(100); assert.deepEqual([...tab.contentEl.querySelectorAll('.forge-description-button')].map((b: any) => b.getAttribute('data-action')), ['update-recipe', 'revert']); }
        else { w.type(edited); await w.wait(100); }                                                      // the 600 ms timer is still running
        const parts = real.collectRestoreParticipants().filter((p) => p.path === PATH);
        assert.ok(parts.length >= 1, 'the open Score tab takes part in a restore');
        await real.runRestoreWithHolds(parts, [PATH], () => { w.store.set(PATH, original); });          // the checkout: the file on disk is the committed one again
        w.fire('modify', w.tf(PATH)); await w.wait(DESCRIPTION_DEBOUNCE_MS + 3000);
        assert.deepEqual(w.writes, [], `${how}: the dropped hand edit was not applied`);
        assert.equal(w.store.get(PATH), original);
        assert.equal(tab.contentEl.querySelector('.forge-phrase-bars').value, '8', `${how}: the controls re-read the restored note`);
        for (const el of [tab.contentEl, notes.contentEl]) assert.equal(el.querySelector('.forge-description-bar') === null, true, `${how}: no stale bar`);
      } finally { w.done(); }
    }
  });

  test(`[${edition}] R4 + P3: the bar's own Score tab (music edition) carries "Restore to last commit" in a score-first vault and does not in any other vault; its participant redraws it from the restored file`, async () => {
    for (const [toml, expected] of [[SCORE_FIRST_TOML, true], [TUTORIAL_TOML, false]] as const) {
      const w = await world(toml);
      try {
        const factory = w.plugin.views.get('forge-rhythm-score');
        if (!factory) { assert.equal(edition, 'lean', 'only the lean edition has no bar Score tab'); continue; }
        const actions = captureActions(() => factory({ getViewState: () => ({ type: 'forge-rhythm-score', state: {} }), getRoot: () => ({}) }));
        assert.equal(actions.some((a) => a.title === 'Restore to last commit' && a.icon === 'history'), expected, `score-first=${expected}`);
        assert.equal(actions.some((a) => a.title === 'Open as JSON'), true, 'a bar IS JSON: its Score tab keeps Open as JSON');
      } finally { w.done(); }
    }
  });
}
