// 2026-11-19-0999b (MIX AND EXTEND AS STEPS) - MUTATION TRIAGE, the tests the diff-seeded pass (mutate.mjs --diff HEAD --max 700, 451 killed / 16 survived / 233 not run) showed were missing, every one an EXACT-ANSWER test (and each one verified to fail
// against its mutant on a scratch copy of src, ~/.forge-mem-evidence/p0999b/scratch-src, and to pass on the real code):
//   * the pure cores: the sign of a small tempo change, the stop of a path mix in millionths (a share that is not a round number, a share outside 0..1 handed straight to the Python), the validator of an Extend step (NaN, 1, -0);
//   * the GRAMMAR GOLDEN: sentences (chosen by a greedy set cover over every mutant of the changed lines of phrase-grammar-core.ts that the other tests do not kill) whose whole answer is pinned: ok = the steps as JSON and the canonical sentence
//     `describe` says; error = line:column, the code if any, the words.
// Equivalent / unreachable mutants (no test can tell them from the real code) are listed at the end of this file, one line each.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { structurePython, structureWords } from './bar-structure-core.ts';
import { validatePhrase, type ExtendBarOp, type MixBarsOp } from './phrase-core.ts';
import { describe, parse } from './phrase-grammar-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const MX = (o: Partial<MixBarsOp> = {}): MixBarsOp => ({ op: 'mix_bars', a: 2, b: 3, weight: 0.5, threshold: 0.5, ghost: false, mode: 'vote', after: 2, ...o });
const EX = (o: Partial<ExtendBarOp> = {}): ExtendBarOp => ({ op: 'extend_bar', bar: 2, bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0, ...o });

// 2026-11-19-0999b mutation survivor: src/bar-structure-core.ts:59 number+1#2 `o.tempo_change_pct < 0` -> `< 1` (a change of less than one percent was said "slower")
test('structureWords of an Extend step: the sign decides slower/faster at every size (0.5 faster, -0.5 slower, 1, -1, 0.01, -0.01, the ends 100 and -90); 0 says nothing', () => {
  const said = (t: number): string => structureWords(EX({ tempo_change_pct: t }));
  const head = 'extend bar 2 to 4 bars, repeating with fills';
  assert.equal(said(0.5), `${head}, 0.5 percent faster`); assert.equal(said(-0.5), `${head}, 0.5 percent slower`);
  assert.equal(said(1), `${head}, 1 percent faster`); assert.equal(said(-1), `${head}, 1 percent slower`);
  assert.equal(said(0.01), `${head}, 0.01 percent faster`); assert.equal(said(-0.01), `${head}, 0.01 percent slower`);
  assert.equal(said(100), `${head}, 100 percent faster`); assert.equal(said(-90), `${head}, 90 percent slower`);
  assert.equal(said(0), head); assert.equal(said(-0), head);
});

// 2026-11-19-0999b mutation survivor: src/bar-structure-core.ts:175 number+1#3 `1e6` -> `1000001` (a share that is not a round number: 0.5 -> 500001 millionths) and number+1#1 `Math.min(1, ...)` -> `Math.min(2, ...)` (a share above 1 is clamped to 1)
test('structurePython of a path mix: the stop is the share in millionths, exactly (0.5, 0.7, 0.3, 0.123456), and a share outside 0..1 handed straight to it is clamped to the ends', () => {
  const stop = (w: number): string => (structurePython(MX({ mode: 'path', order: 'musical', seed: 0, weight: w })) as string[])[1];
  const line = (millionths: number): string => `  _new = [morph_rhythm(a=bars[1], b=bars[2], bars=1, order='musical', seed=0, position=min(_d, max(0, ((1000000 - ${millionths}) * _d + 500000) // 1000000)))]`;
  for (const [w, m] of [[0.5, 500000], [0.7, 700000], [0.3, 300000], [0.1, 100000], [0.123456, 123456], [0, 0], [1, 1000000]] as const) assert.equal(stop(w), line(m), `weight ${w}`);
  assert.equal(stop(1.5), line(1000000), 'above 1: clamped'); assert.equal(stop(2), line(1000000), 'above 1: clamped'); assert.equal(stop(-0.5), line(0), 'below 0: clamped');
  assert.deepEqual(structurePython(MX({ mode: 'path', order: 'musical', seed: 0, weight: 0.5 })), [
    "  _d = morph_rhythm_info(a=bars[1], b=bars[2], order='musical', seed=0)['d']", line(500000), '  bars[2:2] = _new']);
});

// 2026-11-19-0999b mutation survivor: src/phrase-core.ts:391 logic#3 `typeof pct !== 'number' || !Number.isFinite(pct)` -> `&&` (NaN was accepted as a tempo) and src/phrase-core.ts:392 number+1#1 `pct === 0 ? 0 : pct` -> `pct === 1 ? 0 : pct` (a tempo of 1 became 0, minus zero stayed minus zero)
test('validateExtendBar: NaN and the infinities are refused in words (they read back as null), a tempo of 1 and 0.5 are kept, minus zero is zero', () => {
  const op = (t: unknown): Record<string, unknown> => ({ op: 'extend_bar', bar: 2, bars: 4, style: 'repeat_with_fills', tempo_change_pct: t });
  const ask = (t: unknown) => validatePhrase({ kind: 'transform', source: 'phrases/phrase_003', ops: [op(t)] } as never);
  const said = (t: unknown): string => { const r = ask(t); return r.ok ? `OK ${JSON.stringify((r.value as { ops: unknown[] }).ops[0])}` : `ERR ${r.message}`; };
  for (const t of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) assert.equal(said(t), 'ERR ops[0].tempo_change_pct must be a number from -90 to 100, got null.', String(t));
  assert.equal(said(1), 'OK {"op":"extend_bar","bar":2,"bars":4,"style":"repeat_with_fills","tempo_change_pct":1}');
  assert.equal(said(0.5), 'OK {"op":"extend_bar","bar":2,"bars":4,"style":"repeat_with_fills","tempo_change_pct":0.5}');
  assert.equal(said(-1), 'OK {"op":"extend_bar","bar":2,"bars":4,"style":"repeat_with_fills","tempo_change_pct":-1}');
  const zero = ask(-0); assert.ok(zero.ok); assert.ok(Object.is((zero.value as { ops: Array<{ tempo_change_pct: number }> }).ops[0].tempo_change_pct, 0), 'minus zero is stored as zero');
  assert.ok(Object.is(((ask(0) as { value: { ops: Array<{ tempo_change_pct: number }> } }).value).ops[0].tempo_change_pct, 0));
});

// ---- the GRAMMAR GOLDEN of the Mix and Extend steps (readMixBars, readExtendBar, readTempoChange, placeSegment, readStructureStep) ---------------------------------------------------------------------------------------
const render = (text: string): string => {
  const r = parse(text, PHRASE_VAULT);
  if (r.ok) return `OK ${JSON.stringify((r.params as { ops?: unknown[] }).ops ?? [])} => ${describe(r.params)}`;
  const e = r.error; return `ERR ${e.line}:${e.column}${e.code ? ` [${e.code}]` : ''} ${e.message}`;
};

// 2026-11-19-0999b mutation survivor: src/phrase-grammar-core.ts:250 (the head check of `extend`), 351/355/371/401 (every `whole` message), 353 ("and bars 3"), 362..368 (the share: a percent word with no number, a number with no percent word, 101 percent, "of the first", "the second"), 370 (a share that names no bar),
// 378..386 (the mode, the order, the seed, the threshold, the ghost notes: each said twice, an order on a vote, a threshold or ghost notes on a path, the seed 0), 383 / 412 (the `expected` sentence of the refusals), 403 ("Extend bar 2, building up" is one bar), 409..411 (to N bars, the style, the tempo said twice or not at all)
// Each sentence is here because one or more mutants of those lines change its answer (greedy set cover, then the natural readings and the boundary tables added by hand: a share 0 / 100 / 100.5 / 101, a threshold 100 / 101, N 0 / 1 / 64 / 65, a tempo 90 slower / 91 slower / 100 faster / 101 faster).
const GOLDEN: Array<[string, string]> = [
  ["Take [[phrase_003]]. Extend.", "ERR 1:22 Expected \"Thin out ...\", \"Double up ...\", \"Keep ...\", \"Delete ...\", \"Copy ...\", \"Move ...\" or \"Bar N is replaced by [[a bar]]\", but found \"Extend\"."],
  ["Take [[phrase_003]]. Mix bars 0 and 3.", "ERR 1:31 Expected a bar number, 1 or more, but found 0."],
  ["Take [[phrase_003]]. Mix bars 2 and bars 3.", "OK [{\"op\":\"mix_bars\",\"a\":2,\"b\":3,\"weight\":0.5,\"threshold\":0.5,\"ghost\":false,\"mode\":\"vote\",\"after\":2}] => Take [[phrase_003]]. Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it between bars 2 and 3."],
  ["Take [[phrase_003]]. Mix bars 2 and.", "ERR 1:36 Expected a bar number, but found the end of the sentence."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, 70 percent bar 0.", "ERR 1:55 Expected a bar number, 1 or more, but found 0."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, 70 percent.", "ERR 1:50 Expected \"bar N\", \"the first\" or \"the second\" for the share, but found the end of the sentence."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, 101 percent bar 2.", "ERR 1:40 Expected a share from 0 to 100 percent, but found 101."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, percent.", "ERR 1:40 Expected \"N percent bar K\", \"as a vote\" (with \"threshold N percent\" and \"with ghost notes\") or \"as a path, in musical order\", or a place (\"after bar N\", \"before bar N\", \"between bars N and M\", \"at the start\", \"at the end\"), but found \"percent\"."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, 70.", "ERR 1:40 Expected \"N percent bar K\", \"as a vote\" (with \"threshold N percent\" and \"with ghost notes\") or \"as a path, in musical order\", or a place (\"after bar N\", \"before bar N\", \"between bars N and M\", \"at the start\", \"at the end\"), but found \"70\"."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, as a vote, as a path.", "ERR 1:51 Expected \"as a vote\" or \"as a path\" to be said once, but it is said twice."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, as a path, in seeded order, seed 9007199254740993.", "ERR 1:73 Expected a seed, 0 or more, but found 9007199254740993."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, as a path, in seeded order, in musical order.", "ERR 1:68 Expected the order to be said once, but it is said twice."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, in seeded order.", "ERR 1:43 Expected an order and a seed only for a mix as a path, but this mix is a vote."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, in.", "ERR 1:40 Expected \"N percent bar K\", \"as a vote\" (with \"threshold N percent\" and \"with ghost notes\") or \"as a path, in musical order\", or a place (\"after bar N\", \"before bar N\", \"between bars N and M\", \"at the start\", \"at the end\"), but found \"in\"."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, threshold 40 percent, threshold 50 percent.", "ERR 1:62 Expected the threshold to be said once, but it is said twice."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, with ghost notes, with ghost notes.", "ERR 1:58 Expected the ghost notes to be said once, but it is said twice."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, threshold 40 percent, as a path.", "ERR 1:50 Expected a threshold and ghost notes only for a mix as a vote, but this mix is a path."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, with ghost notes, as a path.", "ERR 1:56 Expected a threshold and ghost notes only for a mix as a vote, but this mix is a path."],
  ["Take [[phrase_003]]. Extend bar 0.", "ERR 1:33 Expected a bar number, 1 or more, but found 0."],
  ["Take [[phrase_003]]. Extend bar 2 to.", "ERR 1:37 Expected a number of bars, but found the end of the sentence."],
  ["Take [[phrase_003]]. Extend bar 2 to 4 bars to 5 bars.", "ERR 1:45 Expected \"to N bars\" to be said once, but it is said twice."],
  ["Take [[phrase_003]]. Extend bar 2 building up, building up.", "ERR 1:48 Expected the style to be said once, but it is said twice."],
  ["Take [[phrase_003]]. Extend bar 2 20 percent slower, 10 percent faster.", "ERR 1:54 Expected the tempo change to be said once, but it is said twice."],
  ["Take [[phrase_003]]. Extend bar 2, foo.", "ERR 1:36 Expected \"to N bars\", a style (repeating with fills, building up, adding ghost notes), \"N percent slower\" / \"N percent faster\" or a place (\"after bar N\", \"before bar N\", \"at the start\", \"at the end\"), but found \"foo\"."],
  ["Take [[phrase_003]]. Extend bar 2 and.", "ERR 1:38 Expected a place (\"after bar N\", \"before bar N\", \"between bars N and M\", \"at the start\" or \"at the end\"), but found the end of the sentence."],          // 2026-11-24-1040 (deliberate): an `and` that no place follows says what is missing, not the whole list of segments (it was 1:35 `Expected "to N bars", a style (...) or a place (...), but found "and".`)
  ["Take [[phrase_003]]. Extend bar 2 and bars 3 to 4 bars.", "ERR 1:29 [refused] Extend takes one bar at a time. Say \"Extend bar 2 to 4 bars.\" for one bar, and again for the next."],
  ["Take [[phrase_003]]. Extend bar 2, bar 3 to 4 bars.", "ERR 1:29 [refused] Extend takes one bar at a time. Say \"Extend bar 2 to 4 bars.\" for one bar, and again for the next."],
  ["Take [[phrase_003]]. Extend bars 2 and 3 to 5 bars.", "ERR 1:29 [refused] Extend takes one bar at a time. Say \"Extend bar 2 to 5 bars.\" for one bar, and again for the next."],
  ["Take [[phrase_003]]. Extend bar 2, building up.", "OK [{\"op\":\"extend_bar\",\"bar\":2,\"bars\":4,\"style\":\"building\",\"tempo_change_pct\":0}] => Take [[phrase_003]]. Extend bar 2 to 4 bars, building up."],
  ["Take [[phrase_003]]. Extend bar 2 to 4 bars, foo.", "ERR 1:46 Expected \"to N bars\", a style (repeating with fills, building up, adding ghost notes), \"N percent slower\" / \"N percent faster\" or a place (\"after bar N\", \"before bar N\", \"at the start\", \"at the end\"), but found \"foo\"."],
  ["Take [[phrase_003]]. Extend bar 2, and put them at the end.", "OK [{\"op\":\"extend_bar\",\"bar\":2,\"bars\":4,\"style\":\"repeat_with_fills\",\"tempo_change_pct\":0,\"after\":\"end\"}] => Take [[phrase_003]]. Extend bar 2 to 4 bars, repeating with fills, and put them at the end."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, 0 percent bar 2.", "OK [{\"op\":\"mix_bars\",\"a\":2,\"b\":3,\"weight\":0,\"threshold\":0.5,\"ghost\":false,\"mode\":\"vote\",\"after\":2}] => Take [[phrase_003]]. Mix bars 2 and 3, 0 percent bar 2, as a vote, and put it between bars 2 and 3."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, 100 percent bar 2.", "OK [{\"op\":\"mix_bars\",\"a\":2,\"b\":3,\"weight\":1,\"threshold\":0.5,\"ghost\":false,\"mode\":\"vote\",\"after\":2}] => Take [[phrase_003]]. Mix bars 2 and 3, 100 percent bar 2, as a vote, and put it between bars 2 and 3."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, 100.5 percent bar 2.", "ERR 1:40 Expected a share from 0 to 100 percent, but found 100.5."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, 70 percent of the first.", "OK [{\"op\":\"mix_bars\",\"a\":2,\"b\":3,\"weight\":0.7,\"threshold\":0.5,\"ghost\":false,\"mode\":\"vote\",\"after\":2}] => Take [[phrase_003]]. Mix bars 2 and 3, 70 percent bar 2, as a vote, and put it between bars 2 and 3."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, 70 percent the second.", "OK [{\"op\":\"mix_bars\",\"a\":2,\"b\":3,\"weight\":0.3,\"threshold\":0.5,\"ghost\":false,\"mode\":\"vote\",\"after\":2}] => Take [[phrase_003]]. Mix bars 2 and 3, 30 percent bar 2, as a vote, and put it between bars 2 and 3."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, 70% of the second.", "OK [{\"op\":\"mix_bars\",\"a\":2,\"b\":3,\"weight\":0.3,\"threshold\":0.5,\"ghost\":false,\"mode\":\"vote\",\"after\":2}] => Take [[phrase_003]]. Mix bars 2 and 3, 30 percent bar 2, as a vote, and put it between bars 2 and 3."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, 30 percent bar 3.", "OK [{\"op\":\"mix_bars\",\"a\":2,\"b\":3,\"weight\":0.7,\"threshold\":0.5,\"ghost\":false,\"mode\":\"vote\",\"after\":2}] => Take [[phrase_003]]. Mix bars 2 and 3, 70 percent bar 2, as a vote, and put it between bars 2 and 3."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, 70 percent bar 4.", "ERR 1:51 Expected bar 2 or bar 3 for the share, but found bar 4."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, 70 percent the third.", "ERR 1:51 Expected \"bar N\", \"the first\" or \"the second\" for the share, but found \"the\"."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, as a path, in seeded order, seed 0.", "OK [{\"op\":\"mix_bars\",\"a\":2,\"b\":3,\"weight\":0.5,\"threshold\":0.5,\"ghost\":false,\"mode\":\"path\",\"order\":\"seeded\",\"seed\":0,\"after\":2}] => Take [[phrase_003]]. Mix bars 2 and 3, 50 percent bar 2, as a path, in seeded order, seed 0, and put it between bars 2 and 3."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, as a path, in random order.", "ERR 1:51 Expected \"N percent bar K\", \"as a vote\" (with \"threshold N percent\" and \"with ghost notes\") or \"as a path, in musical order\", or a place (\"after bar N\", \"before bar N\", \"between bars N and M\", \"at the start\", \"at the end\"), but found \"in\"."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, as a path, threshold 40 percent.", "ERR 1:61 Expected a threshold and ghost notes only for a mix as a vote, but this mix is a path."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, as a path, with ghost notes.", "ERR 1:67 Expected a threshold and ghost notes only for a mix as a vote, but this mix is a path."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, threshold 100 percent.", "OK [{\"op\":\"mix_bars\",\"a\":2,\"b\":3,\"weight\":0.5,\"threshold\":1,\"ghost\":false,\"mode\":\"vote\",\"after\":2}] => Take [[phrase_003]]. Mix bars 2 and 3, 50 percent bar 2, as a vote, threshold 100 percent, and put it between bars 2 and 3."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, threshold 101 percent.", "ERR 1:50 Expected a threshold from 0 to 100 percent, but found 101."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, foo.", "ERR 1:40 Expected \"N percent bar K\", \"as a vote\" (with \"threshold N percent\" and \"with ghost notes\") or \"as a path, in musical order\", or a place (\"after bar N\", \"before bar N\", \"between bars N and M\", \"at the start\", \"at the end\"), but found \"foo\"."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, seed 3.", "ERR 1:45 Expected an order and a seed only for a mix as a path, but this mix is a vote."],
  ["Take [[phrase_003]]. Mix bars 2 and 3, as a path, in musical order, seed 4.", "ERR 1:74 Expected a seed only with the seeded order, but this mix is in musical order."],
  ["Take [[phrase_003]]. Extend bar 2 to 1 bar.", "OK [{\"op\":\"extend_bar\",\"bar\":2,\"bars\":1,\"style\":\"repeat_with_fills\",\"tempo_change_pct\":0}] => Take [[phrase_003]]. Extend bar 2 to 1 bar, repeating with fills."],
  ["Take [[phrase_003]]. Extend bar 2 to 64 bars.", "OK [{\"op\":\"extend_bar\",\"bar\":2,\"bars\":64,\"style\":\"repeat_with_fills\",\"tempo_change_pct\":0}] => Take [[phrase_003]]. Extend bar 2 to 64 bars, repeating with fills."],
  ["Take [[phrase_003]]. Extend bar 2 to 65 bars.", "ERR 1:38 Expected a number of bars from 1 to 64, but found 65."],
  ["Take [[phrase_003]]. Extend bar 2 to 0 bars.", "ERR 1:38 Expected a number of bars from 1 to 64, but found 0."],
  ["Take [[phrase_003]]. Extend bar 2 to 4 bars, 90 percent slower.", "OK [{\"op\":\"extend_bar\",\"bar\":2,\"bars\":4,\"style\":\"repeat_with_fills\",\"tempo_change_pct\":-90}] => Take [[phrase_003]]. Extend bar 2 to 4 bars, repeating with fills, 90 percent slower."],
  ["Take [[phrase_003]]. Extend bar 2 to 4 bars, 91 percent slower.", "ERR 1:46 Expected a tempo change of 0 to 90 percent slower, but found 91."],
  ["Take [[phrase_003]]. Extend bar 2 to 4 bars, 100 percent faster.", "OK [{\"op\":\"extend_bar\",\"bar\":2,\"bars\":4,\"style\":\"repeat_with_fills\",\"tempo_change_pct\":100}] => Take [[phrase_003]]. Extend bar 2 to 4 bars, repeating with fills, 100 percent faster."],
  ["Take [[phrase_003]]. Extend bar 2 to 4 bars, 101 percent faster.", "ERR 1:46 Expected a tempo change of 0 to 100 percent faster, but found 101."],
  ["Take [[phrase_003]]. Extend bar 2 to 4 bars, 0.5 percent faster.", "OK [{\"op\":\"extend_bar\",\"bar\":2,\"bars\":4,\"style\":\"repeat_with_fills\",\"tempo_change_pct\":0.5}] => Take [[phrase_003]]. Extend bar 2 to 4 bars, repeating with fills, 0.5 percent faster."],
  ["Take [[phrase_003]]. Extend [[bar_005]] to 8 bars.", "ERR 1:22 Expected \"Thin out ...\", \"Double up ...\", \"Keep ...\", \"Delete ...\", \"Copy ...\", \"Move ...\" or \"Bar N is replaced by [[a bar]]\", but found \"Extend\"."],
  ["Take [[phrase_003]]. Mix [[bar_005]] and [[bar_006]].", "ERR 1:22 Expected \"Thin out ...\", \"Double up ...\", \"Keep ...\", \"Delete ...\", \"Copy ...\", \"Move ...\" or \"Bar N is replaced by [[a bar]]\", but found \"Mix\"."],
];
test('GOLDEN: every sentence of the Mix and Extend steps gives exactly its answer (steps as JSON and the canonical sentence, or line:column, code and words)', () => {
  assert.equal(new Set(GOLDEN.map(([t]) => t)).size, GOLDEN.length, 'no sentence twice');
  for (const [text, want] of GOLDEN) assert.equal(render(text), want, text);
});

// ---- mutants no test can tell from the real code (listed so the next triage does not look at them again) -------------------------------------------------------------------------------------------------------------------
// EQUIVALENT (the same behaviour by another road):
//   src/bar-structure-core.ts:59 boundary#1 `o.tempo_change_pct < 0` -> `<= 0`: that branch is only reached when the change is not 0 (minus zero is `=== 0` too), so `<` and `<=` agree.
//   src/bar-structure-core.ts:151 empty-string#1 `op.after !== 'end'` -> `!== ''`: for "end" the next test `'end' > n` is NaN-false, so the refusal never fires either way.
//   src/phrase-core.ts:351 early-return#1 `return null` -> `return` in unexpectedField: both callers say `unexpectedField(...) ?? barNumberProblem(...)`, and `??` skips undefined as well as null.
//   src/phrase-grammar-core.ts:310 early-return#2, 362 early-return#1, 363 early-return#1, 378 early-return#3, 379 early-return#1 and #2, 380 early-return#1, 382 early-return#1, 410 early-return#1, 411 early-return#1 `return false;` -> `return;`: `segments` only asks `if (t.read())`, undefined is false.
//   src/phrase-grammar-core.ts:357 number+1#1 and #2 (orderAt = -1 -> -2, seedAt = -1 -> -2) and 384 boundary#1, 386 boundary#1 (`orderAt >= 0` / `voteAt >= 0` -> `> 0`): the markers are only ever compared with 0 and a place in the text is never 0 (the first sentence of a line cannot be a Mix step).
//   src/phrase-grammar-core.ts:368 drop-statement#1 (`named = 'b'` dropped) and 373 empty-string#2 (`'b'` -> `''`): `named` is only asked `=== 'a'`, so undefined, '' and 'b' all take the second bar's road.
//   src/phrase-grammar-core.ts:378 empty-string#3 (`mode = 'vote'` -> `mode = ''`): `mode` is only asked `=== 'path'` / `!== 'path'`, and the step gets its own literal 'vote'.
// UNREACHABLE (defensive):
//   src/phrase-grammar-core.ts:350 drop-statement#1 and empty-string#3 (readMixBars: no "bars" word) and 400 drop-statement#1 (readExtendBar: the same): `readStructureStep` has already checked /^\s*bars?\s+\d/ before it calls them, so the word is always there.
