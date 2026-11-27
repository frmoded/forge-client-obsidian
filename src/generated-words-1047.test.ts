// 2026-11-26-1047 (deliberate): what the plugin WRITES in the generated Recipe, and how it reads a note's Python fence. These pins lived beside the readers that are gone (recipe-grammar-core.test.ts, python-apply-core.test.ts); the writers and
// `pythonTextOf` stay, so their pins move here unchanged in substance (the round trip through the removed reader is dropped).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describe, type GrammarParams } from './phrase-grammar-core.ts';
import { MIX_DEFAULTS, PHRASE_DEFAULTS, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { phraseRecipeSteps, pythonTextOf } from './phrase-notes-core.ts';
import { arrangementRecipeSteps } from './arrangement-core.ts';
import { compositionRecipeSteps } from './composition-core.ts';
import { extractPythonSection } from './v2-note-core.ts';
import { GEN, rng } from './test-support/grammar-generators.ts';

/** The Recipe as the writers write it for `p`: one step per line. */
const recipeOf = (p: GrammarParams): string => (p.kind === 'arrangement' ? arrangementRecipeSteps(p) : p.kind === 'composition' ? compositionRecipeSteps(p) : phraseRecipeSteps(p)).join('\n');

test('an arrangement and a composition say their Recipe in the Description grammar\'s own sentences: the same steps, as a set, in the same words', () => {
  for (const kind of ['composition', 'arrangement']) {
    const r = rng(11);
    for (let i = 0; i < 200; i++) {
      const p = GEN[kind](r);
      const steps = recipeOf(p).split('\n');
      const said = describe(p).split(/\.\s+(?=[A-Z])/).map((x) => (x.endsWith('.') ? x : `${x}.`));
      assert.deepEqual([...steps].sort(), [...said].sort(), `${kind} #${i}`);
    }
  }
});

test('WHAT THE RECIPE SAYS: the exact sentences', () => {
  const R = recipeOf;
  assert.equal(R({ kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 }), 'Take [[bar_005]].\nRepeat it for 8 bars with fills, 20 % slower.');
  assert.equal(R({ kind: 'extend', source: 'bar_005', bars: 4, style: 'building', tempo_change_pct: 0 }), 'Take [[bar_005]].\nBuild it up over 4 bars.');
  assert.equal(R({ kind: 'morph', a: 'bar_003', b: 'bar_001', bars: 5, order: 'seeded', seed: 3 }), 'Take [[bar_003]] and [[bar_001]].\nMorph from the first to the second over 5 bars, in seeded order (seed 3).');
  assert.equal(R({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.7, threshold: 0.5, ghost: false }), 'Take [[bar_005]] and [[bar_006]].\nMix them by vote: 70 % [[bar_005]] and 30 % [[bar_006]], threshold 0.50, ghost notes off.');
  assert.equal(R({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.3333, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 0 }), 'Take [[bar_005]] and [[bar_006]].\nMix them as a path of single-hit changes from the first to the second, in musical order.\nKeep the state at weight 0.3333 (1 is all of [[bar_005]], 0 is all of [[bar_006]]).');
  assert.match(R({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 1, threshold: 0.3, ghost: true, mode: 'path', order: 'musical', seed: 0 }), /\nThreshold 30 percent\.\nWith ghost notes\.$/, 'a path says a threshold and ghost notes only when they are not the defaults');
  assert.doesNotMatch(R({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 1, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 0 }), /Threshold|ghost/);
  assert.equal(MIX_DEFAULTS.threshold, 0.5, 'the 0.5 the renderer compares with (phrase-notes-core.ts cannot import phrase-core.ts at run time) is the default');
});

test('a transform\'s Recipe has its own wording (transformOpWords): a range, a row, every amount (all, none, half, N %), both ways of keeping, a grid, a fork', () => {
  const p: GrammarParams = { kind: 'transform', source: 'phrases/phrase_006', ops: [
    { op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 },
    { op: 'thin_out', first: 4, last: 4, amount: 0.2575, keep: 'seeded', seed: 7 },
    { op: 'thin_out', first: 1, last: 2, row: 'clap-2', amount: 1 },
    { op: 'thin_out', first: 6, last: 6, amount: 0 },
    { op: 'double_up', first: 1, last: 2, grid: 16 },
    { op: 'double_up', first: 3, last: 7, row: 'snare', grid: 8 },
  ], overrides: { '9': 'bars/bar_009' } };
  assert.equal(recipeOf(p), [
    'Take [[phrase_006]].',
    'Thin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats.',
    'Thin out bar 4: remove 25.75 % of the hits, chosen by seed 7.',
    'Thin out bars 1 to 2, clap-2 row: remove all the hits, keeping the strongest beats.',
    'Thin out bar 6: remove none of the hits, keeping the strongest beats.',
    'Double up bars 1 to 2: every hit gets a second one a step later.',
    'Double up bars 3 to 7, snare row: every hit gets a second one a step later (grid 8).',
    'Bar 9 is replaced by [[bar_009]].',
  ].join('\n'));
});

test('pythonTextOf: the fence under # Python as the person has it - a comment at the start of a line stays in it (the shared extractor cuts the section there); the same text as the shared extractor for a note the plugin wrote', () => {
  const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 };
  const n = noteContentFor('phrase_001', EXTEND);
  assert.equal(pythonTextOf(n), extractPythonSection(n), 'a generated note: both read the same');
  const commented = n.replace('def compute(context):\n', 'def compute(context):\n# a comment at the start of a line\n');
  assert.match(pythonTextOf(commented)!, /# a comment at the start of a line\n {2}base/);
  assert.equal(pythonTextOf('no python here'), null);
});
