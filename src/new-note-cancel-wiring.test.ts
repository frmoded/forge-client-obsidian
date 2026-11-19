// 2026-11-19-0975 (finding 3) - Cancel on the "Note title" dialog, on the REAL wiring (music edition): the real ForgePlugin.onload, the real bar-selection host score-first registered (its makePhrase is what "New phrase from these bars", Copy, Delete,
// Move on a phrase that is not a plain transform call), the real PhraseView it opens, the real description controller, the plugin's own removeNote (tabs closed, trashed, verified), and an Obsidian rename prompt that is a Modal opened inside
// `fileManager.promptForFileRename` with Save (closes from inside `submit`) and Cancel (closes from outside). What it proves: create + Cancel leaves the vault as it was (the original byte for byte, the new note gone, NO tab on it), create +
// edit + Cancel keeps the note and its tab, Save keeps the note, an Obsidian without the prompt keeps the note, and the plugin itself never touches the new note between its creation and the Cancel (it would not be removable otherwise).
// A DOM element is never an assert operand.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { installHostClock, iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { PHRASE_DEFAULTS, PHRASE_VIEW_TYPE, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { planAction, selectionOf, type SelectionAction } from './bar-selection-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const barText = (n: string): string => fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first', `${n}.md`), 'utf8');
const ORIGINAL = 'phrases/phrase_015.md';
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 5 };
const mid = (n: number) => ({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array(16).fill(false), snare: Array(16).fill(false) }, n });

async function world(opts: { prompt?: boolean } = {}) {
  const win: any = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  const real: RealPlugin = await bundleRealPlugin(ROOT, 'music');
  const clock = installHostClock(win);
  const store = new Map<string, { text: string; mtime: number }>([['bars/bar_007.md', { text: barText('bar_007'), mtime: 1 }], ['bars/bar_008.md', { text: barText('bar_008'), mtime: 1 }], [ORIGINAL, { text: noteContentFor('phrase_015', EXTEND), mtime: 1 }]]);
  const objs = new Map<string, any>();
  const tf = (p: string) => { if (!store.has(p)) return null; let o = objs.get(p); if (!o) { o = Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') }); objs.set(p, o); } o.stat = { mtime: store.get(p)!.mtime, ctime: 1, size: 0 }; return o; };
  const handlers = new Map<string, Array<(...a: any[]) => void>>(), wsHandlers = new Map<string, Array<(f: any) => void>>(), leaves: any[] = [], trashed: string[] = [], lines: string[] = [];
  let tick = 1000;
  const fire = (name: string, ...a: any[]) => { for (const cb of handlers.get(name) ?? []) cb(...a); };
  const rename = (o: any, to: string) => { const from = o.path; const e = store.get(from)!; store.delete(from); store.set(to, e); objs.delete(from); o.path = to; o.basename = path.basename(to, '.md'); objs.set(to, o); fire('rename', o, from); };
  const app: any = {
    vault: {
      adapter: { exists: async (p: string) => p === 'forge.toml' || store.has(p), read: async () => SCORE_FIRST_TOML, remove: async (p: string) => { store.delete(p); objs.delete(p); } },
      on: (name: string, cb: (...a: any[]) => void) => { (handlers.get(name) ?? handlers.set(name, []).get(name)!).push(cb); return {}; }, configDir: '.obsidian',
      getFiles: () => [...store.keys()].map((p) => tf(p)), getMarkdownFiles: () => [...store.keys()].map((p) => tf(p)),
      getAbstractFileByPath: (p: string) => (p === 'phrases' ? {} : tf(p)), read: async (f: any) => { const e = store.get(f.path); if (!e) throw new Error('File not found'); return e.text; },
      create: async (p: string, content: string) => { if (store.has(p)) throw new Error('File already exists.'); store.set(p, { text: content, mtime: ++tick }); return tf(p); },
      createFolder: async () => {},
      process: async (f: any, fn: (t: string) => string) => { const e = store.get(f.path)!; const next = fn(e.text); if (next !== e.text) { store.set(f.path, { text: next, mtime: ++tick }); setTimeout(() => fire('modify', tf(f.path)), 0); } return next; },
      trash: async (f: any) => { trashed.push(f.path); store.delete(f.path); objs.delete(f.path); }, getRoot: () => ({ children: [] }),
    },
    fileManager: {} as any,
    workspace: {
      rootSplit: {}, leftSplit: {}, rightSplit: {}, onLayoutReady: (cb: () => void) => { cb(); },
      iterateAllLeaves: iterateAllLeavesLikeObsidian<any>(() => ({ root: leaves })),
      on: (name: string, cb: (f: any) => void) => { (wsHandlers.get(name) ?? wsHandlers.set(name, []).get(name)!).push(cb); return {}; },
      getLeavesOfType: (type: string) => leaves.filter((l) => l.view.getViewType() === type), getActiveViewOfType: () => null, getMostRecentLeaf: () => null, getActiveFile: () => tf(ORIGINAL), revealLeaf: () => {},
      getLeaf: () => { const leaf: any = { detach() { const i = leaves.indexOf(leaf); if (i >= 0) leaves.splice(i, 1); }, getRoot: () => ({}), getViewState: () => ({ type: leaf.view?.getViewType?.() ?? 'empty', state: { file: leaf.view?.file?.path } }), setViewState: async (st: any) => { if (st.type === PHRASE_VIEW_TYPE) { const v = await open(st.state.file, leaf); leaf.view = v; if (!leaves.includes(leaf)) leaves.push(leaf); } } }; return leaf; },
    },
    metadataCache: { resolvedLinks: {}, on: () => ({}), getFileCache: () => null }, plugins: {},
  };
  const savedInfo = console.info, savedError = console.error, savedDebug = console.debug, savedWarn = console.warn;
  console.info = (...a: unknown[]) => { if (/^\[forge-barsel\]/.test(String(a[0]))) lines.push(String(a[0])); }; console.error = () => {}; console.debug = () => {}; console.warn = () => {};
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
  // Obsidian's Modal as the prompt uses it
  const M: any = real.Modal.prototype; const savedModal = { open: M.open, close: M.close, onClose: M.onClose };
  M.open = function () { this.isOpen = true; }; M.close = function () { this.isOpen = false; this.onClose(); }; M.onClose = function () {};
  class RenamePrompt extends (real.Modal as any) {
    async submit(title: string) { this.close(); const f = this.file; const to = `${path.dirname(f.path)}/${title}.md`; if (to !== f.path) rename(f, to); }
  }
  const prompts: any[] = [];
  if (opts.prompt !== false) app.fileManager.promptForFileRename = (file: any) => { const p = new RenamePrompt(); p.file = file; prompts.push(p); p.open(); };
  const plugin = await loadRealOnload(real, app);
  await clock.advance(60);
  real.setPyodideHostSingleton({ getInstance: async () => ({ computePhraseScore: async (_d: any, params: any) => ({ type: 'musicxml', content: '<score-partwise/>', bars_data: Array.from({ length: params.bars ?? 2 }, (_, i) => mid(i)) }) }) });
  const makeEl = () => { const el = win.document.createElement('div'); win.document.body.appendChild(el); return el; };
  const settle = async (ms = 60) => { await clock.advance(ms); for (let i = 0; i < 40; i++) await Promise.resolve(); };
  async function open(p: string, leaf: any) {
    const view: any = plugin.views.get(PHRASE_VIEW_TYPE)!(leaf);
    view.app = app; view.file = tf(p); view.leaf = leaf; view.registerEvent = (e: unknown) => e; view.contentEl = makeEl(); view.getViewType = () => PHRASE_VIEW_TYPE;
    leaf.view = view; if (!leaves.includes(leaf)) leaves.push(leaf);
    await view.onOpen(); await view.onLoadFile(view.file); await settle(120);
    for (const cb of wsHandlers.get('layout-change') ?? []) cb(undefined); await settle(80);
    return view;
  }
  const tabsOn = (p: string) => leaves.filter((l) => l.view?.file?.path === p).length;
  const snapshot = () => JSON.stringify([...store.entries()].sort());
  const act = (action: SelectionAction) => {
    const plan = planAction(action, selectionOf([1, 2]), EXTEND, 'phrase_015', 5);
    assert.equal(plan.kind, 'new-phrase', `${action} on a phrase that is not a transform makes a new phrase`);
    return (plan as Extract<typeof plan, { kind: 'new-phrase' }>).params;
  };
  return {
    real, store, trashed, lines, leaves, prompts, tf, open, settle, tabsOn, snapshot, act, fire, objs,
    host: () => real.barSelectionHost()!,
    done: () => {
      console.info = savedInfo; console.error = savedError; console.debug = savedDebug; console.warn = savedWarn;
      for (const [k, v] of saved) { if (v === undefined) delete HP[k]; else HP[k] = v; }
      for (const [k, v] of savedBase) { if (v === undefined) delete base[k]; }
      Object.assign(M, savedModal); for (const k of ['open', 'close', 'onClose'] as const) if (savedModal[k] === undefined) delete M[k];
      delete (Object.prototype as any).addAction; g.requestAnimationFrame = savedRaf; if (savedRaf === undefined) delete g.requestAnimationFrame; real.setPyodideHostSingleton(null); clock.restore();
    },
  };
}

const ACTIONS: SelectionAction[] = ['new-phrase', 'copy', 'delete', 'move-right'];
for (const action of ACTIONS) {
  test(`[music] "${action}" then Cancel on the Note title dialog: the new note is gone, no tab is left on it, the vault is as it was and the original is byte-identical`, async () => {
    const w = await world();
    try {
      const tab = await w.open(ORIGINAL, w.leaves[0] ?? { detach() {}, getRoot: () => ({}), getViewState: () => ({ type: PHRASE_VIEW_TYPE, state: { file: ORIGINAL } }) });
      const before = w.snapshot(); const original = w.store.get(ORIGINAL)!;
      assert.ok(w.host(), 'the real wiring registered the bar-selection host');
      const made = await w.host().makePhrase(w.act(action));
      assert.equal(made.ok, true);
      const newPath = (made as { ok: true; path: string }).path;
      assert.equal(w.prompts.length, 1, 'the Note title dialog was offered'); assert.notEqual(w.snapshot(), before, 'non-vacuity: the action wrote a note');
      assert.equal(w.tabsOn(newPath), 1, 'the new phrase is open in a tab');
      await w.settle(3000);                                                    // the tab opened, the controller looked at it, every timer ran: the plugin did not write the new note
      w.prompts[0].close();                                                    // Cancel (or Esc, or a click outside)
      await w.settle(200);
      assert.equal(w.snapshot(), before, 'the vault is exactly as before the action');
      assert.deepEqual(w.trashed, [newPath], 'removed through the plugin\'s own trash');
      assert.equal(w.tabsOn(newPath), 0, 'no tab is left on the deleted note');
      assert.equal(w.tabsOn(ORIGINAL), 1, 'the tab of the original is still there');
      assert.equal(w.store.get(ORIGINAL)!.text, original.text); assert.equal(w.store.get(ORIGINAL)!.mtime, original.mtime, 'the original: the same bytes and the very same mtime (it was never written)');
      assert.ok(w.lines.some((l) => l.includes(`removed ${newPath} (untouched since it was made)`)), JSON.stringify(w.lines));
      void tab;
    } finally { w.done(); }
  });
}

test('[music] create, EDIT, Cancel: the note STAYS, with its tab and the person\'s text (never delete a note the person edited)', async () => {
  const w = await world();
  try {
    await w.open(ORIGINAL, { detach() {}, getRoot: () => ({}), getViewState: () => ({ type: PHRASE_VIEW_TYPE, state: { file: ORIGINAL } }) });
    const made = await w.host().makePhrase(w.act('new-phrase')) as { ok: true; path: string };
    const f = w.tf(made.path); const typed = w.store.get(made.path)!.text + '\nA line I typed.\n';
    await w.real.ForgePlugin; // (keeps the bundle referenced)
    w.store.set(made.path, { text: typed, mtime: 9999 }); w.fire('modify', f);          // the person typed in the note while the dialog was open
    await w.settle(1000);
    const before = w.snapshot();
    w.prompts[0].close(); await w.settle(200);
    assert.equal(w.snapshot(), before, 'nothing changed'); assert.deepEqual(w.trashed, []); assert.equal(w.store.get(made.path)!.text, typed); assert.equal(w.tabsOn(made.path), 1, 'its tab is still open');
    assert.ok(w.lines.some((l) => /is kept \(its text is not what the action wrote \(it was edited\)\)/.test(l)), JSON.stringify(w.lines));
  } finally { w.done(); }
});

test('[music] create, SAVE (the title kept or a new one): the note stays, under its name; an Obsidian without the prompt keeps the note too (nothing to cancel)', async () => {
  const w = await world();
  try {
    await w.open(ORIGINAL, { detach() {}, getRoot: () => ({}), getViewState: () => ({ type: PHRASE_VIEW_TYPE, state: { file: ORIGINAL } }) });
    const made = await w.host().makePhrase(w.act('new-phrase')) as { ok: true; path: string };
    await w.prompts[0].submit('bridge'); await w.settle(300);
    assert.ok(w.store.has('phrases/bridge.md')); assert.ok(!w.store.has(made.path)); assert.deepEqual(w.trashed, []); assert.equal(w.tabsOn('phrases/bridge.md'), 1);
    const again = await w.host().makePhrase(w.act('copy')) as { ok: true; path: string };
    await w.prompts[1].submit(again.path.replace(/^phrases\//, '').replace(/\.md$/, '')); await w.settle(300);        // Save with the title it already has
    assert.ok(w.store.has(again.path)); assert.deepEqual(w.trashed, []);
    assert.ok(!w.lines.some((l) => /title dialog cancelled/.test(l)), 'a Save says nothing of a cancel');
  } finally { w.done(); }
  const bare = await world({ prompt: false });
  try {
    await bare.open(ORIGINAL, { detach() {}, getRoot: () => ({}), getViewState: () => ({ type: PHRASE_VIEW_TYPE, state: { file: ORIGINAL } }) });
    const made = await bare.host().makePhrase(bare.act('new-phrase')) as { ok: true; path: string };
    await bare.settle(500);
    assert.ok(bare.store.has(made.path), 'no prompt: the note stays'); assert.deepEqual(bare.trashed, []);
  } finally { bare.done(); }
});
