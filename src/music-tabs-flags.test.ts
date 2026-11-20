// 2026-11-15-1217 - the music tabs after the driver's three requests: (1) the Score is engraved for the width of its pane and re-engraved when the pane's width changes (it wraps, the tab scrolls vertically); (2) the strips that INPUT a value and the notebooks are behind
// SHOW_LEGACY_CONTROLLERS (off); (3) the "Where did this bar come from?" box is behind SHOW_INSPECTOR (off) while its pin / hover / highlight stay; (4) the status line under the prompt box is the legacy view. The whole-view default-off tests on the REAL wiring are in
// score-first-order-wiring.test.ts; the strips' own tests mount them with the switch on (phrase-dom.test.ts and the rest, unchanged).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { COMPOSER_AUTO_APPLY, DEFAULT_UI_FLAGS, PREVIEW_BEFORE_APPLYING, SHOW_INSPECTOR, SHOW_LEGACY_CONTROLLERS, SHOW_SOURCE_CHIPS, composerAutoApplyOf, readUiFlags, registerUiFlagsSource, uiFlags } from './ui-flags-core.ts';
import { COMPACT_SCORE_INSET_PX, ENGRAVING_SCALE, FIT_PAGE_FACTOR, MIN_HOST_WIDTH_PX, VEROVIO_MIN_PAGE_WIDTH, pageWidthFor } from './host-width-core.ts';
import { RELAYOUT_DEBOUNCE_MS, RELAYOUT_MIN_DELTA_PX, SCORE_HOST_CLASS, attachScoreArea, type ScoreAreaPorts } from './live-score-dom.ts';
import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { PHRASE_DEFAULTS, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { RHYTHM_STARTER } from './new-note-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

// ---- the two switches ---------------------------------------------------------------------------------------------------------------------------------------------------
test('the three music-tab switches are OFF by default and the bar numbers (2026-11-16-0902) are ON, in the constants, in the defaults and in the settings object a fresh install has', () => {
  assert.equal(SHOW_LEGACY_CONTROLLERS, false); assert.equal(SHOW_INSPECTOR, false); assert.equal(SHOW_SOURCE_CHIPS, false);
  // 2026-11-20-1002 (deliberate): `composerAutoApply: false` (a sentence needs a second Enter) is now `previewBeforeApplying: false` (the sentence applies at once); MUSIC_COMPOSER_AUTO_APPLY is ON, the new setting `Preview before applying` is OFF
  assert.deepEqual(DEFAULT_UI_FLAGS, { showLegacyControllers: false, showInspector: false, showSourceChips: false, showBarNumbers: true, previewBeforeApplying: false });
  assert.equal(COMPOSER_AUTO_APPLY, true); assert.equal(PREVIEW_BEFORE_APPLYING, false); assert.equal(composerAutoApplyOf(DEFAULT_UI_FLAGS), true); assert.equal(composerAutoApplyOf({ ...DEFAULT_UI_FLAGS, previewBeforeApplying: true }), false);
  assert.deepEqual(uiFlags(), DEFAULT_UI_FLAGS, 'with no source registered a view gets the defaults');
  const settings = fs.readFileSync(path.join(ROOT, 'src/settings.ts'), 'utf8');
  assert.match(settings, /showLegacyControllers: false,\s*showInspector: false,\s*showSourceChips: false,\s*showBarNumbers: true,/);
  assert.match(settings, /previewBeforeApplying: false,/, '2026-11-20-1002 (deliberate): a fresh install applies at once (was: composerAutoApply: false = the two Enters)');
  assert.ok(!/composerAutoApply/.test(settings), 'the old key is gone from the settings (a stored one is ignored: the old false would have kept every existing install on two Enters)');
});
test('readUiFlags takes only real booleans from the settings object: junk, null and absent are the default (off); a saved true survives data.json', () => {
  assert.deepEqual(readUiFlags(undefined), DEFAULT_UI_FLAGS); assert.deepEqual(readUiFlags(null), DEFAULT_UI_FLAGS);
  assert.deepEqual(readUiFlags({ showLegacyControllers: 'true', showInspector: 1, showSourceChips: 'yes', showBarNumbers: 0 }), DEFAULT_UI_FLAGS);
  assert.deepEqual(readUiFlags({ showLegacyControllers: true, showInspector: false }), { showLegacyControllers: true, showInspector: false, showSourceChips: false, showBarNumbers: true, previewBeforeApplying: false });
  assert.deepEqual(readUiFlags(JSON.parse(JSON.stringify({ showLegacyControllers: true, showInspector: true, showSourceChips: true }))), { showLegacyControllers: true, showInspector: true, showSourceChips: true, showBarNumbers: true, previewBeforeApplying: false });
});
test('the source: a registered source is asked at every call (a change takes effect when a tab mounts), a throwing source is the default, and null puts the default back', () => {
  let on = false;
  registerUiFlagsSource(() => ({ showLegacyControllers: on, showInspector: on, showSourceChips: on, showBarNumbers: true, previewBeforeApplying: false }));
  assert.equal(uiFlags().showLegacyControllers, false); on = true; assert.equal(uiFlags().showLegacyControllers, true);
  registerUiFlagsSource(() => { throw new Error('boom'); }); assert.deepEqual(uiFlags(), DEFAULT_UI_FLAGS);
  registerUiFlagsSource(null); assert.deepEqual(uiFlags(), DEFAULT_UI_FLAGS);
});
test('WIRING: the Forge settings tab has the two toggles, saved to the settings object; main.ts registers the source from it; the three views read it when they mount', () => {
  const settings = fs.readFileSync(path.join(ROOT, 'src/settings.ts'), 'utf8');
  assert.match(settings, /setName\('Show legacy controllers \(editing strips\)'\)[\s\S]*?settings\.showLegacyControllers = value/);
  assert.match(settings, /setName\('Show the bar inspector'\)[\s\S]*?settings\.showInspector = value/);
  assert.match(settings, /setName\('Show source chips'\)[\s\S]*?settings\.showSourceChips = value/);
  // 2026-11-20-1002: the setting `Preview before applying` (default OFF) lives in the SAME tab, saved to the settings object; score-first.ts hands the composer `composerAutoApplyOf(uiFlags())`, read at every Enter
  assert.match(settings, /setName\('Preview before applying'\)[\s\S]*?settings\.previewBeforeApplying = value/);
  assert.match(fs.readFileSync(path.join(ROOT, 'src/score-first.ts'), 'utf8'), /composerAutoApply: \(\) => composerAutoApplyOf\(uiFlags\(\)\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'src/main.ts'), 'utf8'), /registerUiFlagsSource\(\(\) => readUiFlags\(this\.settings\)\)/);
  for (const f of ['phrase-view.ts', 'kits-arrangements.ts', 'compositions.ts']) assert.match(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), /const flags = uiFlags\(\)/, f);
});

// ---- the Score engraved for its pane ---------------------------------------------------------------------------------------------------------------------------------------
test('the page width: a score-first tab engraves for its own width (the SVG is pageWidth * scale / 100 px, so host * 100 / scale = 2.5 x host), the old 5 x stays the default for every other caller, and the minimums hold', () => {
  assert.equal(ENGRAVING_SCALE, 40); assert.equal(FIT_PAGE_FACTOR, 2.5);
  assert.equal(pageWidthFor(710, FIT_PAGE_FACTOR) * ENGRAVING_SCALE / 100, 710, 'natural size = the pane');
  assert.equal(pageWidthFor(710), 3550, 'the default is exactly what it was (5 x)');
  assert.equal(pageWidthFor(320, FIT_PAGE_FACTOR), 800, 'a 320 px pane');
  assert.equal(pageWidthFor(MIN_HOST_WIDTH_PX, FIT_PAGE_FACTOR), VEROVIO_MIN_PAGE_WIDTH, 'never under Verovio\'s minimum');
  assert.equal(pageWidthFor(5, FIT_PAGE_FACTOR), 2100, 'a host not laid out yet: the default page');
  const verovio = fs.readFileSync(path.join(ROOT, 'src/verovio.ts'), 'utf8');
  assert.match(verovio, /pageWidthFor\(hostWidthPx, fit \? FIT_PAGE_FACTOR : 5\)/); assert.match(verovio, /scale: ENGRAVING_SCALE/);
  assert.match(fs.readFileSync(path.join(ROOT, 'src/music-edition.full.ts'), 'utf8'), /hostWidth - COMPACT_SCORE_INSET_PX\) : hostWidth, \{ noHeader: opts\.compact === true, fit: opts\.compact === true \}/);
  assert.equal(COMPACT_SCORE_INSET_PX, 16, 'the 8 px of padding each side of .forge-output-musicxml, the box a compact Score sits in (styles.css)');
  assert.match(fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8'), /\.forge-output-musicxml \{[^}]*padding: 8px;/s);
});

function page(width = 700) {
  const win: any = new Window({ url: 'http://localhost/' });
  const doc = win.document;
  let w = width;
  Object.defineProperty(win.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return this.classList?.contains(SCORE_HOST_CLASS) ? w : 0; } });
  const observers: Array<() => void> = [];
  win.ResizeObserver = class { cb: () => void; constructor(cb: () => void) { this.cb = cb; observers.push(cb); } observe() {} disconnect() { const i = observers.indexOf(this.cb); if (i >= 0) observers.splice(i, 1); } };
  const body = doc.createElement('div'); body.className = 'forge-chat-body'; doc.body.appendChild(body);
  let top = 0; const room = { scrollHeight: 2000, clientHeight: 400 };
  Object.defineProperty(body, 'scrollHeight', { get: () => room.scrollHeight }); Object.defineProperty(body, 'clientHeight', { get: () => room.clientHeight });
  Object.defineProperty(body, 'scrollTop', { get: () => top, set: (v: number) => { top = v; } });
  const tab = doc.createElement('div'); body.appendChild(tab);
  return { win, doc, body, tab: tab as HTMLElement, setWidth: (n: number) => { w = n; }, fire: () => { for (const cb of [...observers]) cb(); }, setTop: (n: number) => { top = n; }, top: () => top, room, observers };
}
function area(pg: ReturnType<typeof page>, over: Partial<ScoreAreaPorts> = {}) {
  const drawn: Array<{ host: HTMLElement; payload: any }> = []; const timers: Array<{ fn: () => void; ms: number }> = []; let computes = 0;
  const p: ScoreAreaPorts = {
    renderInto: (host, payload) => { host.appendChild(host.ownerDocument.createElement('svg')); drawn.push({ host, payload }); return true; },
    stopPlayers: () => {},
    compute: async (_d, title) => { computes++; return { type: 'musicxml', content: `score-of-${title}` }; },
    title: 'bar_001', setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: (h) => { const i = Number(h) - 1; if (timers[i]) timers[i] = { fn: () => {}, ms: -1 }; },
    ...over,
  };
  const a = attachScoreArea(pg.tab, 'score', p)!;
  return { a, p, drawn, timers, computes: () => computes };
}
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 40; i++) await Promise.resolve(); };
const fireTimers = (t: Array<{ fn: () => void; ms: number }>) => { const due = t.splice(0).filter((x) => x.ms === RELAYOUT_DEBOUNCE_MS); for (const x of due) x.fn(); };

test('RELAYOUT: the Score on screen is engraved AGAIN (its own payload, no engine run) when the pane\'s width changes by 24 px or more, once, after a quiet moment; a smaller change (a scrollbar) and a height-only change do nothing', async () => {
  const pg = page(700); const { a, drawn, timers, computes } = area(pg);
  a.showNow(RHYTHM_STARTER); await settle();
  assert.equal(drawn.length, 1); assert.equal(computes(), 1);
  assert.equal(pg.observers.length, 1, 'the pane is observed');
  const settle1 = (): void => { pg.fire(); fireTimers(timers); };
  pg.setWidth(700 + RELAYOUT_MIN_DELTA_PX - 1); settle1(); await settle();
  assert.equal(drawn.length, 1, 'a scrollbar-sized change is ignored');
  pg.room.clientHeight = 300; settle1(); await settle();                                    // the dialog was resized: only the height changed, the width is what it was drawn for
  pg.setWidth(700); settle1(); await settle(); assert.equal(drawn.length, 1, 'no change, no redraw');
  pg.setWidth(380); pg.fire(); pg.fire(); pg.fire();                                         // a drag across widths: three events, ONE timer left alive after the debounce
  assert.equal(timers.filter((t) => t.ms === RELAYOUT_DEBOUNCE_MS).length >= 1, true);
  fireTimers(timers); await settle();
  assert.equal(drawn.length, 2, 'engraved again for the new width, once'); assert.equal(computes(), 1, 'no engine run: the same payload');
  assert.equal(drawn[1].payload, drawn[0].payload);
  assert.equal(drawn[1].host.classList.contains(SCORE_HOST_CLASS), true);
  pg.setWidth(900); settle1(); await settle(); assert.equal(drawn.length, 3, 'the right dock turning back to the bottom: wider again');
  a.dispose(); assert.equal(pg.observers.length, 0, 'disposed: the observer is gone');
});
test('RELAYOUT and the divider (0935): while the tab carries forge-chat-dragging the Score is NOT engraved again however many moves and quiet moments pass (zero re-engraves), and exactly ONE engraving follows the release', async () => {
  const pg = page(700); const { a, drawn, timers, computes } = area(pg);
  a.showNow(RHYTHM_STARTER); await settle(); assert.equal(drawn.length, 1);
  pg.doc.body.classList.add('forge-chat-dragging');                                          // the host of a tab (an ancestor of the Score's pane) while the handle is held
  for (let move = 0; move < 30; move++) { pg.setWidth(700 - move * 10); pg.fire(); if (move % 5 === 4) { fireTimers(timers); await settle(); } }
  fireTimers(timers); await settle();
  assert.equal(drawn.length, 1, 'zero re-engraves during the drag, even after quiet moments');
  pg.doc.body.classList.remove('forge-chat-dragging');
  fireTimers(timers); await settle();
  assert.equal(drawn.length, 2, 'ONE re-engrave after the release'); assert.equal(computes(), 1, 'no engine run'); assert.equal(pg.body.querySelectorAll(`.${SCORE_HOST_CLASS}`).length >= 1, true);
  fireTimers(timers); await settle(); assert.equal(drawn.length, 2, 'and nothing more');
  a.dispose();
});
test('RELAYOUT keeps the tab\'s scroll where it was, relative to its height: halfway down stays halfway down when the Score gets taller; nothing shown = no redraw', async () => {
  const pg = page(700); let draws = 0;
  const seen: unknown[] = [];
  const { a, drawn, timers } = area(pg, { renderInto: (host) => { host.appendChild(host.ownerDocument.createElement('svg')); if (++draws === 2) pg.room.scrollHeight = 3400; seen.push(1); return true; } });
  pg.fire(); fireTimers(timers); await settle(); assert.equal(seen.length, 0, 'nothing on screen yet: nothing to engrave again'); void drawn;
  a.showNow(RHYTHM_STARTER); await settle();
  pg.setTop(800);                                                                            // 800 of (2000 - 400) = half way
  pg.setWidth(380); pg.fire();                                                               // the narrower pane wraps into more systems: the second draw makes the body taller (3400)
  fireTimers(timers); await settle();
  assert.equal(seen.length, 2);
  assert.equal(pg.top(), 0.5 * (3400 - 400), 'the same relative place');
  a.dispose();
});

// ---- the inspector's box is off, its behaviour is not ---------------------------------------------------------------------------------------------------------------------
const KICK_BAR = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false] } };
const kickXml = (tag: string) => `<score-partwise><!--${tag}--><part id="P1"><measure number="1"><attributes><divisions>4</divisions></attributes><note><pitch><step>F</step><octave>4</octave></pitch><duration>8</duration></note><note><pitch><step>F</step><octave>4</octave></pitch><duration>8</duration></note></measure></part></score-partwise>`;
function inspectorArea(showInspector?: boolean) {
  const pg = page(); const posted: unknown[] = [];
  const { a } = area(pg, {
    compute: async (_d, title) => ({ type: 'musicxml', multi_staff_content: kickXml(String(title)), content: 'x' }),
    renderInto: (host, payload) => {
      const doc = host.ownerDocument; const svg = doc.createElement('svg');
      for (const m of String(payload.multi_staff_content).matchAll(/<note id="([^"]+)"/g)) { const g = doc.createElement('g'); g.setAttribute('class', 'note'); g.id = m[1]; svg.appendChild(g); }
      host.appendChild(svg); return true;
    },
    inspector: { noteId: 'bars/bar_001', openNote: () => {}, postHighlight: (t: unknown) => { posted.push(t); } },
    ...(showInspector === undefined ? {} : { showInspector }),
  });
  return { pg, a, posted };
}
test('SHOW_INSPECTOR off: no inspector box in the DOM (no title, body, notes, hint) and nothing said under the Score, but the inspector still RUNS: lighting bars highlights them exactly as with the box; on (or absent) = the box, as before', async () => {
  const on = inspectorArea(true), off = inspectorArea(false), absent = inspectorArea();
  for (const x of [on, off, absent]) { x.a.showNow(KICK_BAR); await settle(); }
  const box = (x: ReturnType<typeof inspectorArea>) => x.pg.tab.querySelectorAll('.forge-inspector-title, .forge-inspector-body, .forge-inspector-notes').length;
  assert.ok(box(on) > 0 && box(absent) > 0, 'non-vacuity: with the switch on (or absent) the box is there');
  assert.equal(box(off), 0, 'off: not on the page');
  assert.equal(off.pg.tab.querySelector('.forge-rhythm-edit-score-quiet')?.textContent ?? '', '', 'off: no sentence under the Score either');
  for (const x of [on, off]) x.a.gridHover({ channel: 'kick', step: 0 });                       // the grid lights the engraved note (the inspector's own behaviour)
  const hot = (x: ReturnType<typeof inspectorArea>) => x.pg.doc.getElementById('a_kick_0')?.getAttribute('class') ?? '';
  assert.match(hot(on), /forge-artifact-hot/); assert.equal(hot(off), hot(on), 'the highlight is the same with the box off');
  for (const x of [on, off]) x.pg.doc.getElementById('a_kick_8')!.dispatchEvent(new x.pg.win.MouseEvent('click', { bubbles: true }));       // a click on a bar PINS it
  const pinned = (x: ReturnType<typeof inspectorArea>) => x.pg.doc.getElementById('a_kick_8')?.getAttribute('class') ?? '';
  assert.match(pinned(on), /forge-artifact-pinned/); assert.equal(pinned(off), pinned(on), 'the pin looks the same with the box off');
  assert.ok(/kick/.test(on.pg.tab.textContent ?? ''), 'on: the box says what was pinned'); assert.ok(!/kick — step/.test(off.pg.tab.textContent ?? ''), 'off: nothing is written about it');
});
test('the headless wiring is still pinned: the Beat Box tab keeps its own `headless`; the new default lives only in live-score-dom.ts (showInspector === false)', () => {
  const t = fs.readFileSync(path.join(ROOT, 'src/live-score-dom.ts'), 'utf8');
  assert.match(t, /ports\.showInspector === false && ports\.inspector\.headless !== true/);
});

// ---- the status line under the box is the legacy view ------------------------------------------------------------------------------------------------------------------------------
test('the status line under the prompt box: shown when `showBoxStatus` is absent or true (every older test), never drawn when it is false (the dialog says the outcome); a clear always goes through; the dialog and the busy line are untouched', async () => {
  const win: any = new Window({ url: 'http://localhost/' });
  const EXT: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 };
  const run = async (showBoxStatus?: () => boolean) => {
    const store = new Map<string, string>([['phrases/phrase_001.md', noteContentFor('phrase_001', EXT)]]);
    const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
    const ports: DescriptionPorts = {
      read: async (p) => store.get(p)!, process: async (p, fn) => { store.set(p, fn(store.get(p)!)); },
      vault: () => ({ bars: ['bar_007'], phrases: ['phrase_001'], arrangements: [], compositions: [], kits: [] }), barNames: () => ['bar_007'], phraseNames: () => ['phrase_001'],
      setTimer: () => 1, clearTimer: () => {}, trace: () => {}, panes: () => panes,
      ...(showBoxStatus ? { showBoxStatus } : {}),
    };
    const ctl = createDescriptionController(ports);
    const el = win.document.createElement('div'); win.document.body.appendChild(el); panes.push({ path: 'phrases/phrase_001.md', contentEl: el, tab: true });
    await ctl.inspect('phrases/phrase_001.md'); for (let i = 0; i < 40; i++) await Promise.resolve();
    const field = el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
    field.value = 'Extend [[bar_007]] to 6 bars, repeating with fills.'; field.dispatchEvent(new win.Event('input', { bubbles: true }));
    for (let n = 0; n < 2; n++) { field.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); for (let i = 0; i < 40; i++) await Promise.resolve(); }       // 2026-11-17-2001: the first Enter previews, the second applies
    return { status: (el.querySelector('.forge-composer-error') as HTMLElement).textContent ?? '', said: [...el.querySelectorAll('.forge-chat-msg')].map((m: any) => m.getAttribute('data-kind')) };
  };
  const shown = await run(), alsoShown = await run(() => true), hidden = await run(() => false);
  assert.equal(shown.status, 'Applied.'); assert.equal(alsoShown.status, 'Applied.');
  assert.equal(hidden.status, '', 'off: the line is not drawn');
  assert.deepEqual(hidden.said, ['you', 'suggestion', 'applied'], 'the dialog says it: the sentence, the preview, the outcome');
  assert.deepEqual(shown.said, hidden.said);
});
test('WIRING: score-first.ts reads the legacy switch for the status line (the plugin\'s own default for `showBoxStatus`)', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'src/score-first.ts'), 'utf8'), /showBoxStatus: hooks\.showBoxStatus \?\? \(\(\) => uiFlags\(\)\.showLegacyControllers\)/);
});

test('2026-11-20-1002: readUiFlags takes previewBeforeApplying only as a real boolean; a stored OLD `composerAutoApply` (every install saved false) is ignored, so no install stays on the two Enters by accident', () => {
  assert.equal(readUiFlags({ previewBeforeApplying: true }).previewBeforeApplying, true);
  for (const junk of ['true', 1, null, undefined]) assert.equal(readUiFlags({ previewBeforeApplying: junk }).previewBeforeApplying, false, String(junk));
  assert.equal(readUiFlags({ composerAutoApply: false } as never).previewBeforeApplying, false); assert.equal(readUiFlags({ composerAutoApply: true } as never).previewBeforeApplying, false);
  assert.equal(composerAutoApplyOf(readUiFlags({ composerAutoApply: false } as never)), true, 'an old saved false applies at once now');
});
