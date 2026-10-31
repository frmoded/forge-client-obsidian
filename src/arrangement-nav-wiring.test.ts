// 2026-10-30-1000 (M10 slice 3) - navigation in an arrangement on the REAL wiring, both editions: the real `ArrangementView` of the real bundle (built by the registered factory, its note loaded by its own onLoadFile) over a vault that holds a
// kit, a phrase and a bar per track, with the REAL engine behind the host singleton (skipped, visibly, without the music wheels). What this proves is that the pieces are CONNECTED: the strip above the Score is one row per kit; the inspector
// is on the music edition's Score (its hint is the arrangement's) and not in the lean one (its Score is a one-line note, P3); a chip's hover lights nothing before a Score exists and throws nothing; the tab hands its pin to the plugin's pair.
// What it cannot do is draw the Score: the music edition's renderer needs Verovio and a MIDI parser that run only in a browser (node cannot require them from the bundle), so the click on a row, the band and the notes pane following are proven
// in pieces - arrangement-rows-dom.test.ts (rows + the real inspector), arrangement-nav-engine.test.ts (real engine + real Verovio), linked-panes-wiring.test.ts (the real view's pin reaching the real linker) - and walked by the driver in Obsidian.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { installHostClock, iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { ARRANGEMENT_VIEW_TYPE, newArrangementNote } from './arrangement-core.ts';
import { ARRANGEMENT_INSPECTOR_HINT } from './arrangement-nav-core.ts';
import { noteContentFor } from './phrase-core.ts';
import { newKitNote } from './kit-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const barText = (n: string): string => fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first', `${n}.md`), 'utf8');
const extend = (source: string, bars: number): any => ({ kind: 'extend', source, bars, style: 'repeat_with_fills', tempo_change_pct: 0 });
const code = (f: string): string => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';

for (const edition of ['lean', 'music'] as const) {
  test(`[${edition}] the real ArrangementView: a strip with one row per kit, the arrangement's inspector on the music Score only, a hover that lights nothing yet, and the pin handed to the plugin's pair`, { skip, timeout: 240_000 }, async () => {
    const win: any = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
    const real: RealPlugin = await bundleRealPlugin(ROOT, edition);
    const clock = installHostClock(win);
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const store = new Map<string, string>(Object.entries({
      'bars/bar_007.md': barText('bar_007'), 'bars/bar_008.md': barText('bar_008').replace('"tempo_bpm": 120', '"tempo_bpm": 100'),
      'kits/rock.md': newKitNote({ kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] } as any), 'kits/latin.md': newKitNote({ kind: 'kit', name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] } as any),
      'phrases/phrase_003.md': noteContentFor('phrase_003', extend('bar_007', 4)), 'phrases/phrase_009.md': noteContentFor('phrase_009', extend('bar_008', 2)),
      'arrangements/arr_001.md': newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }] }),
    }));
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => p === 'forge.toml', read: async () => SCORE_FIRST_TOML }, on: () => ({}), configDir: '.obsidian', getFiles: () => [], getMarkdownFiles: () => [],
        getAbstractFileByPath: (p: string) => (store.has(p) ? tf(p) : null), read: async (f: any) => { const t = store.get(f.path); if (t === undefined) throw new Error('File not found'); return t; },
      },
      workspace: { rootSplit: {}, leftSplit: {}, rightSplit: {}, onLayoutReady: (cb: () => void) => { cb(); }, iterateAllLeaves: iterateAllLeavesLikeObsidian<any>(() => ({ root: [] })), on: () => ({}), getLeavesOfType: () => [], getActiveViewOfType: () => null, getMostRecentLeaf: () => null, getActiveFile: () => null },
      metadataCache: { resolvedLinks: {}, on: () => ({}) }, plugins: {},
    };
    const savedInfo = console.info, savedError = console.error, savedDebug = console.debug;
    console.info = () => {}; console.error = () => {}; console.debug = () => {};
    const HP = win.HTMLElement.prototype;       // Obsidian's global DOM helpers, which the stand-in does not have
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
    const g: any = globalThis; const savedRaf = g.requestAnimationFrame; g.requestAnimationFrame = (fn: () => void) => setImmediate(fn);       // a browser global the renderer asks for
    try {
      const plugin = await loadRealOnload(real, app);
      await clock.advance(60);
      const py = await engine();
      real.setPyodideHostSingleton({ getInstance: async () => ({ computePhraseScore: async (d: any, p: any, t: string) => computePhrase(py, d, p, t) }) });
      const pins: unknown[][] = [];
      const hooks = { goto: async () => true, onNotesNavigated: () => () => {} };
      void hooks;
      const view: any = plugin.views.get(ARRANGEMENT_VIEW_TYPE)!({});
      view.app = app; view.file = tf('arrangements/arr_001.md'); view.registerEvent = () => {};
      const el = win.document.createElement('div'); win.document.body.appendChild(el); view.contentEl = el;
      assert.equal(typeof view.onPin, 'function', 'the tab was given the plugin\'s pin hook (the same one a phrase tab has)');
      const given = view.onPin; view.onPin = (leaf: unknown, pin: unknown) => { pins.push([pin]); return given(leaf, pin); };
      await view.onLoadFile(view.file);
      if (edition === 'music') { const t0 = performance.now(); while (performance.now() - t0 < 60_000 && !/100 bpm/.test(el.querySelector('.forge-arrangement-header')?.textContent ?? '')) { await clock.advance(300); await new Promise((r) => setImmediate(r)); } }

      const rows = [...el.querySelectorAll('.forge-structure-strip > .forge-structure-row')] as any[];
      assert.deepEqual(rows.map((r) => [...r.children].map((c: any) => c.textContent)), [['phrase_003', 'rock kit'], ['phrase_009', 'latin kit']], 'one row per kit above the Score');
      const hint = el.querySelector('.forge-inspector-body')?.textContent ?? null;
      if (edition === 'music') assert.equal(hint, ARRANGEMENT_INSPECTOR_HINT, 'the Score has the arrangement\'s inspector, with its own words');
      else assert.equal(el.querySelector('.forge-inspector'), null, 'the lean edition\'s Score is a one-line note: no inspector, nothing to pin');
      // a hover before any Score is drawn has no lineage to light by: nothing is lit and nothing throws
      const chip = el.querySelector('.forge-structure-chip-kit') as any;
      chip.dispatchEvent(new win.Event('mouseenter')); chip.dispatchEvent(new win.Event('mouseleave'));
      assert.equal(el.querySelectorAll('.forge-artifact-hot').length, 0);
      // the tab closing takes the listeners and the state with it
      await view.onUnloadFile(view.file);
      assert.equal(el.children.length, 0, 'the tab is emptied');
      assert.equal(view.lineage, null); assert.deepEqual(view.rows, {}); assert.equal(view.notesNote, null);
    } finally {
      console.info = savedInfo; console.error = savedError; console.debug = savedDebug;
      for (const [k, v] of saved) { if (v === undefined) delete HP[k]; else HP[k] = v; }
      for (const [k, v] of savedBase) { if (v === undefined) delete base[k]; }
      delete (Object.prototype as any).addAction; g.requestAnimationFrame = savedRaf; if (savedRaf === undefined) delete g.requestAnimationFrame; real.setPyodideHostSingleton(null); clock.restore();
    }
  });

  test(`[${edition}] MECHANISM PIN 2026-10-30-1000 (if the design moves this SHOULD go red — reassess, do not just rewrite): the tab's inspector is the shared one with the opt-in flags of a score-first surface, its rows are drawn when a Score is shown and again on every repaint, a pinned row goes to the pair and to the strip, a chip hover and the notes pane's note light the rows of what they name, and closing the tab lets all of it go`, () => {
    const ka = code('kits-arrangements.ts');
    assert.match(ka, /pointRoles: \[ARRANGEMENT_ROW_ROLE\]/);
    assert.match(ka, /releaseOnEscapeFrom: this\.contentEl,/);
    assert.match(ka, /keepPinOnControls: true,/);
    assert.match(ka, /decorate: \(host, map\) => \{ ensureArrangementRows\(host, map\); \},/, 'a redrawn SVG gets its rows again');
    assert.match(ka, /onShown: \(host\) => \{ ensureArrangementRows\(host, this\.rows\); this\.light\(this\.litByNotes\(\)\); \},/, 'and the first time it is shown, before the first click');
    assert.match(ka, /const pin = e \? pinnedNoteFor\(e\.prov\) : null;\s*\n\s*this\.onPin\?\.\(this\.leaf, pin\);\s*\n\s*this\.strip\?\.emphasise\(e \? chipsOfRow\(e\.prov\) : null\);/);
    assert.match(ka, /onHover: \(chip\) => \{ this\.light\(chip \? rowIdsPlayedBy\(this\.lineage \?\? \[\], chip\.noteId\) : this\.litByNotes\(\)\); \}/);
    assert.match(ka, /structure\.onNotesNavigated\(leaf, \(notesPath\) => \{/);
    assert.match(ka, /this\.stopListening\?\.\(\);\s*\n\s*this\.stopListening = null;/);
    assert.match(ka, /if \(out\.kind === 'score' && !this\.disposed\) \{ this\.paintTempo\(note, out\.payload\); this\.keepLineage\(out\.payload\); \}/);       // 2026-10-31-1110: the header is painted by paintHeader; the tempo only feeds it
    // the inspector is NOT given to a tab that has no way to open a note (a tab built without the plugin's hooks): no half-wired pins
    assert.match(ka, /inspector: this\.openNote \? \{/);
  });
}
