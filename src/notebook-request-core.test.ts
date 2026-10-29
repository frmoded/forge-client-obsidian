// 2026-10-27-0720 (M14 slice 2): the notebook's typed request, the pure core, offline (the service is a stub answer, never the network). A sentence plus the SELECTION becomes the POST /plan payload; the service's answer becomes the ops Run
// would have made from the op picker; the bars and the row are the selection's, whatever the answer says; every refusal is one plain sentence.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EMPTY_REQUEST, NOT_A_TRANSFORM, NO_BARS_SELECTED, OLD_SERVICE, REQUEST_NEEDS_VERSION, askedLine, buildTransformRequest, interpretTransformResponse, oneLine, versionAtLeast,
} from './notebook-request-core.ts';
import { planTransportRefusal } from './sentence-plan-core.ts';

const SOURCE = 'phrases/phrase_006';
const RUNS: Array<[number, number]> = [[3, 5]];
const ctx = (over: Partial<{ runs: Array<[number, number]>; row: string | null }> = {}) => ({ source: SOURCE, runs: RUNS, row: 'kick' as string | null, ...over });
const ok = (plan: unknown) => ({ status: 200, json: { ok: true, parsed_ok: true, plan, error: null } });

// ---- the request ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('the payload: the sentence (one line), the vault\'s bar and phrase names (no README, sorted), and the selection of the FIRST run with its row; the BYOK key only when there is one', () => {
  const r = buildTransformRequest({ sentence: '  make this\n half   as busy, keep the downbeat ', source: SOURCE, runs: [[3, 5], [9, 9]], row: 'kick', barNames: ['bar_005', 'README', 'bar_001', 'bar_005'], phraseNames: ['phrase_006', 'README', 'phrase_001'] });
  assert.deepEqual(r, { ok: true, payload: { sentence: 'make this half as busy, keep the downbeat', bars: ['bar_001', 'bar_005'], phrases: ['phrase_001', 'phrase_006'], selection: { phrase: SOURCE, first: 3, last: 5, row: 'kick' } } });
  const keyed = buildTransformRequest({ sentence: 'x', source: SOURCE, runs: RUNS, row: null, barNames: [], phraseNames: [], ownKey: 'sk-ant-mine' });
  assert.ok(keyed.ok);
  if (keyed.ok) { assert.equal(keyed.payload.user_anthropic_key, 'sk-ant-mine'); assert.equal('row' in keyed.payload.selection, false, 'no row = every row: the field is absent'); assert.deepEqual(keyed.payload.bars, [], 'the vault having no bars does not stop a transform'); }
  const plain = buildTransformRequest({ sentence: 'x', source: SOURCE, runs: RUNS, row: null, barNames: [], phraseNames: [], ownKey: '' });
  assert.ok(plain.ok && !('user_anthropic_key' in plain.payload), 'an empty key is no key');
});

test('nothing is sent for an empty sentence, an over-long one, or no selected bars; each is one sentence', () => {
  const base = { source: SOURCE, runs: RUNS, row: null, barNames: [], phraseNames: [] };
  assert.deepEqual(buildTransformRequest({ ...base, sentence: '   \n ' }), { ok: false, message: EMPTY_REQUEST });
  assert.equal(buildTransformRequest({ ...base, sentence: 'a'.repeat(500) }).ok, true);
  assert.deepEqual(buildTransformRequest({ ...base, sentence: 'a'.repeat(501) }), { ok: false, message: 'That sentence is 501 characters; the limit is 500. Make it shorter.' });
  assert.deepEqual(buildTransformRequest({ ...base, sentence: 'half as busy', runs: [] }), { ok: false, message: NO_BARS_SELECTED });
  assert.equal(oneLine(' a \t b\n\nc '), 'a b c');
});

// ---- the answer -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('"make this half as busy, keep the downbeat": thin_out, amount 0.5, keep downbeat, on the SELECTION\'s bars and row (the engine\'s default keep is the downbeat, so the op carries none)', () => {
  const r = interpretTransformResponse(ok({ kind: 'transform', op: 'thin_out', amount: 0.5, keep: 'downbeat' }), ctx());
  assert.deepEqual(r, { ok: true, op: 'thin_out', ops: [{ op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 }] });
});

test('every op the service can say, with its numbers: thin_out (amount, keep seeded), double_up (grid), and the defaults when it says none', () => {
  assert.deepEqual((interpretTransformResponse(ok({ kind: 'transform', op: 'thin_out', amount: 1, keep: 'seeded' }), ctx()) as any).ops, [{ op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 1, keep: 'seeded', seed: 0 }]);
  assert.deepEqual((interpretTransformResponse(ok({ kind: 'transform', op: 'thin_out' }), ctx()) as any).ops, [{ op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 }], 'no number: the notebook\'s own default');
  assert.deepEqual((interpretTransformResponse(ok({ kind: 'transform', op: 'double_up', grid: 12 }), ctx()) as any).ops, [{ op: 'double_up', first: 3, last: 5, row: 'kick', grid: 12 }]);
  assert.deepEqual((interpretTransformResponse(ok({ kind: 'transform', op: 'double_up' }), ctx({ row: null })) as any).ops, [{ op: 'double_up', first: 3, last: 5, grid: 16 }], 'no row = every row; no grid = 16');
});

test('a scattered selection gets the SAME op on each run, in order', () => {
  const r = interpretTransformResponse(ok({ kind: 'transform', op: 'thin_out', amount: 0.25 }), ctx({ runs: [[2, 2], [4, 5]], row: null }));
  assert.deepEqual(r, { ok: true, op: 'thin_out', ops: [{ op: 'thin_out', first: 2, last: 2, amount: 0.25 }, { op: 'thin_out', first: 4, last: 5, amount: 0.25 }] });
});

test('a selection the answer tries to override: first, last and row in the plan are never read', () => {
  const r = interpretTransformResponse(ok({ kind: 'transform', op: 'thin_out', amount: 0.5, first: 1, last: 99, row: 'snare' }), ctx());
  assert.deepEqual(r, { ok: true, op: 'thin_out', ops: [{ op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 }] });
  const noRow = interpretTransformResponse(ok({ kind: 'transform', op: 'double_up', row: 'snare' }), ctx({ row: null }));
  assert.ok(noRow.ok && noRow.ops.every((o) => o.row === undefined), 'the row the person did not pick is not a row');
});

test('the plugin\'s own validation has the last word: an amount, keep or grid the engine would refuse is a refusal naming it, never an op', () => {
  for (const [plan, expected] of [
    [{ kind: 'transform', op: 'thin_out', amount: 7 }, /amount must be a number from 0 to 1/],
    [{ kind: 'transform', op: 'thin_out', keep: 'snare' }, /keep must be "downbeat" or "seeded"/],
    [{ kind: 'transform', op: 'double_up', grid: 0 }, /grid must be a whole number/],
    [{ kind: 'transform', op: 'thin_out', grid: 16 }, /grid only applies to double_up/],
    [{ kind: 'transform', op: 'double_up', amount: 0.5 }, /amount only applies to thin_out/],
  ] as const) {
    const r = interpretTransformResponse(ok(plan), ctx());
    assert.equal(r.ok, false);
    if (r.ok === false) { assert.match(r.message, /^The planner's answer is not a valid operation: /); assert.match(r.message, expected); assert.equal(r.suspectOld, false, 'a bad number is not an old service'); }
  }
  const noOp = interpretTransformResponse(ok({ kind: 'transform', op: 'swing' }), ctx());
  assert.deepEqual(noOp, { ok: false, message: 'The planner\'s answer is not a valid operation: op must be "thin_out" or "double_up", got "swing".', suspectOld: false });
});

test('"make it jazzier": the service\'s own one-sentence reason is what the person reads; with no reason, the generic one; both could be an old service', () => {
  assert.deepEqual(interpretTransformResponse({ status: 200, json: { ok: false, parsed_ok: true, plan: null, error: 'I can thin the hits out or double them up; I cannot make a bar jazzier.' } }, ctx()), { ok: false, message: 'I can thin the hits out or double them up; I cannot make a bar jazzier.', suspectOld: true });
  assert.deepEqual(interpretTransformResponse({ status: 200, json: { ok: false } }, ctx()), { ok: false, message: 'The planner did not say why it could not plan that. Try saying it differently.', suspectOld: true });
  assert.equal((interpretTransformResponse({ status: 200, json: { ok: true, plan: null } }, ctx()) as any).suspectOld, true);
});

test('an answer that says ok but has no plan, or says not-ok but carries one, is a refusal with the generic reason or the service\'s own, never an op and never a throw', () => {
  assert.deepEqual(interpretTransformResponse({ status: 200, json: { ok: true } }, ctx()), { ok: false, message: 'The planner did not say why it could not plan that. Try saying it differently.', suspectOld: true });
  assert.deepEqual(interpretTransformResponse({ status: 200, json: { ok: false, plan: { kind: 'transform', op: 'thin_out' }, error: 'No.' } }, ctx()), { ok: false, message: 'No.', suspectOld: true });
  assert.deepEqual(interpretTransformResponse({ status: 200, json: { plan: { kind: 'transform', op: 'thin_out' } } }, ctx()), { ok: false, message: 'The planner did not say why it could not plan that. Try saying it differently.', suspectOld: true }, 'no ok at all is not ok');
});

test('an answer that is another kind of phrase (what an old service gives) is not an operation: NOT_A_TRANSFORM, and it may be an old service', () => {
  for (const plan of [{ kind: 'extend', bar: 'bar_005', bars: 8 }, { kind: 'mix', a: 'x', b: 'y' }, { kind: 'banana' }, 'extend', ['transform']]) {
    assert.deepEqual(interpretTransformResponse(ok(plan), ctx()), { ok: false, message: NOT_A_TRANSFORM, suspectOld: true }, JSON.stringify(plan));
  }
});

test('the trouble before there is a plan reads exactly as it does in the sentence dialog, and an old service (404) says it needs 0.2.41', () => {
  const sameAsDialog: Array<[number, unknown]> = [
    [0, { detail: 'Set your transpile token in Settings → Forge → Transpile token before using /generate.' }], [0, { detail: 'ECONNREFUSED' }], [0, null], [401, null], [422, null], [429, null], [503, null],
    [502, { detail: { error: 'Anthropic API: boom' } }], [502, null], [500, null], [200, 'not an object'], [200, null],
  ];
  for (const [status, json] of sameAsDialog) {
    const r = interpretTransformResponse({ status, json }, ctx());
    assert.equal(r.ok, false);
    if (r.ok === false) { assert.equal(r.message, planTransportRefusal({ status, json }, REQUEST_NEEDS_VERSION), `${status} ${JSON.stringify(json)}`); assert.equal(r.suspectOld, false); }
  }
  const old = interpretTransformResponse({ status: 404, json: { detail: 'Not Found' } }, ctx());
  assert.deepEqual(old, { ok: false, message: OLD_SERVICE, suspectOld: false });
  assert.match(OLD_SERVICE, /does not offer planning yet \(it needs version 0\.2\.41 or newer\)/);
});

// ---- 2026-10-29-0800: the answer carries the service version -----------------------------------------------------------------------------------------------------------------------

test('an answer an old service could also give hands back the version the answer itself carries; one without a readable version hands back null (the caller then asks /health)', () => {
  const refusal = (extra: Record<string, unknown>) => ({ status: 200, json: { ok: false, parsed_ok: true, plan: null, error: 'I cannot make a bar jazzier.', ...extra } });
  const newPlan = (extra: Record<string, unknown>) => ({ status: 200, json: { ok: true, plan: { kind: 'extend', bar: 'bar_005', bars: 8 }, ...extra } });
  for (const [label, res] of [['a refusal', refusal], ['another kind of phrase', newPlan]] as const) {
    const withVersion = interpretTransformResponse(res({ version: '0.2.42' }), ctx());
    assert.equal(withVersion.ok, false, label);
    if (withVersion.ok === false) { assert.equal(withVersion.suspectOld, true, label); assert.equal(withVersion.serviceVersion, '0.2.42', label); }
    for (const unreadable of [undefined, '', 42, null, ['0.2.42'], { v: '0.2.42' }]) {
      const r = interpretTransformResponse(res(unreadable === undefined ? {} : { version: unreadable }), ctx());
      assert.equal(r.ok, false, label);
      if (r.ok === false) assert.equal(r.serviceVersion ?? null, null, `${label}: ${JSON.stringify(unreadable)} is no version`);
    }
  }
});

// ---- the version ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('a version is compared by its numbers, not its text; what is not a version is unknown (null), never old', () => {
  assert.equal(versionAtLeast('0.2.41', '0.2.41'), true);
  assert.equal(versionAtLeast('0.2.40', '0.2.41'), false);
  assert.equal(versionAtLeast('0.2.9', '0.2.41'), false, 'by number: 9 is less than 41');
  assert.equal(versionAtLeast('0.2.100', '0.2.41'), true, 'by number: 100 is more than 41');
  assert.equal(versionAtLeast('0.10.0', '0.2.41'), true);
  assert.equal(versionAtLeast('1.0.0', '0.2.41'), true);
  assert.equal(versionAtLeast('0.1.99', '0.2.41'), false);
  assert.equal(versionAtLeast('0.9.9', '1.0.0'), false, 'the major decides first');
  assert.equal(versionAtLeast('1.0.0', '1.0.0'), true);
  assert.equal(versionAtLeast('1.2.3', '1.2.4'), false);
  assert.equal(versionAtLeast(' 0.2.41-dev', '0.2.41'), true, 'what follows the third number is ignored');
  for (const v of [null, undefined, '', 'unknown', '0.2', 'v0.2.41', 5 as unknown as string]) assert.equal(versionAtLeast(v, '0.2.41'), null, String(v));
  assert.equal(versionAtLeast('0.2.41', 'garbage'), null);
});

// ---- the evidence line ----------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('the evidence line: asked "<sentence>" -> thin_out | double_up | refused: <why>; a long sentence is cut at 80 characters and whitespace is one space', () => {
  assert.equal(askedLine('make this half as busy', { ok: true, op: 'thin_out', ops: [] }), '[forge-notebook] asked "make this half as busy" -> thin_out');
  assert.equal(askedLine('double  the\nhits', { ok: true, op: 'double_up', ops: [] }), '[forge-notebook] asked "double the hits" -> double_up');
  assert.equal(askedLine('make it jazzier', { ok: false, message: 'I cannot make a bar jazzier.' }), '[forge-notebook] asked "make it jazzier" -> refused: I cannot make a bar jazzier.');
  const long = askedLine('x'.repeat(81), { ok: false, message: 'm' });
  assert.equal(long, `[forge-notebook] asked "${'x'.repeat(80)}..." -> refused: m`);
  assert.equal(askedLine('x'.repeat(80), { ok: false, message: 'm' }), `[forge-notebook] asked "${'x'.repeat(80)}" -> refused: m`);
});
