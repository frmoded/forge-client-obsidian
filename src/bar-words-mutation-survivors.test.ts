// 2026-11-19-0996b (BAR WORDS INSIDE A PHRASE) - MUTATION TRIAGE, the tests the diff-seeded pass (mutate.mjs --diff HEAD --max 600, 222 killed / 23 survived / 355 not run) showed were missing. Everything here is an EXACT-ANSWER test:
//   * the grammar GOLDEN: fifty sentences chosen (greedy set cover over every mutant of the changed lines of phrase-grammar-core.ts) so that every message, every place word, every refusal code, column and canonical sentence of the new words is
//     pinned: the answer of `parse` for each is the whole string below (ok: the steps as JSON and the canonical sentence `describe` says; error: line:column, the code if any, the words);
//   * the words of every op in a Recipe cell and a chip (phrase-words-core.ts), which no other test said for the new step.
// Not done on purpose: the other halves (validators, morphNewBars, planAppend, the click) are in bar-words-grammar / bar-words-replay / bar-words-click-wiring / bar-words-steps-core next to the tests they extend.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse, describe, canonical, type GrammarParams } from './phrase-grammar-core.ts';
import { transformOpShort, transformOpWords } from './phrase-words-core.ts';
import type { TransformOp } from './phrase-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const render = (text: string): string => {
  const r = parse(text, PHRASE_VAULT);
  if (r.ok) return `OK ${JSON.stringify((r.params as { ops?: unknown[] }).ops ?? [])} => ${describe(r.params)}`;
  const e = r.error; return `ERR ${e.line}:${e.column}${e.code ? ` [${e.code}]` : ''} ${e.message}`;
};

// 2026-11-19-0996b mutation survivor: src/phrase-grammar-core.ts:214..307 (readRange, readStructureStep, readMoveDirection, readPlace, readMorphBetween: the 48 survivors and the 202 killed ones of the not-run list: every `expected` string, every `kw` word, every number bound)
const GOLDEN: Array<[string, string]> = [
  ["Take [[phrase_003]]. Keep bars 5 to 3.", "ERR 1:37 Expected the last bar to be 5 or more, but found 3."],
  ["Take [[phrase_003]]. Keep bars 3 to.", "ERR 1:36 Expected a bar number, but found the end of the sentence."],
  ["Take [[phrase_003]]. Move bar 3 three bars left.", "ERR 1:33 [refused] Move takes one bar at a time. Say \"Move bar 3 one bar left.\" 3 times."],
  ["Take [[phrase_003]]. Move bar 3 0 bars left.", "ERR 1:33 [refused] Expected a move of one bar, but found 0 bars."],
  ["Take [[phrase_003]]. Move bar 3 a bar right.", "OK [{\"op\":\"move\",\"runs\":[[3,3]],\"by\":1}] => Take [[phrase_003]]. Move bar 3 one bar right."],
  ["Take [[phrase_003]]. Move bar 3 2 bar right.", "ERR 1:33 [refused] Move takes one bar at a time. Say \"Move bar 3 one bar right.\" twice."],
  ["Take [[phrase_003]]. Move bars 3 to 5 two bars back.", "ERR 1:39 [refused] Move takes one bar at a time. Say \"Move bars 3 to 5 one bar left.\" twice."],
  ["Take [[phrase_003]]. Move bar 3 to the.", "ERR 1:39 Expected \"one bar left\", \"one bar right\", \"back\" or \"forward\", but found the end of the sentence."],
  ["Take [[phrase_003]]. Move bar 3 one.", "ERR 1:33 Expected \"one bar left\", \"one bar right\", \"back\" or \"forward\", but found \"one\"."],
  ["Take [[phrase_003]]. Thin out bars 1 to 2, by half, keeping the downbeat. Keep bars 1 to 2.", "ERR 1:1 [order] Expected \"Keep\" to come before any \"Thin out\" or \"Double up\" (a change of which bars there are comes first), but it comes after one."],
  ["Take [[phrase_003]]. Thin out bars 1 to 2, by half, keeping the downbeat. Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.", "ERR 1:75 Expected \"Thin out ...\", \"Double up ...\", \"Keep ...\", \"Delete ...\", \"Copy ...\", \"Move ...\" or \"Bar N is replaced by [[a bar]]\", but found \"Morph\"."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bar 2 into bar 3 across 5 bars.", "OK [{\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":2}] => Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 2 across 5 bars.", "ERR 1:70 Expected two different bars to morph between, but found bar 2 twice."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 0 and 3 across 5 bars.", "ERR 1:64 Expected a bar number, 1 or more, but found 0."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 0 across 5 bars.", "ERR 1:70 Expected a bar number, 1 or more, but found 0."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 across 5 bars.", "ERR 1:66 Expected \"and\", but found \"across\"."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 over 5 new bars.", "OK [{\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":2}] => Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 65 bars.", "ERR 1:79 Expected a number of new bars from 1 to 64, but found 65."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5.", "ERR 1:80 Expected \"bars\", but found the end of the sentence."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3.", "ERR 1:59 Expected \"across N bars\" (how many new bars to make between them), but found none."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in seeded order.", "OK [{\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"seeded\",\"seed\":0,\"after\":2}] => Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in seeded order, seed 0, and put them between bars 2 and 3."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in musical order, seed 4.", "ERR 1:110 Expected a seed only with the seeded order, but this morph is in musical order."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in random order.", "ERR 1:87 Expected \"across N bars\", an order (\"in musical order\", also seeded, by-channel), \"seed N\" or a place (\"after bar N\", \"before bar N\", \"between bars N and M\", \"at the start\", \"at the end\"), but found \"in\"."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in seeded order, seed 17, seed 18.", "ERR 1:113 Expected \"seed N\" to be said once, but it is said twice."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in seeded order, in musical order.", "ERR 1:104 Expected the order to be said once, but it is said twice."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in seeded order, seed 9007199254740993.", "ERR 1:109 Expected a seed, 0 or more, but found 9007199254740993."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars put it before bar 2.", "OK [{\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":1}] => Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in musical order, and put them after bar 1."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars at the beginning.", "OK [{\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":0}] => Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in musical order, and put them at the start."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars between bar 2 bar 3.", "ERR 1:100 Expected \"and\", but found \"bar\"."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars and put them.", "ERR 1:98 Expected a place (\"after bar N\", \"before bar N\", \"between bars N and M\", \"at the start\" or \"at the end\"), but found the end of the sentence."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars after bars 3.", "OK [{\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":3}] => Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in musical order, and put them after bar 3."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars after bar 0.", "ERR 1:96 Expected a bar number (\"after bar N\"), 1 or more, but found 0."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars before bar 0.", "ERR 1:97 Expected a bar number (\"before bar N\"), 1 or more, but found 0."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars place them at the end.", "OK [{\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":\"end\"}] => Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in musical order, and put them at the end."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars place it at the start.", "OK [{\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":0}] => Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in musical order, and put them at the start."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars put those after bar 2.", "OK [{\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":2}] => Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars after bar 3 at the end.", "ERR 1:98 Expected the place to be said once, but it is said twice."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars between 2 and.", "ERR 1:99 Expected a bar number, but found the end of the sentence."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars between.", "ERR 1:93 Expected a bar number, but found the end of the sentence."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars and.", "ERR 1:89 Expected a place (\"after bar N\", \"before bar N\", \"between bars N and M\", \"at the start\" or \"at the end\"), but found the end of the sentence."],          // 2026-11-24-1040 (deliberate): an \`and\` that no place follows says what is missing (the place), not the whole list of segments (the \`across N bars\` was already said); it was 1:86 \`Expected "across N bars", an order ... but found "and".\`
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars across 4 bars.", "ERR 1:86 Expected \"across N bars\" to be said once, but it is said twice."],
  ["Morph bars 2 and 3 across 5 bars.", "ERR 1:1 [head] A phrase starts with Extend, Mix, Morph or Take: \"Morph bars N and M across K bars\" works on the bars the phrase already has, so it comes after the first line."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Duplicate bar 2. Move bar 3 back. Remove bar 4. Morph bars 2 and 3 across 5 bars, in seeded order, seed 9, and put them after bar 3.", "OK [{\"op\":\"copy\",\"runs\":[[2,2]]},{\"op\":\"move\",\"runs\":[[3,3]],\"by\":-1},{\"op\":\"delete\",\"runs\":[[4,4]]},{\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"seeded\",\"seed\":9,\"after\":3}] => Extend [[bar_005]] to 8 bars, repeating with fills. Copy bar 2. Move bar 3 one bar left. Delete bar 4. Morph bars 2 and 3 across 5 bars, in seeded order, seed 9, and put them after bar 3."],
  ["Take [[phrase_003]]. Delete bar 1. Morph bars 2 and 3 across 2 bars. Copy bar 1. Thin out bars 1 to 2, by half, keeping the downbeat. Double up bar 1.", "OK [{\"op\":\"delete\",\"runs\":[[1,1]]},{\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":2,\"order\":\"musical\",\"seed\":0,\"after\":2},{\"op\":\"copy\",\"runs\":[[1,1]]},{\"op\":\"thin_out\",\"first\":1,\"last\":2,\"amount\":0.5},{\"op\":\"double_up\",\"first\":1,\"last\":1,\"grid\":16}] => Take [[phrase_003]]. Delete bar 1. Morph bars 2 and 3 across 2 bars, in musical order, and put them between bars 2 and 3. Copy bar 1. Thin out bars 1 to 2, by half, keeping the downbeat. Double up bar 1."],
  ["Take [[phrase_003]]. Keep bars 1 to 1.", "OK [{\"op\":\"keep\",\"runs\":[[1,1]]}] => Take [[phrase_003]]. Keep bar 1."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars before bars 3.", "OK [{\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":2}] => Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars between bars 2 and bars 3.", "OK [{\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":2}] => Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars between bars 2 and 1.", "ERR 1:99 Expected two neighbouring bars after \"between\", but found bar 2 and bar 1."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars between bar 1 and bar 2.", "OK [{\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":1}] => Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in musical order, and put them after bar 1."],
  ["Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 to bars 3 across 5 bars.", "OK [{\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":2}] => Extend [[bar_005]] to 8 bars, repeating with fills. Morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3."],
];
test('GOLDEN of the new words: every sentence is read or refused with EXACTLY these words, this line and column and this code (the answer of parse, whole)', () => {
  for (const [text, want] of GOLDEN) assert.equal(render(text), want, text);
  assert.equal(GOLDEN.length, 50);
});
test('GOLDEN: every OK sentence reads back from the canonical sentence it was written as, to the same params (the list shows the canonical word, the service reads it again)', () => {
  let ok = 0;
  for (const [text, want] of GOLDEN) {
    if (!want.startsWith('OK ')) continue;
    const first = parse(text, PHRASE_VAULT); assert.ok(first.ok, text); if (!first.ok) continue;
    const again = parse(describe(first.params), PHRASE_VAULT); assert.ok(again.ok, `${describe(first.params)} -> ${again.ok ? '' : again.error.message}`);
    if (again.ok) assert.deepEqual(again.params, canonical(first.params as GrammarParams), text);
    ok++;
  }
  assert.ok(ok >= 10, `${ok} sentences read`);
});

// 2026-11-19-0996b mutation survivor: src/phrase-words-core.ts:28 (transformOpShort: the five structure ops say their words, a thin out and a double up their short ones) and :19 (transformOpWords)
const WORDS: Array<[TransformOp, string, string]> = [
  [{"op":"keep","runs":[[1,2],[5,5]]}, "keep bars 1 to 2 and bar 5", "keep bars 1 to 2 and bar 5"],
  [{"op":"delete","runs":[[3,3]]}, "delete bar 3", "delete bar 3"],
  [{"op":"copy","runs":[[2,4]]}, "copy bars 2 to 4", "copy bars 2 to 4"],
  [{"op":"move","runs":[[2,2]],"by":-1}, "move bar 2 one bar left", "move bar 2 one bar left"],
  [{"op":"move","runs":[[2,3],[6,6]],"by":1}, "move bars 2 to 3 and bar 6 one bar right", "move bars 2 to 3 and bar 6 one bar right"],
  [{"op":"morph_between","a":2,"b":3,"bars":5,"order":"musical","seed":0,"after":2}, "morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3", "morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3"],
  [{"op":"morph_between","a":6,"b":1,"bars":1,"order":"seeded","seed":4,"after":"end"}, "morph bars 6 and 1 across 1 bar, in seeded order, seed 4, and put it at the end", "morph bars 6 and 1 across 1 bar, in seeded order, seed 4, and put it at the end"],
  [{"op":"thin_out","first":1,"last":2,"amount":0.5}, "thin out bars 1 to 2: remove half of the hits, keeping the strongest beats", "thin out bars 1 to 2"],
  [{"op":"thin_out","first":3,"last":3,"amount":1,"row":"kick"}, "thin out bar 3, kick row: remove all the hits, keeping the strongest beats", "thin out bar 3, kick row"],
  [{"op":"thin_out","first":1,"last":4,"amount":0.25,"keep":"seeded","seed":7}, "thin out bars 1 to 4: remove 25 % of the hits, chosen by seed 7", "thin out bars 1 to 4"],
  [{"op":"double_up","first":1,"last":2,"grid":16}, "double up bars 1 to 2: every hit gets a second one a step later", "double up bars 1 to 2"],
  [{"op":"double_up","first":2,"last":5,"grid":8,"row":"snare"}, "double up bars 2 to 5, snare row: every hit gets a second one a step later (grid 8)", "double up bars 2 to 5, snare row"],
];
test('transformOpWords / transformOpShort say every op: the structure steps (and the morph between two bars) in their own words in both, a thin out and a double up in their long and their short forms', () => {
  for (const [op, long, short] of WORDS) { assert.equal(transformOpWords(op), long, JSON.stringify(op)); assert.equal(transformOpShort(op), short, JSON.stringify(op)); }
});
