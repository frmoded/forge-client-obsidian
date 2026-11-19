// 2026-11-19-0980 (second mutation sample, the WHOLE of src/sentence-list-core.ts, ~/.forge-mem-evidence/0980-mutants2.log: 23 survivors). The ones a test CAN kill are killed here (182, 243 x3, 349 `if-false`); the others are equivalent or unreachable by
// construction, one line each in the feedback. Pure: no controller, no DOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as L from './sentence-list-core.ts';
import { wrongKindSentence } from './note-family-core.ts';
import { PHRASE_VAULT, } from './test-support/phrase-list-fixtures.ts';
import { VAULT as LIST_VAULT } from './test-support/sentence-list-fixtures.ts';
import type { GrammarParams } from './phrase-grammar-core.ts';

test('sentence-list-core 182: a composition whose first section is said "For N bars play ..." still reads a later "Play ..." as its next section ("Then play"): the lead is rewritten after a "For" section too', async () => {
  const list = ['For 4 bars play [[phrase_001]].', 'Play [[phrase_002]].'];
  const rp = await L.replay(list, 'composition', { vault: LIST_VAULT });
  assert.equal(rp.stop, null); assert.equal(rp.applied, 2);
  assert.deepEqual((rp.params as unknown as { sections: Array<{ source: string; length?: number }> }).sections, [{ source: 'phrases/phrase_001', length: 4 }, { source: 'phrases/phrase_002' }]);
  assert.deepEqual(rp.list, ['Play [[phrase_001]] for 4 bars.', 'Then play [[phrase_002]].'], 'and the canonical lines say them in the composition\'s own words');
});

test('sentence-list-core 243 (a line the grammar reads, but of ANOTHER kind): a composition sentence in a PHRASE list is not a line of it: the replay stops AT it, in the words "this note is a phrase, but the sentence describes a composition", at line 1, column 1', async () => {
  const ctx = { vault: PHRASE_VAULT };
  const rp = L.replayGrammar(['Play [[phrase_001]] for 4 bars.'], 'phrase', ctx);
  assert.equal(rp.applied, 0); assert.equal(rp.params, null);
  assert.deepEqual(rp.stop, { index: 0, reason: 'unreadable', message: wrongKindSentence('phrase', 'composition', 'the sentence'), line: 1, column: 1 });
  assert.equal(wrongKindSentence('phrase', 'composition', 'the sentence'), 'this note is a phrase, but the sentence describes a composition; make a new note for that');
  const plan = await L.planAppend([], 'phrase', ['Play [[phrase_001]] for 4 bars.'], ctx);
  assert.ok(!plan.ok); assert.equal(plan.reason, 'unreadable'); assert.equal(plan.message, wrongKindSentence('phrase', 'composition', 'the sentence')); assert.deepEqual([plan.line, plan.column], [1, 1]);
  // the same in a list that already has a head: the line is not applied and the note shows what it showed
  const later = L.replayGrammar(['Take [[phrase_003]].', 'Play [[phrase_001]] for 4 bars.'], 'phrase', ctx);
  assert.equal(later.applied, 1); assert.equal(later.stop?.index, 1);
});

test('sentence-list-core 349 (`listAfterParams` is for a PHRASE\'s strip): for an arrangement or a composition it is the canonical lines of the params, never the list as it was kept (a list is in the order the sentences were applied; the canonical order is describe\'s)', () => {
  const arr = ['Play [[phrase_001]] on the [[rock]] kit.', 'Mute the [[rock]] kit.', 'Play [[phrase_002]] on the [[latin]] kit.'];
  const ap = L.replayGrammar(arr, 'arrangement', { vault: LIST_VAULT }).params as GrammarParams;
  assert.deepEqual(L.listAfterParams(arr, ap, 'arrangement', { vault: LIST_VAULT }), L.linesOfParams(ap, 'arrangement'));
  assert.notDeepEqual(L.linesOfParams(ap, 'arrangement'), arr, 'the premise: the canonical order is not the order of the list');
  const comp = ['Play [[phrase_001]].', 'Repeat that once more.'];
  const cp = L.replayGrammar(comp, 'composition', { vault: LIST_VAULT }).params as GrammarParams;
  assert.deepEqual(L.listAfterParams(comp, cp, 'composition', { vault: LIST_VAULT }), L.linesOfParams(cp, 'composition'));
  // a phrase asked with params of another family is the canonical lines too
  assert.deepEqual(L.listAfterParams(['Take [[phrase_003]].'], ap, 'phrase', { vault: PHRASE_VAULT }), L.linesOfParams(ap, 'phrase'));
});
