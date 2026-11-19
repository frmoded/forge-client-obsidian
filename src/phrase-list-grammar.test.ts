// 2026-11-19-0980 (THE LIST MODEL, stage 2: PHRASES) - the GRAMMAR half: what the phrase grammar reads and `describe` writes now that a phrase's Description is a list whose line 1 is the HEAD (Extend, Mix, Morph or Take) and whose later lines
// are transforms. Written RED first (against the stage-1 code: `Take [[x]].` alone was refused, the modifier lines did not exist, a Keep after an Extend, a Mix or a Morph was refused). The properties pinned:
//   * `Take [[x]].` alone is a phrase: a copy of x (zero changes); its Recipe, Python, json and note words say so;
//   * "Make it N percent slower." / "Make it N percent faster." edit the Extend head's tempo segment, "Make it N bars long." the length segment of an Extend or a Morph; the last one said wins; a head with no such segment refuses them in words;
//   * a structure step (Keep, Delete, Copy, Move) is valid after ANY head; a Thin out or a Double up only after a Take; a structure step after a density step is refused with the code `order` (never re-sorted);
//   * EVERY sentence that was readable before is still readable and `describe` still writes it byte for byte (golden over the 14 playground notes and 12 more paragraphs).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse, describe, type GrammarParams } from './phrase-grammar-core.ts';
import * as desc from './phrase-describe-core.ts';
import { phraseDescription, phraseLinks, phrasePython, phraseRecipeSteps } from './phrase-notes-core.ts';
import { formatPhraseJson, validatePhrase, readPhraseNote } from './phrase-core.ts';
import { parseRecipe } from './recipe-grammar-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { EXTRA_PARAGRAPHS, PHRASE_VAULT, PLAYGROUND_PHRASES } from './test-support/phrase-list-fixtures.ts';

const V = PHRASE_VAULT;
const ok = (text: string): GrammarParams => { const r = parse(text, V); assert.ok(r.ok, `"${text}" should read: ${r.ok ? '' : r.error.message}`); return (r as { ok: true; params: GrammarParams }).params; };
const bad = (text: string): { message: string; line: number; column: number; code?: string } => { const r = parse(text, V); assert.ok(!r.ok, `"${text}" should be refused`); return (r as { ok: false; error: { message: string; line: number; column: number; code?: string } }).error; };

// ---- Take [[x]]. alone -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('`Take [[phrase_003]].` alone is readable: a transform with NO change, a copy of phrase_003', () => {
  const p = ok('Take [[phrase_003]].') as { kind: string; source: string; ops: unknown[] };
  assert.equal(p.kind, 'transform'); assert.equal(p.source, 'phrases/phrase_003'); assert.deepEqual(p.ops, []);
  assert.equal(describe(p as GrammarParams), 'Take [[phrase_003]].', 'and it is said back the same');
  assert.deepEqual(ok(describe(p as GrammarParams)), p);
});

test('a copy of x has every derived part: json, Recipe, Python (the bars of x, returned), the note words, the links; and the validators accept it', () => {
  const p = ok('Take [[phrase_003]].');
  assert.ok(validatePhrase(p).ok, 'the plugin\'s own validators accept zero changes');
  assert.equal(formatPhraseJson(p as never), ['{', '  "kind": "transform",', '  "source": "phrases/phrase_003",', '  "ops": [', '  ]', '}'].join('\n'));
  assert.deepEqual(phraseRecipeSteps(p as never), ['Take [[phrase_003]].']);
  assert.match(phrasePython(p as never), /def compute\(context\):\n {2}bars = phrase_003\(\)\n {2}return bars/);
  assert.deepEqual(phraseLinks(p as never), ['phrase_003']);
  assert.match(phraseDescription('phrase_020', p as never), /^phrase_020 — a copy of \[\[phrase_003\]\]\.$/);
  const back = parseRecipe('Take [[phrase_003]].', V); assert.ok(back.ok, 'the Recipe of a copy reads back'); assert.deepEqual(back.ok && back.params, p);
  const read = readPhraseNote(`---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${formatPhraseJson(p as never)}\n\`\`\`\n`); assert.ok(read.ok, 'the json cache of a copy reads back');
});

test('a Take of an arrangement or a composition alone is a copy too; a Take of a note that is not there is still refused by name', () => {
  assert.equal((ok('Take [[arr_001]].') as { source: string }).source, 'arrangements/arr_001');
  assert.equal((ok('Take [[song_1]].') as { source: string }).source, 'compositions/song_1');
  assert.match(bad('Take [[nobody]].').message, /nobody/);
});

// ---- the modifier lines ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('"Make it 20 percent slower." and "Make it 10 percent faster." edit the tempo segment of an Extend head; the last one said wins', () => {
  const head = 'Extend [[bar_005]] to 8 bars, repeating with fills.';
  assert.equal((ok(`${head} Make it 20 percent slower.`) as { tempo_change_pct: number }).tempo_change_pct, -20);
  assert.equal((ok(`${head} Make it 10 percent faster.`) as { tempo_change_pct: number }).tempo_change_pct, 10);
  assert.equal((ok(`${head} Make it 20 percent slower. Make it 5 percent faster.`) as { tempo_change_pct: number }).tempo_change_pct, 5);
  assert.equal((ok('Extend [[bar_005]] to 8 bars, repeating with fills, 30 percent slower. Make it 10 percent faster.') as { tempo_change_pct: number }).tempo_change_pct, 10, 'a modifier replaces what the head said');
  assert.equal((ok(`${head} Make it 0 percent slower.`) as { tempo_change_pct: number }).tempo_change_pct, 0);
});

test('"Make it 12 bars long." edits the length segment of an Extend head and of a Morph head; forks are checked against the NEW length', () => {
  const e = ok('Extend [[bar_005]] to 4 bars, repeating with fills. Make it 12 bars long.') as { bars: number };
  assert.equal(e.bars, 12);
  const m = ok('Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order. Make it 9 bars long.') as { bars: number };
  assert.equal(m.bars, 9);
  assert.equal((ok('Extend [[bar_005]] to 4 bars, repeating with fills. Make it 1 bar long.') as { bars: number }).bars, 1, 'one bar is "1 bar long"');
  const shrunk = bad('Extend [[bar_005]] to 8 bars, repeating with fills. Bar 6 is replaced by [[bar_009]]. Make it 4 bars long.');
  assert.match(shrunk.message, /bar of this phrase \(1 to 4\)/i, shrunk.message);
});

test('the modifier lines are said by `describe`\'s helper words, and the sentences they make read back to the same number', () => {
  assert.equal(desc.tempoModifierSentence(-20), 'Make it 20 percent slower.');
  assert.equal(desc.tempoModifierSentence(12), 'Make it 12 percent faster.');
  assert.equal(desc.tempoModifierSentence(0), 'Make it 0 percent slower.');
  assert.equal(desc.lengthModifierSentence(8), 'Make it 8 bars long.');
  assert.equal(desc.lengthModifierSentence(1), 'Make it 1 bar long.');
  const head = 'Extend [[bar_005]] to 4 bars, repeating with fills.';
  for (const pct of [-90, -33.5, -1, 0, 7, 100]) assert.equal((ok(`${head} ${desc.tempoModifierSentence(pct)}`) as { tempo_change_pct: number }).tempo_change_pct, pct);
  for (const bars of [1, 2, 17, 64]) assert.equal((ok(`${head} ${desc.lengthModifierSentence(bars)}`) as { bars: number }).bars, bars);
});

test('a head with no such segment refuses a modifier in words that name the head: a tempo needs an Extend; a length needs an Extend or a Morph; a Mix and a Take have neither', () => {
  assert.match(bad('Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order. Make it 10 percent faster.').message, /tempo.*Extend|Extend.*tempo/i);
  assert.match(bad('Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote. Make it 3 bars long.').message, /Extend or a Morph|mix/i);
  assert.match(bad('Take [[phrase_003]]. Make it 3 bars long.').message, /Extend or a Morph|take/i);
  assert.match(bad('Take [[phrase_003]]. Make it 10 percent slower.').message, /tempo/i);
  assert.match(bad('Make it 10 percent slower.').message, /Extend, Mix, Morph, Take or Play/, 'alone, a modifier has no head to edit: the grammar says what a description starts with');
  assert.match(bad('Extend [[bar_005]] to 4 bars. Make it 99 bars long.').message, /1 to 64/);
  assert.match(bad('Extend [[bar_005]] to 4 bars. Make it 95 percent slower.').message, /0 to 90 percent slower/);
});

// ---- a structure step is valid after ANY head ------------------------------------------------------------------------------------------------------------------------------------------------------
test('`Keep bars 1 to 2.` is valid after an Extend, a Mix, a Morph and a Take (CCQA weekly finding: it was refused alone)', () => {
  const heads: Array<[string, string]> = [
    ['extend', 'Extend [[bar_005]] to 6 bars, repeating with fills.'],
    ['morph', 'Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.'],
    ['mix', 'Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote.'],
    ['transform', 'Take [[phrase_003]].'],
  ];
  for (const [kind, head] of heads) {
    const p = ok(`${head} Keep bars 1 to 2.`) as { kind: string; ops?: Array<{ op: string; runs: number[][] }> };
    assert.equal(p.kind, kind); assert.deepEqual(p.ops, [{ op: 'keep', runs: [[1, 2]] }], kind);
    assert.ok(validatePhrase(p).ok, `${kind}: the validators accept it`);
    assert.deepEqual(ok(describe(p as GrammarParams)), p, `${kind}: describe says it and the grammar reads it back`);
    assert.deepEqual(readPhraseNote(`---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${formatPhraseJson(p as never)}\n\`\`\`\n`), { ok: true, value: p }, `${kind}: the json cache keeps it`);
    assert.ok(phrasePython(p as never).includes('bars = [bars[i - 1] for a, b in [[1,2]] for i in range(a, b + 1)]'), `${kind}: the Python says the step on the bars the head made`);
    assert.ok(phraseRecipeSteps(p as never).includes('Keep bars 1 to 2.'), `${kind}: and so does the Recipe`);
  }
});

test('all four structure steps follow every head, in order, and the steps keep their runs; Delete, Copy and Move too', () => {
  for (const head of ['Extend [[bar_005]] to 6 bars, repeating with fills.', 'Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.', 'Take [[phrase_003]].']) {
    const p = ok(`${head} Copy bars 1 to 2. Delete bar 4. Move bars 1 to 2 one bar right. Keep bars 1 to 5.`) as { ops: Array<{ op: string }> };
    assert.deepEqual(p.ops.map((o) => o.op), ['copy', 'delete', 'move', 'keep'], head);
  }
});

test('a Thin out or a Double up is only for a Take: after an Extend, a Mix or a Morph it is refused in words that say what may follow the head', () => {
  for (const head of ['Extend [[bar_005]] to 6 bars, repeating with fills.', 'Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.', 'Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote.']) {
    assert.match(bad(`${head} Thin out bars 1 to 2, by half, keeping the downbeat.`).message, /Take/, head);
    assert.match(bad(`${head} Double up bars 1 to 2.`).message, /Take/, head);
  }
});

test('a structure step AFTER a density step is refused with the code `order` and the grammar\'s own words; the same steps in the right order are fine (never re-sorted)', () => {
  const e = bad('Take [[phrase_003]]. Thin out bars 1 to 2, by half, keeping the downbeat. Keep bars 1 to 3.');
  assert.equal(e.code, 'order'); assert.match(e.message, /to come before any "Thin out" or "Double up"/);
  assert.equal(bad('Take [[phrase_003]]. Double up bar 1. Delete bar 2.').code, 'order');
  assert.ok(parse('Take [[phrase_003]]. Keep bars 1 to 3. Thin out bars 1 to 2, by half, keeping the downbeat.', V).ok);
  assert.equal(bad('Take [[phrase_003]]. Keep bars 3 to 1.').code, undefined, 'another refusal is not an order refusal');
});

test('forks follow every head as before, and with a structure step after an Extend the fork numbers are those of the bars AFTER the step (as a Take\'s are)', () => {
  const p = ok('Extend [[bar_005]] to 6 bars, repeating with fills. Keep bars 1 to 2. Bar 2 is replaced by [[bar_009]].') as { overrides?: Record<string, string>; ops?: unknown[] };
  assert.deepEqual(p.overrides, { '2': 'bars/bar_009' }); assert.equal(p.ops?.length, 1);
  assert.match(describe(p as GrammarParams), /^Extend \[\[bar_005\]\] to 6 bars, repeating with fills\. Keep bars 1 to 2\. Bar 2 is replaced by \[\[bar_009\]\]\.$/);
  const without = ok('Extend [[bar_005]] to 6 bars, repeating with fills. Bar 6 is replaced by [[bar_009]].') as { overrides?: Record<string, string> };
  assert.deepEqual(without.overrides, { '6': 'bars/bar_009' });
  assert.match(bad('Extend [[bar_005]] to 6 bars, repeating with fills. Bar 7 is replaced by [[bar_009]].').message, /1 to 6/, 'without a step the head\'s own length bounds a fork');
});

// ---- nothing that was readable changed, nothing that was written changed -----------------------------------------------------------------------------------------------------------------------
test('GOLDEN: every playground phrase note\'s Description is read and said back BYTE FOR BYTE (14 notes), and so is every extra paragraph (12)', () => {
  const names = Object.keys(PLAYGROUND_PHRASES);
  assert.equal(names.length, 14, 'the fixture is the 14 notes of the playground');
  for (const n of names) {
    const text = extractDescription(PLAYGROUND_PHRASES[n]).trim();
    const p = ok(text);
    assert.equal(describe(p), text, n);
  }
  const extras = Object.entries(EXTRA_PARAGRAPHS); assert.equal(extras.length, 12);
  for (const [k, text] of extras) assert.equal(describe(ok(text)), text, k);
});

test('GOLDEN: the derived parts of a note WITHOUT the new fields are what they were: the json, the Recipe steps and the Python of every fixture carry no `ops` and no new line', () => {
  for (const [k, text] of [...Object.entries(PLAYGROUND_PHRASES).map(([n, t]) => [n, extractDescription(t).trim()] as const), ...Object.entries(EXTRA_PARAGRAPHS)]) {
    const p = ok(text) as { kind: string; ops?: unknown[] };
    if (p.kind !== 'transform') { assert.equal(p.ops, undefined, `${k}: a head with no step has no ops field`); assert.ok(!formatPhraseJson(p as never).includes('"ops"'), `${k}: and no ops in its json`); assert.ok(!phrasePython(p as never).includes('range(a, b + 1)'), `${k}: nor in its Python`); }
  }
});
