// 2026-11-17-2000 - the Score's one gentle row, the pure part: the tempo field (parsing, clamping, steps), the factor and the stretched note sequence, the words and the export list, the icons.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { iconIssues } from './music-ribbon-core.ts';
import {
  TEMPO_DEFAULT, TEMPO_MAX, TEMPO_MIN, TEMPO_STEP, TRANSPORT_ICONS, TRANSPORT_LABELS, clampTempo, clockAfterTempoChange, exportItems, formatTempo, parseTempoText, playPauseLabel, scaleSequenceTempo, scoreSecondsAt, stepTempo, tempoFactor,
} from './score-transport-core.ts';

test('tempo: the range is 50..200 percent in steps of 5, 100 is the default', () => {
  assert.deepEqual([TEMPO_MIN, TEMPO_MAX, TEMPO_STEP, TEMPO_DEFAULT], [50, 200, 5, 100]);
});

test('clampTempo: inside the range it rounds to a whole percent, outside it goes to the nearest end, a non-number is the default', () => {
  assert.equal(clampTempo(100), 100); assert.equal(clampTempo(103.4), 103); assert.equal(clampTempo(49), 50); assert.equal(clampTempo(0), 50); assert.equal(clampTempo(-5), 50); assert.equal(clampTempo(201), 200); assert.equal(clampTempo(9999), 200);
  assert.equal(clampTempo(NaN), 100); assert.equal(clampTempo(Infinity), 100);
});

test('stepTempo: the plus and minus buttons go to the next multiple of 5 in their direction, stop at both ends, and a typed odd value lands on a multiple (103 -> 105 / 100)', () => {
  assert.equal(stepTempo(100, 1), 105); assert.equal(stepTempo(100, -1), 95);
  assert.equal(stepTempo(103, 1), 105); assert.equal(stepTempo(103, -1), 100); assert.equal(stepTempo(101, -1), 100); assert.equal(stepTempo(104, 1), 105);
  assert.equal(stepTempo(200, 1), 200); assert.equal(stepTempo(50, -1), 50); assert.equal(stepTempo(52, -1), 50); assert.equal(stepTempo(198, 1), 200);
  // walking from one end to the other takes exactly (200-50)/5 presses, never a value off the grid
  let v = 50, n = 0; while (v < 200) { v = stepTempo(v, 1); n++; assert.equal(v % 5, 0); } assert.equal(n, 30);
});

test('parseTempoText: "120", "120%", " 120 % " are tempos (clamped to the range); anything else is not', () => {
  for (const [text, pct] of [['120', 120], ['120%', 120], [' 120 % ', 120], ['50', 50], ['300', 200], ['10', 50], ['0', 50], ['007', 50 > 7 ? 50 : 7]] as const) assert.deepEqual(parseTempoText(text), { ok: true, pct }, text);
  for (const bad of ['', '  ', 'fast', '12a', '1.5', '-20', '1e2', '%', '120 bpm', '１２０']) assert.deepEqual(parseTempoText(bad), { ok: false }, JSON.stringify(bad));
  assert.deepEqual(parseTempoText(undefined as unknown as string), { ok: false });
});

test('formatTempo and tempoFactor: "100%", and 50 percent plays twice as long, 200 half as long', () => {
  assert.equal(formatTempo(100), '100%'); assert.equal(formatTempo(55), '55%'); assert.equal(formatTempo(500), '200%');
  assert.equal(tempoFactor(100), 1); assert.equal(tempoFactor(50), 2); assert.equal(tempoFactor(200), 0.5);
});

const r9 = (x: number): number => Math.round(x * 1e9) / 1e9;   // floats: 0.15 + (1.15 - 0.15) * 0.5 is 0.6499999999999999
test('scaleSequenceTempo: the notes after the silent lead-in are stretched, the lead-in is not, the input is not touched, the totals follow', () => {
  const lead = 0.15; const base = { totalTime: lead + 4, notes: [{ startTime: lead, endTime: lead + 1, pitch: 60 }, { startTime: lead + 1, endTime: lead + 4, pitch: 64 }], tempos: [{ qpm: 120 }] };
  const snapshot = JSON.stringify(base);
  const slow = scaleSequenceTempo(base, 50, lead);
  assert.equal(JSON.stringify(base), snapshot, 'input untouched');
  assert.deepEqual(slow.notes.map((n) => [r9(n.startTime), r9(n.endTime)]), [[lead, lead + 2], [lead + 2, lead + 8]].map((a) => a.map(r9))); assert.equal(r9(slow.totalTime), r9(lead + 8)); assert.equal(slow.notes[0].pitch, 60);
  const fast = scaleSequenceTempo(base, 200, lead); assert.deepEqual(fast.notes.map((n) => [r9(n.startTime), r9(n.endTime)]), [[lead, lead + 0.5], [lead + 0.5, lead + 2]].map((a) => a.map(r9)));
  assert.deepEqual(scaleSequenceTempo(base, 100, lead), base, '100 percent is the same sequence');
  assert.deepEqual(scaleSequenceTempo({}, 50, lead), {}, 'an empty sequence stays empty');
});

test('scoreSecondsAt and clockAfterTempoChange: the follower finds the same note at any tempo, and a tempo change in the middle keeps the place', () => {
  const lead = 0.15;
  assert.equal(scoreSecondsAt(lead + 2, 100, lead), 2); assert.equal(scoreSecondsAt(lead + 2, 50, lead), 1); assert.equal(scoreSecondsAt(lead + 2, 200, lead), 4); assert.equal(scoreSecondsAt(0.05, 100, lead) < 0, true, 'still in the lead-in');
  // at 100 percent the player clock reads lead + 3 (score second 3); at 50 percent the same place reads lead + 6; back to 100 gives lead + 3 again
  assert.equal(clockAfterTempoChange(lead + 3, 100, 50, lead), lead + 6); assert.equal(clockAfterTempoChange(lead + 6, 50, 100, lead), lead + 3);
  assert.equal(clockAfterTempoChange(0.1, 100, 50, lead), 0.1, 'inside the lead-in nothing moves'); assert.equal(clockAfterTempoChange(0, 100, 200, lead), 0);
  for (const [a, b] of [[100, 75], [75, 150], [150, 50]]) { const there = clockAfterTempoChange(lead + 5, a, b, lead); assert.ok(Math.abs(scoreSecondsAt(there, b, lead) - scoreSecondsAt(lead + 5, a, lead)) < 1e-9, `${a} to ${b}: same score second`); }
});

test('words: Play and Pause swap, every control has a plain-word label, and the export list is MusicXML, MIDI (and GarageBand on a Mac desktop only)', () => {
  assert.equal(playPauseLabel(false), 'Play'); assert.equal(playPauseLabel(true), 'Pause');
  for (const v of Object.values(TRANSPORT_LABELS)) assert.ok(typeof v === 'string' && v.length > 2 && !/progress|elapsed|time/i.test(v), v);
  assert.deepEqual(exportItems({ macDesktop: false }).map((i) => i.label), ['MusicXML', 'MIDI']);
  assert.deepEqual(exportItems({ macDesktop: true }).map((i) => [i.id, i.label]), [['musicxml', 'MusicXML'], ['midi', 'MIDI'], ['garageband', 'Open in GarageBand']]);
});

test('icons: all six are of our own family: no wrapper, no image, link or script, every coordinate inside the 100 box, stroke 6 in currentColor', () => {
  for (const icon of Object.values(TRANSPORT_ICONS)) {
    assert.deepEqual(iconIssues(icon.svg), [], icon.id);
    assert.match(icon.svg, /stroke="currentColor" stroke-width="6"/, icon.id); assert.doesNotMatch(icon.svg, /#[0-9a-fA-F]{3,6}|rgb\(/, `${icon.id}: no fixed colour`);
  }
  assert.deepEqual(Object.keys(TRANSPORT_ICONS).sort(), ['export', 'minus', 'pause', 'play', 'plus', 'reset']);
});
