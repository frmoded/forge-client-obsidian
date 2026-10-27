// score_first M6 (drain 2026-10-22-1950) — the phrase tab's inspector, on the surface a person uses: happy-dom, the real mountPhrase + live Score area + the REUSED bar inspector (score-inspector.ts),
// a fake renderer that draws `g.measure` elements with the ids found in the annotated MusicXML (as Verovio does, measured in real Chrome), a fake vault. Click a bar -> the stack; click the links ->
// the notes open; hover -> the fan; the bracket; the source link. Without the `inspector` port the tab is exactly the M5 tab (phrase-dom.test.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import type { PhraseParams } from './phrase-core.ts';
import { LIVE_SCORE_DEBOUNCE_MS } from './live-score-core.ts';

const PATH = 'phrases/phrase_001.md';
const phraseText = (p: Partial<PhraseParams> = {}) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20, ...p }, null, 2)}\n\`\`\`\n`;
const BAR = `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array(16).fill(false) } })}\n\`\`\`\n`;
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const TEMPI = [100, 97, 94, 91, 89, 86, 83, 80];

/** What the engine returns for `bars` bars: two parts, a measure per bar per part, a tempo in each. */
const xmlFor = (bars: number, tempi: number[] = TEMPI) => {
  const part = (p: number) => `<part id="P${p}">${Array.from({ length: bars }, (_, i) => `<measure number="${i + 1}"><direction><sound tempo="${tempi[i] ?? 100}"/></direction><note><rest/><duration>16</duration></note></measure>`).join('')}</part>`;
  return `<score-partwise>${part(1)}${part(2)}</score-partwise>`;
};

function rig(opts: { phrase?: string; bar?: string | null; xml?: (bars: number) => string; inspector?: boolean; structure?: boolean; gotoHandled?: boolean } = {}) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([[PATH, opts.phrase ?? phraseText()]]);
  if (opts.bar !== null) files.set('bars/bar_005.md', opts.bar ?? BAR);
  const opened: string[] = [];
  const pins: Array<unknown> = [];
  const gotos: string[] = []; const traces: string[] = []; let navFn: ((path: string) => void) | null = null;
  let now = 0; const timers: Array<{ id: number; at: number; fn: () => void }> = []; let nextId = 1;
  const ports: PhraseMountPorts = {
    path: PATH, title: 'phrase_001', plan: 'score',
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async () => ({ ok: true }),
    compute: async (_d, params) => ({ type: 'musicxml', content: (opts.xml ?? xmlFor)(params.bars), multi_staff_content: (opts.xml ?? xmlFor)(params.bars), kit_content: xmlFor(params.bars).replace(/<part id="P2">[\s\S]*<\/part>/, '') }),
    // Verovio keeps the first part's measure ids as the ids of one `g.measure` per bar: the fake draws exactly that, plus a notehead inside each so a click can land on something that is not the group
    renderInto: (host, payload) => {
      const xml = String(payload.multi_staff_content);
      const first = /<part id="P1">([\s\S]*?)<\/part>/.exec(xml)![1];
      const ids = [...first.matchAll(/<measure number="\d+"(?: id="([^"]+)")?>/g)].map((m) => m[1] ?? '');
      host.innerHTML = `<svg>${ids.map((id) => `<g class="measure"${id ? ` id="${id}"` : ''}><g class="note" id="n_${id}"></g></g>`).join('')}</svg>`;
      host.querySelectorAll('g.measure').forEach((g: any, i: number) => { g.getBBox = () => ({ x: 100 * i, y: 0, width: 90, height: 50 }); });   // a drawn measure has a box
      return true;
    },
    stopPlayers: () => {},
    setTimer: (fn, ms) => { const id = nextId++; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    inspector: opts.inspector === false ? undefined : { openNote: (id) => { opened.push(id); }, onPin: (p) => { pins.push(p); } },
    structure: opts.structure ? { goto: async (id) => { gotos.push(id); return opts.gotoHandled ?? true; }, onNotesNavigated: (fn) => { navFn = fn; return () => { navFn = null; }; }, trace: (line) => { traces.push(line); } } : undefined,
  };
  const handle = mountPhrase(parent, ports);
  const advance = async (ms: number) => { now += ms; for (;;) { const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); } await flush(); };
  const q = (sel: string) => parent.querySelector(sel) as any;
  const qa = (sel: string) => [...parent.querySelectorAll(sel)] as any[];
  const fire = (el: any, type: string, init: any = {}) => el.dispatchEvent(new win.MouseEvent(type, { bubbles: true, ...init }));
  const stack = () => qa('.forge-inspector-lineage > li').filter((li) => li.querySelector('span')).map((li) => li.querySelector('span').textContent);   // M9: an action line is a button, not a text line
  return { handle, parent, files, opened, pins, gotos, traces, navigate: (path: string) => navFn?.(path), q, qa, fire, stack, advance, win, status: () => q('.forge-rhythm-edit-score-status').textContent as string };
}

test('every bar of the Score is a measure with an id the map knows: ph_bar_1 .. ph_bar_8', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  assert.deepEqual(r.qa('g.measure').map((g) => g.id), [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `ph_bar_${n}`));
});

test('CLICK A BAR: the stack reads bar 5 of 8 | made by phrase_001 (extend, slowing 20 %, style repeat_with_fills) | from bar_005 | tempo 89 (the engine\'s tempo for that bar)', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  assert.match(r.q('.forge-inspector-body').textContent, /^Click a bar to see where it came from\./);
  r.fire(r.q('#n_ph_bar_5'), 'click');                           // a click on the notehead inside the bar still selects the BAR
  assert.deepEqual(r.stack(), ['bar 5 of 8', 'made by phrase_001 (extend, slowing 20 %, style repeat_with_fills)', 'from bar_005', 'tempo 89']);
  assert.ok(r.q('#ph_bar_5').classList.contains('forge-artifact-pinned'));
});

test('the two links open their notes: the phrase entry opens phrase_001, the bar entry opens bar_005; each button has its own accessible name', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  r.fire(r.q('#ph_bar_3'), 'click');
  const buttons = r.qa('.forge-inspector-lineage button.forge-inspector-open');
  assert.deepEqual(buttons.map((b) => b.getAttribute('aria-label')), ['Open phrase_001', 'Open bar_005']);
  buttons[0].click(); buttons[1].click();
  assert.deepEqual(r.opened, ['phrases/phrase_001', 'bars/bar_005']);
});

test('HOVER A BAR with nothing pinned shows its stack (a preview), leaving restores the hint; a pinned bar is not replaced by hovering another', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  r.fire(r.q('#ph_bar_2'), 'mouseover');
  assert.equal(r.stack()[0], 'bar 2 of 8');
  assert.ok(r.q('.forge-inspector-lineage').classList.contains('forge-inspector-preview'));
  r.fire(r.q('#ph_bar_2'), 'mouseout', { relatedTarget: r.parent });
  assert.match(r.q('.forge-inspector-body').textContent, /^Click a bar/);
  r.fire(r.q('#ph_bar_4'), 'click');
  r.fire(r.q('#ph_bar_6'), 'mouseover');
  assert.equal(r.stack()[0], 'bar 4 of 8', 'the pinned bar stays');
});

test('THE FAN: hovering "from bar_005" or "made by phrase_001" lights every bar; hovering "bar 5 of 8" or the tempo lights only that bar; leaving clears', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  r.fire(r.q('#ph_bar_5'), 'click');
  const lis = r.qa('.forge-inspector-lineage > li');
  const hot = () => r.qa('g.measure.forge-artifact-hot').map((g) => g.id);
  r.fire(lis[2], 'mouseenter');
  assert.equal(hot().length, 8, 'the source covers all eight bars');
  r.fire(lis[2], 'mouseleave');
  assert.deepEqual(hot(), []);
  r.fire(lis[1], 'mouseenter');
  assert.equal(hot().length, 8, 'the phrase covers all eight bars');
  r.fire(lis[1], 'mouseleave');
  r.fire(lis[0], 'mouseenter');
  assert.deepEqual(hot(), ['ph_bar_5']);
  r.fire(lis[0], 'mouseleave');
  r.fire(lis[3], 'mouseenter');
  assert.deepEqual(hot(), ['ph_bar_5']);
  r.fire(lis[3], 'mouseleave');
  assert.deepEqual(hot(), []);
});

test('THE BRACKET over the bars: labelled with the phrase and its bar count; hover or focus lights all bars; a click or Enter opens the phrase note', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  const b = r.q('.forge-phrase-bracket');
  assert.equal(b.textContent, 'phrase_001 · 8 bars');
  assert.equal(b.getAttribute('role'), 'button'); assert.equal(b.getAttribute('tabindex'), '0');
  assert.ok(b.getAttribute('aria-label'));
  r.fire(b, 'mouseenter');
  assert.equal(r.qa('g.measure.forge-artifact-hot').length, 8);
  r.fire(b, 'mouseleave');
  assert.equal(r.qa('g.measure.forge-artifact-hot').length, 0);
  b.dispatchEvent(new r.win.Event('focus')); assert.equal(r.qa('g.measure.forge-artifact-hot').length, 8);
  b.dispatchEvent(new r.win.Event('blur')); assert.equal(r.qa('g.measure.forge-artifact-hot').length, 0);
  r.fire(b, 'click');
  b.dispatchEvent(new r.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  b.dispatchEvent(new r.win.KeyboardEvent('keydown', { key: 'x', bubbles: true }));
  assert.deepEqual(r.opened, ['phrases/phrase_001', 'phrases/phrase_001']);
  assert.equal(b.previousElementSibling.className, 'forge-phrase-controls', 'the bracket sits between the strip and the Score');
});

test('a one-bar phrase says "1 bar"; a phrase the tab cannot read has no bracket', async () => {
  const r = rig({ phrase: phraseText({ bars: 1 }) });
  await r.handle.load(); await flush();
  assert.equal(r.q('.forge-phrase-bracket').textContent, 'phrase_001 · 1 bar');
  const bad = rig({ phrase: phraseText({ bars: 99 }) });
  await bad.handle.load(); await flush();
  assert.equal(bad.q('.forge-phrase-bracket').style.display, 'none');
});

test('FROM THE PHRASE BACK: the source in the strip is a link to bar_005 with its own accessible name; invalid phrase: the link is disabled', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  const link = r.q('.forge-phrase-source');
  assert.equal(link.tagName, 'BUTTON'); assert.equal(link.textContent, 'bar_005'); assert.equal(link.getAttribute('aria-label'), 'Open bar_005');
  link.click();
  assert.deepEqual(r.opened, ['bars/bar_005']);
  const bad = rig({ phrase: phraseText({ bars: 99 }) });
  await bad.handle.load(); await flush();
  assert.equal(bad.q('.forge-phrase-source').disabled, true);
});

test('KEYBOARD: arrow keys walk the bars, Esc lets go (the bar inspector\'s keys, unchanged)', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  const host = r.q('.forge-rhythm-score-host');
  const key = (k: string) => host.dispatchEvent(new r.win.KeyboardEvent('keydown', { key: k, bubbles: true }));
  key('ArrowRight'); assert.equal(r.stack()[0], 'bar 1 of 8');
  key('ArrowRight'); key('ArrowRight'); assert.equal(r.stack()[0], 'bar 3 of 8');
  key('ArrowLeft'); assert.equal(r.stack()[0], 'bar 2 of 8');
  key('Escape'); assert.match(r.q('.forge-inspector-body').textContent, /^Click a bar/);
});

test('A REFUSAL shows no lineage: a missing source keeps the Score line and clears the stack; a Score whose bars cannot be tied says why instead of guessing', async () => {
  const gone = rig({ bar: null });
  await gone.handle.load(); await flush();
  assert.match(gone.status(), /^Phrase: the source bar bar_005 .*not found/);
  assert.equal(gone.qa('g.measure').length, 0);
  const wrong = rig({ xml: (bars) => xmlFor(bars - 1) });
  await wrong.handle.load(); await flush();
  assert.match(wrong.q('.forge-inspector-body').textContent, /could not be mapped to its note, so it cannot be inspected \(the Score has 7 bars but the phrase asks for 8\)/);
  wrong.fire(wrong.q('g.measure'), 'click');
  assert.equal(wrong.qa('.forge-inspector-lineage').length, 0, 'nothing is guessed');
});

test('FRESHNESS: a changed parameter redraws and the stack follows the NEW phrase (bars, percentage); the pin does not survive onto a bar that no longer exists', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  r.fire(r.q('#ph_bar_5'), 'click');
  r.files.set(PATH, phraseText({ bars: 4, tempo_change_pct: 30 }));
  r.handle.noteModified(PATH); await flush(); await r.advance(LIVE_SCORE_DEBOUNCE_MS);
  assert.deepEqual(r.qa('g.measure').map((g) => g.id), ['ph_bar_1', 'ph_bar_2', 'ph_bar_3', 'ph_bar_4']);
  r.fire(r.q('#ph_bar_2'), 'click');
  assert.deepEqual(r.stack().slice(0, 2), ['bar 2 of 4', 'made by phrase_001 (extend, speeding up 30 %, style repeat_with_fills)']);
  assert.equal(r.q('.forge-phrase-bracket').textContent, 'phrase_001 · 4 bars');
});

test('WITHOUT the inspector port the tab is exactly the M5 tab: no bracket, no inspector, the source is plain text, bars carry no ids', async () => {
  const r = rig({ inspector: false });
  await r.handle.load(); await flush();
  assert.equal(r.q('.forge-phrase-bracket'), null);
  assert.equal(r.q('.forge-inspector'), null);
  assert.equal(r.q('.forge-phrase-source').tagName, 'SPAN');
  assert.deepEqual(r.qa('g.measure').map((g) => g.id), ['', '', '', '', '', '', '', '']);
});

test('dispose removes the bracket and the inspector with the rest', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  r.handle.dispose();
  assert.equal(r.parent.children.length, 0);
});

test('P3: the BAR inspector (no phrase options) is exactly what it was: its hint, its lineage (a hit, then the note), plain "Open note" buttons with no aria-label, no hover-link on its entries, no preview on hover', async () => {
  const { createScoreInspector, INSPECTOR_HINT } = await import('./score-inspector.ts');
  const win: any = new Window({ url: 'http://localhost/' });
  const doc = win.document;
  const slot = doc.createElement('div'); const host = doc.createElement('div');
  doc.body.append(slot, host);
  host.innerHTML = '<svg><g class="note" id="a_kick_0"></g></svg>';
  const opened: string[] = [];
  const insp = createScoreInspector(slot, { noteId: 'bars/bar_001', openNote: (id) => opened.push(id), postHighlight: () => {} });
  const map = { a_kick_0: { noteId: 'bars/bar_001', role: 'hit', params: { channel: 'kick', step: 0, beat: 'beat 1' } } };
  insp.onShown(host, { payload: {}, map, problems: [], kitProblems: [] });
  assert.equal(slot.querySelector('.forge-inspector-body').textContent, INSPECTOR_HINT);
  host.querySelector('#a_kick_0').dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
  assert.equal(slot.querySelector('.forge-inspector-body').textContent, INSPECTOR_HINT, 'hovering shows no preview in the bar tab');
  host.querySelector('#a_kick_0').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const lis = [...slot.querySelectorAll('.forge-inspector-lineage > li')] as any[];
  assert.deepEqual(lis.map((l) => l.className), ['forge-inspector-hit', 'forge-inspector-note']);
  assert.equal(lis[0].querySelector('span').textContent, 'kick — step 1 (beat 1)');
  const button = slot.querySelector('button.forge-inspector-open') as any;
  assert.equal(button.textContent, 'Open note'); assert.equal(button.hasAttribute('aria-label'), false);
  const hotBefore = host.querySelectorAll('.forge-artifact-hot').length;          // the pinned note itself may be hot from the pointer that clicked it
  lis[1].dispatchEvent(new win.MouseEvent('mouseenter'));
  assert.equal(host.querySelectorAll('.forge-artifact-hot').length, hotBefore, 'no hover-link on the bar\'s entries');
  button.click(); assert.deepEqual(opened, ['bars/bar_001']);
});


test('2300: the phrase tab lights bars with the BAND (visible whatever the stylesheet or theme does): a pin, a hover and the fan each put a band in the right bars, and the others are dimmed while one is pinned', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  const bands = () => r.qa('.forge-artifact-band').map((b: any) => b.parentElement.id);
  r.fire(r.q('#ph_bar_3'), 'mouseover');
  assert.deepEqual(bands(), ['ph_bar_3'], 'hover');
  r.fire(r.q('#n_ph_bar_3'), 'click');
  assert.deepEqual(bands(), ['ph_bar_3'], 'pin');
  assert.equal(r.q('#ph_bar_1').style.opacity, '0.45');
  assert.equal(r.q('#ph_bar_3').style.opacity, '');
  const lis = r.qa('.forge-inspector-lineage > li');
  r.fire(lis[2], 'mouseenter');
  assert.equal(bands().length, 8, 'the fan: every bar');
  r.fire(lis[2], 'mouseleave');
  assert.deepEqual(bands(), ['ph_bar_3']);
  const b = r.q('.forge-phrase-bracket'); r.fire(b, 'mouseenter');
  assert.equal(bands().length, 8, 'the bracket');
});

test('2300 P3: the BAR inspector (no band option) inserts no band and dims nothing', async () => {
  const { createScoreInspector } = await import('./score-inspector.ts');
  const win: any = new Window({ url: 'http://localhost/' });
  const doc = win.document; const slot = doc.createElement('div'); const host = doc.createElement('div'); doc.body.append(slot, host);
  host.innerHTML = '<svg><g class="note" id="a_kick_0"></g><g class="note" id="a_snare_4"></g></svg>';
  host.querySelectorAll('g').forEach((g: any) => { g.getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 }); });
  const insp = createScoreInspector(slot, { noteId: 'bars/bar_001', openNote: () => {}, postHighlight: () => {} });
  const map = { a_kick_0: { noteId: 'bars/bar_001', role: 'hit', params: { channel: 'kick', step: 0, beat: 'beat 1' } }, a_snare_4: { noteId: 'bars/bar_001', role: 'hit', params: { channel: 'snare', step: 4, beat: 'beat 2' } } };
  insp.onShown(host, { payload: {}, map, problems: [], kitProblems: [] });
  host.querySelector('#a_kick_0').dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
  host.querySelector('#a_kick_0').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.equal(host.querySelectorAll('.forge-artifact-band').length, 0);
  assert.equal((host.querySelector('#a_snare_4') as any).style.opacity, '');
});

// ---- M12 (drain 2026-10-26-1250): the pin is told to the tab, so a notes pane can follow it ---------------------------------------------------------------------------------------------------

test('M12: pinning a bar tells the tab which note made it (the source bar of an extend, "pinned bar N"); Esc tells it the pin is gone (null)', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  assert.deepEqual(r.pins, [], 'a Score drawn with nothing pinned says nothing new');
  r.fire(r.q('#n_ph_bar_5'), 'click');
  assert.deepEqual(r.pins, [{ noteId: 'bars/bar_005', reason: 'pinned bar 5' }]);
  r.fire(r.q('#ph_bar_2'), 'click');
  assert.deepEqual(r.pins.at(-1), { noteId: 'bars/bar_005', reason: 'pinned bar 2' });
  r.q('.forge-rhythm-score-host').dispatchEvent(new r.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(r.pins.at(-1), null, 'released');
  r.q('.forge-rhythm-score-host').dispatchEvent(new r.win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.deepEqual(r.pins.at(-1), { noteId: 'bars/bar_005', reason: 'pinned bar 1' }, 'the arrow keys walk the pin: the notes pane follows');
});

test('M12: a redraw that forgets the pin (an extend redraws without keeping it) tells the tab the pin is gone, so the notes pane goes home instead of staying on a bar that is no longer pinned', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  r.fire(r.q('#ph_bar_3'), 'click');
  const before = r.pins.length;
  await r.handle.noteModified('bars/bar_005.md'); await r.advance(1500);
  assert.equal(r.pins.length > before, true, 'the redraw said something');
  assert.equal(r.pins.at(-1), null);
});

test('M12: without the onPin port the tab is exactly what it was (the pin works, nothing is told)', async () => {
  const r = rig({ inspector: true });
  await r.handle.load(); await flush();
  r.fire(r.q('#ph_bar_3'), 'click');
  assert.equal(r.stack()[0], 'bar 3 of 8');
});

// ---- M13 (drain 2026-10-26-1270): the structure strip above the Score ------------------------------------------------------------------------------------------------------------------------

const hotBars = (r: any) => r.qa('g.measure.forge-artifact-hot').map((g: any) => g.id);
const chipTexts = (r: any) => r.qa('.forge-structure-strip button').map((b: any) => b.textContent);

test('M13: with the structure port the phrase tab has a strip ABOVE the Score naming bar_005 -> phrase_001 extend 8 bars; without the port there is no strip at all (the tab is what it was)', async () => {
  const r = rig({ structure: true });
  await r.handle.load(); await flush();
  assert.deepEqual(chipTexts(r), ['bar_005', 'phrase_001 extend 8 bars']);
  const strip = r.q('.forge-structure-strip'), score = r.q('.forge-rhythm-score-host');
  assert.ok(strip.compareDocumentPosition(score) & 4, 'the strip comes before the Score in the DOM');
  const plain = rig();
  await plain.handle.load(); await flush();
  assert.equal(plain.q('.forge-structure-strip'), null);
});

test('M13: hovering the source chip lights the bars it contributed to (all eight of an extend), the phrase chip lights all; leaving clears; keyboard focus does the same', async () => {
  const r = rig({ structure: true });
  await r.handle.load(); await flush();
  const [src, phrase] = r.qa('.forge-structure-strip button');
  r.fire(src, 'mouseenter'); assert.equal(hotBars(r).length, 8);
  r.fire(src, 'mouseleave'); assert.deepEqual(hotBars(r), []);
  r.fire(phrase, 'mouseenter'); assert.equal(hotBars(r).length, 8);
  r.fire(phrase, 'mouseleave'); assert.deepEqual(hotBars(r), []);
  src.dispatchEvent(new r.win.Event('focus')); assert.equal(hotBars(r).length, 8);
  src.dispatchEvent(new r.win.Event('blur')); assert.deepEqual(hotBars(r), []);
});

test('M13: a chip click goes to the notes pane (goto); with no pair (goto answers false) the plugin\'s own opener opens the note', async () => {
  const r = rig({ structure: true });
  await r.handle.load(); await flush();
  r.qa('.forge-structure-strip button')[0].click(); await flush();
  assert.deepEqual(r.gotos, ['bars/bar_005']); assert.deepEqual(r.opened, []);
  const none = rig({ structure: true, gotoHandled: false });
  await none.handle.load(); await flush();
  none.qa('.forge-structure-strip button')[1].click(); await flush();
  assert.deepEqual(none.opened, ['phrases/phrase_001']);
});

test('M13: the notes pane navigated by the person lights the bars that note contributed and KEEPS them lit (hover on and off a chip does not clear them) until the next navigation; a stranger note clears; one evidence line each', async () => {
  const r = rig({ structure: true });
  await r.handle.load(); await flush();
  r.navigate('bars/bar_005.md');
  assert.equal(hotBars(r).length, 8);
  const [src] = r.qa('.forge-structure-strip button');
  r.fire(src, 'mouseenter'); r.fire(src, 'mouseleave');
  assert.equal(hotBars(r).length, 8, 'still lit after a hover came and went');
  r.navigate('notes/other.md'); assert.deepEqual(hotBars(r), []);
  r.navigate('phrases/phrase_001.md'); assert.equal(hotBars(r).length, 8, 'this phrase\'s own note lights all of its bars');
  r.navigate('phrases/phrase_009.md'); assert.deepEqual(hotBars(r), [], 'another phrase lights nothing here');
  assert.deepEqual(r.traces, [
    '[forge-strip] note pane -> bars/bar_005.md lights bars 1, 2, 3, 4, 5, 6, 7, 8', '[forge-strip] note pane -> notes/other.md lights bars none',
    '[forge-strip] note pane -> phrases/phrase_001.md lights bars 1, 2, 3, 4, 5, 6, 7, 8', '[forge-strip] note pane -> phrases/phrase_009.md lights bars none',
  ]);
});

test('M13: pinning a bar emphasises the chip of the note that made it; Esc clears it', async () => {
  const r = rig({ structure: true });
  await r.handle.load(); await flush();
  const on = () => r.qa('.forge-structure-chip-on').map((b: any) => b.dataset.note);
  r.fire(r.q('#ph_bar_3'), 'click'); assert.deepEqual(on(), ['bars/bar_005']);
  r.q('.forge-rhythm-score-host').dispatchEvent(new r.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.deepEqual(on(), []);
});

test('M13: the strip follows the note: a new Bars count in the json is a new chip text', async () => {
  const r = rig({ structure: true });
  await r.handle.load(); await flush();
  r.files.set(PATH, phraseText({ bars: 4 } as any));
  await r.handle.noteModified(PATH); await r.advance(1500);
  assert.deepEqual(chipTexts(r), ['bar_005', 'phrase_001 extend 4 bars']);
});

// 2026-10-27-1000 (hardening of the 1800 rule, through the REAL surfaces): the phrase Score keeps a pin when the player or a button inside its host is clicked (the notes pane is never told), and the bar inspector - the same
// inspector code, shared with every vault - lets go of it exactly as it did before 1800 (P3).
test('1800 through the phrase tab: pin bar 3, click the player, a zoom button and a plain button inside the Score host: the pin stays and the tab is told nothing more; empty Score space still lets go', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  const host = r.q('.forge-rhythm-score-host');
  const doc = r.win.document;
  const player = doc.createElement('midi-player'); host.appendChild(player);
  const zoom = doc.createElement('button'); zoom.className = 'forge-zoom-button'; host.appendChild(zoom);
  r.fire(r.q('#ph_bar_3'), 'click');
  const told = r.pins.length;
  assert.deepEqual(r.qa('.forge-artifact-pinned').map((e: any) => e.id), ['ph_bar_3']);
  r.fire(player, 'click'); r.fire(zoom, 'click');
  assert.deepEqual(r.qa('.forge-artifact-pinned').map((e: any) => e.id), ['ph_bar_3'], 'still pinned');
  assert.equal(r.pins.length, told, 'the notes pane heard nothing');
  r.fire(r.q('svg'), 'click', { clientX: 5000, clientY: 5000 });
  assert.equal(r.pins.at(-1), null, 'a click on empty Score space still lets go');
});

test('1800 P3 through the bar inspector: a click on a button inside its host releases the pin, as before 1800', async () => {
  const { createScoreInspector } = await import('./score-inspector.ts');
  const win: any = new Window({ url: 'http://localhost/' });
  const doc = win.document;
  const slot = doc.createElement('div'); const host = doc.createElement('div');
  doc.body.append(slot, host);
  host.innerHTML = '<svg><g class="note" id="a_kick_0"></g></svg>';
  const pinned: Array<string | null> = [];
  const insp = createScoreInspector(slot, { noteId: 'bars/bar_001', openNote: () => {}, postHighlight: () => {}, onPinned: (e: any) => pinned.push(e ? e.id : null) });
  const map = { a_kick_0: { noteId: 'bars/bar_001', role: 'hit', params: { channel: 'kick', step: 0, beat: 'beat 1' } } };
  insp.onShown(host, { payload: {}, map, problems: [], kitProblems: [] });
  host.querySelector('#a_kick_0').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(pinned, ['a_kick_0']);
  const button = doc.createElement('button'); host.appendChild(button);
  button.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(pinned, ['a_kick_0', null], 'the click on a button let go of the pin');
});
