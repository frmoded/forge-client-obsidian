// 2026-11-16-1000 - select bars on the Score: the model (click, range, toggle, Esc), the words, what each menu entry plans, and that every sentence it writes is one the grammar reads back to the same steps.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  NO_SELECTION, SELECTION_MENU, actionStep, disabledReason, extendSelection, limitTo, menuRun, planAction, sameSelection, selectionOf, selectRange, selectionText, toggleSelection, type BarSelection, type SelectionAction,
} from './bar-selection-core.ts';
import { parse } from './phrase-grammar-core.ts';
import type { ExtendPhrase, PhraseParams, TransformPhrase } from './phrase-core.ts';

const sel = (...bars: number[]): BarSelection => selectionOf(bars);
const VAULT = { bars: ['bar_005', 'bar_007'], phrases: ['phrase_006', 'phrase_007'] };

test('SELECTION MODEL: a drag is a range; shift extends from the anchor; ctrl/cmd toggles one bar; nothing is selected by default', () => {
  assert.deepEqual(NO_SELECTION, { bars: [], anchor: null, last: null });
  assert.deepEqual(selectRange(3, 5), { bars: [3, 4, 5], anchor: 3, last: 5 });
  assert.deepEqual(selectRange(5, 3), { bars: [3, 4, 5], anchor: 5, last: 3 });                       // dragged leftwards: the press began at 5
  assert.deepEqual(extendSelection(NO_SELECTION, 4), { bars: [4], anchor: 4, last: 4 });               // shift-click with nothing selected selects that bar
  let s = extendSelection(sel(2), 5);
  assert.deepEqual(s, { bars: [2, 3, 4, 5], anchor: 2, last: 5 });
  s = extendSelection(s, 3);                                                                  // shift again: the anchor stays, the range follows
  assert.deepEqual(s, { bars: [2, 3], anchor: 2, last: 3 });
  s = extendSelection(s, 1);
  assert.deepEqual(s, { bars: [1, 2], anchor: 2, last: 1 });
  let t = toggleSelection(NO_SELECTION, 4);
  t = toggleSelection(t, 7);
  assert.deepEqual(t, { bars: [4, 7], anchor: 7, last: 7 });                                          // not contiguous: that is allowed
  t = toggleSelection(t, 4);
  assert.deepEqual(t, { bars: [7], anchor: 7, last: 7 });
  t = toggleSelection(t, 7);
  assert.deepEqual(t, NO_SELECTION);                                                           // the last bar toggled off leaves nothing, and no anchor
  assert.deepEqual(extendSelection(toggleSelection(sel(2), 6), 8), { bars: [6, 7, 8], anchor: 6, last: 8 });   // shift after a ctrl-click extends from the bar that was ctrl-clicked
});

test('selectionOf and limitTo: junk is dropped; a redraw with fewer bars keeps what is still there', () => {
  assert.deepEqual(selectionOf([5, 3, 3, 0, -2, 1.5, 4]), { bars: [3, 4, 5], anchor: 3, last: 5 });
  assert.deepEqual(selectionOf([]), NO_SELECTION);
  const same = sel(1, 2);
  assert.equal(limitTo(same, 5), same);                                                      // nothing to drop: the same object
  assert.deepEqual(limitTo(sel(2, 4, 8), 5), { bars: [2, 4], anchor: 2, last: 4 });
  assert.deepEqual(limitTo(sel(7, 8), 5), NO_SELECTION);
  assert.ok(sameSelection(sel(1, 2), sel(2, 1)));
  assert.ok(!sameSelection(sel(1, 2), sel(1, 3)));
});

test('menuRun: the menu goes beside the range of the bar last touched (the person is looking there), else the last range', () => {
  assert.equal(menuRun(NO_SELECTION), null);
  assert.deepEqual(menuRun(selectRange(3, 5)), [3, 5]);
  let s = toggleSelection(toggleSelection(toggleSelection(NO_SELECTION, 2), 6), 7);
  assert.deepEqual(menuRun(s), [6, 7]);                                          // last touched: 7
  s = toggleSelection(s, 2); assert.deepEqual(s.bars, [6, 7]);                    // 2 toggled out
  s = toggleSelection(s, 2); s = extendSelection(s, 3);                           // 2 in again (anchor 2), shift to 3
  assert.deepEqual(menuRun(s), [2, 3]);
  assert.deepEqual(menuRun(selectionOf([1, 2, 9])), [9, 9]);                      // no gesture: the last range
});

test('THE COUNT: one bar, a range, and a list with its ranges', () => {
  assert.equal(selectionText(NO_SELECTION), 'no bars selected');
  assert.equal(selectionText(sel(4)), 'bar 4 selected');
  assert.equal(selectionText(sel(3, 4, 5)), '3 bars selected: bars 3 to 5');
  assert.equal(selectionText(sel(3, 4, 5, 8)), '4 bars selected: bars 3 to 5 and bar 8');
});

test('THE MENU: five entries in the prompt\'s order, each with a tooltip; each writes the step that its words say', () => {
  assert.deepEqual(SELECTION_MENU.map((m) => m.label), ['New phrase from these bars', 'Copy', 'Delete', 'Move left', 'Move right']);
  for (const m of SELECTION_MENU) assert.ok(m.title.length > 10, m.id);
  const s = sel(3, 4, 5, 8);
  assert.deepEqual(actionStep('new-phrase', s), { op: 'keep', runs: [[3, 5], [8, 8]] });
  assert.deepEqual(actionStep('copy', s), { op: 'copy', runs: [[3, 5], [8, 8]] });
  assert.deepEqual(actionStep('delete', s), { op: 'delete', runs: [[3, 5], [8, 8]] });
  assert.deepEqual(actionStep('move-left', s), { op: 'move', runs: [[3, 5], [8, 8]], by: -1 });
  assert.deepEqual(actionStep('move-right', s), { op: 'move', runs: [[3, 5], [8, 8]], by: 1 });
});

test('WHEN AN ENTRY IS GREYED, and why: nothing selected, a bar the Score has not, deleting every bar, moving off either end', () => {
  const ids: SelectionAction[] = ['new-phrase', 'copy', 'delete', 'move-left', 'move-right'];
  for (const id of ids) assert.equal(disabledReason(id, NO_SELECTION, 8), 'Select some bars first.');
  assert.equal(disabledReason('copy', sel(9), 8), 'Bar 9 is not on the Score (it has 8 bars).');
  assert.equal(disabledReason('delete', selectRange(1, 8), 8), 'That would leave no bars.');
  assert.equal(disabledReason('delete', selectRange(1, 7), 8), null);
  assert.equal(disabledReason('new-phrase', selectRange(1, 8), 8), null);                     // keeping every bar is a fine (if pointless) phrase
  assert.equal(disabledReason('move-left', sel(1, 2), 8), 'Bar 1 cannot move left.');
  assert.equal(disabledReason('move-left', sel(2), 8), null);
  assert.equal(disabledReason('move-right', sel(7, 8), 8), 'Bar 8 is the last bar: it cannot move right.');
  assert.equal(disabledReason('move-right', sel(7), 8), null);
  assert.equal(disabledReason('delete', sel(1), 1), 'That would leave no bars.');
});

const EXTEND: ExtendPhrase = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 };
const TRANSFORM: TransformPhrase = { kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'thin_out', first: 1, last: 2, amount: 0.5 }] };

test('NEW PHRASE FROM THESE BARS: always a new transform phrase whose sentence names the bars and the phrase they come from (a link), in any kind of phrase', () => {
  for (const current of [EXTEND, TRANSFORM, null] as Array<PhraseParams | null>) {
    const p = planAction('new-phrase', sel(3, 4, 5), current, 'phrase_007', 8);
    assert.equal(p.kind, 'new-phrase');
    if (p.kind !== 'new-phrase') continue;
    assert.equal(p.sentence, 'Take [[phrase_007]]. Keep bars 3 to 5.');
    assert.deepEqual(p.params, { kind: 'transform', source: 'phrases/phrase_007', ops: [{ op: 'keep', runs: [[3, 5]] }] });
  }
  const gap = planAction('new-phrase', sel(2, 5, 6), EXTEND, 'phrase_007', 8);
  assert.ok(gap.kind === 'new-phrase' && gap.sentence === 'Take [[phrase_007]]. Keep bar 2 and bars 5 to 6.');       // not contiguous: kept in order of position, as one sentence
  const scrambled = planAction('new-phrase', selectionOf([6, 2, 5]), EXTEND, 'phrase_007', 8);
  assert.ok(scrambled.kind === 'new-phrase' && scrambled.sentence === gap.sentence);
});

test('THE OTHER ACTIONS on a transform phrase are a PREVIEW of its own Description: the step goes after its structure steps and before any Thin out / Double up, which keep their place', () => {
  const p = planAction('delete', sel(3, 4), TRANSFORM, 'phrase_007', 8);
  assert.equal(p.kind, 'preview');
  if (p.kind !== 'preview') return;
  assert.equal(p.sentence, 'Delete bars 3 to 4.');
  assert.equal(p.text, 'Take [[phrase_006]]. Delete bars 3 to 4. Thin out bars 1 to 2, by half, keeping the downbeat.');
  const twice = planAction('copy', sel(1), { ...TRANSFORM, ops: [{ op: 'keep', runs: [[2, 6]] }, ...TRANSFORM.ops] }, 'phrase_007', 5);
  assert.ok(twice.kind === 'preview' && twice.text === 'Take [[phrase_006]]. Keep bars 2 to 6. Copy bar 1. Thin out bars 1 to 2, by half, keeping the downbeat.');
  // the text the box will hold is a description the grammar reads: it parses to the ops it was made from
  for (const a of ['copy', 'delete', 'move-left', 'move-right'] as const) {
    const q = planAction(a, sel(3, 4, 6), TRANSFORM, 'phrase_007', 8);
    assert.equal(q.kind, 'preview', a);
    if (q.kind !== 'preview') continue;
    const back = parse(q.text, VAULT);
    assert.ok(back.ok, `${a}: ${q.text}`);
    assert.deepEqual((back as { params: TransformPhrase }).params.ops, [q.step, ...TRANSFORM.ops], a);
  }
});

test('A PHRASE THAT CANNOT TAKE THE STEP INTO ITS OWN DESCRIPTION makes a new transform phrase of itself instead: an extend, a morph, a mix, a transform with edited bars', () => {
  for (const current of [EXTEND, { kind: 'morph', a: 'bar_005', b: 'bar_007', bars: 5, order: 'musical', seed: 0 }, { kind: 'mix', a: 'bar_005', b: 'bar_007', weight: 0.5, threshold: 0.5, ghost: false }] as PhraseParams[]) {
    const p = planAction('delete', sel(2), current, 'phrase_007', 5);
    assert.equal(p.kind, 'new-phrase', current.kind);
    assert.ok(p.kind === 'new-phrase' && p.sentence === 'Take [[phrase_007]]. Delete bar 2.' && /not a transform/.test(p.because));
  }
  const forked: TransformPhrase = { ...TRANSFORM, overrides: { '2': 'bars/bar_007' } };
  const f = planAction('move-left', sel(3), forked, 'phrase_007', 8);
  assert.ok(f.kind === 'new-phrase' && f.sentence === 'Take [[phrase_007]]. Move bar 3 one bar left.' && /bars you edited/.test(f.because));
  const noForks = planAction('copy', sel(3), { ...TRANSFORM, overrides: {} }, 'phrase_007', 8);
  assert.equal(noForks.kind, 'preview');                                                       // an empty overrides object is no fork
});

test('REFUSED with the reason: every action on nothing, and the greyed cases, in every kind of phrase; a step that would make the phrase invalid (more than 16 steps)', () => {
  assert.deepEqual(planAction('delete', NO_SELECTION, TRANSFORM, 'phrase_007', 8), { kind: 'refused', message: 'Select some bars first.' });
  assert.deepEqual(planAction('move-left', sel(1), EXTEND, 'phrase_007', 8), { kind: 'refused', message: 'Bar 1 cannot move left.' });
  assert.deepEqual(planAction('delete', selectRange(1, 3), EXTEND, 'phrase_007', 3), { kind: 'refused', message: 'That would leave no bars.' });
  const full: TransformPhrase = { ...TRANSFORM, ops: Array.from({ length: 16 }, () => ({ op: 'copy' as const, runs: [[1, 1]] as Array<[number, number]> })) };
  const over = planAction('copy', sel(2), full, 'phrase_007', 20);
  assert.ok(over.kind === 'refused' && /1 to 16 operations/.test(over.message), JSON.stringify(over));
});

// ---- 2026-11-16-1000, from the mutation pass (446 mutants on bar-structure-core.ts and this file: 404 killed, the logic ones that survived are killed by what follows) ----------------------------------------------------------------

const B = (bars: number[], anchor: number | null, last: number | null): BarSelection => ({ bars, anchor, last });

test('shift-click with no anchor, or no bars, starts over from that bar (whatever the other field says)', () => {
  assert.deepEqual(extendSelection(B([3, 4], null, 4), 6), B([6], 6, 6));
  assert.deepEqual(extendSelection(B([], 3, null), 6), B([6], 6, 6));
});

test('toggling a bar OUT keeps the anchor if that bar is still in, else the last bar left; `last` is the last bar left; toggling one IN makes it both', () => {
  assert.deepEqual(toggleSelection(B([2, 5, 7], 7, 7), 7), B([2, 5], 5, 5));        // the anchor itself went out
  assert.deepEqual(toggleSelection(B([2, 5, 7], 7, 7), 5), B([2, 7], 7, 7));        // another went out: the anchor stays
  assert.deepEqual(toggleSelection(B([2, 5, 7], 2, 2), 5), B([2, 7], 2, 7));        // anchor stays, last is the last bar left
  assert.deepEqual(toggleSelection(B([3, 4, 6], 9, 9), 6), B([3, 4], 4, 4));        // an anchor that is not even selected is not kept
  assert.deepEqual(toggleSelection(B([3, 4, 6], null, null), 3), B([4, 6], 6, 6));
  assert.deepEqual(toggleSelection(B([3, 4], 3, 4), 8), B([3, 4, 8], 8, 8));
});

test('selectionOf of one bar: that bar is the anchor and the last; limitTo keeps a bar AT the edge and drops the one past it, and falls back for the anchor and the last', () => {
  assert.deepEqual(selectionOf([4]), B([4], 4, 4));
  const edge = B([3, 5], 3, 5);
  assert.equal(limitTo(edge, 5), edge, 'a bar at the edge stays');
  assert.deepEqual(limitTo(B([3, 6], 3, 6), 5), B([3], 3, 3));
  assert.deepEqual(limitTo(B([2, 4, 8], 8, 8), 5), B([2, 4], 2, 4), 'anchor and last past the edge: the first bar for the anchor, the last bar left for `last`');
  assert.deepEqual(limitTo(B([2, 4, 8], 4, 2), 5), B([2, 4], 4, 2), 'anchor and last still there: kept');
  assert.deepEqual(limitTo(B([2, 5, 8], 5, 5), 5), B([2, 5], 5, 5), 'an anchor exactly at the edge is still there');
  assert.deepEqual(limitTo(B([2, 4, 8], 8, 4), 5), B([2, 4], 2, 4), 'only the anchor is past the edge');
  assert.deepEqual(limitTo(B([2, 4, 8], 4, 8), 5), B([2, 4], 4, 4), 'only `last` is past the edge');
  assert.deepEqual(limitTo(B([2, 8], 8, 8), 5), B([2], 2, 2), 'exactly one bar left: it is the anchor and the last');
  assert.deepEqual(limitTo(B([2, 8], 2, 8), 5), B([2], 2, 2));
  assert.deepEqual(limitTo(B([7, 8], 7, 8), 5), NO_SELECTION, 'nothing left: nothing');
  assert.deepEqual(limitTo(B([7, 8], null, null), 5), NO_SELECTION);
});

test('menuRun at its edges: the range whose first or last bar was touched; a bar in no range, or no bar touched, gives the last range', () => {
  const s = (last: number | null) => B([1, 2, 4, 5, 6, 9], 1, last);
  assert.deepEqual(menuRun(s(4)), [4, 6]);                                       // the first bar of a range
  assert.deepEqual(menuRun(s(6)), [4, 6]);                                       // the last bar of a range
  assert.deepEqual(menuRun(s(5)), [4, 6]);
  assert.deepEqual(menuRun(s(2)), [1, 2]);
  assert.deepEqual(menuRun(s(3)), [9, 9], 'a bar in no range');
  assert.deepEqual(menuRun(s(null)), [9, 9]);
});

test('disabledReason at its edges: a bar exactly on the last bar is fine; with the number of bars unknown (0) nothing about the end is judged; the singular "1 bar"', () => {
  assert.equal(disabledReason('copy', sel(8), 8), null);
  assert.equal(disabledReason('copy', sel(9), 0), null, 'unknown number of bars');
  assert.equal(disabledReason('copy', sel(2), 1), 'Bar 2 is not on the Score (it has 1 bar).');
  assert.equal(disabledReason('copy', sel(9), 8), 'Bar 9 is not on the Score (it has 8 bars).');
  assert.equal(disabledReason('delete', sel(1, 2), 0), null, 'unknown number of bars: not judged');
  assert.equal(disabledReason('delete', sel(1, 2), 3), null);
  assert.equal(disabledReason('move-right', sel(5), 0), null, 'unknown number of bars: not judged');
  assert.equal(disabledReason('move-right', sel(1), 1), 'Bar 1 is the last bar: it cannot move right.');
});

test('a phrase renamed to something else than phrase_N cannot be the source of a transform (the validator\'s rule): the menu says so instead of making a note that would not open; and why a new phrase was made is said exactly', () => {
  const renamed = planAction('new-phrase', sel(2, 3), EXTEND, 'my groove', 8);
  assert.equal(renamed.kind, 'refused');
  assert.match((renamed as { message: string }).message, /source/i);
  const made = planAction('new-phrase', sel(2, 3), EXTEND, 'phrase_007', 8);
  assert.ok(made.kind === 'new-phrase' && made.because === 'new phrase');
  const other = planAction('delete', sel(2), EXTEND, 'phrase_007', 8);
  assert.ok(other.kind === 'new-phrase' && other.because === 'this phrase is not a transform: the change is made as a new phrase of it');
});
