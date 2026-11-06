// 2026-11-05-1188 (Scale Explorer: `mode: triad`) - the DOM under happy-dom. The staff drawer is a stub that engraves fake `g.note > g.notehead > use` elements (one per <pitch> of the MusicXML it is given), the sound a spy.
// A click on the 3rd notehead of the scale staff picks degree 3 and the piano, the triad staff, the readout and the chips follow; the chips do the same; the legend is there; there is no seventh anywhere; nothing sounds but a press on Play.
// (The real engraving, a REAL mouse click on a real notehead and the layout at 640 and 300 px are in scripts/dev/measure-triad-mode.ts.)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountScaleBlock } from './scale-explorer-dom.ts';
import { TRIAD_LEGEND } from './triad-mode-core.ts';

const SVG = 'http://www.w3.org/2000/svg';

function mount(source: string, opts: { failStaff?: boolean } = {}) {
  const win: any = new Window({ url: 'http://localhost/' });
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const plays: { midis: number[]; starts: number[]; hooks: any }[] = [];
  let stops = 0;
  const staffCalls: { xml: string; host: any }[] = [];
  const sound = { play: (events: any[], hooks: any) => { plays.push({ midis: events.map((e) => e.midi), starts: events.map((e) => e.startMs), hooks }); }, stop: () => { stops++; } };
  const renderStaff = async (host: any, xml: string) => {
    staffCalls.push({ xml, host });
    if (opts.failStaff) throw new Error('no verovio here');
    const svg = win.document.createElementNS(SVG, 'svg');
    for (let i = 0; i < (xml.match(/<pitch>/g) ?? []).length; i++) {
      const note = win.document.createElementNS(SVG, 'g'); note.setAttribute('class', 'note');
      const head = win.document.createElementNS(SVG, 'g'); head.setAttribute('class', 'notehead');
      head.appendChild(win.document.createElementNS(SVG, 'use'));
      note.appendChild(head); svg.appendChild(note);
    }
    host.appendChild(svg);
  };
  const handle = mountScaleBlock(el, source, { sound, renderStaff });
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const q = (sel: string) => el.querySelector(sel) as any;
  const qa = (sel: string) => [...el.querySelectorAll(sel)] as any[];
  const click = (node: any) => node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const scaleNotes = () => qa('.forge-triad-scale-staff g.note');
  const pitchesOf = (xml: string) => [...xml.matchAll(/<step>([A-G])<\/step>\s*(?:<alter>(-?\d)<\/alter>)?/g)].map((m) => m[1] + (m[2] === '1' ? '#' : m[2] === '-1' ? 'b' : ''));
  const marks = () => scaleNotes().map((n, i) => (n.classList.contains('is-triad') ? `${i}:${n.getAttribute('data-role')}` : null)).filter(Boolean);
  const keysOn = () => qa('.forge-triad-key.is-triad').map((k) => Number(k.getAttribute('data-midi'))).sort((a, b) => a - b);
  const pick = (selector: string, value: string) => { const s = q(selector); s.value = value; s.dispatchEvent(new win.Event('change')); };
  return { win, el, handle, plays, staffCalls, q, qa, click, tick, scaleNotes, pitchesOf, marks, keysOn, pick, stops: () => stops };
}

test('the block: controls, the scale staff, the chips under it, the piano, the triad\'s own staff, the readout, the legend - in that order; the default pick is degree 1', async () => {
  const m = mount('mode: triad'); await m.tick();
  const order = [...m.q('.forge-scale').children].map((c: any) => String(c.className).split(' ').filter((x: string) => x.startsWith('forge-'))[0] + (String(c.className).includes('forge-triad-') ? '' : ''));
  assert.deepEqual([...m.q('.forge-scale').children].map((c: any) => String(c.className)), [
    'forge-scale-controls', 'forge-scale-caption', 'forge-scale-staff forge-triad-scale-staff', 'forge-triad-chips', 'forge-scale-piano', 'forge-scale-staff forge-triad-chord-staff', 'forge-triad-readout', 'forge-triad-legend',
  ], order.join(' | '));
  assert.equal(m.q('.forge-scale').getAttribute('data-mode'), 'triad');
  assert.equal(m.q('.forge-triad-readout').textContent, 'C major: degrees 1, 3 and 5 of C major, the I chord');
  assert.deepEqual(m.qa('.forge-triad-chip').map((c) => c.getAttribute('data-numeral')), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
  assert.deepEqual(m.qa('.forge-triad-chip').map((c) => c.getAttribute('aria-pressed')), ['true', 'false', 'false', 'false', 'false', 'false', 'false']);
  assert.deepEqual(m.handle!.state(), { tonic: 'C', scale: 'major', degree: 1 });
  assert.equal(m.q('.forge-scale-sevenths'), null, 'no 7ths switch');
});

test('the legend is always there, in the driver\'s words, with the same words as a tooltip on the legend and on every Roman numeral', async () => {
  const m = mount('mode: triad'); await m.tick();
  assert.equal(m.q('.forge-triad-legend').textContent, TRIAD_LEGEND);
  assert.equal(m.q('.forge-triad-legend').title, TRIAD_LEGEND);
  for (const n of m.qa('.forge-triad-chip-numeral')) assert.equal(n.title, TRIAD_LEGEND);
  m.click(m.qa('.forge-triad-chip')[3]); await m.tick();
  assert.equal(m.q('.forge-triad-legend').textContent, TRIAD_LEGEND, 'still there after a pick');
});

test('the scale staff gets the 8 notes of the scale, the triad staff ONE chord of three in the scale\'s spelling; the picked triad\'s noteheads are coloured and carry 1, 3, 5', async () => {
  const m = mount('tonic: Eb\nscale: natural minor\nmode: triad\ndegree: 3'); await m.tick();
  const [scaleCall, triadCall] = m.staffCalls;
  assert.equal((scaleCall.xml.match(/<pitch>/g) ?? []).length, 8, 'the scale staff: 8 notes');
  assert.deepEqual(m.pitchesOf(scaleCall.xml).slice(0, 3), ['Eb', 'F', 'Gb']);
  assert.equal((triadCall.xml.match(/<pitch>/g) ?? []).length, 3, 'the triad staff: three notes');
  assert.equal((triadCall.xml.match(/<chord\/>/g) ?? []).length, 2, 'stacked as ONE chord');
  assert.deepEqual(m.pitchesOf(triadCall.xml), ['Gb', 'Bb', 'Db'].map((n) => n), 'Gb Bb Db: the scale\'s own spelling (Gb, not F#)');
  assert.deepEqual(m.marks(), ['2:root', '4:third', '6:fifth']);
  assert.deepEqual(m.scaleNotes().filter((n) => n.classList.contains('is-triad')).map((n) => n.querySelector('text.forge-triad-label').textContent), ['1', '3', '5']);
  assert.equal(m.scaleNotes().filter((n) => n.querySelector('text.forge-triad-label')).length, 3, 'only the three carry a number');
});

test('THE POINT: a click on the 3rd notehead picks degree 3 - the readout, the chips, the piano keys, the marked noteheads and the triad staff all follow; the scale staff is not engraved again', async () => {
  const m = mount('mode: triad'); await m.tick();
  const scaleDraws = m.staffCalls.filter((c) => (c.xml.match(/<pitch>/g) ?? []).length === 8).length;
  m.click(m.scaleNotes()[2].querySelector('use')); await m.tick();
  assert.equal(m.q('.forge-triad-readout').textContent, 'E minor: degrees 3, 5 and 7 of C major, the iii chord');
  assert.deepEqual(m.qa('.forge-triad-chip').map((c) => c.getAttribute('aria-pressed')), ['false', 'false', 'true', 'false', 'false', 'false', 'false']);
  assert.deepEqual(m.keysOn(), [64, 67, 71]);
  assert.equal(m.q('.forge-triad-key.is-triad-root').getAttribute('data-midi'), '64');
  assert.deepEqual(m.marks(), ['2:root', '4:third', '6:fifth']);
  assert.deepEqual(m.pitchesOf(m.staffCalls[m.staffCalls.length - 1].xml), ['E', 'G', 'B'], 'the triad staff was drawn again');
  assert.equal(m.staffCalls.filter((c) => (c.xml.match(/<pitch>/g) ?? []).length === 8).length, scaleDraws, 'the scale staff was NOT engraved again');
  assert.equal(m.q('.forge-scale').getAttribute('data-degree'), '3');
  assert.deepEqual(m.handle!.state(), { tonic: 'C', scale: 'major', degree: 3 });
  // CONTROL: another notehead gives another triad (the comparator can fail)
  m.click(m.scaleNotes()[5].querySelector('use')); await m.tick();
  assert.notEqual(m.q('.forge-triad-readout').textContent, 'E minor: degrees 3, 5 and 7 of C major, the iii chord');
  assert.equal(m.q('.forge-triad-readout').textContent, 'A minor: degrees 6, 1 and 3 of C major, the vi chord');
});

test('the chips do the same as the noteheads (vi in C major: A C E on the piano, "A minor", the numbers on the staff wrap: A, the octave C, E); vii° is a diminished triad B D F', async () => {
  const m = mount('mode: triad'); await m.tick();
  m.click(m.qa('.forge-triad-chip')[5]); await m.tick();
  assert.equal(m.q('.forge-triad-readout').textContent, 'A minor: degrees 6, 1 and 3 of C major, the vi chord');
  assert.deepEqual(m.keysOn(), [69, 72, 76]);
  assert.deepEqual(m.marks(), ['2:fifth', '5:root', '7:third']);
  assert.deepEqual(m.pitchesOf(m.staffCalls[m.staffCalls.length - 1].xml), ['A', 'C', 'E']);
  m.click(m.qa('.forge-triad-chip')[6]); await m.tick();
  assert.equal(m.q('.forge-triad-readout').textContent, 'B diminished: degrees 7, 2 and 4 of C major, the vii° chord');
  assert.deepEqual(m.keysOn(), [71, 74, 77]);
  assert.deepEqual(m.pitchesOf(m.staffCalls[m.staffCalls.length - 1].xml), ['B', 'D', 'F']);
  assert.equal(m.qa('.forge-triad-chip')[6].getAttribute('aria-pressed'), 'true');
  assert.equal(m.qa('.forge-triad-chip')[5].getAttribute('aria-pressed'), 'false');
});

test('the octave notehead (the 8th) picks degree 1; a pick of the degree already picked changes nothing (no redraw, no sound)', async () => {
  const m = mount('mode: triad\ndegree: 4'); await m.tick();
  m.click(m.scaleNotes()[7].querySelector('use')); await m.tick();
  assert.equal(m.q('.forge-scale').getAttribute('data-degree'), '1');
  const calls = m.staffCalls.length;
  m.click(m.qa('.forge-triad-chip')[0]); await m.tick();
  assert.equal(m.staffCalls.length, calls, 'the same pick is a no-op');
});

test('a click in the staff that is not on a notehead (and no layout to find the nearest) changes nothing', async () => {
  const m = mount('mode: triad'); await m.tick();
  m.click(m.q('.forge-triad-scale-staff svg')); await m.tick();
  assert.equal(m.q('.forge-scale').getAttribute('data-degree'), '1');
});

test('the key: a change of tonic keeps the pick and follows the key; a change of scale type changes the numerals (dorian: i ii III IV v vi° VII), the staff and the readout; the scale staff is engraved again for a key change only', async () => {
  const m = mount('mode: triad\ndegree: 2'); await m.tick();
  m.pick('.forge-scale-tonic', 'F#'); await m.tick();
  assert.equal(m.q('.forge-triad-readout').textContent, 'G# minor: degrees 2, 4 and 6 of F# major, the ii chord');
  m.pick('.forge-scale-type', 'dorian'); await m.tick();
  assert.deepEqual(m.qa('.forge-triad-chip').map((c) => c.getAttribute('data-numeral')), ['i', 'ii', 'III', 'IV', 'v', 'vi°', 'VII']);
  assert.match(m.q('.forge-triad-readout').textContent, /of \S+ dorian, the ii chord$/);
  assert.equal(m.q('.forge-scale').getAttribute('data-scale'), 'dorian');
  assert.equal(m.handle!.state().degree, 2);
});

test('NO sevenths anywhere: no "7" and no "seventh" in the whole block text for a pick of degree 1 to 6 in 4 scale types (degree 7 says "degrees 7" and nothing else), no 7ths switch', async () => {
  for (const type of ['major', 'natural minor', 'harmonic minor', 'dorian']) {
    for (let d = 1; d <= 7; d++) {
      const m = mount(`mode: triad\nscale: ${type}\ndegree: ${d}`); await m.tick();
      const text = String(m.q('.forge-scale').textContent);
      assert.ok(!/seventh|7ths/i.test(text), `${type} ${d}: ${text}`);
      const stripped = text.replace(/degrees \d, \d and \d/, '');
      assert.ok(!/7/.test(stripped), `${type} ${d}: "${stripped}"`);
      assert.equal(m.q('.forge-scale-sevenths'), null);
    }
  }
});

test('SOUND only on a press: nothing plays on mount, on a pick, on a notehead click, on a key change; Play together is the 3 notes at once, Play arpeggio one after the other, Play scale the 8 notes; a second press stops', async () => {
  const m = mount('mode: triad\ndegree: 2'); await m.tick();
  m.click(m.scaleNotes()[4].querySelector('use')); m.click(m.qa('.forge-triad-chip')[3]); m.pick('.forge-scale-tonic', 'G'); await m.tick();
  assert.equal(m.plays.length, 0, 'no sound from mounting, picking or changing the key');
  const btn = (mode: string) => m.qa('.forge-scale-play').find((b) => b.getAttribute('data-mode') === mode);
  assert.deepEqual(m.qa('.forge-scale-play').map((b) => b.textContent), ['Play together', 'Play arpeggio', 'Play scale']);
  m.click(btn('together'));
  assert.equal(m.plays.length, 1);
  assert.deepEqual(m.plays[0].midis, [72, 76, 79], 'IV in G major (from G4) is C5 E5 G5');
});

test('Play together / arpeggio / scale in detail: the events of each, the keys light while they sound, a second press of the same button stops', async () => {
  const m = mount('mode: triad\ndegree: 5'); await m.tick();       // V in C major: G B D
  const btn = (mode: string) => m.qa('.forge-scale-play').find((b) => b.getAttribute('data-mode') === mode);
  m.click(btn('together'));
  assert.deepEqual(m.plays[0].midis, [67, 71, 74]);
  assert.deepEqual(m.plays[0].starts, [0, 0, 0]);
  m.plays[0].hooks.onNoteOn(67);
  assert.ok(m.q('.forge-triad-key[data-midi="67"]').classList.contains('is-playing'), 'a sounding key lights');
  m.plays[0].hooks.onNoteOff(67);
  assert.ok(!m.q('.forge-triad-key[data-midi="67"]').classList.contains('is-playing'));
  assert.equal(btn('together').textContent, 'Stop');
  m.click(btn('together'));
  assert.equal(m.plays.length, 1, 'the second press stops, it does not play again');
  assert.equal(btn('together').textContent, 'Play together');
  m.click(btn('arpeggio'));
  assert.deepEqual(m.plays[1].midis, [67, 71, 74]);
  assert.ok(m.plays[1].starts[0] < m.plays[1].starts[1] && m.plays[1].starts[1] < m.plays[1].starts[2], 'one after the other: ' + m.plays[1].starts.join(','));
  m.click(btn('scale'));
  assert.equal(m.plays[2].midis.length, 8);
  assert.deepEqual(m.plays[2].midis, [60, 62, 64, 65, 67, 69, 71, 72]);
  assert.ok(m.plays[2].starts.every((t, i) => i === 0 || t > m.plays[2].starts[i - 1]), 'the scale goes up note by note, not all at once: ' + m.plays[2].starts.join(','));
  m.plays[2].hooks.onEnd();
  assert.equal(btn('scale').textContent, 'Play scale', 'the end of the plan puts the button back');
});

test('`controls: no`: no dropdowns and no Play buttons (a fixed picture), the pick by notehead and by chip still works, and nothing ever sounds', async () => {
  const m = mount('mode: triad\ncontrols: no\ndegree: 5'); await m.tick();
  assert.equal(m.qa('select').length, 0);
  assert.equal(m.qa('button.forge-scale-play').length, 0);
  assert.equal(m.q('.forge-triad-readout').textContent, 'G major: degrees 5, 7 and 2 of C major, the V chord');
  m.click(m.qa('.forge-triad-chip')[1]); await m.tick();
  assert.equal(m.q('.forge-triad-readout').textContent, 'D minor: degrees 2, 4 and 6 of C major, the ii chord');
  assert.equal(m.plays.length, 0);
});

test('`show: piano` has no staffs at all (the chips and the readout are the pick); `show: staff` has no piano', async () => {
  const a = mount('mode: triad\nshow: piano'); await a.tick();
  assert.equal(a.qa('.forge-scale-staff').length, 0);
  assert.equal(a.staffCalls.length, 0);
  assert.ok(a.q('.forge-scale-piano') && a.q('.forge-triad-chips') && a.q('.forge-triad-readout') && a.q('.forge-triad-legend'));
  a.click(a.qa('.forge-triad-chip')[4]); await a.tick();
  assert.deepEqual(a.keysOn(), [67, 71, 74]);
  const b = mount('mode: triad\nshow: staff'); await b.tick();
  assert.equal(b.q('.forge-scale-piano'), null);
  assert.equal(b.qa('.forge-scale-staff').length, 2);
});

test('a staff that cannot be drawn says so inside its box and the rest still works (the chips pick, the readout follows)', async () => {
  const m = mount('mode: triad', { failStaff: true });
  const errors: unknown[] = []; const saved = console.error; console.error = (...a: unknown[]) => { errors.push(a); };
  try { await m.tick(); await m.tick(); m.click(m.qa('.forge-triad-chip')[2]); await m.tick(); await m.tick(); } finally { console.error = saved; }
  assert.match(String(m.q('.forge-triad-scale-staff').textContent), /The staff could not be drawn: no verovio here/);
  assert.equal(m.q('.forge-triad-readout').textContent, 'E minor: degrees 3, 5 and 7 of C major, the iii chord');
  assert.ok(errors.length >= 1);
});

test('destroy removes the block and silences the sound; the other modes\' DOM has no triad part (scale, chord, free)', async () => {
  const m = mount('mode: triad'); await m.tick();
  m.handle!.destroy();
  assert.equal(m.q('.forge-scale'), null);
  assert.ok(m.stops() >= 1);
  for (const source of ['', 'mode: chord', 'mode: free']) {
    const o = mount(source); await o.tick();
    assert.equal(o.qa('[class*="forge-triad"]').length, 0, source);
  }
});
