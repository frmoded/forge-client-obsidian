// 2026-10-27-1030 (M14 slice 1, design 4.13): the phrase kind `transform`. A transform phrase is a note with ONE json fence like the others:
//   { "kind": "transform", "source": "phrases/phrase_006", "ops": [ { "op": "thin_out" | "double_up", "first", "last", "row"?, "amount"? | "grid"?, "keep"?, "seed"? } ], "overrides"? }
// `source` names another PHRASE note (its bars are what the ops change), so a wikilink to it is in the Recipe and the links list, and the structure strip and backlinks already work.
// Pure: validation, the words an op reads in, the json text, the starter note and the next free name. The engine runs the ops (forge/music/lib.py thin_out_bars / double_up_bars).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  TRANSFORM_OPS_MAX, formatPhraseJson, noteContentFor, planNewTransform, readPhraseKind, readPhraseNote, rangeWords, selectionWords, transformNoteContent, transformOpWords, validatePhrase,
  type PhraseParams, type TransformOp,
} from './phrase-core.ts';

const THIN: TransformOp = { op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 };
const DOUBLE: TransformOp = { op: 'double_up', first: 7, last: 9, grid: 16 };
const T = (over: object = {}) => ({ kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 }], ...over });

test('a valid transform: the source phrase, the ops; what the op does not say takes its default and the value is normalised', () => {
  assert.deepEqual(validatePhrase(T()), { ok: true, value: { kind: 'transform', source: 'phrases/phrase_006', ops: [THIN] } });
  assert.deepEqual(validatePhrase(T({ ops: [{ op: 'thin_out', first: 3, last: 5 }] })), { ok: true, value: { kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'thin_out', first: 3, last: 5, amount: 0.5 }] } });
  assert.deepEqual(validatePhrase(T({ ops: [{ op: 'double_up', first: 7, last: 9 }] })), { ok: true, value: { kind: 'transform', source: 'phrases/phrase_006', ops: [DOUBLE] } });
  assert.deepEqual(validatePhrase(T({ ops: [{ op: 'thin_out', first: 1, last: 1, amount: 0.25, keep: 'seeded', seed: 3 }, { op: 'double_up', first: 2, last: 2, row: 'snare', grid: 8 }] })).ok && true, true);
  const seeded = validatePhrase(T({ ops: [{ op: 'thin_out', first: 1, last: 1, amount: 0.25, keep: 'seeded', seed: 3 }] }));
  assert.deepEqual(seeded.ok && seeded.value.kind === 'transform' && seeded.value.ops[0], { op: 'thin_out', first: 1, last: 1, amount: 0.25, keep: 'seeded', seed: 3 });
  const downbeat = validatePhrase(T({ ops: [{ op: 'thin_out', first: 1, last: 1, keep: 'downbeat' }] }));
  assert.deepEqual(downbeat.ok && downbeat.value.kind === 'transform' && downbeat.value.ops[0], { op: 'thin_out', first: 1, last: 1, amount: 0.5 }, 'the default keep is not written');
  const seededNoSeed = validatePhrase(T({ ops: [{ op: 'thin_out', first: 1, last: 1, keep: 'seeded' }] }));
  assert.deepEqual(seededNoSeed.ok && seededNoSeed.value.kind === 'transform' && seededNoSeed.value.ops[0], { op: 'thin_out', first: 1, last: 1, amount: 0.5, keep: 'seeded', seed: 0 });
});

test('overrides (forks) compose with a transform: bar numbers of the derived bars, note ids like every other kind', () => {
  const ok = validatePhrase(T({ overrides: { '4': 'bars/bar_009', '2': 'bars/bar_010' } }));
  assert.ok(ok.ok && ok.value.kind === 'transform');
  if (ok.ok && ok.value.kind === 'transform') assert.deepEqual(ok.value.overrides, { '2': 'bars/bar_010', '4': 'bars/bar_009' });
  assert.equal(validatePhrase(T({ overrides: {} })).ok && true, true);
  const bad = validatePhrase(T({ overrides: { '0': 'bars/bar_009' } }));
  assert.ok(!bad.ok && /overrides: "0" is not a bar of this phrase/.test(bad.message));
  const bad2 = validatePhrase(T({ overrides: { '2': 'nope' } }));
  assert.ok(!bad2.ok && /overrides: bar 2 must name a bar note/.test(bad2.message));
});

test('every refusal names the field', () => {
  const msg = (raw: unknown) => { const r = validatePhrase(raw); assert.equal(r.ok, false, JSON.stringify(raw)); return (r as { message: string }).message; };
  assert.match(msg(T({ source: 'phrase_006' })), /source must be a phrase note without \.md, like phrases\/phrase_006/);
  assert.match(msg(T({ source: 'phrases/phrase_006.md' })), /source must be a phrase note/);
  assert.match(msg(T({ source: 'bars/bar_005' })), /source must be a phrase note/);
  assert.match(msg(T({ source: 7 })), /source must be a phrase note/);
  assert.match(msg(T({ ops: [] })), /ops must be a list of 1 to 16 operations/);
  assert.match(msg(T({ ops: 'thin' })), /ops must be a list of 1 to 16 operations/);
  assert.match(msg(T({ ops: Array.from({ length: TRANSFORM_OPS_MAX + 1 }, () => ({ op: 'double_up', first: 1, last: 1 })) })), /ops must be a list of 1 to 16/);
  assert.match(msg(T({ ops: [null] })), /ops\[0\] must be an object/);
  assert.match(msg(T({ ops: [{ op: 'melt', first: 1, last: 1 }] })), /ops\[0\]\.op must be "thin_out" or "double_up", got "melt"/);
  for (const [first, last] of [[0, 1], [2, 1], [1.5, 2], ['1', 2], [1, undefined], [-1, 2]]) {
    assert.match(msg(T({ ops: [{ op: 'double_up', first, last }] })), /ops\[0\]: first and last must be whole bar numbers with 1 <= first <= last/);
  }
  assert.match(msg(T({ ops: [{ op: 'thin_out', first: 1, last: 1, row: 'ki ck' }] })), /ops\[0\]\.row must be a channel name/);
  assert.match(msg(T({ ops: [{ op: 'thin_out', first: 1, last: 1, row: 3 }] })), /ops\[0\]\.row must be a channel name/);
  for (const amount of [-0.1, 1.1, '0.5', null]) assert.match(msg(T({ ops: [{ op: 'thin_out', first: 1, last: 1, amount }] })), /ops\[0\]\.amount must be a number from 0 to 1/);
  assert.match(msg(T({ ops: [{ op: 'thin_out', first: 1, last: 1, keep: 'loudest' }] })), /ops\[0\]\.keep must be "downbeat" or "seeded"/);
  assert.match(msg(T({ ops: [{ op: 'thin_out', first: 1, last: 1, seed: 2 }] })), /ops\[0\]\.seed only applies with keep "seeded"/);
  assert.match(msg(T({ ops: [{ op: 'thin_out', first: 1, last: 1, keep: 'seeded', seed: -1 }] })), /ops\[0\]\.seed must be a whole number, 0 or more/);
  for (const grid of [0, 1.5, '16', null]) assert.match(msg(T({ ops: [{ op: 'double_up', first: 1, last: 1, grid }] })), /ops\[0\]\.grid must be a whole number, 1 or more/);
  assert.match(msg(T({ ops: [{ op: 'double_up', first: 1, last: 1, amount: 0.5 }] })), /ops\[0\]: amount only applies to thin_out/);
  assert.match(msg(T({ ops: [{ op: 'thin_out', first: 1, last: 1, grid: 8 }] })), /ops\[0\]: grid only applies to double_up/);
  assert.match(msg(T({ ops: [{ op: 'thin_out', first: 1, last: 1, volume: 3 }] })), /ops\[0\]: unexpected field "volume"/);
  assert.match(msg(T({ extra: 1 })), /Unexpected field "extra" \(a transform holds only kind, source, ops, overrides\)/);
  assert.match(msg(T({ ops: [THIN, { op: 'double_up', first: 2, last: 1 }] })), /ops\[1\]: first and last/);
});

test('the kind is named in the refusal of an unknown kind, and readPhraseKind knows a transform even when the rest is wrong', () => {
  const r = validatePhrase({ kind: 'remix' });
  assert.ok(!r.ok && r.message === 'kind must be "extend", "mix", "morph" or "transform", got "remix".');
  const note = (json: string) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${json}\n\`\`\`\n`;
  assert.equal(readPhraseKind(note('{"kind": "transform", "source": 7}')), 'transform');
  assert.equal(readPhraseKind(note('{"kind": "transform", "source": "phrases/phrase_006", "ops": []}')), 'transform');
});

test('the words: a range, a selection with its row, an op in a sentence', () => {
  assert.equal(rangeWords(3, 5), 'bars 3 to 5');
  assert.equal(rangeWords(4, 4), 'bar 4');
  assert.equal(selectionWords(3, 5, 'kick'), 'bars 3 to 5, kick row');
  assert.equal(selectionWords(3, 5, undefined), 'bars 3 to 5');
  assert.equal(selectionWords(2, 2), 'bar 2');
  assert.equal(transformOpWords(THIN), 'thin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats');
  assert.equal(transformOpWords({ op: 'thin_out', first: 1, last: 1, amount: 1 }), 'thin out bar 1: remove all the hits, keeping the strongest beats');
  assert.equal(transformOpWords({ op: 'thin_out', first: 1, last: 2, amount: 0 }), 'thin out bars 1 to 2: remove none of the hits, keeping the strongest beats');
  assert.equal(transformOpWords({ op: 'thin_out', first: 1, last: 2, amount: 0.25, keep: 'seeded', seed: 3 }), 'thin out bars 1 to 2: remove 25 % of the hits, chosen by seed 3');
  assert.equal(transformOpWords(DOUBLE), 'double up bars 7 to 9: every hit gets a second one a step later');
  assert.equal(transformOpWords({ op: 'double_up', first: 7, last: 7, row: 'snare', grid: 8 }), 'double up bar 7, snare row: every hit gets a second one a step later (grid 8)');
});

test('the json text: field order as the design shows it, ops one per line, overrides in bar order; it reads back to the same value', () => {
  const p: PhraseParams = { kind: 'transform', source: 'phrases/phrase_006', ops: [THIN, DOUBLE, { op: 'thin_out', first: 1, last: 1, amount: 0.25, keep: 'seeded', seed: 3 }], overrides: { '10': 'bars/bar_012', '2': 'bars/bar_011' } };
  assert.equal(formatPhraseJson(p), [
    '{',
    '  "kind": "transform",',
    '  "source": "phrases/phrase_006",',
    '  "ops": [',
    '    {"op": "thin_out", "first": 3, "last": 5, "row": "kick", "amount": 0.5},',
    '    {"op": "double_up", "first": 7, "last": 9, "grid": 16},',
    '    {"op": "thin_out", "first": 1, "last": 1, "amount": 0.25, "keep": "seeded", "seed": 3}',
    '  ],',
    '  "overrides": {',
    '    "2": "bars/bar_011",',
    '    "10": "bars/bar_012"',
    '  }',
    '}',
  ].join('\n'));
  const note = noteContentFor('phrase_007', p);
  const read = readPhraseNote(note);
  assert.ok(read.ok);
  if (read.ok) assert.equal(formatPhraseJson(read.value), formatPhraseJson(p), 'JSON -> note -> JSON, byte for byte');
  const plain: PhraseParams = { kind: 'transform', source: 'phrases/phrase_006', ops: [THIN] };
  assert.equal(formatPhraseJson(plain), ['{', '  "kind": "transform",', '  "source": "phrases/phrase_006",', '  "ops": [', '    {"op": "thin_out", "first": 3, "last": 5, "row": "kick", "amount": 0.5}', '  ]', '}'].join('\n'));
});

test('the starter note and the next free name: the same loop every new phrase uses', () => {
  const content = transformNoteContent('phrase_007', 'phrases/phrase_006', [THIN]);
  assert.equal(content, noteContentFor('phrase_007', { kind: 'transform', source: 'phrases/phrase_006', ops: [THIN] }));
  const read = readPhraseNote(content);
  assert.ok(read.ok && read.value.kind === 'transform');
  const plan = planNewTransform({ source: 'phrases/phrase_006', ops: [THIN], existingBasenames: ['phrase_001', 'phrase_006'], exists: () => false });
  assert.deepEqual(plan.ok && { name: plan.name, path: plan.path }, { name: 'phrase_007', path: 'phrases/phrase_007.md' });
  assert.ok(plan.ok && plan.content === transformNoteContent('phrase_007', 'phrases/phrase_006', [THIN]));
  const taken = planNewTransform({ source: 'phrases/phrase_006', ops: [THIN], existingBasenames: [], exists: () => true });
  assert.ok(!taken.ok && /Could not find a free phrase name/.test(taken.message));
  const bad = planNewTransform({ source: 'bars/bar_001', ops: [THIN], existingBasenames: [], exists: () => false });
  assert.ok(!bad.ok && /source must be a phrase note/.test(bad.message), 'a plan that does not validate is never a note');
});
