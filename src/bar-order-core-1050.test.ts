// 2026-11-27-1050 (prompt stack stage 2) - the preview line `bars 1 2 3 become 2 1 3`: made without the engine from the drawn Score's bar count and the structure steps a push adds (the SAME step code the plugin runs), and left out, never guessed,
// whenever the count or the relation of the old bars to the new ones is not known.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { LIST_MODEL_SENTINEL_BAR_ORDER_CORE, barOrderLine, drawnBarCount } from './bar-order-core.ts';
import { replayGrammar } from './sentence-list-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';
import type { PhraseParams } from './phrase-core.ts';

const params = (...list: string[]): PhraseParams => { const r = replayGrammar(list, 'phrase', { vault: PHRASE_VAULT }); assert.equal(r.stop, null, r.stop?.message); return r.params as PhraseParams; };
const TAKE = 'Take [[phrase_001]].';
const EXT = 'Extend [[bar_005]] to 4 bars, repeating with fills.';
const line = (count: number | null, before: string[], added: string[]) => barOrderLine(count, params(...before), params(...before, ...added));

test('the sentinel names this core', () => { assert.equal(LIST_MODEL_SENTINEL_BAR_ORDER_CORE, 'forge-list-model-core:bar-order-core'); });

test('the findings example: swap bars 3 and 9 on 11 bars', () => {
  assert.equal(line(11, [TAKE], ['Move bar 9 after bar 2.', 'Move bar 4 after bar 9.']), 'bars 1 2 3 4 5 6 7 8 9 10 11 become 1 2 9 4 5 6 7 8 3 10 11');
});

test('delete, keep and copy; the numbers are the bars of the Score on screen, also after earlier steps', () => {
  assert.equal(line(4, [EXT], ['Delete bar 2.']), 'bars 1 2 3 4 become 1 3 4');
  assert.equal(line(3, [EXT, 'Delete bar 2.'], ['Copy bar 1 and put it at the end.']), 'bars 1 2 3 become 1 2 3 1');
  assert.equal(line(5, [TAKE], ['Keep bars 2 to 3.']), 'bars 1 2 3 4 5 become 2 3');
});

test('a bar a step MAKES has no old number: it is `new`', () => {
  assert.equal(line(4, [EXT], ['Mix bars 1 and 2, 50 percent bar 1, as a vote, and put it at the end.']), 'bars 1 2 3 4 become 1 2 3 4 new');
});

test('omitted, never guessed: no count, a count that does not match the head, no step that changes which bars there are, a new head, a replaced bar, a step the bars do not have', () => {
  assert.equal(line(null, [EXT], ['Delete bar 2.']), null, 'no drawn Score');
  assert.equal(line(5, [EXT], ['Delete bar 2.']), null, 'the Score has another number of bars than the note: it is behind');
  assert.equal(line(4, [EXT], ['Make it 20 percent slower.']), null);
  assert.equal(line(4, [TAKE], ['Thin out bars 1 to 2.']), null);
  assert.equal(barOrderLine(4, params(EXT), params('Extend [[bar_007]] to 4 bars, repeating with fills.', 'Delete bar 2.')), null, 'a new head');
  assert.equal(barOrderLine(4, params(TAKE), params('Take [[phrase_002]].', 'Delete bar 2.')), null, 'a Take of another phrase: its count is unknown');
  assert.equal(barOrderLine(4, params(EXT), params('Extend [[bar_005]] to 6 bars, repeating with fills.', 'Delete bar 2.')), null, 'another length');
  assert.equal(line(4, [EXT, 'Bar 3 is replaced by [[bar_007]].'], ['Delete bar 2.']), null, 'a replaced bar stays at its position, not with its bar');
  assert.equal(line(4, [EXT], ['Delete bar 2.', 'Bar 1 is replaced by [[bar_007]].']), null);
  assert.equal(line(4, [TAKE], ['Delete bar 9.']), null, 'the grammar reads it; the bars do not have it');
  assert.equal(barOrderLine(4, null, params(EXT)), null, 'no phrase before');
  assert.equal(barOrderLine(4, params(EXT), null), null);
  assert.equal(barOrderLine(4, params(EXT, 'Delete bar 2.'), params(EXT)), null, 'steps taken away');
  assert.equal(line(200, [TAKE], ['Delete bar 2.']), null, 'too long to be shown whole: not shown cut');
});

test('a tempo line beside the steps does not matter to the order', () => {
  assert.equal(line(4, [EXT], ['Make it 20 percent slower.', 'Delete bar 4.']), 'bars 1 2 3 4 become 1 2 3');
});

test('the count is the drawn Score\'s: a pending Score is not counted, a stale one says nothing, no Score and no bar say nothing', () => {
  const win: any = new Window({ url: 'http://localhost/' });
  const pane = (html: string) => { const el = win.document.createElement('div'); el.innerHTML = html; return el as HTMLElement; };
  const host = (n: number, cls = '') => `<div class="forge-rhythm-score-host ${cls}"><svg>${'<g class="measure"></g>'.repeat(n)}</svg></div>`;
  assert.equal(drawnBarCount(pane(host(4))), 4);
  assert.equal(drawnBarCount(pane(host(4) + host(7, 'forge-rhythm-score-host-pending'))), 4);
  assert.equal(drawnBarCount(pane(host(7, 'forge-rhythm-score-host-pending'))), null);
  assert.equal(drawnBarCount(pane(host(4, 'forge-rhythm-score-host-stale'))), null);
  assert.equal(drawnBarCount(pane(host(0))), null);
  assert.equal(drawnBarCount(pane('')), null);
  assert.equal(drawnBarCount(undefined), null);
});

test('2026-11-27-1050 (mutation pass): a place AT the last bar is inside the Score (the line is made); one past it is not', () => {
  assert.equal(line(4, [EXT], ['Copy bar 1 and put it after bar 4.']), 'bars 1 2 3 4 become 1 2 3 4 1');
  assert.equal(line(4, [EXT], ['Copy bar 1 and put it after bar 5.']), null);
});
