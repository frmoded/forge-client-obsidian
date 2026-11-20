// 2026-11-20-1002 (A TYPED UNDO AND REDO) - the reader, pure. `Undo`, `Undo.`, `Undo that`, `Undo 3`, `Undo three`, `Redo` are read LOCALLY by the SAME reader as `Duplicate` (duplicate-sentence-core.readActionText): never a list line, never
// the sentence service's. Anything else that opens with the word is refused in plain words (it is never the grammar's or the service's: neither knows the word). Written RED first.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LIST_MODEL_SENTINEL_TYPED_STEP_CORE, MAX_STEPS, readStepText, stepForms } from './typed-step-core.ts';
import { readActionText } from './duplicate-sentence-core.ts';

test('the sentinel names this core (the lean build greps for it)', () => { assert.equal(LIST_MODEL_SENTINEL_TYPED_STEP_CORE, 'forge-list-model-core:typed-step-core'); });

test('Undo: the bare word, with a full stop, in any case and with white space around it, is ONE step', () => {
  for (const t of ['Undo', 'Undo.', 'undo', 'UNDO', '  undo  ', 'Undo\n', 'undo .', 'Undo that', 'Undo that.', 'undo THAT', 'Undo it', 'Undo last sentence', 'Undo the last sentence.', 'undo last sentence']) {
    assert.deepEqual(readStepText(t), { kind: 'undo', count: 1 }, JSON.stringify(t));
  }
});
test('Undo N: a figure or a word up to ten, "up to that many"; a trailing full stop is fine', () => {
  for (const [t, n] of [['Undo 3', 3], ['undo 3.', 3], ['Undo three', 3], ['undo THREE.', 3], ['Undo 1', 1], ['Undo one', 1], ['Undo 10', 10], ['Undo ten', 10], ['Undo 12', 12], ['Undo 100', 100], ['Undo   2', 2], ['Undo two', 2], ['Undo 02', 2]] as const) {
    assert.deepEqual(readStepText(t), { kind: 'undo', count: n }, t);
  }
  for (const [w, n] of [['one', 1], ['two', 2], ['three', 3], ['four', 4], ['five', 5], ['six', 6], ['seven', 7], ['eight', 8], ['nine', 9], ['ten', 10]] as const) assert.deepEqual(readStepText(`Undo ${w}`), { kind: 'undo', count: n }, w);
  assert.equal(MAX_STEPS, 100, 'the undo stack keeps 100');
});
test('Redo: the same forms', () => {
  for (const t of ['Redo', 'Redo.', 'redo', ' REDO ', 'Redo that', 'redo it.']) assert.deepEqual(readStepText(t), { kind: 'redo', count: 1 }, t);
  assert.deepEqual(readStepText('Redo 2'), { kind: 'redo', count: 2 }); assert.deepEqual(readStepText('redo three.'), { kind: 'redo', count: 3 });
});

test('other words after Undo or Redo, a bad count, and a text with other sentences are REFUSED in words (never the grammar\'s, never the service\'s); the refusal says the forms', () => {
  const forms = stepForms('Undo');
  assert.equal(forms, 'Undo, Undo that, Undo 3 or Undo three');
  for (const t of ['Undo the delete', 'Undo bar 3.', 'undo please', 'Undo 3 bars', 'Undo three times', 'Undo 1.5', 'Undo -2', 'Undo eleven', 'Undo all', 'Undo [[bar_007]]']) {
    const r = readStepText(t);
    assert.equal(r.kind, 'refused', t);
    if (r.kind === 'refused') { assert.equal(r.step, true, 'marked: the composers of an arrangement, a composition and a bar refuse it too'); assert.equal(r.message, `Undo takes only a number: write ${forms}.`, t); }
  }
  for (const t of ['Undo 0', 'undo zero']) { const r = readStepText(t); assert.equal(r.kind, 'refused', t); if (r.kind === 'refused') assert.equal(r.message, `Undo takes only a number: write ${forms}.`); }
  const big = readStepText('Undo 101'); assert.equal(big.kind, 'refused'); if (big.kind === 'refused') assert.equal(big.message, 'Undo takes up to 100 at a time.');
  const r = readStepText('Redo the delete'); assert.equal(r.kind, 'refused'); if (r.kind === 'refused') assert.equal(r.message, `Redo takes only a number: write ${stepForms('Redo')}.`);
  assert.equal(stepForms('Redo'), 'Redo, Redo that, Redo 3 or Redo three');
  for (const t of ['Undo. Undo.', 'Undo. Keep bars 1 to 2.', 'Keep bars 1 to 2. Undo.', 'Undo\nRedo']) {
    const x = readStepText(t); assert.equal(x.kind, 'refused', t); if (x.kind === 'refused') assert.equal(x.message, 'Undo and Redo have to be on their own: empty the box, then write Undo (or Redo) by itself.', t);
  }
});

test('what is NOT a step: no Undo or Redo word at the start of a sentence (a word that merely contains it, a link, a sentence of the grammar) is none', () => {
  for (const t of ['', '   ', 'Undone', 'Redone bars', 'Unredo', 'Keep bars 1 to 2.', 'Take [[phrase_001]].', 'Delete bar 2 and then undo it.', 'Mute the [[undo]] kit.', 'Play [[redo]] for 8 bars.', 'Hit kick on step 1.', 'Duplicate [[bar_007]].']) assert.equal(readStepText(t).kind, 'none', JSON.stringify(t));
});

test('the reader of Duplicate is the SAME reader: readActionText answers a step word first, and still answers Duplicate and none as it did', () => {
  assert.deepEqual(readActionText('Undo'), { kind: 'undo', count: 1 }); assert.deepEqual(readActionText('undo 3.'), { kind: 'undo', count: 3 }); assert.deepEqual(readActionText('Redo'), { kind: 'redo', count: 1 });
  assert.equal(readActionText('Undo the delete').kind, 'refused');
  assert.deepEqual(readActionText('Duplicate [[bar_007]].'), { kind: 'duplicate', target: 'bar_007' });
  assert.deepEqual(readActionText('Keep bars 1 to 2.'), { kind: 'none' });
  assert.equal(readActionText('Undo. Duplicate [[bar_007]].').kind, 'refused');
});
