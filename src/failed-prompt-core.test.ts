// 2026-11-20-1004 (THE FAILED-PROMPT REVIEW QUEUE, phase 1: a LOCAL queue) - the pure core: what a record holds (and never holds), its limits (cut AND said), the queue file (JSON lines), the resolutions with their undo, the personal table
// (a resolved sentence maps to its lines), the weekly failure list and the export. Written RED first. Nothing here touches a file, the network or the DOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FAILED_FILE, RESOLVED_FILE, FP_LIMITS, LIST_MODEL_SENTINEL_FAILED_PROMPT_CORE,
  exportLines, failureList, knownLines, makeRecord, newId, normalise, parseQueue, pendingOf, recordLine, resolve, tableOf, unresolve,
  type FailedRecord, type FailureInput,
} from './failed-prompt-core.ts';

const META = { id: 'fp-1', time: '2026-11-21T01:02:03.000Z', build: '0.5.41 music abc1234', vaultId: 'v-9f3a' };
const INPUT: FailureInput = { kind: 'phrase', sentence: 'swap the second and third bars', lines: ['Extend [[bar_005]] to 4 bars, repeating with fills.'], barCount: 4, grammarError: { message: 'Expected "Keep ..." but found "swap".', column: 1 }, service: { result: 'none' } };
const rec = (over: Partial<FailureInput> = {}, meta: Partial<typeof META> = {}): FailedRecord => makeRecord({ ...INPUT, ...over }, { ...META, ...meta });

test('the sentinel and the file names', () => {
  assert.equal(LIST_MODEL_SENTINEL_FAILED_PROMPT_CORE, 'forge-list-model-core:failed-prompt-core');
  assert.equal(FAILED_FILE, 'failed-prompts.jsonl'); assert.equal(RESOLVED_FILE, 'failed-prompts-resolved.jsonl');
  assert.deepEqual(FP_LIMITS.sentence, 500); assert.equal(FP_LIMITS.lines, 50); assert.equal(FP_LIMITS.record, 8192);
});

test('a record has exactly the fields of the design (section 3), the vault id and no vault name, no path, no body; resolution is empty', () => {
  const r = rec();
  assert.deepEqual(Object.keys(r).sort(), ['bar-count', 'build', 'grammar-error', 'id', 'kind', 'lines', 'resolution', 'sentence', 'service-result', 'time', 'vault-id']);
  assert.equal(r.id, 'fp-1'); assert.equal(r.time, META.time); assert.equal(r.build, META.build); assert.equal(r['vault-id'], 'v-9f3a'); assert.equal(r.kind, 'phrase');
  assert.equal(r.sentence, INPUT.sentence); assert.deepEqual(r.lines, INPUT.lines); assert.equal(r['bar-count'], 4);
  assert.deepEqual(r['grammar-error'], { message: INPUT.grammarError!.message, column: 1 }); assert.deepEqual(r['service-result'], { result: 'none', text: '' }); assert.equal(r.resolution, null);
});

test('a record is ONE json line (no newline in it), parses back to itself, and is at most 8 KB', () => {
  const r = rec({ sentence: 'a\nb\r\nc\td', lines: ['x'] });
  const line = recordLine(r); assert.ok(!/[\n\r]/.test(line)); assert.deepEqual(JSON.parse(line), r); assert.ok(Buffer.byteLength(line) <= FP_LIMITS.record);
  assert.equal(r.sentence, 'a b c d', 'control characters and line breaks are spaces');
});

test('every service result is kept with its text: none, refused, cancelled, not-set-up, error:<code>; anything else becomes none', () => {
  for (const result of ['none', 'refused', 'cancelled', 'not-set-up', 'error:401', 'error:503', 'error:unreachable'] as const) assert.equal(rec({ service: { result, text: 'why' } })['service-result'].result, result);
  assert.deepEqual(rec({ service: { result: 'refused', text: 'No bar called bar_099.' } })['service-result'], { result: 'refused', text: 'No bar called bar_099.' });
  assert.equal(rec({ service: { result: 'bogus' as never } })['service-result'].result, 'none');
  assert.equal(rec({ service: { result: 'error:<script>' as never } })['service-result'].result, 'none');
  assert.equal(rec({ kind: 'nonsense' as never }).kind, 'phrase');
});

test('LIMITS are cut AND said: a sentence over 500 characters, more than 50 lines, a record over 8 KB (`cut` lists what was cut, only when something was)', () => {
  assert.equal('cut' in rec(), false);
  const long = rec({ sentence: 'x'.repeat(900) }); assert.equal(long.sentence.length, 500); assert.deepEqual(long.cut, ['sentence']);
  const many = rec({ lines: Array.from({ length: 80 }, (_, i) => `Keep bar ${i + 1}.`) }); assert.equal(many.lines.length, 50); assert.deepEqual(many.cut, ['lines']);
  const huge = rec({ sentence: '€'.repeat(500), lines: Array.from({ length: 50 }, () => 'L'.repeat(300)), grammarError: { message: 'g'.repeat(3000), column: 1 }, service: { result: 'refused', text: 's'.repeat(5000) } });
  assert.ok(Buffer.byteLength(recordLine(huge)) <= 8192); assert.ok(huge.cut!.length > 0); assert.ok(huge.cut!.includes('service-text') || huge.cut!.includes('lines') || huge.cut!.includes('grammar-error'));
  assert.equal(huge.sentence, '€'.repeat(500), 'the sentence is cut last (and only at 500)');
});

test('markup in a sentence is kept as TEXT (never interpreted by the record, escaped by JSON); a very long link and a lone bracket are just characters', () => {
  const r = rec({ sentence: 'Play [[phrase_001] <img src=x onerror=alert(1)> `x` {{y}}' });
  assert.equal(r.sentence, 'Play [[phrase_001] <img src=x onerror=alert(1)> `x` {{y}}'); assert.deepEqual(JSON.parse(recordLine(r)).sentence, r.sentence);
});

test('a bad bar count or column is null / 0, never NaN; lines are strings only', () => {
  assert.equal(rec({ barCount: Number.NaN })['bar-count'], null); assert.equal(rec({ barCount: -1 })['bar-count'], null); assert.equal(rec({ barCount: 2.9 })['bar-count'], 2);
  assert.equal(rec({ grammarError: null })['grammar-error'], null);
  assert.deepEqual(rec({ lines: ['a', 7 as never, null as never, 'b'] }).lines, ['a', 'b']);
});

test('ids are made from a random source once; normalise: case, spaces, final stop, quotes', () => {
  assert.equal(newId(() => 0.5, 1_700_000_000_000), newId(() => 0.5, 1_700_000_000_000)); assert.notEqual(newId(() => 0.1, 1), newId(() => 0.9, 1)); assert.match(newId(() => 0.25, 5), /^[a-z0-9-]+$/);
  assert.equal(normalise('  Move   Bar 4 before bar 2.  '), 'move bar 4 before bar 2'); assert.equal(normalise('"Move bar 4 before bar 2!"'), 'move bar 4 before bar 2'); assert.equal(normalise('Play [[phrase_001]'), 'play [[phrase_001]');
});

// ---- the queue file ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('parseQueue reads JSON lines, skips blank and broken lines (counted), keeps the order, and is not fooled by extra fields or a wrong shape', () => {
  const a = rec({}, { id: 'a' }), b = rec({}, { id: 'b' });
  const text = `${recordLine(a)}\n\nnot json\n{"id":"x"}\n${recordLine(b)}\n`;
  const q = parseQueue(text); assert.deepEqual(q.records.map((r) => r.id), ['a', 'b']); assert.equal(q.bad, 2);
  assert.deepEqual(parseQueue('').records, []); assert.equal(parseQueue('').bad, 0);
});

test('pending: unresolved only, OLDEST first (by time, then file order)', () => {
  const r1 = rec({}, { id: '1', time: '2026-11-21T03:00:00.000Z' }), r2 = rec({}, { id: '2', time: '2026-11-21T01:00:00.000Z' }), r3 = rec({}, { id: '3', time: '2026-11-21T01:00:00.000Z' });
  assert.deepEqual(pendingOf([r1, r2, r3]).map((r) => r.id), ['2', '3', '1']);
  assert.deepEqual(pendingOf(resolve([r1, r2, r3], '2', { kind: 'not-a-request' }, '2026-11-22T00:00:00.000Z')).map((r) => r.id), ['3', '1']);
});

test('resolve: the four kinds; lines are kept as given; an unknown id changes nothing; undo restores EXACTLY the record', () => {
  const base = [rec({}, { id: 'a' }), rec({}, { id: 'b' })];
  const T = '2026-11-22T00:00:00.000Z';
  const w = resolve(base, 'a', { kind: 'lines', lines: ['Move bar 3 one bar left.'] }, T); assert.deepEqual(w[0].resolution, { kind: 'lines', lines: ['Move bar 3 one bar left.'], time: T }); assert.equal(w[1].resolution, null);
  assert.deepEqual(resolve(base, 'a', { kind: 'teach', note: 'swap' }, T)[0].resolution, { kind: 'teach', note: 'swap', time: T });
  assert.deepEqual(resolve(base, 'a', { kind: 'ask', question: 'Which bars?' }, T)[0].resolution, { kind: 'ask', question: 'Which bars?', time: T });
  assert.deepEqual(resolve(base, 'a', { kind: 'not-a-request' }, T)[0].resolution, { kind: 'not-a-request', time: T });
  assert.deepEqual(resolve(base, 'zzz', { kind: 'not-a-request' }, T), base); assert.notEqual(resolve(base, 'a', { kind: 'not-a-request' }, T), base, 'immutable: a new list');
  assert.equal(base[0].resolution, null, 'the input is untouched');
  assert.deepEqual(unresolve(w, 'a'), base);
});

test('resolve cuts what a person types into a resolution: at most 50 lines of 300 chars, a note of 500, a question of 200 (and is cut, not refused)', () => {
  const T = 'now';
  const r = resolve([rec({}, { id: 'a' })], 'a', { kind: 'lines', lines: Array.from({ length: 60 }, () => 'K'.repeat(400)) }, T)[0].resolution!;
  assert.equal(r.lines!.length, 50); assert.ok(r.lines!.every((l) => l.length === 300));
  assert.equal(resolve([rec({}, { id: 'a' })], 'a', { kind: 'teach', note: 'n'.repeat(900) }, T)[0].resolution!.note!.length, 500);
  assert.equal(resolve([rec({}, { id: 'a' })], 'a', { kind: 'ask', question: 'q'.repeat(900) }, T)[0].resolution!.question!.length, 200);
});

// ---- the personal table, the weekly list, the export --------------------------------------------------------------------------------------------------------------------------------------
test('the personal table maps a NORMALISED sentence to its resolved lines (only "lines" resolutions); the same sentence typed differently still matches; a later resolution wins', () => {
  const T = '2026-11-22T00:00:00.000Z';
  let q = [rec({ sentence: 'Swap the 2nd and 3rd bars.' }, { id: 'a' }), rec({ sentence: 'x' }, { id: 'b' }), rec({ sentence: 'swap the 2nd and 3rd bars' }, { id: 'c' })];
  q = resolve(q, 'a', { kind: 'lines', lines: ['Move bar 3 one bar left.'] }, T); q = resolve(q, 'b', { kind: 'teach', note: 'n' }, T);
  assert.deepEqual([...tableOf(q).entries()], [['swap the 2nd and 3rd bars', ['Move bar 3 one bar left.']]]);
  assert.deepEqual(knownLines(tableOf(q), '  SWAP the 2nd and 3rd bars!!'), ['Move bar 3 one bar left.']); assert.equal(knownLines(tableOf(q), 'something else'), null);
  q = resolve(q, 'c', { kind: 'lines', lines: ['Move bar 2 one bar right.'] }, '2026-11-23T00:00:00.000Z'); assert.deepEqual(knownLines(tableOf(q), 'swap the 2nd and 3rd bars'), ['Move bar 2 one bar right.']);
  assert.equal(tableOf(resolve([rec({ sentence: 'y' }, { id: 'z' })], 'z', { kind: 'lines', lines: [] }, T)).size, 0, 'empty lines teach nothing');
});

test('the weekly failure list: the top sentences by COUNT (normalised), most first, ties by the earliest, a header line, never more than the asked top', () => {
  const mk = (s: string, id: string, t: string) => rec({ sentence: s }, { id, time: t });
  const q = [mk('Swap them.', '1', '2026-11-21T01:00:00Z'), mk('swap them', '2', '2026-11-21T02:00:00Z'), mk('Make it funky', '3', '2026-11-21T00:30:00Z'), mk('Play [[phrase_001]', '4', '2026-11-21T03:00:00Z'), mk('swap them!', '5', '2026-11-21T04:00:00Z')];
  const out = failureList(q, 2).split('\n');
  assert.equal(out[0], 'Failed sentences (top 2 of 3 different, 5 in all)'); assert.equal(out[1], '3\tswap them'); assert.equal(out[2], '1\tmake it funky'); assert.equal(out.length, 3);
  assert.equal(failureList([], 5), 'No failed sentences.');
});

test('the export is the RESOLVED records only, one JSON line each, oldest first, ending in a newline; nothing resolved = empty text', () => {
  const q = resolve([rec({}, { id: 'a', time: '2026-11-21T02:00:00Z' }), rec({}, { id: 'b', time: '2026-11-21T01:00:00Z' }), rec({}, { id: 'c' })], 'a', { kind: 'not-a-request' }, 't');
  const out = resolve(q, 'b', { kind: 'lines', lines: ['Keep bar 1.'] }, 't');
  const text = exportLines(out); assert.ok(text.endsWith('\n')); assert.deepEqual(text.trim().split('\n').map((l) => JSON.parse(l).id), ['b', 'a']);
  assert.equal(exportLines([rec()]), '');
});
