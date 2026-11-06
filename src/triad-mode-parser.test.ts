// 2026-11-05-1188 (Scale Explorer: `mode: triad`) - the block parser: the good blocks and their defaults, `degree: 1..7`, `show` listing piano and staff only, and every refusal in one sentence (`sevenths`, `diatonic`, `guitar`,
// `intervals`, `numbers`, `chord`, a bad degree, a degree outside triad mode). The other modes' parse is untouched (their own tests and the 1170 golden).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseScaleExplorerSource } from './scale-explorer-core.ts';

const good = (source: string) => { const r = parseScaleExplorerSource(source); assert.ok(r.ok, r.ok ? '' : r.message); return (r as { ok: true; options: any }).options; };
const refused = (source: string, re: RegExp) => { const r = parseScaleExplorerSource(source); assert.ok(!r.ok && re.test(r.message), `${JSON.stringify(source)}: ${r.ok ? 'was accepted' : r.message}`); };

test('`mode: triad` alone is the defaults: C major, octave 4, degree 1, controls on, the piano and the staff, and none of the other rows', () => {
  const o = good('mode: triad');
  assert.deepEqual(o, { tonic: 'C', scale: 'major', octave: 4, mode: 'triad', degree: 1, controls: true, chord: 'major', labels: 'names', tab: false, show: { piano: true, staff: true, numbers: false, diatonic: false, guitar: false, intervals: false } });
});

test('every triad option, in any order, case-insensitive: tonic, scale, octave, degree, controls', () => {
  const o = good('degree: 6\nControls: no\nMODE: Triad\nscale: natural minor\noctave: 3\ntonic: eb');
  assert.deepEqual([o.mode, o.tonic, o.scale, o.octave, o.degree, o.controls], ['triad', 'Eb', 'natural minor', 3, 6, false]);
  for (const d of [1, 2, 3, 4, 5, 6, 7]) assert.equal(good(`mode: triad\ndegree: ${d}`).degree, d);
});

test('`show` may list piano and staff (either or both); the rest of the block still parses', () => {
  assert.deepEqual(good('mode: triad\nshow: piano').show, { piano: true, staff: false, numbers: false, diatonic: false, guitar: false, intervals: false });
  assert.deepEqual(good('mode: triad\nshow: staff').show, { piano: false, staff: true, numbers: false, diatonic: false, guitar: false, intervals: false });
  assert.equal(good('mode: triad\nshow: Piano, Staff').show.piano, true);
});

test('triad mode refuses what belongs to the other modes, each in one sentence that names it', () => {
  refused('mode: triad\nshow: piano, staff, diatonic', /show: "diatonic" is the row of chords you click in free mode, so it is not available in mode: triad/);
  refused('mode: triad\nshow: piano, guitar', /show: "guitar" is the guitar neck of the other modes, so it is not available in mode: triad/);
  refused('mode: triad\nshow: piano, intervals', /show: "intervals" is the interval pattern of a scale, so it is not available in mode: triad/);
  refused('mode: triad\nshow: piano, numbers', /show: "numbers" is the degree numbers of a scale on the piano, so it is not available in mode: triad/);
  refused('mode: triad\nchord: minor', /"chord" picks the quality of a chord in mode: chord; in mode: triad the triad comes from the scale and the picked note/);
});

test('NO sevenths: a `sevenths` line in a triad block is refused with its own sentence, wherever the mode line is; anywhere else it is the unknown option it always was', () => {
  const sentence = /mode: triad has no sevenths: a triad is three notes, the root and the next-but-one note twice, all taken from the scale/;
  refused('mode: triad\nsevenths: yes', sentence);
  refused('sevenths: yes\nmode: triad', sentence);
  refused('mode: triad\nSevenths: no', sentence);
  refused('sevenths: yes', /Unknown option "sevenths" \(supported: /);
  refused('mode: free\nsevenths: yes', /Unknown option "sevenths"/);
});

test('`degree` must be a whole number from 1 to 7, and belongs to triad mode', () => {
  for (const bad of ['0', '8', 'abc', '1.5', '-1', '']) refused(`mode: triad\ndegree: ${bad}`, /degree must be a whole number from 1 to 7 \(got "/);
  refused('degree: 3', /"degree" picks the root of a triad, so the block needs "mode: triad"/);
  refused('mode: chord\ndegree: 3', /"degree" picks the root of a triad/);
  refused('mode: free\ndegree: 3', /"degree" picks the root of a triad/);
  refused('mode: triad\ndegree: 2\ndegree: 3', /The option "degree" is given twice/);
});

test('the other modes parse as they did: scale still has its interval row on, chord and free still refuse "mode: arpeggio" and name triad among the modes', () => {
  assert.equal(good('').show.intervals, true);
  assert.equal(good('').degree, 1, 'the option exists everywhere with its default; only triad mode reads it');
  refused('mode: arpeggio', /mode must be scale, chord, free or triad \(got "arpeggio"\)/);
  assert.equal(good('mode: free').mode, 'free');
  assert.equal(good('mode: chord').mode, 'chord');
});
