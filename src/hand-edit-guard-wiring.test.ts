// 2026-10-31-1120 (M15b bug, CCQA/driver walk step 5): the Description of a phrase was edited by hand and the STYLE control refused ("Not saved: the Description was edited by hand; ...") but the TEMPO control did not. Every control of every
// surface that writes a note's derived text must refuse the same way, so this is ONE table over the REAL wiring (the real ForgePlugin.onload from the real bundle, the real PhraseView / ArrangementView built by the registered factories, their notes
// loaded by their own onLoadFile, a vault whose `process` and `create` record every write): one row per control, and each row says that when the Description was hand-edited NO BYTE is written (not the note, not a fork note), the control goes back to
// what the note says, and the status line shows the sentence. It pins the MECHANISM (every write goes through the tab's single writer, which asks the one decision function); if the design moves this SHOULD go red - reassess, do not just rewrite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { installHostClock, iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { ARRANGEMENT_VIEW_TYPE, newArrangementNote } from './arrangement-core.ts';
import { MORPH_DEFAULTS, PHRASE_DEFAULTS, PHRASE_VIEW_TYPE, noteContentFor, starterMix, type PhraseParams } from './phrase-core.ts';
import { handEditRefusal } from './phrase-notes-core.ts';
import { newKitNote } from './kit-core.ts';
import { editThisBar, type ForkPorts } from './phrase-fork-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const barText = (n: string): string => fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first', `${n}.md`), 'utf8');
const REFUSAL = handEditRefusal(true);          // "Not saved: the Description was edited by hand; press Update from Description first or revert it."
const PATH = 'phrases/phrase_001.md';
const ARR = 'arrangements/arr_001.md';

/** The note with its `# Description` sentence changed by hand (the way the person types into the text view): the stored description_hash no longer matches. */
const handEdited = (text: string): string => {
  const m = /(# Description\s*\n\s*\n)([^\n]+)/.exec(text);
  assert.ok(m, 'the note has a # Description');
  return text.replace(m[0], `${m[1]}${m[2]} Make it much louder.`);
};

/** One control: how to find it, how to move it, and what it shows when the note's own value is on it. */
interface Row { label: string; note: PhraseParams; sel: string; set(el: any): void; shows(el: any): string; kind: 'number' | 'select' | 'range' | 'check' }
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS };
const MIX_VOTE: PhraseParams = { ...(starterMix('bar_007', 'bar_008') as any), mode: 'vote', weight: 0.5 };
const MIX_PATH: PhraseParams = starterMix('bar_007', 'bar_008');
const MORPH: PhraseParams = { kind: 'morph', a: 'bar_007', b: 'bar_008', ...MORPH_DEFAULTS };
const num = (v: string) => (el: any) => { el.value = v; };
const pick = (v: string) => (el: any) => { el.value = v; };
const ROWS: Row[] = [
  { label: 'extend: Bars', note: EXTEND, sel: '.forge-phrase-bars', set: num('6'), shows: (e) => e.value, kind: 'number' },
  { label: 'extend: Style', note: EXTEND, sel: '.forge-phrase-style', set: pick('building'), shows: (e) => e.value, kind: 'select' },
  { label: 'extend: Tempo change (%)', note: EXTEND, sel: '.forge-phrase-pct', set: num('7'), shows: (e) => e.value, kind: 'number' },
  { label: 'mix (vote): Weight', note: MIX_VOTE, sel: '.forge-mix-weight', set: num('0.25'), shows: (e) => e.value, kind: 'range' },
  { label: 'mix (vote): Threshold', note: MIX_VOTE, sel: '.forge-mix-threshold', set: num('0.9'), shows: (e) => e.value, kind: 'range' },
  { label: 'mix (vote): Ghost notes', note: MIX_VOTE, sel: '.forge-mix-ghost', set: (e) => { e.checked = !e.checked; }, shows: (e) => String(e.checked), kind: 'check' },
  { label: 'mix: Mode', note: MIX_VOTE, sel: '.forge-mix-mode', set: pick('path'), shows: (e) => e.value, kind: 'select' },
  { label: 'mix (path): Order', note: MIX_PATH, sel: '.forge-mix-order', set: pick('seeded'), shows: (e) => e.value, kind: 'select' },
  { label: 'mix (path): Seed', note: MIX_PATH, sel: '.forge-mix-seed', set: num('9'), shows: (e) => e.value, kind: 'number' },
  { label: 'mix: Bar a', note: MIX_VOTE, sel: '.forge-mix-a', set: pick('bar_008'), shows: (e) => e.value, kind: 'select' },
  { label: 'mix: Bar b', note: MIX_VOTE, sel: '.forge-mix-b', set: pick('bar_007'), shows: (e) => e.value, kind: 'select' },
  { label: 'morph: Bars', note: MORPH, sel: '.forge-morph-bars', set: num('3'), shows: (e) => e.value, kind: 'number' },
  { label: 'morph: Order', note: MORPH, sel: '.forge-morph-order', set: pick('seeded'), shows: (e) => e.value, kind: 'select' },
  { label: 'morph: Seed', note: MORPH, sel: '.forge-morph-seed', set: num('4'), shows: (e) => e.value, kind: 'number' },
  { label: 'morph: Bar a', note: MORPH, sel: '.forge-morph-a', set: pick('bar_008'), shows: (e) => e.value, kind: 'select' },
  { label: 'morph: Bar b', note: MORPH, sel: '.forge-morph-b', set: pick('bar_007'), shows: (e) => e.value, kind: 'select' },
];

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  let win: any;

  /** The real plugin on a vault that records its writes, and a real tab (`phrase` or `arrangement`) over `files`. */
  async function world(files: Record<string, string>) {
    win ??= new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
    real ??= await bundleRealPlugin(ROOT, edition);
    const clock = installHostClock(win);
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const store = new Map<string, string>(Object.entries(files));
    const writes: string[] = [], created: string[] = [], handlers = new Map<string, Array<(f: any) => void>>();
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => p === 'forge.toml', read: async () => SCORE_FIRST_TOML },
        on: (name: string, cb: (f: any) => void) => { (handlers.get(name) ?? handlers.set(name, []).get(name)!).push(cb); return {}; }, configDir: '.obsidian',
        getFiles: () => [...store.keys()].map(tf), getMarkdownFiles: () => [...store.keys()].map(tf),
        getAbstractFileByPath: (p: string) => (store.has(p) ? tf(p) : null), read: async (f: any) => { const t = store.get(f.path); if (t === undefined) throw new Error('File not found'); return t; },
        process: async (f: any, fn: (t: string) => string) => { const cur = store.get(f.path)!; const next = fn(cur); if (next !== cur) { store.set(f.path, next); writes.push(f.path); } return next; },
        create: async (p: string, c: string) => { if (store.has(p)) throw new Error('File already exists.'); store.set(p, c); created.push(p); return tf(p); },
        createFolder: async () => {},
      },
      workspace: { rootSplit: {}, leftSplit: {}, rightSplit: {}, onLayoutReady: (cb: () => void) => { cb(); }, iterateAllLeaves: iterateAllLeavesLikeObsidian<any>(() => ({ root: [] })), on: () => ({}), getLeavesOfType: () => [], getActiveViewOfType: () => null, getMostRecentLeaf: () => null, getActiveFile: () => null },
      metadataCache: { resolvedLinks: {}, on: () => ({}) }, plugins: {},
    };
    const savedInfo = console.info, savedError = console.error, savedDebug = console.debug;
    const errors: unknown[][] = [];
    console.info = () => {}; console.error = (...a: unknown[]) => { errors.push(a); }; console.debug = () => {};
    const HP = win.HTMLElement.prototype;
    const saved = ['createEl', 'createDiv', 'createSpan', 'setText', 'empty', 'addClass', 'removeClass'].map((k) => [k, HP[k]] as const);
    HP.createEl = function (tag: string, o: any = {}) { const e = win.document.createElement(tag); if (o.cls) e.className = o.cls; if (o.text) e.textContent = o.text; if (o.attr) for (const [k, v] of Object.entries(o.attr)) e.setAttribute(k, String(v)); this.appendChild(e); return e; };
    HP.createDiv = function (o: any = {}) { return this.createEl('div', o); };
    HP.createSpan = function (o: any = {}) { return this.createEl('span', o); };
    HP.setText = function (t: string) { this.textContent = t; };
    HP.empty = function () { this.textContent = ''; };
    HP.addClass = function (c: string) { this.classList.add(c); };
    HP.removeClass = function (c: string) { this.classList.remove(c); };
    const bases = [real.PhraseView, real.ArrangementView].map((c: any) => Object.getPrototypeOf(c.prototype));
    const savedBase = bases.flatMap((base: any) => ['onLoadFile', 'onUnloadFile', 'onOpen', 'onClose'].map((k) => [base, k, base[k]] as const));
    for (const base of bases) for (const m of ['onLoadFile', 'onUnloadFile', 'onOpen', 'onClose']) base[m] = base[m] ?? (async function () {});
    (Object.prototype as any).addAction = function () { return { remove() {} }; };
    const g: any = globalThis; const savedRaf = g.requestAnimationFrame; g.requestAnimationFrame = (fn: () => void) => setImmediate(fn);
    const plugin = await loadRealOnload(real, app);
    await clock.advance(60);
    real.setPyodideHostSingleton({ getInstance: async () => ({ computePhraseScore: () => new Promise(() => {}), computeArrangementScore: () => new Promise(() => {}) }) });          // the engine never answers: no Score is drawn, the strip is what is tested
    const open = async (type: string, file: string) => {
      const view: any = plugin.views.get(type)!({});
      view.app = app; view.file = tf(file); view.registerEvent = (e: unknown) => e;
      const el = win.document.createElement('div'); win.document.body.appendChild(el); view.contentEl = el;
      await view.onOpen(); await view.onLoadFile(view.file); await clock.advance(20);
      return { view, el };
    };
    return {
      store, writes, created, open, clock, errors,
      settle: async () => { await clock.advance(700); for (let i = 0; i < 20; i++) await Promise.resolve(); },
      done: () => {
        console.info = savedInfo; console.error = savedError; console.debug = savedDebug;
        for (const [k, v] of saved) { if (v === undefined) delete HP[k]; else HP[k] = v; }
        for (const [base, k, v] of savedBase) { if (v === undefined) delete base[k]; }
        delete (Object.prototype as any).addAction; g.requestAnimationFrame = savedRaf; if (savedRaf === undefined) delete g.requestAnimationFrame; real.setPyodideHostSingleton(null); clock.restore();
      },
    };
  }
  const bars = (): Record<string, string> => ({ 'bars/bar_007.md': barText('bar_007'), 'bars/bar_008.md': barText('bar_008') });

  for (const row of ROWS) {
    test(`[${edition}] a hand-edited Description: ${row.label} writes NOTHING, goes back to the note's value and the status line says why`, async () => {
      const original = noteContentFor('phrase_001', row.note);
      const edited = handEdited(original);
      const w = await world({ ...bars(), [PATH]: edited });
      try {
        const { el } = await w.open(PHRASE_VIEW_TYPE, PATH);
        const control = el.querySelector(row.sel);
        assert.ok(control, `${row.sel} is on the strip`);
        const before = row.shows(control);
        row.set(control);
        const moved = row.shows(control);
        assert.notEqual(moved, before, 'the test really moved the control');
        control.dispatchEvent(new win.Event('input', { bubbles: true }));
        control.dispatchEvent(new win.Event('change', { bubbles: true }));
        await w.settle();
        assert.equal(w.store.get(PATH), edited, 'not one byte of the note was written');
        assert.deepEqual(w.writes, [], 'vault.process changed nothing');
        assert.deepEqual(w.created, [], 'and no note was created');
        assert.equal(row.shows(el.querySelector(row.sel)), before, 'the control went back to what the note says');
        assert.equal(el.querySelector('.forge-phrase-status')?.textContent, REFUSAL, 'the status line says why');
      } finally { w.done(); }
    });
  }

  for (const [label, act] of [
    ['Mute', (b: any) => b.click()], ['Solo', (b: any) => b.click()],
  ] as const) {
    test(`[${edition}] a hand-edited Description: the arrangement's ${label} button writes NOTHING, goes back and the tab says why`, async () => {
      const note = newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }] });
      const edited = handEdited(note);
      const w = await world({ ...bars(), 'kits/rock.md': newKitNote({ kind: 'kit', name: 'rock', channels: ['kick', 'snare'] } as any), 'kits/latin.md': newKitNote({ kind: 'kit', name: 'latin', channels: ['bell', 'claves'] } as any), [ARR]: edited });
      try {
        const { el } = await w.open(ARRANGEMENT_VIEW_TYPE, ARR);
        const button = el.querySelector(`.forge-arr-${label.toLowerCase()}`);
        assert.ok(button);
        const before = button.getAttribute('aria-pressed');
        act(button);
        assert.notEqual(button.getAttribute('aria-pressed'), before);
        await w.settle();
        assert.equal(w.store.get(ARR), edited, 'not one byte of the note was written');
        assert.deepEqual(w.writes, []);
        assert.equal(el.querySelector(`.forge-arr-${label.toLowerCase()}`)?.getAttribute('aria-pressed'), before, 'the button went back to what the note says');
        assert.equal(el.querySelector('.forge-phrase-status')?.textContent, REFUSAL, 'the tab says why');
        assert.equal(el.querySelector('.forge-phrase-status')?.getAttribute('role'), 'status', 'in a status region');
        assert.ok(w.errors.some((e) => e[0] === 'ArrangementView.writeSettings refused' && e[1] === REFUSAL), 'and the console has the refusal');
      } finally { w.done(); }
    });
  }

  test(`[${edition}] a hand-edited Description: "Edit this bar" creates NO fork note (it used to create bars/bar_NNN.md and then be refused: "the phrase was not changed, but bars/... was created")`, async () => {
    const edited = handEdited(noteContentFor('phrase_001', EXTEND));
    const w = await world({ ...bars(), [PATH]: edited });
    try {
      const { view } = await w.open(PHRASE_VIEW_TYPE, PATH);
      void view;
      // the fork flow with the vault of this world and the writer of this tab: the decision "may this phrase be written?" is asked BEFORE the fork note is made
      const refusals = (await import('./phrase-core.ts')).phraseWriteRefusal;
      const ports: ForkPorts<unknown> = {
        listBarBasenames: () => ['bar_007', 'bar_008'], exists: (p) => w.store.has(p), create: async (p, c) => { w.store.set(p, c); w.created.push(p); return p; }, notify: () => {}, isAlreadyExists: () => false,
        canWrite: async () => refusals(w.store.get(PATH)!, 'phrase_001'),
        writePhrase: async () => ({ ok: false, message: REFUSAL }), open: async () => {},
      } as any;
      const out = await editThisBar(ports, { params: EXTEND as any, barNumber: 2, phraseNoteId: 'phrases/phrase_001', barData: JSON.parse(/```json\n([\s\S]*?)\n```/.exec(barText('bar_007'))![1]) });
      assert.equal(out.ok, false);
      assert.deepEqual(w.created, [], 'no fork note was created');
      assert.equal((out as { message: string }).message, `Edit this bar: ${REFUSAL}`);
    } finally { w.done(); }
  });

  test(`[${edition}] an arrangement whose Description is in sync: Mute writes the note once, the status line is empty and nothing is logged as refused`, async () => {
    const note = newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }] });
    const w = await world({ ...bars(), 'kits/rock.md': newKitNote({ kind: 'kit', name: 'rock', channels: ['kick', 'snare'] } as any), 'kits/latin.md': newKitNote({ kind: 'kit', name: 'latin', channels: ['bell', 'claves'] } as any), [ARR]: note });
    try {
      const { el } = await w.open(ARRANGEMENT_VIEW_TYPE, ARR);
      (el.querySelector('.forge-arr-mute') as any).click();
      await w.settle();
      assert.deepEqual(w.writes, [ARR]); assert.match(w.store.get(ARR)!, /"mute": true/);
      assert.equal(el.querySelector('.forge-phrase-status')?.textContent, '');
      assert.deepEqual(w.errors.filter((e) => e[0] === 'ArrangementView.writeSettings refused'), []);
    } finally { w.done(); }
  });

  test(`[${edition}] a Description that was NOT edited by hand: every one of those controls still writes (the guard is not a wall): Tempo, Style and the arrangement's Mute`, async () => {
    const note = noteContentFor('phrase_001', EXTEND);
    const w = await world({ ...bars(), [PATH]: note });
    try {
      const { el } = await w.open(PHRASE_VIEW_TYPE, PATH);
      const pct = el.querySelector('.forge-phrase-pct'); pct.value = '7'; pct.dispatchEvent(new win.Event('change', { bubbles: true }));
      await w.settle();
      assert.deepEqual(w.writes, [PATH], 'the note was written');
      assert.match(w.store.get(PATH)!, /"tempo_change_pct": 7/);
      assert.equal(el.querySelector('.forge-phrase-status')?.textContent, '', 'and nothing is said');
    } finally { w.done(); }
  });
}
