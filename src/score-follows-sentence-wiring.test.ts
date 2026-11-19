// 2026-11-19-0975 (finding 1 of the CCQA weekly of 2026-11-18, sandbox step 6) - EVERY applied sentence refreshes the open Score at once. The REAL wiring, music edition (the lean edition has no Score): the real ForgePlugin.onload from the real bundle, the
// real PhraseView / ArrangementView / CompositionView built by the registered factories, the REAL description controller and composer (a sentence is typed in the box and sent with Enter, Enter: preview, then apply), a vault whose `process` writes FIRST and
// delivers `modify` AFTER (Obsidian's order), and an engine that records every `computePhraseScore` it is asked for. "The Score refreshed" = the engine was asked again, for the NOTE AS IT IS NOW (its params / its data), and the status line under the Score
// is not a stale one. The incident: after `Take [[phrase_015]]. Keep bars 1 to 2.` the open Score kept its 5 bars until the tab was closed and reopened. The cause (found here): the sentence was typed in a phrase the person had just RENAMED (the "Note title"
// dialog every bar-selection action opens); the phrase tab had captured the note's path when it mounted, so every `modify` of the note under its NEW name was "another note" to it. A DOM element is never an assert operand (a failure would format the tree).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { installHostClock, iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { PHRASE_DEFAULTS, PHRASE_VIEW_TYPE, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { ARRANGEMENT_VIEW_TYPE, newArrangementNote } from './arrangement-core.ts';
import { COMPOSITION_VIEW_TYPE } from './composition-core.ts';
import { emptyArrangementNote, emptyCompositionNote } from './empty-note-core.ts';
import { newKitNote } from './kit-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const barText = (n: string): string => fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first', `${n}.md`), 'utf8');
const PHRASE = 'phrases/phrase_001.md';
const SOURCE = 'phrases/phrase_002.md';
const ARR = 'arrangements/arr_001.md';
const COMP = 'compositions/song_1.md';
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 5 };
const mid = (n: number) => ({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array(16).fill(false), snare: Array(16).fill(false) }, n });

interface Ask { data: any; params: any; title: string }

async function world(extra: Record<string, string> = {}) {
  const win: any = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  const real: RealPlugin = await bundleRealPlugin(ROOT, 'music');
  const clock = installHostClock(win);
  const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
  const store = new Map<string, string>(Object.entries({
    'bars/bar_007.md': barText('bar_007'), 'bars/bar_008.md': barText('bar_008'),
    'kits/rock.md': newKitNote({ kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] } as any), 'kits/latin.md': newKitNote({ kind: 'kit', name: 'latin', channels: ['bell', 'claves'] } as any),
    [PHRASE]: noteContentFor('phrase_001', EXTEND), [SOURCE]: noteContentFor('phrase_002', { ...EXTEND, bars: 5 }),
    ...extra,
  }));
  const writes: string[] = [], handlers = new Map<string, Array<(...a: any[]) => void>>(), wsHandlers = new Map<string, Array<(f: any) => void>>(), leaves: any[] = [], asked: Ask[] = [];
  const fire = (name: string, ...a: any[]) => { for (const cb of handlers.get(name) ?? []) cb(...a); };
  const app: any = {
    vault: {
      adapter: { exists: async (p: string) => p === 'forge.toml', read: async () => SCORE_FIRST_TOML },
      on: (name: string, cb: (...a: any[]) => void) => { (handlers.get(name) ?? handlers.set(name, []).get(name)!).push(cb); return {}; }, configDir: '.obsidian',
      getFiles: () => [...store.keys()].map(tf), getMarkdownFiles: () => [...store.keys()].map(tf),
      getAbstractFileByPath: (p: string) => (store.has(p) ? tf(p) : null), read: async (f: any) => { const t = store.get(f.path); if (t === undefined) throw new Error('File not found'); return t; },
      process: async (f: any, fn: (t: string) => string) => { const cur = store.get(f.path)!; const next = fn(cur); if (next !== cur) { store.set(f.path, next); writes.push(f.path); setTimeout(() => fire('modify', tf(f.path)), 0); } return next; },
      create: async () => { throw new Error('not used'); }, createFolder: async () => {}, getRoot: () => ({ children: [] }),
    },
    workspace: {
      rootSplit: {}, leftSplit: {}, rightSplit: {}, onLayoutReady: (cb: () => void) => { cb(); },
      iterateAllLeaves: iterateAllLeavesLikeObsidian<any>(() => ({ root: leaves })),
      on: (name: string, cb: (f: any) => void) => { (wsHandlers.get(name) ?? wsHandlers.set(name, []).get(name)!).push(cb); return {}; },
      getLeavesOfType: () => [], getActiveViewOfType: () => null, getMostRecentLeaf: () => null, getActiveFile: () => null,
    },
    metadataCache: { resolvedLinks: {}, on: () => ({}), getFileCache: () => null }, plugins: {},
  };
  const savedInfo = console.info, savedError = console.error, savedDebug = console.debug, savedWarn = console.warn;
  console.info = () => {}; console.error = () => {}; console.debug = () => {}; console.warn = () => {};
  const HP = win.HTMLElement.prototype;
  const saved = ['createEl', 'createDiv', 'createSpan', 'setText', 'empty', 'addClass', 'removeClass'].map((k) => [k, HP[k]] as const);
  HP.createEl = function (tag: string, o: any = {}) { const e = win.document.createElement(tag); if (o.cls) e.className = o.cls; if (o.text) e.textContent = o.text; if (o.attr) for (const [k, v] of Object.entries(o.attr)) e.setAttribute(k, String(v)); this.appendChild(e); return e; };
  HP.createDiv = function (o: any = {}) { return this.createEl('div', o); };
  HP.createSpan = function (o: any = {}) { return this.createEl('span', o); };
  HP.setText = function (t: string) { this.textContent = t; };
  HP.empty = function () { this.textContent = ''; };
  HP.addClass = function (c: string) { this.classList.add(c); };
  HP.removeClass = function (c: string) { this.classList.remove(c); };
  const bases: any[] = [real.PhraseView, real.ArrangementView].map((c) => Object.getPrototypeOf(c.prototype));
  const savedBase = bases.map((b) => ['onLoadFile', 'onUnloadFile', 'onOpen', 'onClose'].map((k) => [b, k, b[k]] as const)).flat();
  for (const b of bases) for (const m of ['onLoadFile', 'onUnloadFile', 'onOpen', 'onClose']) b[m] = b[m] ?? (async function () {});
  (Object.prototype as any).addAction = function () { return { remove() {} }; };
  const g: any = globalThis; const savedRaf = g.requestAnimationFrame; g.requestAnimationFrame = (fn: () => void) => setImmediate(fn);
  const plugin = await loadRealOnload(real, app);
  await clock.advance(60);
  // the engine: every request is recorded; a phrase of N bars answers N bars (a transform asks for its source phrase first, and gets the same answer a phrase would)
  real.setPyodideHostSingleton({
    getInstance: async () => ({
      computePhraseScore: async (data: any, params: any, title: string) => {
        asked.push({ data, params, title });
        const bars = params.kind === 'extend' ? params.bars : params.kind === 'transform' ? (data.bars?.length ?? 0) : 1;
        return { type: 'musicxml', content: `<score-partwise><x>${bars}</x></score-partwise>`, bars_data: Array.from({ length: bars }, (_, i) => mid(i)) };
      },
    }),
  });
  const makeEl = () => { const el = win.document.createElement('div'); win.document.body.appendChild(el); return el; };
  const settle = async (ms = 60) => { await clock.advance(ms); for (let i = 0; i < 40; i++) await Promise.resolve(); };
  const open = async (type: string, p: string) => {
    const leaf: any = { getViewState: () => ({ type, state: { file: view.file.path } }), getRoot: () => ({}) };
    const view: any = plugin.views.get(type)!(leaf);
    view.app = app; view.file = tf(p); view.leaf = leaf; view.registerEvent = (e: unknown) => e; view.contentEl = makeEl(); leaf.view = view; leaves.push(leaf);
    view.getViewType = () => type;
    // `registerEvent` is stubbed (the view hands us what the vault would call): the views' own `vault.on` calls are the handlers the vault delivers to, in registration order
    await view.onOpen(); await view.onLoadFile(view.file); await settle(120);
    for (const cb of wsHandlers.get('layout-change') ?? []) cb(undefined); await settle(80);
    return view;
  };
  /** Rename the note the way Obsidian does: the same TFile object now has the new path, then `rename` is delivered. */
  const rename = async (view: any, to: string) => {
    const from = view.file.path; const text = store.get(from)!; store.delete(from); store.set(to, text);
    view.file.path = to; view.file.basename = path.basename(to, '.md');
    fire('rename', view.file, from); await settle(120);                               // Obsidian says `rename` and nothing else: no `modify`, no layout change
  };
  const field = (view: any) => view.contentEl.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement | null;
  const press = async (view: any, init: Record<string, unknown>) => { field(view)!.dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); await settle(30); };
  /** type a sentence in the composer, Enter (the preview), Enter (apply), then let the debounce of the Score pass */
  const say = async (view: any, sentence: string) => {
    const f = field(view); assert.ok(f !== null, 'the composer is in the tab');
    f!.value = sentence; f!.dispatchEvent(new win.Event('input', { bubbles: true })); await press(view, { key: 'Enter' }); await press(view, { key: 'Enter' }); await settle(500);
  };
  const undo = async (view: any, shift = false) => { await press(view, { key: shift ? 'Z' : 'z', metaKey: true, shiftKey: shift }); await settle(500); };
  const lastAsk = (): Ask | undefined => asked[asked.length - 1];
  return {
    real, plugin, store, writes, asked, lastAsk, open, rename, say, undo, settle, field, tf,
    done: () => {
      console.info = savedInfo; console.error = savedError; console.debug = savedDebug; console.warn = savedWarn;
      for (const [k, v] of saved) { if (v === undefined) delete HP[k]; else HP[k] = v; }
      for (const [b, k, v] of savedBase) { if (v === undefined) delete b[k]; }
      delete (Object.prototype as any).addAction; g.requestAnimationFrame = savedRaf; if (savedRaf === undefined) delete g.requestAnimationFrame; real.setPyodideHostSingleton(null); clock.restore();
    },
  };
}

// ---- the four phrase kinds, in a tab that has not been renamed (the baseline: these already worked) and in one that has (the incident) --------------------------------------------------------------------------------------------------------------
const KINDS: Array<{ kind: string; sentence: string; check: (a: Ask) => void }> = [
  { kind: 'extend', sentence: 'Extend [[bar_007]] to 3 bars, repeating with fills.', check: (a) => { assert.equal(a.params.kind, 'extend'); assert.equal(a.params.bars, 3); } },
  { kind: 'mix', sentence: 'Mix [[bar_007]] and [[bar_008]], 50 percent [[bar_007]], as a vote. Threshold 65 percent. With ghost notes.', check: (a) => { assert.equal(a.params.kind, 'mix'); } },
  { kind: 'morph', sentence: 'Morph [[bar_007]] into [[bar_008]] over 5 bars, in musical order.', check: (a) => { assert.equal(a.params.kind, 'morph'); } },
  { kind: 'take', sentence: 'Take [[phrase_002]]. Keep bars 1 to 2.', check: (a) => { assert.equal(a.params.kind, 'transform'); assert.equal(a.data.bars.length, 2, 'the two bars that were kept went to the engine'); } },
];
for (const renamed of [false, true]) {
  for (const k of KINDS) {
    test(`[music] ${renamed ? 'a RENAMED phrase tab' : 'a phrase tab'}: the sentence of a ${k.kind} phrase re-asks the engine for the note as it is NOW, at once (no reopening)`, async () => {
      const w = await world();
      try {
        const tab = await w.open(PHRASE_VIEW_TYPE, PHRASE);
        const before = w.asked.length;
        assert.ok(before >= 1, 'the Score was asked for when the tab opened');
        if (renamed) await w.rename(tab, 'phrases/bridge.md');
        const target = renamed ? 'phrases/bridge.md' : PHRASE;
        const n0 = w.asked.length;
        await w.say(tab, k.sentence);
        assert.ok(w.writes.includes(target), `the sentence was written to ${target}: ${JSON.stringify(w.writes)}`);
        assert.ok(w.asked.length > n0, 'the engine was asked for the new note (the Score refreshed)');
        k.check(w.lastAsk()!);
        assert.match(w.store.get(target)!, /"kind": "(extend|mix|morph|transform)"/);
      } finally { w.done(); }
    });
  }
}

test('[music] the incident, step by step: Take [[x]]. Keep bars 1 to 2. in a renamed transform phrase of 5 bars: the Score is asked for 2 bars, not left at 5', async () => {
  const w = await world();
  try {
    const tab = await w.open(PHRASE_VIEW_TYPE, PHRASE);
    await w.say(tab, 'Take [[phrase_002]]. Copy bar 2.');
    assert.equal(w.lastAsk()!.data.bars.length, 6, 'copy bar 2 of 5 bars: 6 bars');
    await w.rename(tab, 'phrases/bridge.md');
    await w.say(tab, 'Take [[phrase_002]]. Keep bars 1 to 2.');
    assert.equal(w.lastAsk()!.data.bars.length, 2, 'the Score is for the 2 kept bars');
  } finally { w.done(); }
});

// ---- arrangements and compositions (the list model): apply, undo and redo each re-ask the engine -------------------------------------------------------------------------------------------------------------------------------------------------------
test('[music] an ARRANGEMENT: Apply (appended), Undo and Redo each refresh the open Score at once; the same after the note was renamed', async () => {
  for (const renamed of [false, true]) {
    const w = await world({ [ARR]: emptyArrangementNote('arr_001') });
    try {
      const tab = await w.open(ARRANGEMENT_VIEW_TYPE, ARR);
      let target = ARR;
      if (renamed) { await w.rename(tab, 'arrangements/groove.md'); target = 'arrangements/groove.md'; }
      const tracks = (a: Ask | undefined) => (a?.data?.tracks ?? []).map((t: any) => `${t.kit}:${t.phrase}`);
      const n0 = w.asked.length;
      await w.say(tab, 'Play [[phrase_001]] on the [[rock]] kit.');
      assert.ok(w.asked.length > n0, `apply: the engine was asked (renamed=${renamed})`);
      assert.deepEqual(tracks(w.lastAsk()), ['rock:phrase_001']);
      await w.say(tab, 'Play [[phrase_002]] on the [[latin]] kit.');
      assert.deepEqual(tracks(w.lastAsk()), ['rock:phrase_001', 'latin:phrase_002'], 'the second sentence is appended and the Score follows');
      const n1 = w.asked.length;
      await w.undo(tab);
      assert.ok(w.asked.length > n1, 'undo: the engine was asked');
      assert.deepEqual(tracks(w.lastAsk()), ['rock:phrase_001'], 'undo took the last sentence out of the Score too');
      const n2 = w.asked.length;
      await w.undo(tab, true);
      assert.ok(w.asked.length > n2, 'redo: the engine was asked');
      assert.deepEqual(tracks(w.lastAsk()), ['rock:phrase_001', 'latin:phrase_002']);
      assert.ok(w.writes.includes(target));
    } finally { w.done(); }
  }
});

test('[music] a COMPOSITION: Apply (appended), Undo and Redo each refresh the open Score at once; the same after the note was renamed', async () => {
  for (const renamed of [false, true]) {
    const w = await world({ [COMP]: emptyCompositionNote('song_1') });
    try {
      const tab = await w.open(COMPOSITION_VIEW_TYPE, COMP);
      let target = COMP;
      if (renamed) { await w.rename(tab, 'compositions/anthem.md'); target = 'compositions/anthem.md'; }
      const sections = (a: Ask | undefined) => (a?.data?.sections ?? []).map((s: any) => String(s.source ?? s.phrase ?? s.name ?? JSON.stringify(s)));
      const n0 = w.asked.length;
      await w.say(tab, 'Play [[phrase_001]].');
      assert.ok(w.asked.length > n0, `apply: the engine was asked (renamed=${renamed})`);
      assert.equal(sections(w.lastAsk()).length, 1);
      await w.say(tab, 'Then play [[phrase_002]] for 4 bars.');
      assert.equal(sections(w.lastAsk()).length, 2, 'the second sentence is appended and the Score follows');
      const n1 = w.asked.length;
      await w.undo(tab);
      assert.ok(w.asked.length > n1, 'undo: the engine was asked');
      assert.equal(sections(w.lastAsk()).length, 1);
      const n2 = w.asked.length;
      await w.undo(tab, true);
      assert.ok(w.asked.length > n2, 'redo: the engine was asked');
      assert.equal(sections(w.lastAsk()).length, 2);
      assert.ok(w.writes.includes(target));
    } finally { w.done(); }
  }
});
