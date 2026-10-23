// score_first M6 (drain 2026-10-22-1950) — navigation through an extend: which note, which parameter, which parent, for EVERY bar of a phrase's Score. Pure core: the ids put on the measures of
// the engine's MusicXML, the per-bar tempo READ FROM THE ENGINE'S OWN OUTPUT (not a second copy of the formula), the provenance map, the lineage stack and the bars a stack entry covers.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PHRASE_BAR_SCOPE, annotatePhraseXml, barsCoveredBy, describeTempoChange, phraseBarId, phraseLineageOf, phraseNoteId, phraseProvenance, phraseSourceNoteId, type PhraseBarInfo,
} from './phrase-lineage-core.ts';
import type { PhraseParams } from './phrase-core.ts';

const PARAMS: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: -20 };
const TEMPI = [100, 93, 87, 80];

/** A MusicXML shaped like the engine's: two parts, one <measure> per bar per part, a <sound tempo> in each bar of each part. */
function xml(tempi: Array<number | null>, parts = 2, extra = ''): string {
  const measure = (n: number, t: number | null) => `<measure number="${n}">${n === 1 ? '<attributes><divisions>4</divisions></attributes>' : ''}${t === null ? '' : `<direction><sound tempo="${t}"/></direction>`}<note><rest/><duration>16</duration></note></measure>`;
  const part = (p: number) => `<part id="P${p}">${tempi.map((t, i) => measure(i + 1, t)).join('')}</part>`;
  return `<?xml version="1.0"?><score-partwise>${extra}${Array.from({ length: parts }, (_, p) => part(p + 1)).join('')}</score-partwise>`;
}

test('ids and names: phraseBarId is scope_bar_N (an XML NCName), and the note ids are the files without .md', () => {
  assert.equal(PHRASE_BAR_SCOPE, 'ph');
  assert.equal(phraseBarId('ph', 5), 'ph_bar_5');
  assert.match(phraseBarId('ph', 12), /^[A-Za-z_][\w.-]*$/);
  assert.equal(phraseNoteId('phrases/phrase_001.md'), 'phrases/phrase_001');
  assert.equal(phraseNoteId('phrases/phrase_001'), 'phrases/phrase_001');
  assert.equal(phraseSourceNoteId('bar_005'), 'bars/bar_005');
});

test('annotatePhraseXml puts an id on every bar of the FIRST part (Verovio draws one measure per bar from it), numbered from 1, and reads each bar\'s tempo from the engine\'s <sound tempo>', () => {
  const r = annotatePhraseXml(xml(TEMPI), null, 4, 'ph');
  assert.equal(r.ok, true);
  if (r.ok === false) return;
  assert.deepEqual(r.bars, TEMPI.map((tempo, i) => ({ id: `ph_bar_${i + 1}`, index: i + 1, tempo })));
  const firstPart = /<part id="P1">([\s\S]*?)<\/part>/.exec(r.multiXml)![1];
  assert.deepEqual([...firstPart.matchAll(/<measure number="(\d+)" id="([^"]+)">/g)].map((m) => [m[1], m[2]]), [['1', 'ph_bar_1'], ['2', 'ph_bar_2'], ['3', 'ph_bar_3'], ['4', 'ph_bar_4']]);
  const secondPart = /<part id="P2">([\s\S]*?)<\/part>/.exec(r.multiXml)![1];
  assert.ok(!/ id="/.test(secondPart), 'the second part is left alone: duplicate ids would not be valid XML ids');
  assert.equal(r.multiXml.replace(/ id="ph_bar_\d+"/g, ''), xml(TEMPI), 'nothing else in the document changed');
});

test('annotatePhraseXml: a bar with no tempo mark has tempo null (never invented); a fractional tempo is a number', () => {
  const r = annotatePhraseXml(xml([100, null, 92.5, 80]), null, 4, 'ph');
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.bars.map((b) => b.tempo), [100, null, 92.5, 80]);
});

test('annotatePhraseXml refuses, naming why, and never guesses: not the bars the phrase asked for, no part, no measure', () => {
  const wrongCount = annotatePhraseXml(xml(TEMPI), null, 8, 'ph');
  assert.equal(wrongCount.ok, false);
  if (wrongCount.ok === false) assert.match(wrongCount.problems[0], /4 bars but the phrase asks for 8/);
  const none = annotatePhraseXml('<score-partwise></score-partwise>', null, 4, 'ph');
  assert.equal(none.ok, false);
  if (none.ok === false) assert.match(none.problems[0], /no part/);
  const noMeasure = annotatePhraseXml('<score-partwise><part id="P1"></part></score-partwise>', null, 1, 'ph');
  assert.equal(noMeasure.ok, false);
});

test('annotatePhraseXml: the Kit view is annotated the same way when it can be, and its trouble NEVER blocks the multi-staff view', () => {
  const ok = annotatePhraseXml(xml(TEMPI), xml(TEMPI, 1), 4, 'ph');
  assert.equal(ok.ok, true);
  if (ok.ok) { assert.ok(/<measure number="2" id="ph_bar_2">/.test(ok.kitXml!)); assert.deepEqual(ok.kitProblems, []); }
  const bad = annotatePhraseXml(xml(TEMPI), xml([100, 93], 1), 4, 'ph');
  assert.equal(bad.ok, true);
  if (bad.ok) { assert.equal(bad.kitXml, null); assert.match(bad.kitProblems[0], /Kit/); }
});

test('an id that is already on a measure is kept as the engine wrote it (nothing is overwritten) and the map says so by refusing', () => {
  const tagged = xml(TEMPI).replace('<measure number="2">', '<measure number="2" id="engine_made">');
  const r = annotatePhraseXml(tagged, null, 4, 'ph');
  assert.equal(r.ok, false);
  if (r.ok === false) assert.match(r.problems[0], /already carries an id/);
});

const BARS: PhraseBarInfo[] = TEMPI.map((tempo, i) => ({ id: `ph_bar_${i + 1}`, index: i + 1, tempo }));

test('phraseProvenance: one entry per bar, naming the phrase note, its role and every parameter the stack needs', () => {
  const map = phraseProvenance('phrases/phrase_001', PARAMS, BARS);
  assert.deepEqual(Object.keys(map), ['ph_bar_1', 'ph_bar_2', 'ph_bar_3', 'ph_bar_4']);
  assert.deepEqual(map.ph_bar_3, { noteId: 'phrases/phrase_001', role: 'phrase-bar', params: { bar: 3, bars: 4, tempo: 87, source: 'bar_005', style: 'repeat_with_fills', tempo_change_pct: -20 } });
});

test('describeTempoChange: slowing, speeding up, none; a fractional percentage is printed as it is', () => {
  assert.equal(describeTempoChange(-20), 'slowing 20 %');
  assert.equal(describeTempoChange(35), 'speeding up 35 %');
  assert.equal(describeTempoChange(0), 'no tempo change');
  assert.equal(describeTempoChange(-12.5), 'slowing 12.5 %');
});

test('THE STACK (the prompt\'s own example): bar 5 of 8 | made by phrase_001 (extend, slowing 20 %, style repeat_with_fills) | from bar_005 | tempo 92', () => {
  const map = phraseProvenance('phrases/phrase_001', { ...PARAMS, bars: 8 }, [...Array(8)].map((_, i) => ({ id: `ph_bar_${i + 1}`, index: i + 1, tempo: i === 4 ? 92 : 100 })));
  const stack = phraseLineageOf(map.ph_bar_5);
  assert.deepEqual(stack.map((e) => e.text), ['bar 5 of 8', 'made by phrase_001 (extend, slowing 20 %, style repeat_with_fills)', 'from bar_005', 'tempo 92', 'Edit this bar']);   // M9 (drain 2026-10-23-0330), deliberate: a generated bar's stack ends with the Edit this bar action; the four lines above are the M6 stack, unchanged
  assert.deepEqual(stack.map((e) => e.noteId), [undefined, 'phrases/phrase_001', 'bars/bar_005', undefined, undefined], 'the phrase and the source bar are the two links');
  assert.deepEqual(stack.map((e) => e.kind), ['bar', 'note', 'note', 'tempo', 'action']);
  assert.deepEqual(stack.map((e) => e.openLabel), [undefined, 'Open phrase_001', 'Open bar_005', undefined, undefined], 'each link has its own accessible name');
  assert.deepEqual(stack.map((e) => e.covers), ['self', 'all', 'all', 'self', undefined], 'hovering an entry lights the bars it covers: this bar, or every bar of the phrase');
});

test('the stack never invents: no tempo in the engine\'s output means no tempo entry; an entry of another role is not a phrase bar', () => {
  const stack = phraseLineageOf({ noteId: 'phrases/phrase_001', role: 'phrase-bar', params: { bar: 2, bars: 4, tempo: null, source: 'bar_005', style: 'building', tempo_change_pct: 0 } });
  assert.deepEqual(stack.map((e) => e.text), ['bar 2 of 4', 'made by phrase_001 (extend, no tempo change, style building)', 'from bar_005', 'Edit this bar']);   // M9: the action is the one added line
  const other = phraseLineageOf({ noteId: 'bars/bar_001', role: 'hit', params: {} });
  assert.deepEqual(other.map((e) => e.text), ['hit', 'bars/bar_001']);
});

test('barsCoveredBy: "self" is the pinned bar only; "all" is every bar of the map; anything else covers nothing', () => {
  const map = phraseProvenance('phrases/phrase_001', PARAMS, BARS);
  assert.deepEqual(barsCoveredBy(map, 'ph_bar_2', 'self'), ['ph_bar_2']);
  assert.deepEqual(barsCoveredBy(map, 'ph_bar_2', 'all'), ['ph_bar_1', 'ph_bar_2', 'ph_bar_3', 'ph_bar_4']);
  assert.deepEqual(barsCoveredBy(map, 'ph_bar_2', undefined), []);
  assert.deepEqual(barsCoveredBy(map, 'nope', 'self'), [], 'an id that is not in the map covers nothing');
});
