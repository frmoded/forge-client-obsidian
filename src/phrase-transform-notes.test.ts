// 2026-10-27-1030: a transform phrase note reads in the Forge shape like the other kinds (1020): # Description, # Recipe (English steps), # Python, then the ONE json fence. The Python of a transform reads its source phrase by calling it by
// name and hands the bars to the region functions of forge/music/lib.py; it parses, and run on the real engine over a stand-in for the source it does what the Score does (phrase-transform-engine.test.ts).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { formatPhraseJson, noteContentFor, readPhraseNote, refreshPhraseNoteText, type PhraseParams, type TransformOp } from './phrase-core.ts';
import { DERIVED_NOTE, derivedSections, phraseDescription, phraseLinks, phrasePython, phraseRecipeSteps } from './phrase-notes-core.ts';
import { chipsFor, barParent, barsContributedBy, stripText } from './structure-strip-core.ts';

const THIN: TransformOp = { op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 };
const DOUBLE: TransformOp = { op: 'double_up', first: 7, last: 9, grid: 16 };
const T: PhraseParams = { kind: 'transform', source: 'phrases/phrase_006', ops: [THIN] };
const T2: PhraseParams = { kind: 'transform', source: 'phrases/phrase_006', ops: [THIN, DOUBLE, { op: 'thin_out', first: 1, last: 2, amount: 0.25, keep: 'seeded', seed: 3 }], overrides: { '4': 'bars/bar_009' } };

test('Description, links and Recipe of a transform: the source PHRASE is the wikilink, each op is a step, a fork is a step', () => {
  assert.equal(phraseDescription('phrase_007', T), 'phrase_007 — a transform of [[phrase_006]]: thin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats.');
  assert.deepEqual(phraseLinks(T), ['phrase_006']);
  assert.deepEqual(phraseRecipeSteps(T), ['Take [[phrase_006]].', 'Thin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats.']);
  assert.deepEqual(phraseRecipeSteps(T2), [
    'Take [[phrase_006]].',
    'Thin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats.',
    'Double up bars 7 to 9: every hit gets a second one a step later.',
    'Thin out bars 1 to 2: remove 25 % of the hits, chosen by seed 3.',
    'Bar 4 is replaced by [[bar_009]].',
  ]);
  assert.deepEqual(phraseLinks(T2), ['phrase_006', 'bar_009']);
  assert.ok(phraseDescription('phrase_007', T2).endsWith('Edited by hand: bar 4 is [[bar_009]].'));
});

test('Python of a transform: the source phrase called by name, one region call per op in order, forks by index, the Score last', () => {
  assert.equal(phrasePython(T), [
    'def compute(context):',
    '  bars = phrase_006()',
    "  bars = thin_out_bars(bars=bars, first=3, last=5, row='kick', amount=0.5)",
    '  return rhythm_bars_to_stream(bars=bars)',
  ].join('\n'));
  assert.equal(phrasePython(T2), [
    'def compute(context):',
    '  bars = phrase_006()',
    "  bars = thin_out_bars(bars=bars, first=3, last=5, row='kick', amount=0.5)",
    '  bars = double_up_bars(bars=bars, first=7, last=9, grid=16)',
    "  bars = thin_out_bars(bars=bars, first=1, last=2, amount=0.25, keep='seeded', seed=3)",
    '  bars[3] = bar_009()',
    '  return rhythm_bars_to_stream(bars=bars)',
  ].join('\n'));
  for (const p of [T, T2, { ...T, ops: [{ op: 'double_up', first: 1, last: 1, row: 'snare', grid: 8 }] } as PhraseParams]) {
    assert.equal(spawnSync('python3', ['-I', '-c', 'import ast,sys; ast.parse(sys.stdin.read())'], { input: phrasePython(p), encoding: 'utf8' }).status, 0, JSON.stringify(p));
  }
});

test('the whole note, golden: frontmatter with whole-value links, the comment, # Description, # Recipe, # Python, the json fence last; it reads back; a refresh changes nothing', () => {
  const note = noteContentFor('phrase_007', T);
  assert.equal(note, [
    '---', 'type: data', 'content_type: json',
    'description: "phrase_007 — a transform of [[phrase_006]]: thin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats."',
    'links:', '  - "[[phrase_006]]"', '---', '',
    DERIVED_NOTE, '',
    '# Description', '', 'phrase_007 — a transform of [[phrase_006]]: thin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats.', '',
    '# Recipe', '', 'Take [[phrase_006]].', 'Thin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats.', '',
    '# Python', '', '```python', phrasePython(T), '```', '',
    '```json', formatPhraseJson(T), '```', '',
  ].join('\n'));
  const read = readPhraseNote(note);
  assert.ok(read.ok);
  if (read.ok) assert.equal(formatPhraseJson(read.value), formatPhraseJson(T));
  const r = refreshPhraseNoteText(note, 'phrase_007');
  assert.ok(r.ok && !r.changed);
  assert.ok(derivedSections('p', T2).includes('  bars[3] = bar_009()'));
});

test('the structure strip of a transform: the source phrase chip, an arrow, the transform chip, then the forks; the strip text is the golden', () => {
  assert.equal(stripText(chipsFor('phrase_007', T)), '[phrase_006] -> [phrase_007 transform, thin out bars 3 to 5, kick row]');
  assert.equal(stripText(chipsFor('phrase_007', T2)), '[phrase_006] -> [phrase_007 transform, 3 ops] [bar_009 fork of bar 4]');
  assert.deepEqual(chipsFor('phrase_007', T)[0], { text: 'phrase_006', noteId: 'phrases/phrase_006', kind: 'source' });
});

test('which bars a note contributed to, for the two-way highlight: the source phrase made every bar (a fork replaces one), the transform phrase itself made them all', () => {
  assert.equal(barParent(T, 2), 'phrase_006');
  assert.equal(barParent(T2, 4), 'bar_009');
  assert.deepEqual(barsContributedBy(T, 'phrase_006', undefined, 6), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(barsContributedBy(T2, 'phrase_006', undefined, 6), [1, 2, 3, 5, 6]);
  assert.deepEqual(barsContributedBy(T2, 'bar_009', undefined, 6), [4]);
  assert.deepEqual(barsContributedBy(T, 'phrase_007', 'phrase_007', 6), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(barsContributedBy(T, 'phrase_006', undefined), [1, 2, 3, 4, 5], 'without a known count: up to the last bar an op names');
});
