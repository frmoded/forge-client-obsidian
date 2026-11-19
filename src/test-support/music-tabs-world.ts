// 2026-11-19-0990 - test support: a music-edition vault with REAL leaves. The real ForgePlugin.onload from the real bundle (as score-follows-sentence-wiring.test.ts), a vault whose `process` writes first and delivers `modify` after
// (Obsidian's order) and whose TFile objects are STABLE (a rename changes the path of the very object the tab holds, as Obsidian does), and a workspace of leaves whose `setViewState` builds the view the plugin registered for the
// type (the real PhraseView / ArrangementView / CompositionView / rhythm views from the real factories) or a plain markdown view (the note's text). The file list's click, a link, a rename and "reopen" are therefore the host's own
// sequence (`file-open`, `active-leaf-change`, `layout-change`), and what a tab shows is read from the leaf, never assumed. An engine that records every request. A DOM element is never an assert operand (a failure would format the tree).
import fs from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './bundle-real-plugin.ts';
import { installHostClock, iterateAllLeavesLikeObsidian, type HostClock } from './host-workspace.ts';
import { loadRealOnload, type LoadedPlugin } from './real-onload.ts';
import { PHRASE_DEFAULTS, noteContentFor, type PhraseParams } from '../phrase-core.ts';
import { newKitNote } from '../kit-core.ts';

export const ROOT = process.cwd();                     // the tests run from the repo root (as bundle-real-plugin.ts)
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const barText = (n: string): string => fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first', `${n}.md`), 'utf8');
const EXTEND = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 5 } as PhraseParams;
const mid = (n: number) => ({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array(16).fill(false), snare: Array(16).fill(false) }, n });

export interface Ask { data: any; params: any; title: string }
export interface Action { icon: string; title: string; cb: () => void }

let realOnce: Promise<RealPlugin> | null = null;
/** The real bundle, made once per test file (a bundle takes seconds); each world loads its own plugin from it. */
export function realMusicPlugin(): Promise<RealPlugin> { realOnce ??= bundleRealPlugin(ROOT, 'music'); return realOnce; }

/** `restoredText`: notes whose TEXT tab the layout restored before the plugin loaded (a tab restored after a reload shows what it showed). */
export async function musicTabsWorld(real: RealPlugin, extra: Record<string, string> = {}, opts: { restoredText?: Array<string | { path: string; mode: 'preview' | 'source' }> } = {}) {
  const win: any = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  const clock: HostClock = installHostClock(win);
  const store = new Map<string, string>(Object.entries({
    'bars/bar_007.md': barText('bar_007'), 'bars/bar_008.md': barText('bar_008'),
    'kits/rock.md': newKitNote({ kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] } as any), 'kits/latin.md': newKitNote({ kind: 'kit', name: 'latin', channels: ['bell', 'claves'] } as any),
    'phrases/phrase_001.md': noteContentFor('phrase_001', EXTEND), 'phrases/phrase_002.md': noteContentFor('phrase_002', EXTEND),
    ...extra,
  }));
  const files = new Map<string, any>();
  const tf = (p: string): any => {
    let f = files.get(p);
    if (!f) { f = Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') }); files.set(p, f); }
    return f;
  };
  const writes: string[] = [], asked: Ask[] = [], notices: string[] = [], errors: unknown[][] = [];
  const vaultHandlers = new Map<string, Array<(...a: any[]) => void>>(), wsHandlers = new Map<string, Array<(...a: any[]) => void>>();
  const fireVault = (name: string, ...a: any[]) => { for (const cb of vaultHandlers.get(name) ?? []) cb(...a); };
  const fireWs = (name: string, ...a: any[]) => { for (const cb of wsHandlers.get(name) ?? []) cb(...a); };
  const rootSplit = {}, leftSplit = {}, rightSplit = {};
  const leaves: any[] = [];
  let activeLeaf: any = null;
  let plugin: LoadedPlugin;
  const el = () => { const e = win.document.createElement('div'); win.document.body.appendChild(e); return e; };
  const frontOf = (p: string): Record<string, unknown> | undefined => {
    const t = store.get(p); const m = t === undefined ? null : /^---\r?\n([\s\S]*?)\r?\n---/.exec(t);
    if (!m) return undefined;
    const out: Record<string, unknown> = {};
    for (const line of m[1].split(/\r?\n/)) { const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line); if (kv) out[kv[1]] = kv[2]; }
    return out;
  };

  const markdownView = (leaf: any, file: any) => {
    const v: any = new real.MarkdownView();
    v.file = file; v.leaf = leaf; v.containerEl = el(); v.contentEl = el(); v.getViewType = () => 'markdown'; v.actions = [] as Action[];
    return v;
  };
  const closeView = async (leaf: any): Promise<void> => {
    const v = leaf.view;
    if (v?.file && typeof v.onUnloadFile === 'function') await v.onUnloadFile(v.file);
    if (typeof v?.onClose === 'function') await v.onClose();
  };
  const makeLeaf = (): any => {
    const leaf: any = {
      view: { getViewType: () => 'empty' }, working: false,
      getRoot: () => rootSplit,
      getViewState: () => (leaf.view?.file ? { type: leaf.view.getViewType(), state: { file: leaf.view.file.path, ...(leaf.view.mode ? { mode: leaf.view.mode } : {}) } } : { type: leaf.view.getViewType(), state: {} }),
      /** Obsidian: a leaf that is `working` ignores setViewState; the view of the registered type is built by the plugin's own factory. */
      setViewState: async (s: { type: string; state?: { file?: string; mode?: string }; active?: boolean }) => {
        if (leaf.working) return;
        leaf.working = true;
        try {
          await closeView(leaf);
          const file = s.state?.file ? tf(s.state.file) : undefined;
          if (s.type === 'markdown') { leaf.view = markdownView(leaf, file); if (s.state?.mode) leaf.view.mode = s.state.mode; }
          else if (plugin.views.has(s.type)) {
            const view: any = plugin.views.get(s.type)!(leaf);
            view.app = app; view.file = file; view.leaf = leaf; view.registerEvent = (e: unknown) => e; view.contentEl = el(); view.containerEl = el(); view.getViewType = () => s.type;
            leaf.view = view;
            await view.onOpen?.();
            if (file) await view.onLoadFile(file);
          } else leaf.view = { getViewType: () => s.type, file };
          if (s.active) activeLeaf = leaf;
        } finally { leaf.working = false; }
        fireWs('active-leaf-change', leaf); fireWs('layout-change');
      },
      detach: () => { void closeView(leaf); const i = leaves.indexOf(leaf); if (i >= 0) leaves.splice(i, 1); if (activeLeaf === leaf) activeLeaf = leaves[0] ?? null; leaf.view = { getViewType: () => 'empty' }; fireWs('layout-change'); },
      history: { backHistory: [] as unknown[], back: async () => {} },
    };
    leaf.parent = { children: leaves };
    leaves.push(leaf);
    return leaf;
  };

  const app: any = {
    vault: {
      adapter: { exists: async (p: string) => p === 'forge.toml', read: async () => SCORE_FIRST_TOML },
      on: (name: string, cb: (...a: any[]) => void) => { (vaultHandlers.get(name) ?? vaultHandlers.set(name, []).get(name)!).push(cb); return {}; }, configDir: '.obsidian',
      getFiles: () => [...store.keys()].map(tf), getMarkdownFiles: () => [...store.keys()].map(tf),
      getAbstractFileByPath: (p: string) => (store.has(p) ? tf(p) : null),
      read: async (f: any) => { const t = store.get(f.path); if (t === undefined) throw new Error('File not found'); return t; },
      process: async (f: any, fn: (t: string) => string) => { const cur = store.get(f.path)!; const next = fn(cur); if (next !== cur) { store.set(f.path, next); writes.push(f.path); setTimeout(() => fireVault('modify', tf(f.path)), 0); } return next; },
      create: async (p: string, text: string) => { store.set(p, text); const f = tf(p); fireVault('create', f); return f; },
      createFolder: async () => {}, getRoot: () => ({ children: [] }),
    },
    workspace: {
      rootSplit, leftSplit, rightSplit, onLayoutReady: (cb: () => void) => { cb(); },
      iterateAllLeaves: iterateAllLeavesLikeObsidian<any>(() => ({ root: leaves })),
      on: (name: string, cb: (...a: any[]) => void) => { (wsHandlers.get(name) ?? wsHandlers.set(name, []).get(name)!).push(cb); return {}; },
      getLeavesOfType: (t: string) => leaves.filter((l) => l.view?.getViewType?.() === t),
      getActiveViewOfType: (cls: any) => (activeLeaf?.view instanceof cls ? activeLeaf.view : null),
      getMostRecentLeaf: () => activeLeaf, getActiveFile: () => activeLeaf?.view?.file ?? null,
      getLeaf: (how: unknown) => (how === false && activeLeaf ? activeLeaf : (activeLeaf = makeLeaf())),
      setActiveLeaf: (l: any) => { activeLeaf = l; }, revealLeaf: (l: any) => { activeLeaf = l; },
      createLeafBySplit: () => makeLeaf(), requestSaveLayout: () => {},
    },
    metadataCache: { resolvedLinks: {}, on: () => ({}), getFileCache: (f: any) => ({ frontmatter: frontOf(f.path) }) }, plugins: {},
  };

  const savedInfo = console.info, savedError = console.error, savedDebug = console.debug, savedWarn = console.warn;
  console.info = (...a: unknown[]) => { const s = String(a[0]); if (s.startsWith('[forge-notice]')) notices.push(s); };
  console.error = (...a: unknown[]) => { errors.push(a); }; console.debug = () => {}; console.warn = () => {};
  const HP = win.HTMLElement.prototype;
  const saved = ['createEl', 'createDiv', 'createSpan', 'setText', 'empty', 'addClass', 'removeClass'].map((k) => [k, HP[k]] as const);
  HP.createEl = function (tag: string, o: any = {}) { const e = win.document.createElement(tag); if (o.cls) e.className = o.cls; if (o.text) e.textContent = o.text; if (o.attr) for (const [k, v] of Object.entries(o.attr)) e.setAttribute(k, String(v)); this.appendChild(e); return e; };
  HP.createDiv = function (o: any = {}) { return this.createEl('div', o); };
  HP.createSpan = function (o: any = {}) { return this.createEl('span', o); };
  HP.setText = function (t: string) { this.textContent = t; };
  HP.empty = function () { this.textContent = ''; };
  HP.addClass = function (c: string) { this.classList.add(c); };
  HP.removeClass = function (c: string) { this.classList.remove(c); };
  // the shim's view base classes have no lifecycle: the views call super.onOpen / onLoadFile / onUnloadFile / onClose
  const bases: any[] = [real.PhraseView, real.ArrangementView].map((c) => Object.getPrototypeOf(c.prototype));
  const savedBase = bases.map((b) => ['onLoadFile', 'onUnloadFile', 'onOpen', 'onClose'].map((k) => [b, k, b[k]] as const)).flat();
  for (const b of bases) for (const m of ['onLoadFile', 'onUnloadFile', 'onOpen', 'onClose']) b[m] = b[m] ?? (async function () {});
  // the shim's view base classes have no `addAction`: every view that adds a header action records it on itself (`view.actions`), so a test reads the buttons a tab carries
  (Object.prototype as any).addAction = function (icon: string, title: string, cb: () => void) { const e = win.document.createElement('div'); (this.actions ??= []).push({ icon, title, cb, el: e }); return e; };
  const g: any = globalThis; const savedRaf = g.requestAnimationFrame; g.requestAnimationFrame = (fn: () => void) => setImmediate(fn);
  for (const r of opts.restoredText ?? []) { const p = typeof r === 'string' ? r : r.path; const l = makeLeaf(); l.view = markdownView(l, tf(p)); if (typeof r !== 'string') l.view.mode = r.mode; activeLeaf = l; }
  plugin = await loadRealOnload(real, app);
  await clock.advance(60);
  if ((opts.restoredText ?? []).length > 0) { fireWs('layout-change'); await clock.advance(800); }
  real.setPyodideHostSingleton({
    getInstance: async () => ({
      computePhraseScore: async (data: any, params: any, title: string) => {
        asked.push({ data, params, title });
        const bars = params.kind === 'extend' || params.kind === 'morph' ? params.bars : params.kind === 'transform' ? (data.bars?.length ?? 0) : 1;
        return { type: 'musicxml', content: `<score-partwise><x>${bars}</x></score-partwise>`, bars_data: Array.from({ length: bars }, (_, i) => mid(i)) };
      },
    }),
  });
  const settle = async (ms = 60) => { await clock.advance(ms); for (let i = 0; i < 40; i++) await Promise.resolve(); };

  /** The file list (or a link, or the quick switcher): the active tab opens the note as the host does, the note's text first, then the events the host fires after it. */
  const openFromList = async (p: string, opts: { newTab?: boolean } = {}) => {
    const leaf = opts.newTab || activeLeaf === null ? (activeLeaf = makeLeaf()) : activeLeaf;
    leaf.working = false;
    await closeView(leaf);
    leaf.view = markdownView(leaf, tf(p)); activeLeaf = leaf;
    fireWs('file-open', tf(p)); fireWs('active-leaf-change', leaf); fireWs('layout-change');
    await settle(800);
    return leaf;
  };
  /** A tab the layout restored: its view type and file are saved; the plugin was loaded after (or with) it. `type` 'markdown' = the note's text. */
  const restoreTab = async (type: string, p: string) => {
    const leaf = makeLeaf(); activeLeaf = leaf;
    await leaf.setViewState({ type, state: { file: p }, active: true });
    await settle(800);
    return leaf;
  };
  /** Rename in the file list: the SAME TFile gets the new path (Obsidian), then `rename` is delivered; nothing else is said. */
  const rename = async (from: string, to: string) => {
    const text = store.get(from)!; const f = tf(from); store.delete(from); files.delete(from); store.set(to, text); files.set(to, f);
    f.path = to; f.basename = path.basename(to, '.md');
    fireVault('rename', f, from); await settle(200);
  };
  /** The note edited by hand in the text view (the editor saves the file: a `modify`). */
  const handEdit = async (p: string, fn: (text: string) => string) => {
    store.set(p, fn(store.get(p)!)); fireVault('modify', tf(p)); await settle(1500);
  };
  const viewOf = (leaf: any): any => leaf.view;
  const typeOf = (leaf: any): string => leaf.view.getViewType();
  const field = (view: any) => view.contentEl.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement | null;
  const press = async (view: any, init: Record<string, unknown>) => { field(view)!.dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); await settle(30); };
  const say = async (view: any, sentence: string) => {
    const f = field(view); if (f === null) throw new Error('the composer is not in the tab');
    f.value = sentence; f.dispatchEvent(new win.Event('input', { bubbles: true })); await press(view, { key: 'Enter' }); await press(view, { key: 'Enter' }); await settle(500);
  };
  return {
    real, plugin, store, writes, asked, notices, errors, leaves, tf, clock, settle, openFromList, restoreTab, rename, handEdit, viewOf, typeOf, field, say, markdownView,
    active: () => activeLeaf,
    fire: { vault: fireVault, ws: fireWs },
    lastAsk: (): Ask | undefined => asked[asked.length - 1],
    done: () => {
      real.messageDelivery.setScoreFirst(false); real.messageDelivery.resetForTests();      // first: its listeners still use the DOM helpers below
      console.info = savedInfo; console.error = savedError; console.debug = savedDebug; console.warn = savedWarn;
      for (const [k, v] of saved) { if (v === undefined) delete HP[k]; else HP[k] = v; }
      for (const [b, k, v] of savedBase) { if (v === undefined) delete b[k]; }
      delete (Object.prototype as any).addAction; g.requestAnimationFrame = savedRaf; if (savedRaf === undefined) delete g.requestAnimationFrame; real.setPyodideHostSingleton(null); clock.restore();
    },
  };
}
export type MusicTabsWorld = Awaited<ReturnType<typeof musicTabsWorld>>;
