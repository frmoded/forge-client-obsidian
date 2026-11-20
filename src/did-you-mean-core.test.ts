// 2026-11-20-1002 (DID YOU MEAN) - the pure repairs of a sentence the grammar cannot read. Written RED first. Three deterministic repairs, each a small pure function:
//   closeLinks   `Play [[phrase_001]` -> `Play [[phrase_001]]` (an unclosed link: one bracket, none, or a name cut by the full stop)
//   typoOfVerb   `Delet` -> `Delete` (Damerau distance 1 against the verbs of the grammar's own tables; a UNIQUE match only; a word that already IS a verb is never touched)
//   moveRepair   `Move bar 4 before bar 2.` -> `Move bar 4 one bar left.` plus the hint that Move takes one bar one place at a time (so: say it twice)
// and `repairCandidate` (the three in order, each sentence of the text, always with its full stop) and `suggestRepair` (a candidate is offered ONLY when the caller's reader says the grammar reads it: never a guess).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  LIST_MODEL_SENTINEL_DID_YOU_MEAN_CORE, closeLinks, didYouMeanQuestion, isOneEdit, moveRepair, repairCandidate, suggestRepair, typoOfVerb, verbsOf,
} from './did-you-mean-core.ts';
import { VERBS } from './phrase-grammar-core.ts';
import { STRUCTURE_WORDS } from './bar-structure-core.ts';
import { BAR_FORMS } from './bar-grammar-core.ts';

test('the sentinel names this core (the lean build greps for it)', () => {
  assert.equal(LIST_MODEL_SENTINEL_DID_YOU_MEAN_CORE, 'forge-list-model-core:did-you-mean-core');
});

// ---- Damerau distance 1 -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('isOneEdit: exactly one insertion, deletion, substitution or adjacent swap; zero edits and two edits are not one', () => {
  for (const [a, b] of [['delet', 'delete'], ['deelte', 'delete'], ['dlete', 'delete'], ['deletee', 'delete'], ['delste', 'delete'], ['mov', 'move'], ['mvoe', 'move'], ['keap', 'keep'], ['ab', 'ba'], ['a', 'ab']] as const) assert.equal(isOneEdit(a, b), true, `${a} ~ ${b}`);
  for (const [a, b] of [['delete', 'delete'], ['', ''], ['dleet', 'delete'], ['xxlete', 'delete'], ['delet', 'copy'], ['abc', 'cab'], ['abcd', 'badc'], ['kept', 'keeps'], ['a', 'abc'], ['delete', 'dletee']] as const) assert.equal(isOneEdit(a, b), false, `${a} !~ ${b}`);
});
test('isOneEdit is symmetric and ignores nothing but equality (case is the caller\'s business)', () => {
  const words = ['move', 'mvoe', 'mode', 'mov', 'moves', 'mover', 'oove', 'moe', 'Move'];
  for (const a of words) for (const b of words) assert.equal(isOneEdit(a, b), isOneEdit(b, a), `${a},${b}`);
  assert.equal(isOneEdit('Move', 'move'), true, 'a different letter case is one substitution here: the caller lower-cases first');
});

// ---- the vocabulary comes from the grammar's tables ---------------------------------------------------------------------------------------------------------------------------------------------
test('verbsOf draws from the tables: every first word of a VERBS example and of the structure words; the bar composer from the bar forms; no hand copy', () => {
  const musicList = verbsOf('phrase');
  for (const v of VERBS) assert.ok(musicList.includes(/^[A-Za-z]+/.exec(v.example)![0].toLowerCase()), `VERBS ${v.verb}`);
  for (const w of Object.values(STRUCTURE_WORDS)) assert.ok(musicList.includes(w.verb), `STRUCTURE ${w.verb}`);
  assert.ok(musicList.includes('remove') && musicList.includes('duplicate'), 'the two synonyms the structure steps read');
  for (const f of ['arrangement', 'composition'] as const) assert.deepEqual(verbsOf(f), musicList, f);
  const bar = verbsOf('bar');
  for (const form of BAR_FORMS) assert.ok(bar.includes(/^[A-Za-z]+/.exec(form)![0].toLowerCase()), form);
  assert.equal(bar.includes('extend'), false, 'a bar has no Extend'); assert.equal(musicList.includes('hit'), false, 'a phrase has no Hit');
  assert.deepEqual([...musicList], [...new Set(musicList)], 'each verb once'); assert.deepEqual(musicList, [...musicList].sort(), 'sorted: one answer whatever the table order');
});

test('typoOfVerb: a one-letter typo of a UNIQUE verb is the verb, capitalised; a real verb, a far word and an ambiguous word are null', () => {
  const v = verbsOf('phrase');
  assert.equal(typoOfVerb('Delet', v), 'Delete'); assert.equal(typoOfVerb('delet', v), 'Delete'); assert.equal(typoOfVerb('DELET', v), 'Delete');
  assert.equal(typoOfVerb('Mvoe', v), 'Move'); assert.equal(typoOfVerb('Keap', v), 'Keep'); assert.equal(typoOfVerb('Copyy', v), 'Copy'); assert.equal(typoOfVerb('Extnd', v), 'Extend'); assert.equal(typoOfVerb('Moprh', v), 'Morph');
  assert.equal(typoOfVerb('Delete', v), null, 'already a verb: never touched'); assert.equal(typoOfVerb('delete', v), null);
  assert.equal(typoOfVerb('Remove', v), null, 'a synonym the grammar reads is a verb too');
  assert.equal(typoOfVerb('Banana', v), null, 'far from every verb');
  assert.equal(typoOfVerb('Mox', v), 'Mix', 'one substitution of a three-letter verb');
  // ambiguous: two verbs at distance one
  assert.equal(typoOfVerb('Cop', ['copy', 'cope']), null, 'two matches: no guess');
  assert.equal(typoOfVerb('Cop', ['copy']), 'Copy');
  assert.equal(typoOfVerb('', v), null); assert.equal(typoOfVerb('12', v), null); assert.equal(typoOfVerb('Del-et', v), null, 'a word is letters only');
});

test('typoOfVerb on the tables: every verb of the phrase table, one letter dropped, comes back (unless that collides with another verb)', () => {
  const v = verbsOf('phrase'); let checked = 0;
  for (const verb of v) {
    const typo = verb.slice(0, -1);
    const hits = v.filter((w) => isOneEdit(typo, w));
    if (typo.length < 2 || v.includes(typo) || hits.length !== 1) continue;
    assert.equal(typoOfVerb(typo, v)?.toLowerCase(), verb, typo); checked++;
  }
  assert.ok(checked >= 10, `only ${checked} verbs were checked`);
});

// ---- unclosed links -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('closeLinks: one bracket closed, none closed after the name, a name before the full stop; closed links, other text and an empty link are left alone', () => {
  assert.equal(closeLinks('Play [[phrase_001]'), 'Play [[phrase_001]]');
  assert.equal(closeLinks('Play [[phrase_001]]'), 'Play [[phrase_001]]');
  assert.equal(closeLinks('Play [[phrase_001'), 'Play [[phrase_001]]');
  assert.equal(closeLinks('Play [[phrase_001.'), 'Play [[phrase_001]].');
  assert.equal(closeLinks('Play [[phrase_001].'), 'Play [[phrase_001]].');
  assert.equal(closeLinks('Play [[phrase_001] for 8 bars.'), 'Play [[phrase_001]] for 8 bars.');
  assert.equal(closeLinks('Mix [[bar_005]] and [[bar_006.'), 'Mix [[bar_005]] and [[bar_006]].');
  assert.equal(closeLinks('Mix [[bar_005] and [[bar_006]]'), 'Mix [[bar_005]] and [[bar_006]]');
  assert.equal(closeLinks('Mute the [[rock kit.'), 'Mute the [[rock]] kit.', 'no bracket at all: the name is the first word');
  assert.equal(closeLinks('Play [[my groove]'), 'Play [[my groove]]', 'a name with a space, one bracket');
  assert.equal(closeLinks('Take [[]'), 'Take [[]', 'nothing to close');
  assert.equal(closeLinks('Take [[ .'), 'Take [[ .');
  assert.equal(closeLinks('Delete bar 2.'), 'Delete bar 2.');
  assert.equal(closeLinks(''), '');
  assert.equal(closeLinks('Play [[a|b]'), 'Play [[a|b]]', 'an alias bar is part of the name');
});

// ---- Move with place words ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('moveRepair: before and after another bar are places left or right, said as ONE place, with the count in the hint', () => {
  const r1 = moveRepair('Move bar 4 before bar 2.')!;
  assert.equal(r1.sentence, 'Move bar 4 one bar left.');
  assert.equal(r1.hint, 'Move takes one bar one place at a time. Bar 4 before bar 2 is 2 places left: say it twice (the second time for bar 3).');
  const r2 = moveRepair('Move bar 2 before bar 5.')!; assert.equal(r2.sentence, 'Move bar 2 one bar right.'); assert.match(r2.hint, /is 2 places right: say it twice \(the second time for bar 3\)\.$/);
  const r3 = moveRepair('Move bar 2 after bar 5.')!; assert.equal(r3.sentence, 'Move bar 2 one bar right.'); assert.match(r3.hint, /is 3 places right: say it 3 times \(the next time for bar 3\)\.$/, JSON.stringify(r3));
  const r4 = moveRepair('move bar 6 after bar 2')!; assert.equal(r4.sentence, 'Move bar 6 one bar left.'); assert.match(r4.hint, /is 3 places left: say it 3 times/);
  const one = moveRepair('Move bar 3 before bar 2.')!; assert.equal(one.sentence, 'Move bar 3 one bar left.'); assert.equal(one.hint, 'Move takes one bar one place at a time.');
  const oneR = moveRepair('Move bar 2 after bar 3.')!; assert.equal(oneR.sentence, 'Move bar 2 one bar right.'); assert.equal(oneR.hint, 'Move takes one bar one place at a time.');
});
test('moveRepair: no move at all (the bar would stay where it is), another verb and other shapes are null', () => {
  for (const t of ['Move bar 4 before bar 5.', 'Move bar 4 after bar 3.', 'Move bar 4 before bar 4.', 'Move bar 4 after bar 4.', 'Move bar 2 one bar left.', 'Delete bar 2 before bar 1.', 'Move bars 2 to 3 before bar 1.', 'Move bar 4 before.', '', 'Move bar x before bar 2.']) assert.equal(moveRepair(t), null, t);
});

// ---- the combined candidate -------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('repairCandidate: the repairs of the three kinds in one sentence, each sentence of the text, always with its full stop; null when nothing was repaired', () => {
  assert.deepEqual(repairCandidate('Play [[phrase_001]', 'composition'), { sentence: 'Play [[phrase_001]].' });
  assert.deepEqual(repairCandidate('Delet bar 2.', 'phrase'), { sentence: 'Delete bar 2.' });
  assert.deepEqual(repairCandidate('delet bar 2', 'phrase'), { sentence: 'Delete bar 2.' }, 'a typo and a missing stop: one suggestion');
  assert.deepEqual(repairCandidate('Take [[phrase_001]. Delet bar 2', 'phrase'), { sentence: 'Take [[phrase_001]]. Delete bar 2.' }, 'each sentence on its own');
  assert.deepEqual(repairCandidate('Move bar 4 before bar 2.', 'phrase'), { sentence: 'Move bar 4 one bar left.', hint: moveRepair('Move bar 4 before bar 2.')!.hint });
  assert.deepEqual(repairCandidate('Clera kick.', 'bar'), { sentence: 'Clear kick.' });
  assert.equal(repairCandidate('Delete bar 2.', 'phrase'), null, 'nothing to repair');
  assert.equal(repairCandidate('Delete bar 2', 'phrase'), null, 'a missing stop alone is nothing the grammar needs (it adds it): not a repair');
  assert.equal(repairCandidate('Banana split.', 'phrase'), null, 'no deterministic repair');
  assert.equal(repairCandidate('Make it faster please.', 'phrase'), null);
  assert.equal(repairCandidate('', 'phrase'), null); assert.equal(repairCandidate('   ', 'phrase'), null);
  assert.equal(repairCandidate('Hit kick on step 1.', 'phrase'), null, 'Hit is not a phrase verb and is far from every one of them');
});
test('repairCandidate: the verbs of the family, not of another (Clera is a bar typo, not a phrase one; Delet is a phrase typo, not a bar one)', () => {
  assert.equal(repairCandidate('Clera kick.', 'phrase'), null); assert.equal(repairCandidate('Delet bar 2.', 'bar'), null);
  assert.equal(repairCandidate('Roate the kick channel one step to the right.', 'bar')?.sentence, 'Rotate the kick channel one step to the right.');
});
test('repairCandidate: a Move with place words is repaired, but the other sentences of the text keep their own repairs; only the FIRST hint is kept', () => {
  const r = repairCandidate('Keap bars 1 to 2. Move bar 4 before bar 2.', 'phrase')!;
  assert.equal(r.sentence, 'Keep bars 1 to 2. Move bar 4 one bar left.'); assert.match(r.hint!, /^Move takes one bar one place at a time\./);
});

// ---- the question ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the dialog line: Did you mean: <the sentence without its closing full stop>? then the hint, if any', () => {
  assert.equal(didYouMeanQuestion({ sentence: 'Play [[phrase_001]].' }), 'Did you mean: Play [[phrase_001]]?');
  assert.equal(didYouMeanQuestion({ sentence: 'Delete bar 2.' }), 'Did you mean: Delete bar 2?');
  assert.equal(didYouMeanQuestion({ sentence: 'Keep bars 1 to 2. Delete bar 2.' }), 'Did you mean: Keep bars 1 to 2. Delete bar 2?');
  assert.equal(didYouMeanQuestion({ sentence: 'Move bar 4 one bar left.', hint: 'Move takes one bar one place at a time.' }), 'Did you mean: Move bar 4 one bar left? Move takes one bar one place at a time.');
});

// ---- offered only when the grammar reads it --------------------------------------------------------------------------------------------------------------------------------------------------
test('suggestRepair: the candidate is returned only when the reader says the grammar reads it; the reader is asked with the repaired text; no candidate means the reader is not asked', async () => {
  const asked: string[] = [];
  const yes = async (t: string) => { asked.push(t); return true; }, no = async (t: string) => { asked.push(t); return false; };
  assert.deepEqual(await suggestRepair('Delet bar 2.', 'phrase', yes), { sentence: 'Delete bar 2.' }); assert.deepEqual(asked, ['Delete bar 2.']);
  assert.equal(await suggestRepair('Delet bar 2.', 'phrase', no), null, 'the grammar still cannot read it: never offered');
  asked.length = 0; assert.equal(await suggestRepair('Banana.', 'phrase', yes), null); assert.deepEqual(asked, [], 'nothing to ask about');
  assert.equal(await suggestRepair('Delet bar 2.', 'phrase', async () => { throw new Error('boom'); }), null, 'a reader that throws is a no, never a crash');
});
