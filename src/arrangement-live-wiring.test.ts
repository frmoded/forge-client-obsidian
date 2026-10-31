// 2026-10-31-1110 (CCQA smoke 9, items 2 and 3) - the arrangement tab's header sentence and its "Every kit is muted" message on the REAL wiring, both editions: the real `ArrangementView` of the real bundle, its note loaded by its own
// onLoadFile, the vault's real `modify` handler as the host calls it, and an engine that NEVER answers (a render that takes seconds). What this proves: the sentence above the strip is the CURRENT note's the moment the note changes (not
// after a render, not one change behind), and a note whose every kit is muted shows its message inside the debounce, from the note alone. It pins the MECHANISM (the header is painted from the note text in the same step as the controls;
// the tab asks the Score area to dim a stale score); if the design moves this SHOULD go red - reassess, do not just rewrite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { installHostClock, iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { ALL_MUTED, ARRANGEMENT_VIEW_TYPE, newArrangementNote, type ArrangementParams } from './arrangement-core.ts';
import { noteContentFor } from './phrase-core.ts';
import { newKitNote } from './kit-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const barText = (n: string): string => fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first', `${n}.md`), 'utf8');
const extend = (source: string, bars: number): any => ({ kind: 'extend', source, bars, style: 'repeat_with_fills', tempo_change_pct: 0 });
const ARR = 'arrangements/arr_001.md';
const arr = (rock: object = {}, latin: object = {}): string => newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003', ...rock }, { kit: 'latin', phrase: 'phrase_009', ...latin }] } as ArrangementParams);

for (const edition of ['lean', 'music'] as const) {
  test(`[${edition}] the arrangement tab: the sentence above the strip is the CURRENT note's the moment the note changes (Solo on, Solo off, Muted, both muted), with the render still pending`, async () => {
    const win: any = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
    const real: RealPlugin = await bundleRealPlugin(ROOT, edition);
    const clock = installHostClock(win);
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const store = new Map<string, string>(Object.entries({
      'bars/bar_007.md': barText('bar_007'), 'bars/bar_008.md': barText('bar_008'),
      'kits/rock.md': newKitNote({ kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] } as any), 'kits/latin.md': newKitNote({ kind: 'kit', name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] } as any),
      'phrases/phrase_003.md': noteContentFor('phrase_003', extend('bar_007', 4)), 'phrases/phrase_009.md': noteContentFor('phrase_009', extend('bar_008', 2)),
      [ARR]: arr(),
    }));
    const handlers = new Map<string, (f: any) => void>();
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => p === 'forge.toml', read: async () => SCORE_FIRST_TOML }, on: (name: string, cb: (f: any) => void) => { handlers.set(name, cb); return {}; }, configDir: '.obsidian', getFiles: () => [], getMarkdownFiles: () => [],
        getAbstractFileByPath: (p: string) => (store.has(p) ? tf(p) : null), read: async (f: any) => { const t = store.get(f.path); if (t === undefined) throw new Error('File not found'); return t; },
      },
      workspace: { rootSplit: {}, leftSplit: {}, rightSplit: {}, onLayoutReady: (cb: () => void) => { cb(); }, iterateAllLeaves: iterateAllLeavesLikeObsidian<any>(() => ({ root: [] })), on: () => ({}), getLeavesOfType: () => [], getActiveViewOfType: () => null, getMostRecentLeaf: () => null, getActiveFile: () => null },
      metadataCache: { resolvedLinks: {}, on: () => ({}) }, plugins: {},
    };
    const savedInfo = console.info, savedError = console.error, savedDebug = console.debug;
    console.info = () => {}; console.error = () => {}; console.debug = () => {};
    const HP = win.HTMLElement.prototype;
    const saved = ['createEl', 'createDiv', 'createSpan', 'setText', 'empty', 'addClass', 'removeClass'].map((k) => [k, HP[k]] as const);
    HP.createEl = function (tag: string, o: any = {}) { const e = win.document.createElement(tag); if (o.cls) e.className = o.cls; if (o.text) e.textContent = o.text; if (o.attr) for (const [k, v] of Object.entries(o.attr)) e.setAttribute(k, String(v)); this.appendChild(e); return e; };
    HP.createDiv = function (o: any = {}) { return this.createEl('div', o); };
    HP.createSpan = function (o: any = {}) { return this.createEl('span', o); };
    HP.setText = function (t: string) { this.textContent = t; };
    HP.empty = function () { this.textContent = ''; };
    HP.addClass = function (c: string) { this.classList.add(c); };
    HP.removeClass = function (c: string) { this.classList.remove(c); };
    const base: any = Object.getPrototypeOf(real.ArrangementView.prototype);
    const savedBase = ['onLoadFile', 'onUnloadFile', 'onOpen', 'onClose'].map((k) => [k, base[k]] as const);
    for (const m of ['onLoadFile', 'onUnloadFile', 'onOpen', 'onClose']) base[m] = base[m] ?? (async function () {});
    (Object.prototype as any).addAction = function () { return { remove() {} }; };
    const g: any = globalThis; const savedRaf = g.requestAnimationFrame; g.requestAnimationFrame = (fn: () => void) => setImmediate(fn);
    try {
      const plugin = await loadRealOnload(real, app);
      await clock.advance(60);
      real.setPyodideHostSingleton({ getInstance: async () => ({ computePhraseScore: () => new Promise(() => {}) }) });         // the engine never answers: every render stays pending
      const view: any = plugin.views.get(ARRANGEMENT_VIEW_TYPE)!({});
      view.app = app; view.file = tf(ARR); view.registerEvent = (e: unknown) => e;
      const el = win.document.createElement('div'); win.document.body.appendChild(el); view.contentEl = el;
      await view.onOpen();
      await view.onLoadFile(view.file);
      const header = (): string => el.querySelector('.forge-arrangement-header')?.textContent ?? '';
      const change = async (text: string): Promise<void> => { store.set(ARR, text); handlers.get('modify')!(tf(ARR)); for (let i = 0; i < 10; i++) await Promise.resolve(); };      // no clock advance: the debounce has not fired, no render has returned
      assert.doesNotMatch(header(), /Solo|Muted/);
      await change(arr({}, { solo: true }));
      assert.match(header(), /Solo: latin\./, header());
      await change(arr());
      assert.doesNotMatch(header(), /Solo/, 'Solo off: the sentence is gone with the change, not one change later: ' + header());
      await change(arr({ mute: true }));
      assert.match(header(), /Muted: rock\./, header());
      assert.doesNotMatch(header(), /Solo/);
      await change(arr({ mute: true }, { mute: true }));
      assert.match(header(), /Muted: rock, latin\./, 'both muted: the sentence names both: ' + header());
      await change(arr({}, { mute: true }));
      assert.match(header(), /Muted: latin\./); assert.doesNotMatch(header(), /Muted: rock/);
      if (edition === 'music') {
        // item 3: every kit muted -> the message is on screen inside the debounce, from the note alone (the engine never answered)
        await change(arr({ mute: true }, { mute: true }));
        await clock.advance(50);
        for (let i = 0; i < 10; i++) await Promise.resolve();
        assert.equal(el.querySelector('.forge-rhythm-edit-score-status')?.textContent, ALL_MUTED, 'at once, before the 400 ms debounce');
      }
      // item 4: the line under the sentence names the kit of the pinned row and the note the notes pane was sent to; empty and hidden with nothing pinned
      const pin = el.querySelector('.forge-arrangement-pin') as any;
      assert.ok(pin, 'the line exists'); assert.equal(pin.style.display, 'none'); assert.equal(pin.textContent, '');
      view.paintPin('Notes pane: rock \u00b7 bar_001'); assert.equal(pin.textContent, 'Notes pane: rock \u00b7 bar_001'); assert.equal(pin.style.display, '');
      view.paintPin(null); assert.equal(pin.textContent, ''); assert.equal(pin.style.display, 'none');
      await view.onUnloadFile(view.file);
    } finally {
      console.info = savedInfo; console.error = savedError; console.debug = savedDebug;
      for (const [k, v] of saved) { if (v === undefined) delete HP[k]; else HP[k] = v; }
      for (const [k, v] of savedBase) { if (v === undefined) delete base[k]; }
      delete (Object.prototype as any).addAction; g.requestAnimationFrame = savedRaf; if (savedRaf === undefined) delete g.requestAnimationFrame; real.setPyodideHostSingleton(null); clock.restore();
    }
  });

  test(`[${edition}] MECHANISM PIN 2026-10-31-1110 (if the design moves this SHOULD go red - reassess, do not just rewrite): the tab paints its header from the note text in the same step as the controls, and asks its Score area to dim a stale score`, () => {
    const ka = fs.readFileSync(path.join(ROOT, 'src/kits-arrangements.ts'), 'utf8');
    assert.match(ka, /markPending: true,/);
    assert.match(ka, /this\.paintPin\(e \? pinStatusLine\(e\.prov\) : null\);/, 'a pinned row says its kit and its note; a released pin clears it');
    assert.match(ka, /this\.paintHeader\(text\); this\.showControls\(text\); this\.strip\?\.show\(text\);/, 'a note change: header, controls and strip from the same text, in one step');
    assert.match(ka, /this\.headerEl = this\.contentEl\.createDiv\(\{ cls: 'forge-arrangement-header' \}\);\s*\n\s*this\.paintHeader\(text\);/, 'and on load');
  });
}
