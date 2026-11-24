// 2026-11-23-1027 PART B (client; deterministic, no model): `Move bar 1 after bar 3.` is the CHAIN of one-place moves, and the repair says ALL of them (`Move bar 1 one bar right. Move bar 2 one bar right.`), so `Use this` / Enter applies the whole move in one step
// (one undo entry). The grammar reads the chain in order (each sentence against the order the sentences before it produce) and the FINAL ORDER of the bars is asserted against an independent model of the meaning (take the bar out, put it back before or after
// the named bar), not just "it parses". A move that goes nowhere is a plain refusal in words (never a question, the service is not asked).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { moveRepair, movePlaces, placeRefusal, repairCandidate } from './did-you-mean-core.ts';
import { replayGrammar } from './sentence-list-core.ts';
import { applyStructureOps } from './bar-structure-core.ts';
import { isRunsOp } from './bar-structure-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const head = (n: number): string => `Extend [[bar_005]] to ${n} bars, repeating with fills.`;
/** The meaning, independently: take bar A out, put it before or after bar M (numbers are positions in the ORIGINAL order). */
function meaning(n: number, a: number, rel: 'before' | 'after', m: number): number[] {
  const rest = Array.from({ length: n }, (_, i) => i + 1).filter((x) => x !== a);
  const at = rest.indexOf(m) + (rel === 'after' ? 1 : 0);
  return [...rest.slice(0, at), a, ...rest.slice(at)];
}
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
const split = (s: string): string[] => s.split(/(?<=\.)\s+/);

test('the driver\'s two sentences: `Move bar 1 after bar 3.` and `Move bar 4 before bar 2.` are two sentences each, in the order the moving bar sits', () => {
  const a = moveRepair('Move bar 1 after bar 3.')!;
  assert.equal(a.sentence, 'Move bar 1 one bar right. Move bar 2 one bar right.'); assert.equal(a.hint, 'Bar 1 after bar 3 is 2 places right: both moves are written.');
  assert.deepEqual(finalOrder(4, split(a.sentence)), [2, 3, 1, 4]);
  const b = moveRepair('Move bar 4 before bar 2.')!;
  assert.equal(b.sentence, 'Move bar 4 one bar left. Move bar 3 one bar left.'); assert.equal(b.hint, 'Bar 4 before bar 2 is 2 places left: both moves are written.');
  assert.deepEqual(finalOrder(4, split(b.sentence)), [1, 4, 2, 3]);
});

test('EVERY before/after of every bar in phrases of 2 to 6 bars: the chain has the right length, the grammar reads it in order and the final order IS the meaning (left and right, 1, 2, 3 and more places, the first and last bar, a 2-bar phrase)', () => {
  let chains = 0, refused = 0; const seen = { places: new Set<number>(), dir: new Set<string>() };
  for (let n = 2; n <= 6; n++) for (let a = 1; a <= n; a++) for (let m = 1; m <= n; m++) for (const rel of ['before', 'after'] as const) {
    const text = `Move bar ${a} ${rel} bar ${m}.`, p = movePlaces(text)!, r = moveRepair(text);
    if (a === m) { assert.equal(r, null, text); assert.equal(placeRefusal(text), `Bar ${a} cannot go ${rel} itself.`); refused++; continue; }          // before or after ITSELF: no meaning to replay
    const expected = meaning(n, a, rel, m), stay = expected.every((x, i) => x === i + 1);
    if (p.n < 1) { assert.equal(r, null, text); assert.equal(stay, true, `${text}: a zero-place move leaves the bars as they are`); assert.ok(placeRefusal(text) !== null, text); refused++; continue; }
    assert.ok(r !== null, text); assert.equal(placeRefusal(text), null, text);
    const sentences = split(r!.sentence); assert.equal(sentences.length, p.n, `${text}: ${p.n} sentences`);
    assert.deepEqual(finalOrder(n, sentences), expected, `${text} in ${n} bars -> ${r!.sentence}`);
    assert.equal(stay, false, text); chains++; seen.places.add(p.n); seen.dir.add(p.dir);
  }
  assert.ok(chains > 100 && refused > 10, `${chains} chains, ${refused} refusals`); assert.ok([1, 2, 3, 4].every((k) => seen.places.has(k)) && seen.dir.has('left') && seen.dir.has('right'));
});

test('the first and the last bar, and a two-bar phrase, by name', () => {
  assert.deepEqual(finalOrder(4, split(moveRepair('Move bar 1 after bar 4.')!.sentence)), [2, 3, 4, 1]);
  assert.deepEqual(finalOrder(4, split(moveRepair('Move bar 4 before bar 1.')!.sentence)), [4, 1, 2, 3]);
  assert.deepEqual(finalOrder(2, split(moveRepair('Move bar 1 after bar 2.')!.sentence)), [2, 1]);
  assert.deepEqual(finalOrder(2, split(moveRepair('Move bar 2 before bar 1.')!.sentence)), [2, 1]);
  assert.deepEqual(finalOrder(5, split(moveRepair('Move bar 5 before bar 1.')!.sentence)), [5, 1, 2, 3, 4]);          // three places and more
  assert.equal(moveRepair('Move bar 5 before bar 1.')!.hint, 'Bar 5 before bar 1 is 4 places left: all 4 moves are written.');
});

test('the hint says what it did, in the three sizes', () => {
  assert.equal(moveRepair('Move bar 3 before bar 2.')!.hint, 'Bar 3 before bar 2 is 1 place left.');
  assert.equal(moveRepair('Move bar 2 after bar 3.')!.hint, 'Bar 2 after bar 3 is 1 place right.');
  assert.equal(moveRepair('Move bar 1 after bar 3.')!.hint, 'Bar 1 after bar 3 is 2 places right: both moves are written.');
  assert.equal(moveRepair('Move bar 1 after bar 4.')!.hint, 'Bar 1 after bar 4 is 3 places right: all 3 moves are written.');
});

test('a move that goes nowhere is refused in words (never a question): the bar is already there, or it is asked to go before or after itself; every other sentence is not this refusal', () => {
  assert.equal(placeRefusal('Move bar 2 before bar 3.'), 'Bar 2 is already before bar 3: nothing to move.');
  assert.equal(placeRefusal('Move bar 4 after bar 3.'), 'Bar 4 is already after bar 3: nothing to move.');
  assert.equal(placeRefusal('move bar 3 before bar 3'), 'Bar 3 cannot go before itself.'); assert.equal(placeRefusal('Move bar 3 after bar 3.'), 'Bar 3 cannot go after itself.');
  for (const t of ['Move bar 1 after bar 3.', 'Move bar 4 before bar 2.', 'Move bar 2 one bar left.', 'Delete bar 2.', 'Move bars 2 to 3 before bar 5.', '']) assert.equal(placeRefusal(t), null, t);
  assert.equal(moveRepair('Move bar 2 before bar 3.'), null);
});

test('repairCandidate joins the chain as it joins any sentences: with the other sentences of the text, the FIRST hint kept, every sentence with its stop', () => {
  const r = repairCandidate('Keep bars 1 to 4. Move bar 4 before bar 2. Delete bar 1', 'phrase')!;
  assert.equal(r.sentence, 'Keep bars 1 to 4. Move bar 4 one bar left. Move bar 3 one bar left. Delete bar 1.'); assert.equal(r.hint, 'Bar 4 before bar 2 is 2 places left: both moves are written.');
  assert.equal(repairCandidate('Move bar 2 before bar 3.', 'phrase'), null, 'a zero-place move has no repair');
});

test('the swaps the service is taught (forge-transpile 0.2.51 LINES_CHAIN_EXAMPLES) are read by THIS grammar and give the order the server says: neighbours one move, bars two apart three', () => {
  assert.deepEqual(finalOrder(4, ['Move bar 2 one bar right.']), [1, 3, 2, 4]);
  assert.deepEqual(finalOrder(4, ['Move bar 1 one bar right.', 'Move bar 2 one bar right.', 'Move bar 2 one bar left.']), [3, 2, 1, 4]);
});
