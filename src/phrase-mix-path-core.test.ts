// score_first (drain 2026-10-26-0900) — the mix gets a "path" mode: the Weight slider walks the morph's single-hit steps. The pure rules: the field `mode` ("vote" | "path", absent = vote, byte-identical to before),
// the path-only fields `order` and `seed`, the stop a weight lands on (`k = round_half_up((1 - weight) * d)`, computed with integers so a weight like 0.45 is not at the mercy of floating point), the weight a stop
// writes, the sentence, the evidence lines, the starter note of a NEW mix (path, explicit), and what the strip writes when the mode changes. The REAL engine pins the same stop rule in phrase-mix-path-engine.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MIX_KEYS, MIX_DEFAULTS, formatPhraseJson, mixNoteContent, mixSentence, mixTraceEngine, mixTraceRead, mixTraceWritten, normalizeMix, pathStopOf, pathWeightFor, readPhraseNote, validatePhrase,
  type MixPhrase,
} from './phrase-core.ts';

const VOTE: MixPhrase = { kind: 'mix', a: 'bar_005', b: 'bar_001', weight: 0.5, threshold: 0.5, ghost: false };
const PATH: MixPhrase = { ...VOTE, mode: 'path', order: 'musical', seed: 0 };

// ---- vote mixes are untouched ---------------------------------------------------------------------------------------------------------------------------------------------------------

test('a mix with no mode is a vote mix and comes back EXACTLY as before: no mode, no order, no seed in the value', () => {
  const r = validatePhrase({ kind: 'mix', a: 'bar_005', b: 'bar_001', weight: 0, threshold: 0.65, ghost: true });
  assert.deepEqual(r, { ok: true, value: { kind: 'mix', a: 'bar_005', b: 'bar_001', weight: 0, threshold: 0.65, ghost: true } });
  assert.equal(formatPhraseJson({ kind: 'mix', a: 'bar_005', b: 'bar_001', weight: 0, threshold: 0.65, ghost: true }), '{\n  "kind": "mix",\n  "a": "bar_005",\n  "b": "bar_001",\n  "weight": 0,\n  "threshold": 0.65,\n  "ghost": true\n}');
});

test('an explicit "vote" is a vote mix and keeps its word; order and seed do not apply to it and are refused naming the field', () => {
  assert.deepEqual(validatePhrase({ ...VOTE, mode: 'vote' }), { ok: true, value: { ...VOTE, mode: 'vote' } });
  for (const field of ['order', 'seed']) {
    const r = validatePhrase({ ...VOTE, [field]: field === 'order' ? 'musical' : 3 });
    assert.equal(r.ok, false, field);
    if (r.ok === false) assert.match(r.message, new RegExp(`${field} only applies in path mode`), field);
    const explicit = validatePhrase({ ...VOTE, mode: 'vote', [field]: field === 'order' ? 'seeded' : 1 });
    assert.equal(explicit.ok, false, `${field} with an explicit vote`);
  }
});

test('MIX_KEYS names mode, order and seed after the vote fields; the unknown-field refusal lists them', () => {
  assert.deepEqual([...MIX_KEYS], ['kind', 'a', 'b', 'weight', 'threshold', 'ghost', 'mode', 'order', 'seed']);
  assert.deepEqual(validatePhrase({ ...VOTE, swing: 3 }), { ok: false, message: 'Unexpected field "swing" (a mix holds only kind, a, b, weight, threshold, ghost, mode, order, seed).' });
});

// ---- the mode ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('mode: "path" is valid, with order and seed defaulting to the morph\'s (musical, 0); the three orders and a seed are accepted', () => {
  const r = validatePhrase({ ...VOTE, mode: 'path' });
  assert.deepEqual(r, { ok: true, value: { ...VOTE, mode: 'path', order: 'musical', seed: 0 } });
  for (const order of ['musical', 'seeded', 'by_channel']) assert.equal(validatePhrase({ ...VOTE, mode: 'path', order, seed: 7 }).ok, true, order);
  assert.deepEqual(validatePhrase({ ...VOTE, mode: 'path', order: 'seeded', seed: 7 }), { ok: true, value: { ...VOTE, mode: 'path', order: 'seeded', seed: 7 } });
});

test('a wrong mode, order or seed is REFUSED naming the field (never silently corrected)', () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ mode: 'x' }, 'mode must be "vote" or "path", got "x".'],
    [{ mode: 3 }, 'mode must be "vote" or "path", got 3.'],
    [{ mode: null }, 'mode must be "vote" or "path", got null.'],
    [{ mode: 'path', order: 'sideways' }, 'order must be one of musical, seeded, by_channel, got "sideways".'],
    [{ mode: 'path', seed: -1 }, 'seed must be a whole number, 0 or more, got -1.'],
    [{ mode: 'path', seed: 1.5 }, 'seed must be a whole number, 0 or more, got 1.5.'],
    [{ mode: 'path', seed: '3' }, 'seed must be a whole number, 0 or more, got "3".'],
  ];
  for (const [patch, message] of cases) assert.deepEqual(validatePhrase({ ...VOTE, ...patch }), { ok: false, message }, JSON.stringify(patch));
});

test('threshold and ghost stay valid (and validated) in path mode: they are kept in the JSON, only ignored', () => {
  assert.deepEqual(validatePhrase({ ...PATH, threshold: 0.65, ghost: true }), { ok: true, value: { ...PATH, threshold: 0.65, ghost: true } });
  const r = validatePhrase({ ...PATH, threshold: 3 });
  assert.equal(r.ok, false);
  if (r.ok === false) assert.match(r.message, /threshold/);
});

// ---- the note ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('formatPhraseJson: a path mix writes mode, order and seed after the vote fields, in that order, and round-trips; a vote mix with an explicit mode writes just the mode', () => {
  const text = formatPhraseJson({ ...PATH, weight: 0.75 });
  assert.equal(text, '{\n  "kind": "mix",\n  "a": "bar_005",\n  "b": "bar_001",\n  "weight": 0.75,\n  "threshold": 0.5,\n  "ghost": false,\n  "mode": "path",\n  "order": "musical",\n  "seed": 0\n}');
  assert.deepEqual(validatePhrase(JSON.parse(text)), { ok: true, value: { ...PATH, weight: 0.75 } });
  const vote = formatPhraseJson({ ...VOTE, mode: 'vote' });
  assert.equal(vote, '{\n  "kind": "mix",\n  "a": "bar_005",\n  "b": "bar_001",\n  "weight": 0.5,\n  "threshold": 0.5,\n  "ghost": false,\n  "mode": "vote"\n}');
  assert.deepEqual(validatePhrase(JSON.parse(vote)), { ok: true, value: { ...VOTE, mode: 'vote' } });
});

test('a NEW mix is a path mix, explicit in its JSON (mode, order, seed), starting at weight 1 = all bar a (a stop for any d); the vote defaults still apply to a mix note that says nothing', () => {
  const text = mixNoteContent('phrase_002', 'bar_005', 'bar_001');
  assert.match(text, /"mode": "path",\n  "order": "musical",\n  "seed": 0\n}/);
  assert.deepEqual(readPhraseNote(text), { ok: true, value: { kind: 'mix', a: 'bar_005', b: 'bar_001', weight: 1, threshold: MIX_DEFAULTS.threshold, ghost: MIX_DEFAULTS.ghost, mode: 'path', order: 'musical', seed: 0 } });
  assert.match(text, /^---\ntype: data\ncontent_type: json\ndescription: ".*\[\[bar_005\]\].*\[\[bar_001\]\].*path.*"\nlinks:\n[\s\S]*---\n\n<!-- derived[\s\S]*\n```json\n/);
  assert.deepEqual(MIX_DEFAULTS, { weight: 0.5, threshold: 0.5, ghost: false });
  assert.deepEqual(validatePhrase({ kind: 'mix', a: 'bar_001', b: 'bar_002' }), { ok: true, value: { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.5, threshold: 0.5, ghost: false } });
});

// ---- the stop a weight lands on ---------------------------------------------------------------------------------------------------------------------------------------------------

test('pathStopOf: k = round_half_up((1 - weight) * d): the ends, the middle, and half-up at a tie', () => {
  assert.equal(pathStopOf(1, 4), 0);
  assert.equal(pathStopOf(0, 4), 4);
  assert.equal(pathStopOf(0.5, 4), 2);
  assert.equal(pathStopOf(0.75, 4), 1);
  assert.equal(pathStopOf(0.5, 3), 2, '1.5 rounds UP');
  assert.equal(pathStopOf(0.5, 1), 1, '0.5 rounds UP');
  assert.equal(pathStopOf(0.4, 1), 1);
  assert.equal(pathStopOf(0.6, 1), 0);
  assert.equal(pathStopOf(0.3, 0), 0, 'nothing to walk: always the one state');
});

test('pathStopOf is exact for weights with decimals: 0.45 of 10 is 5.5 -> 6 (a float 1 - 0.45 is 0.5499999999999999 and would give 5), 0.7 of 5 is 1.5 -> 2', () => {
  assert.equal(pathStopOf(0.45, 10), 6);
  assert.equal(pathStopOf(0.7, 5), 2);
  assert.equal(pathStopOf(0.35, 10), 7);
  assert.equal(pathStopOf(0.15, 10), 9, '8.5 -> 9');
  // the oracle: exact decimal arithmetic over integers, every weight of two decimals and many d
  for (const d of [1, 2, 3, 4, 5, 7, 10, 16, 17, 33, 48, 80]) {
    for (let w100 = 0; w100 <= 100; w100++) {
      const k = Math.floor(((100 - w100) * d + 50) / 100);
      assert.equal(pathStopOf(w100 / 100, d), k, `weight ${w100 / 100}, d ${d}`);
    }
  }
});

test('pathWeightFor writes the weight of a stop so that it lands back on that stop for every d and every stop (to four decimals: two would lose stops once d passes 100), 1 at stop 0 and 0 at stop d', () => {
  assert.equal(pathWeightFor(0, 4), 1);
  assert.equal(pathWeightFor(4, 4), 0);
  assert.equal(pathWeightFor(2, 4), 0.5);
  assert.equal(pathWeightFor(1, 3), 0.6667);
  assert.equal(pathWeightFor(2, 3), 0.3333);
  assert.equal(pathWeightFor(0, 0), 1);
  for (const d of [1, 2, 3, 4, 5, 7, 10, 16, 17, 33, 48, 80, 99, 100, 101, 192, 500]) {
    for (let j = 0; j <= d; j++) {
      const w = pathWeightFor(j, d);
      assert.ok(w >= 0 && w <= 1, `weight ${w}`);
      assert.equal(pathStopOf(w, d), j, `d ${d}, stop ${j}, weight ${w}`);
      assert.equal(String(w), String(Number(w.toFixed(4))), 'a clean number in the note, never 0.30000000000000004');
    }
  }
});

// ---- words and evidence -----------------------------------------------------------------------------------------------------------------------------------------------------------------

test('mixSentence: a vote mix reads exactly as before; a path mix says which stop of the path it shows, in which order', () => {
  assert.equal(mixSentence(VOTE), 'Mix of bar_005 and bar_001: 50 % bar_005; a hit appears where the weights say it should (threshold 0.50).');
  assert.equal(mixSentence({ ...PATH, weight: 0.5 }, 4), 'Mix of bar_005 and bar_001, path: 2 of 4 single-hit changes (musical order).');
  assert.equal(mixSentence({ ...PATH, weight: 1 }, 4), 'Mix of bar_005 and bar_001, path: 0 of 4 single-hit changes (musical order).');
  assert.equal(mixSentence({ ...PATH, weight: 0.5 }, 1), 'Mix of bar_005 and bar_001, path: 1 of 1 single-hit change (musical order).');
  assert.equal(mixSentence({ ...PATH, order: 'seeded', seed: 3, weight: 0 }, 4), 'Mix of bar_005 and bar_001, path: 4 of 4 single-hit changes (seeded order, seed 3).');
  assert.equal(mixSentence({ ...PATH, order: 'by_channel' }, 4), 'Mix of bar_005 and bar_001, path: 2 of 4 single-hit changes (by-channel order).');
  assert.equal(mixSentence({ ...PATH }, null), 'Mix of bar_005 and bar_001, path (musical order).', 'd not known yet: the sentence leaves the count out');
  assert.equal(mixSentence({ ...PATH, weight: 0.5, a: 'bar_005', b: 'bar_005' }, 0), 'Mix of bar_005 and itself, path: 0 of 0 single-hit changes (musical order); the two bars are the same, so there is nothing to walk.');
});

test('evidence lines: a vote mix\'s are byte-identical; a path mix\'s add the mode, order and seed', () => {
  assert.equal(mixTraceWritten(VOTE), '[forge-mix] wrote a=bar_005 b=bar_001 weight=0.5 threshold=0.5 ghost=false');
  assert.equal(mixTraceWritten(PATH), '[forge-mix] wrote a=bar_005 b=bar_001 weight=0.5 threshold=0.5 ghost=false mode=path order=musical seed=0');
  const text = `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${formatPhraseJson(PATH)}\n\`\`\`\n`;
  assert.equal(mixTraceRead(text), '[forge-mix] Score read a=bar_005 b=bar_001 weight=0.5 threshold=0.5 ghost=false mode=path order=musical seed=0');
  assert.match(mixTraceEngine(PATH, { content: '<x/>', path_state: { d: 4, k: 2 } }) ?? '', /^\[forge-mix\] engine asked weight=0\.5 threshold=0\.5 ghost=false mode=path order=musical seed=0 -> .*path 2 of 4 changes/);
  assert.match(mixTraceEngine(PATH, { content: '<x/>' }) ?? '', /no path state/);
  assert.equal(mixTraceEngine(VOTE, { content: '<note/>' }), '[forge-mix] engine asked weight=0.5 threshold=0.5 ghost=false -> notes: single score 1');
});

// ---- what the strip writes --------------------------------------------------------------------------------------------------------------------------------------------------------

test('normalizeMix: switching to path fills order and seed (the morph\'s defaults); switching to vote drops them and says "vote"; weight, threshold and ghost are kept either way', () => {
  assert.deepEqual(normalizeMix({ ...VOTE, weight: 0.25, mode: 'path' }), { ...VOTE, weight: 0.25, mode: 'path', order: 'musical', seed: 0 });
  assert.deepEqual(normalizeMix({ ...PATH, order: 'seeded', seed: 4, mode: 'vote' }), { ...VOTE, mode: 'vote' });
  assert.deepEqual(normalizeMix({ ...PATH, order: 'seeded', seed: 4 }), { ...PATH, order: 'seeded', seed: 4 });
  assert.deepEqual(normalizeMix(VOTE), VOTE, 'a mix that has no mode stays as it is (no mode written)');
  assert.deepEqual(normalizeMix({ ...VOTE, order: 'seeded', seed: 4 }), VOTE, 'order and seed never ride on a vote mix');
});
