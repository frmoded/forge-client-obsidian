// 2026-11-23-1027 PART B made `Move bar 1 after bar 3.` a CHAIN of one-place moves that a repair wrote. 2026-11-24-1040 (deliberate): the repair is RETIRED because the GRAMMAR reads a Move to a place itself (one sentence, one op: src/move-place-1040.test.ts says the
// order, the canonical sentence and the refusals, and checks the single sentence against this very chain). What stays here: the chain is still READ and REPLAYED byte for byte (every chain already in a note), and the repair no longer writes one.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { repairCandidate } from './did-you-mean-core.ts';
import { replayGrammar } from './sentence-list-core.ts';
import { applyStructureOps, isRunsOp } from './bar-structure-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const head = (n: number): string => `Extend [[bar_005]] to ${n} bars, repeating with fills.`;
/** The bars' order after the sentences, read by the REAL grammar and run by the REAL structure engine. */
function finalOrder(n: number, sentences: string[]): number[] {
  const r = replayGrammar([head(n), ...sentences], 'phrase', { vault: PHRASE_VAULT } as never);
  assert.equal(r.stop, null, `the grammar reads every sentence: ${JSON.stringify(r.stop)}`);
  const ops = ((r.params as { ops?: unknown[] }).ops ?? []) as Parameters<typeof applyStructureOps>[1] & unknown[];
  assert.equal(ops.length, sentences.length, 'one op per sentence');
  assert.ok((ops as unknown as Array<Parameters<typeof isRunsOp>[0]>).every(isRunsOp));
  const done = applyStructureOps(Array.from({ length: n }, (_, i) => i + 1), ops);
  assert.ok(done.ok, done.ok ? '' : done.message);
  return done.ok ? done.items : [];
}

test('a chain already in a note still reads and replays: the driver\'s two chains give the order they always gave', () => {
  assert.deepEqual(finalOrder(4, ['Move bar 1 one bar right.', 'Move bar 2 one bar right.']), [2, 3, 1, 4]);
  assert.deepEqual(finalOrder(4, ['Move bar 4 one bar left.', 'Move bar 3 one bar left.']), [1, 4, 2, 3]);
  assert.deepEqual(finalOrder(5, ['Move bar 5 one bar left.', 'Move bar 4 one bar left.', 'Move bar 3 one bar left.', 'Move bar 2 one bar left.']), [5, 1, 2, 3, 4]);
  assert.deepEqual(finalOrder(2, ['Move bar 1 one bar right.']), [2, 1]);
});

test('the repair is RETIRED: a Move with place words is no longer mended into a chain (the grammar reads it), and a typo is still mended', () => {
  for (const t of ['Move bar 1 after bar 3.', 'Move bar 4 before bar 2.', 'move bar 6 after bar 2', 'Move bar 2 before bar 3.', 'Move bar 3 after bar 3.']) assert.equal(repairCandidate(t, 'phrase'), null, t);
  assert.deepEqual(repairCandidate('Mvoe bar 4 one bar left.', 'phrase'), { sentence: 'Move bar 4 one bar left.' });
  assert.deepEqual(repairCandidate('Keep bars 1 to 4. Delet bar 1', 'phrase'), { sentence: 'Keep bars 1 to 4. Delete bar 1.' });
});

test('the swaps the service is taught (forge-transpile LINES_CHAIN_EXAMPLES) are read by THIS grammar and give the order the server says: neighbours one move, bars two apart three', () => {
  assert.deepEqual(finalOrder(4, ['Move bar 2 one bar right.']), [1, 3, 2, 4]);
  assert.deepEqual(finalOrder(4, ['Move bar 1 one bar right.', 'Move bar 2 one bar right.', 'Move bar 2 one bar left.']), [3, 2, 1, 4]);
});
