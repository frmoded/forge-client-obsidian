// 2026-11-20-1004 - mutation survivors of failed-prompt-core / -store / -setup-core, pinned: the exact caps and their boundaries, the byte-fit fallback, the reader of a queue file that someone edited, the tie-breaks of the lists, the store's lock and
// id, and the tracker's mapping of how a request ended (a status, unreachable, refused, not built), its dedupe and its forget.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FP_LIMITS, exportLines, failureList, makeRecord, newId, normalise, parseQueue, pendingOf, queueText, recordLine, resolve, tableOf, unresolve, type FailedRecord, type FailureInput } from './failed-prompt-core.ts';
import { createFailedStore, type FileAdapter } from './failed-prompt-store.ts';
import { createTracker, noteFailure, type FailedPromptsPort } from './failed-prompt-setup-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const META = { id: 'i', time: '2026-11-21T01:00:00.000Z', build: 'b', vaultId: 'v-1' };
const INPUT: FailureInput = { kind: 'phrase', sentence: 's', lines: ['L1'], barCount: 2, grammarError: { message: 'm', column: 1 }, service: { result: 'none' } };
const rec = (over: Partial<FailureInput> = {}, meta: Partial<typeof META> = {}): FailedRecord => makeRecord({ ...INPUT, ...over }, { ...META, ...meta });

// ---- the record's caps ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the caps sit exactly at 500 / 50 / 300 / 500 / 500 / 200 and the record at 8192', () => {
  assert.deepEqual(FP_LIMITS, { sentence: 500, lines: 50, line: 300, record: 8192, text: 500, note: 500, question: 200, build: 100 });
  assert.equal(rec({ sentence: 'x'.repeat(500) }).sentence.length, 500); assert.equal('cut' in rec({ sentence: 'x'.repeat(500) }), false);
  assert.deepEqual(rec({ sentence: 'x'.repeat(501) }).cut, ['sentence']); assert.equal(rec({ sentence: 'x'.repeat(501) }).sentence.length, 500);
  assert.equal('cut' in rec({ lines: Array.from({ length: 50 }, () => 'a') }), false); assert.deepEqual(rec({ lines: Array.from({ length: 51 }, () => 'a') }).cut, ['lines']);
  assert.equal(rec({ lines: ['x'.repeat(300)] }).lines[0].length, 300); assert.equal(rec({ lines: ['x'.repeat(301)] }).lines[0].length, 300);
});

test('the grammar message and the service text are cut at 500 AND said, each under its own name; at 500 they are not', () => {
  const g500 = rec({ grammarError: { message: 'g'.repeat(500), column: 1 } }); assert.equal('cut' in g500, false); assert.equal(g500['grammar-error']!.message.length, 500);
  const g501 = rec({ grammarError: { message: 'g'.repeat(501), column: 1 } }); assert.deepEqual(g501.cut, ['grammar-error']); assert.equal(g501['grammar-error']!.message.length, 500);
  const s500 = rec({ service: { result: 'refused', text: 's'.repeat(500) } }); assert.equal('cut' in s500, false);
  const s501 = rec({ service: { result: 'refused', text: 's'.repeat(501) } }); assert.deepEqual(s501.cut, ['service-text']); assert.equal(s501['service-result'].text.length, 500);
  const both = rec({ sentence: 'x'.repeat(600), lines: Array.from({ length: 60 }, () => 'a'), grammarError: { message: 'g'.repeat(600), column: 1 }, service: { result: 'refused', text: 's'.repeat(600) } });
  assert.deepEqual(both.cut, ['sentence', 'lines', 'grammar-error', 'service-text'], 'each is said once, in this order');
});

test('the 8 KB fit: lines go from the END, five at a time, until the record fits, and `lines` is said once', () => {
  const lines = Array.from({ length: 50 }, (_, i) => `${String(i).padStart(3, '0')}${'L'.repeat(297)}`);
  const r = rec({ lines });
  assert.ok(Buffer.byteLength(recordLine(r)) <= 8192); assert.deepEqual(r.cut, ['lines']);
  assert.ok(r.lines.length > 0 && r.lines.length < 50 && r.lines.length % 5 === 0, `kept ${r.lines.length}`); assert.deepEqual(r.lines, lines.slice(0, r.lines.length), 'the FIRST lines are kept');
  const more = rec({ lines, sentence: 'y'.repeat(500) }); assert.ok(more.lines.length < r.lines.length, 'a longer sentence leaves room for fewer lines');
  assert.ok(Buffer.byteLength(recordLine(rec({ lines: lines.slice(0, 20) }))) <= 8192); assert.equal(rec({ lines: lines.slice(0, 20) }).lines.length, 20, 'a record that fits keeps everything');
});

test('the build string is capped at 100 characters, so even a record with no lines always fits (the 8 KB limit is provable: every other field is capped)', () => {
  const r = makeRecord({ ...INPUT, sentence: '€'.repeat(500), lines: ['a'], grammarError: { message: '€'.repeat(500), column: 1 }, service: { result: 'refused', text: '€'.repeat(500) } }, { ...META, build: 'B'.repeat(9000) });
  assert.equal(r.build.length, 100); assert.ok(Buffer.byteLength(recordLine(r)) <= 8192); assert.deepEqual(r.lines, ['a']); assert.equal('cut' in r, false);
  assert.equal(makeRecord(INPUT, { ...META, build: 'b\nc' }).build, 'b c');
});

test('every kind is accepted; ids and their parts: the clock in base 36, six random base-36 digits', () => {
  for (const kind of ['phrase', 'arrangement', 'composition', 'bar'] as const) assert.equal(rec({ kind }).kind, kind);
  assert.equal(newId(() => 0, 36), 'fp-10-000000'); assert.equal(newId(() => 0.9999999999, 0), 'fp-0-zzzzzz');
  assert.match(newId(() => 0.5, 1_700_000_000_000), /^fp-[a-z0-9]+-[a-z0-9]{6}$/); assert.equal(newId(() => 0.5, 1.9), newId(() => 0.5, 1));
  assert.equal(normalise('  A\tB\n'), 'a b'); assert.equal(normalise(''), ''); assert.equal(normalise('“Hi.”'), 'hi'); assert.equal(normalise('x ?!. '), 'x');
});

// ---- the reader of a queue file that someone edited ---------------------------------------------------------------------------------------------------------------------------------------
test('parseQueue repairs what it can and drops what it cannot: wrong types become the defaults, a bad shape is skipped and counted', () => {
  const base = { id: 'a', time: 't', sentence: 's', kind: 'bar', lines: ['x', 3, 'y'] };
  const read = (extra: Record<string, unknown>): FailedRecord => parseQueue(JSON.stringify({ ...base, ...extra })).records[0];
  const r = read({ build: 7, 'vault-id': 8, 'bar-count': 'two', 'grammar-error': { message: 5 }, 'service-result': { result: 'bogus', text: 5 }, resolution: { kind: 7 }, cut: ['a', 1, 'b'] });
  assert.deepEqual([r.build, r['vault-id'], r['bar-count'], r['grammar-error'], r['service-result'], r.resolution, r.cut, r.lines], ['', '', null, null, { result: 'none', text: '' }, null, ['a', 'b'], ['x', 'y']]);
  const g = read({ 'grammar-error': { message: 'm', column: 'x' }, 'service-result': { result: 'refused', text: 't' }, 'bar-count': 4, build: 'b', 'vault-id': 'v', resolution: { kind: 'lines', lines: ['z'], time: 'T' } });
  assert.deepEqual([g['grammar-error'], g['service-result'], g['bar-count'], g.build, g['vault-id'], g.resolution], [{ message: 'm', column: 0 }, { result: 'refused', text: 't' }, 4, 'b', 'v', { kind: 'lines', lines: ['z'], time: 'T' }]);
  for (const bad of [{ id: 1 }, { time: 1 }, { sentence: 1 }, { kind: 'x' }, { lines: 'x' }, { id: undefined }]) assert.equal(parseQueue(JSON.stringify({ ...base, ...bad })).records.length, 0, JSON.stringify(bad));
  assert.equal(parseQueue(JSON.stringify([base])).records.length, 0, 'an array is not a record'); assert.equal(parseQueue('null').bad, 1); assert.equal(parseQueue(undefined as never).records.length, 0);
});

test('queueText / recordLine round trip; queueText of nothing is empty', () => {
  const a = rec({}, { id: 'a' }), b = rec({}, { id: 'b' });
  assert.equal(queueText([]), ''); assert.equal(queueText([a, b]), `${recordLine(a)}\n${recordLine(b)}\n`); assert.deepEqual(parseQueue(queueText([a, b])).records, [a, b]);
});

// ---- the order of lists -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('pending: strictly by time, EQUAL times keep the file order, a later file position never jumps ahead of an earlier time', () => {
  const mk = (id: string, time: string) => rec({}, { id, time });
  assert.deepEqual(pendingOf([mk('c', '2026-11-21T03:00:00.000Z'), mk('a', '2026-11-21T01:00:00.000Z'), mk('b', '2026-11-21T01:00:00.000Z'), mk('d', '2026-11-21T02:00:00.000Z')]).map((r) => r.id), ['a', 'b', 'd', 'c']);
  assert.deepEqual(pendingOf([mk('x', '2026-11-21T01:00:00.000Z'), mk('y', '2026-11-21T01:00:00.000Z')]).map((r) => r.id), ['x', 'y']);
  assert.deepEqual(pendingOf([mk('y', '2026-11-21T01:00:00.000Z'), mk('x', '2026-11-21T01:00:00.000Z')]).map((r) => r.id), ['y', 'x']);
});

test('the failure list: counts by normalised sentence, ties go to the EARLIEST first sighting (even when it comes later in the file), `top` is at least 1', () => {
  const mk = (s: string, time: string) => rec({ sentence: s }, { id: s + time, time });
  const q = [mk('beta', '2026-11-21T05:00:00Z'), mk('alpha', '2026-11-21T04:00:00Z'), mk('beta', '2026-11-21T01:00:00Z'), mk('alpha', '2026-11-21T09:00:00Z'), mk('gamma', '2026-11-21T00:00:00Z')];
  assert.deepEqual(failureList(q, 5).split('\n'), ['Failed sentences (top 3 of 3 different, 5 in all)', '2\tbeta', '2\talpha', '1\tgamma'], 'beta was first seen at 01:00, alpha at 04:00');
  assert.deepEqual(failureList(q, 0).split('\n'), ['Failed sentences (top 1 of 3 different, 5 in all)', '2\tbeta']);
  const same = [mk('one', '2026-11-21T02:00:00Z'), mk('two', '2026-11-21T01:00:00Z')]; assert.deepEqual(failureList(same, 5).split('\n').slice(1), ['1\ttwo', '1\tone']);
});

test('the export is oldest-first by time, file order for equal times; resolve of a missing id and unresolve keep every other record', () => {
  const a = rec({}, { id: 'a', time: '2026-11-21T02:00:00Z' }), b = rec({}, { id: 'b', time: '2026-11-21T01:00:00Z' }), c = rec({}, { id: 'c', time: '2026-11-21T01:00:00Z' });
  const all = ['a', 'b', 'c'].reduce((q, id) => resolve(q, id, { kind: 'not-a-request' }, 'T'), [a, b, c]);
  assert.deepEqual(exportLines(all).trim().split('\n').map((l) => JSON.parse(l).id), ['b', 'c', 'a']);
  assert.deepEqual(unresolve(all, 'a').map((r) => r.resolution === null), [true, false, false]);
  const tie = [resolve([a], 'a', { kind: 'lines', lines: ['x'] }, '2026-11-22T00:00:00Z')[0], resolve([b], 'b', { kind: 'lines', lines: ['y'] }, '2026-11-22T00:00:00Z')[0]];
  assert.deepEqual(tableOf([{ ...tie[0], sentence: 'same' }, { ...tie[1], sentence: 'same' }]).get('same'), ['y'], 'equal resolution times: the later in the file wins');
});

// ---- the store ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function memory(initial: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(initial)); const calls: string[] = []; let failNext = 0;
  const adapter: FileAdapter = {
    read: async (p) => { calls.push(`read ${p}`); const t = files.get(p); if (t === undefined) throw new Error('ENOENT'); return t; },
    write: async (p, t) => { calls.push(`write ${p}`); if (failNext > 0) { failNext--; throw new Error('boom'); } files.set(p, t); },
    append: async (p, t) => { calls.push(`append ${p}`); if (failNext > 0) { failNext--; throw new Error('boom'); } files.set(p, (files.get(p) ?? '') + t); },
    exists: async (p) => files.has(p),
  };
  return { files, calls, adapter, failNext: (n: number) => { failNext = n; } };
}
const DIR = 'plug';
const mkStore = (m: ReturnType<typeof memory>, on = { v: true }, extra: Partial<Parameters<typeof createFailedStore>[0]> = {}) => createFailedStore({ adapter: m.adapter, dir: DIR, enabled: () => on.v, build: () => 'b', now: () => 1_700_000_000_000, rand: () => 0.5, warn: () => {}, ...extra });

test('the vault id is exactly `v-` + the clock and the random digits (no `fp`, no dash); an existing valid id file is USED, an invalid one is replaced', async () => {
  const m = memory(); const s = mkStore(m); await s.record(INPUT);
  assert.equal(m.files.get('plug/failed-prompts-vault-id.txt'), `v-${newId(() => 0.5, 1_700_000_000_000).slice(3).replace(/-/g, '')}\n`);
  const kept = memory({ 'plug/failed-prompts-vault-id.txt': 'v-abc123\n' }); await mkStore(kept).record(INPUT); assert.equal(JSON.parse(kept.files.get('plug/failed-prompts.jsonl')!.trim())['vault-id'], 'v-abc123');
  for (const bad of ['', 'vault-name', 'v-', 'v-ABC', 'x v-abc']) { const w = memory({ 'plug/failed-prompts-vault-id.txt': bad }); await mkStore(w).record(INPUT); assert.notEqual(JSON.parse(w.files.get('plug/failed-prompts.jsonl')!.trim())['vault-id'], bad || 'x', JSON.stringify(bad)); assert.match(JSON.parse(w.files.get('plug/failed-prompts.jsonl')!.trim())['vault-id'], /^v-[a-z0-9]+$/); }
});

test('one failed write never blocks the next (the lock chain survives), and the failure is said once', async () => {
  const m = memory(); const said: string[] = []; const s = mkStore(m, { v: true }, { warn: (x) => { said.push(x); } });
  await s.record(INPUT); m.failNext(1); assert.equal(await s.record({ ...INPUT, sentence: 'two' }), false); assert.equal(await s.record({ ...INPUT, sentence: 'three' }), true);
  assert.equal(said.length, 1); assert.deepEqual(m.files.get('plug/failed-prompts.jsonl')!.trim().split('\n').map((l) => JSON.parse(l).sentence), ['s', 'three']);
  m.failNext(1); await assert.rejects(s.save([]), /boom/); await s.save([]); assert.equal(m.files.get('plug/failed-prompts.jsonl'), '');
});

test('load absorbs the file (the pending count and the table are known), a missing file is empty, and every change calls the listeners', async () => {
  const seed = memory(); const w = mkStore(seed); await w.record({ ...INPUT, sentence: 'a' }); await w.record({ ...INPUT, sentence: 'b' });
  const s = mkStore(seed); let changes = 0; s.onChange(() => { changes++; });
  assert.equal(s.pendingCount(), 0, 'nothing is known before a load'); await s.load(); assert.equal(s.pendingCount(), 2); assert.equal(changes, 1);
  await s.record({ ...INPUT, sentence: 'c' }); assert.equal(s.pendingCount(), 3); assert.equal(changes, 2); await s.save([]); assert.equal(s.pendingCount(), 0); assert.equal(changes, 3);
  await mkStore(memory()).load();
});

test('switching the setting OFF and refreshing forgets the table and the count; ON again does not bring the old table back without a read', async () => {
  const m = memory(); const on = { v: true }; const s = mkStore(m, on); await s.record({ ...INPUT, sentence: 'Swap them.' });
  const { records } = await s.load(); await s.save([{ ...records[0], resolution: { kind: 'lines', lines: ['Keep bar 1.'], time: 't' } }]); assert.deepEqual(s.known('swap them'), ['Keep bar 1.']);
  on.v = false; await s.refresh(); on.v = true; assert.equal(s.known('swap them'), null, 'the table was dropped'); assert.equal(s.pendingCount(), 0);
  await s.refresh(); assert.deepEqual(s.known('swap them'), ['Keep bar 1.']);
});

test('export counts exactly the resolved lines and names the file next to the queue', async () => {
  const m = memory(); const s = mkStore(m); for (const x of ['a', 'b', 'c']) await s.record({ ...INPUT, sentence: x });
  const { records } = await s.load(); await s.save(records.map((r, i) => (i < 2 ? { ...r, resolution: { kind: 'not-a-request' as const, time: 't' } } : r)));
  assert.deepEqual(await s.exportResolved(), { count: 2, file: 'plug/failed-prompts-resolved.jsonl' }); assert.equal(m.files.get('plug/failed-prompts-resolved.jsonl')!.split('\n').length, 3);
});

// ---- noteFailure and the tracker -----------------------------------------------------------------------------------------------------------------------------------------------------------
const recorder = () => { const got: FailureInput[] = []; const port: FailedPromptsPort = { record: (i) => { got.push(i); }, known: (s) => (s === 'known' ? ['K.'] : null) }; return { got, port }; };
const pane = (n: number) => { const el = { querySelector: (sel: string) => (sel === '.forge-rhythm-score-host' ? { querySelectorAll: (q: string) => (q === 'g.measure' ? Array.from({ length: n }) : []) } : null) }; return el as unknown as HTMLElement; };

test('noteFailure: the bar count only from a drawn Score; a bar keeps its own lines and never a count; a throwing port is swallowed', () => {
  const { got, port } = recorder();
  noteFailure(port, { family: 'phrase', sentence: 's', cur: '---\ntype: data\n---\n', vault: PHRASE_VAULT as never, pane: pane(3), grammar: null, service: { result: 'none' } });
  noteFailure(port, { family: 'bar', sentence: 's', lines: ['a', 'b'], pane: pane(3), grammar: { message: 'm', column: 2 }, service: { result: 'refused', text: 't' } });
  noteFailure(port, { family: 'phrase', sentence: 's', cur: '', vault: PHRASE_VAULT as never, pane: pane(0), grammar: null, service: { result: 'none' } });
  noteFailure(port, { family: 'phrase', sentence: 's', cur: '', vault: PHRASE_VAULT as never, grammar: null, service: { result: 'none' } });
  assert.deepEqual(got.map((g) => [g.kind, g.barCount, g.lines.length]), [['phrase', 3, 0], ['bar', null, 2], ['phrase', null, 0], ['phrase', null, 0]]);
  assert.deepEqual(got[1].grammarError, { message: 'm', column: 2 }); assert.deepEqual(got[1].service, { result: 'refused', text: 't' });
  assert.doesNotThrow(() => noteFailure({ record: () => { throw new Error('x'); }, known: () => null }, { family: 'bar', sentence: 's', grammar: null, service: { result: 'none' } }));
  assert.doesNotThrow(() => noteFailure(port, { family: 'phrase', sentence: 's', cur: undefined, vault: undefined, grammar: null, service: { result: 'none' } }));
});

const tracker = (over: { port?: FailedPromptsPort; askPlan?: unknown } = {}) => {
  const r = recorder();
  const t = createTracker({ failedPrompts: 'port' in over ? over.port : r.port, askPlan: 'askPlan' in over ? over.askPlan : () => 0, vault: () => PHRASE_VAULT as never, panes: () => [{ path: 'phrases/p.md', contentEl: pane(4) }, { path: 'phrases/q.md', contentEl: pane(9) }] },
    (path) => (path.startsWith('bars/') ? 'bar' : path.startsWith('phrases/') ? 'phrase' : null));
  return { t, got: r.got };
};

test('createTracker: no port = null (the controller keeps nothing); `known` is the port\'s table', () => {
  assert.equal(createTracker({ failedPrompts: undefined, vault: () => PHRASE_VAULT as never, panes: () => [] }, () => 'phrase'), null);
  const { t } = tracker(); assert.deepEqual(t!.known('known'), ['K.']); assert.equal(t!.known('other'), null);
});

test('fail needs the grammar\'s verdict first (`rejected`) and a list family; it records the grammar words, the NOTE\'S pane count and the result and text; the same sentence twice is one record until `forget`', () => {
  const { t, got } = tracker();
  t!.fail('phrases/p.md', 'x', 'none', 'why'); assert.equal(got.length, 0, 'no grammar verdict yet');
  t!.rejected('phrases/p.md', { message: 'bad', column: 7 }, '---\ntype: data\n---\n'); t!.fail('phrases/p.md', 'x', 'not-set-up', 'why');
  assert.deepEqual(got.map((g) => [g.kind, g.sentence, g.barCount, g.grammarError, g.service]), [['phrase', 'x', 4, { message: 'bad', column: 7 }, { result: 'not-set-up', text: 'why' }]]);
  t!.fail('phrases/p.md', 'x', 'none'); assert.equal(got.length, 1, 'same sentence: once'); t!.fail('phrases/p.md', 'y', 'cancelled'); assert.equal(got.length, 2); assert.deepEqual(got[1].service, { result: 'cancelled', text: '' });
  t!.forget('phrases/p.md'); t!.fail('phrases/p.md', 'y', 'cancelled'); assert.equal(got.length, 3, 'after forget it is a new failure');
  t!.rejected('bars/b.md', { message: 'm', column: 1 }, ''); t!.fail('bars/b.md', 'z', 'none'); assert.equal(got.length, 3, 'a bar goes through `bar`, never `fail`');
  t!.rejected('other/x.md', { message: 'm', column: 1 }, ''); t!.fail('other/x.md', 'z', 'none'); assert.equal(got.length, 3, 'a note that is none of ours');
  t!.rejected('phrases/q.md', { message: 'm', column: 1 }, ''); t!.fail('phrases/q.md', 'w', 'none'); assert.equal(got[3].barCount, 9, 'each note\'s own pane');
});

test('svc/ended: how a request ended becomes the result: a status of 200 is `refused`, 0 is `error:unreachable`, 401 is `error:401`, `none` is `none`; null forgets; `ended` records only when something ended', () => {
  const { t, got } = tracker(); const go = (how: number | 'none' | null, sentence: string) => { t!.rejected('phrases/p.md', { message: 'm', column: 1 }, ''); t!.svc('phrases/p.md', how, 'text'); t!.ended('phrases/p.md', sentence); };
  go(200, 'a'); go(0, 'b'); go(401, 'c'); go('none', 'd'); go(null, 'e');
  assert.deepEqual(got.map((g) => g.service), [{ result: 'refused', text: 'text' }, { result: 'error:unreachable', text: 'text' }, { result: 'error:401', text: 'text' }, { result: 'none', text: 'text' }]);
  t!.rejected('phrases/p.md', { message: 'm', column: 1 }, ''); t!.svc('phrases/p.md', 200); t!.ended('phrases/p.md', 'f'); assert.deepEqual(got[4].service, { result: 'refused', text: '' }, 'no text = empty text');
  t!.svc('phrases/p.md', null); t!.ended('phrases/p.md', 'g'); assert.equal(got.length, 5, 'forgotten: nothing ended');
});

test('bar: unoffered says why (no service in this build = none, a service not set up = not-set-up), cancelled, and a refusal with its status and words; deduped per bar; own lines, no count', () => {
  const none = tracker({ askPlan: undefined }), set = tracker();
  none.t!.bar('bars/b.md', 'x', ['L'], { message: 'm', column: 3 }, 'unoffered'); set.t!.bar('bars/b.md', 'x', ['L'], null, 'unoffered');
  assert.deepEqual(none.got[0], { kind: 'bar', sentence: 'x', lines: ['L'], barCount: null, grammarError: { message: 'm', column: 3 }, service: { result: 'none', text: '' } }); assert.deepEqual(set.got[0].service, { result: 'not-set-up', text: '' }); assert.equal(set.got[0].grammarError, null);
  const { t, got } = tracker();
  t!.bar('bars/b.md', 'a', [], null, 'cancelled'); t!.bar('bars/b.md', 'a', [], null, 'cancelled'); t!.bar('bars/b.md', 'b', [], null, { status: 0, text: 'offline' }); t!.bar('bars/b.md', 'c', [], null, { status: 503, text: 'busy' }); t!.bar('bars/b.md', 'd', [], null, { text: 'no' }); t!.bar('bars/b.md', 'e', [], null, { status: 200, text: 'no' });
  assert.deepEqual(got.map((g) => g.service.result), ['cancelled', 'error:unreachable', 'error:503', 'refused', 'refused']); assert.deepEqual(got[1].service.text, 'offline');
  t!.bar('bars/other.md', 'a', [], null, 'cancelled'); assert.equal(got.length, 6, 'another bar is another record');
});

// ---- third round: exact limits, a hand-edited file, the tie-breaks, the store's cache and switch, the setup's wiring ---------------------------------------------------------------------------------------
import { REVIEW_MENU_ID, createReview, LIST_MODEL_SENTINEL_FAILED_PROMPT_SETUP_CORE } from './failed-prompt-setup-core.ts';
import { LIST_MODEL_SENTINEL_FAILED_PROMPT_STORE } from './failed-prompt-store.ts';

test('column and bar count edges: 0 stays 0 (a bar count of 0 is a count), negatives and NaN are 0 / null, a fraction is floored', () => {
  assert.equal(rec({ grammarError: { message: 'm', column: 0 } }).grammarError?.column ?? rec({ grammarError: { message: 'm', column: 0 } })['grammar-error']!.column, 0);
  assert.equal(rec({ grammarError: { message: 'm', column: 0 } })['grammar-error']!.column, 0); assert.equal(rec({ grammarError: { message: 'm', column: -4 } })['grammar-error']!.column, 0);
  assert.equal(rec({ grammarError: { message: 'm', column: Number.NaN } })['grammar-error']!.column, 0); assert.equal(rec({ grammarError: { message: 'm', column: 2.9 } })['grammar-error']!.column, 2);
  assert.equal(rec({ barCount: 0 })['bar-count'], 0); assert.equal(rec({ barCount: 1 })['bar-count'], 1);
});

test('the record limit is EXACT: a record of 8192 bytes keeps its lines, one of 8193 is trimmed (from the end, five lines at a time)', () => {
  const lines = (n: number, last: number) => [...Array.from({ length: n }, (_, i) => `${String(i).padStart(2, '0')}${'a'.repeat(288)}`), 'b'.repeat(last)];
  const bytesOf = (n: number, last: number) => Buffer.byteLength(recordLine({ ...makeRecord({ ...INPUT, lines: [] }, META), lines: lines(n, last) }));          // the UNTRIMMED size (makeRecord trims)
  let guard = 0;
  let n = 1; while (bytesOf(n + 1, 1) <= 8192 && guard++ < 100) n++;
  const last = 1 + (8192 - bytesOf(n, 1)); assert.ok(last >= 1 && last <= 300, `tunable: ${last}`);
  const fit = makeRecord({ ...INPUT, lines: lines(n, last) }, META); assert.equal(Buffer.byteLength(recordLine(fit)), 8192); assert.equal(fit.lines.length, n + 1); assert.equal('cut' in fit, false);
  const over = makeRecord({ ...INPUT, lines: lines(n, last + 1) }, META); assert.ok(Buffer.byteLength(recordLine(over)) <= 8192); assert.equal(over.lines.length, n + 1 - 5); assert.deepEqual(over.cut, ['lines']);
});

test('a hand-edited file: a `lines` resolution without lines teaches nothing and never throws', () => {
  const text = JSON.stringify({ id: 'a', time: 't', sentence: 'swap', kind: 'phrase', lines: [], resolution: { kind: 'lines', time: 'T' } });
  const { records } = parseQueue(text); assert.equal(records.length, 1); assert.doesNotThrow(() => tableOf(records)); assert.equal(tableOf(records).size, 0);
  assert.equal(tableOf(parseQueue(JSON.stringify({ id: 'b', time: 't', sentence: 'x', kind: 'phrase', lines: [], resolution: { kind: 'teach', time: 'T' } })).records).size, 0);
});

test('first sightings in the failure list are the EARLIEST time, not the last one read; equal first sightings keep the first-come order', () => {
  const mk = (s: string, time: string) => rec({ sentence: s }, { id: s + time, time });
  const q = [mk('x', '2026-11-21T02:00:00Z'), mk('y', '2026-11-21T05:00:00Z'), mk('x', '2026-11-21T08:00:00Z'), mk('y', '2026-11-21T06:00:00Z')];
  assert.deepEqual(failureList(q, 5).split('\n').slice(1), ['2\tx', '2\ty'], 'x first seen at 02:00, y at 05:00 (later records must not move them)');
  const q2 = [mk('y', '2026-11-21T05:00:00Z'), mk('x', '2026-11-21T08:00:00Z'), mk('y', '2026-11-21T06:00:00Z'), mk('x', '2026-11-21T02:00:00Z')]; assert.deepEqual(failureList(q2, 5).split('\n').slice(1), ['2\tx', '2\ty'], 'x: the earlier sighting comes later in the file');
  const eq = [mk('p', '2026-11-21T01:00:00Z'), mk('q', '2026-11-21T01:00:00Z')]; assert.deepEqual(failureList(eq, 5).split('\n').slice(1), ['1\tp', '1\tq']);
});

test('store: the vault id is read ONCE (a second record makes one append, no read); a switch OFF then ON again leaves no stale count', async () => {
  const m = memory(); const s = mkStore(m); await s.record(INPUT); m.calls.length = 0; await s.record(INPUT); assert.deepEqual(m.calls, ['append plug/failed-prompts.jsonl']);
  const on = { v: true }; const t = mkStore(memory(), on); await t.record(INPUT); await t.record(INPUT); assert.equal(t.pendingCount(), 2); on.v = false; await t.refresh(); on.v = true; assert.equal(t.pendingCount(), 0);
  assert.equal(LIST_MODEL_SENTINEL_FAILED_PROMPT_STORE, 'forge-list-model-core:failed-prompt-store');
});

const reviewDeps = (over: Partial<Parameters<typeof createReview>[0]> = {}) => { const m = memory(); const applied: string[] = []; return { m, applied, deps: { adapter: m.adapter, dir: DIR, enabled: () => true, build: () => 'b', now: () => 1_700_000_000_000, rand: () => 0.5, warn: () => {}, vault: () => PHRASE_VAULT as never, active: () => null, applyLines: async () => ({ ok: true, message: '' }), copy: async () => {}, ...over } as Parameters<typeof createReview>[0] }; };

test('setup wiring: the constants, bindOpen/open, attach/appendLine (with and without the controller), the menu entry, the top-20 list, the checks that need the lines above them', async () => {
  assert.equal(LIST_MODEL_SENTINEL_FAILED_PROMPT_SETUP_CORE, 'forge-list-model-core:failed-prompt-setup-core'); assert.equal(REVIEW_MENU_ID, 'review-unprocessed-sentences');
  const { deps } = reviewDeps(); const r = createReview(deps);
  assert.deepEqual(await r.appendLine('p', 's'), { ok: false, message: 'The composer is not ready.' });
  const seen: string[] = []; r.port.attach!({ appendLine: async (p, s) => { seen.push(`${p}:${s}`); return { ok: true, message: 'ok' }; } }); assert.deepEqual(await r.appendLine('p', 's'), { ok: true, message: 'ok' }); assert.deepEqual(seen, ['p:s']);
  let opened = 0; r.port.open!(); assert.equal(opened, 0); r.bindOpen(() => { opened++; }); r.port.open!(); assert.equal(opened, 1);
  const head = 'Extend [[bar_005]] to 4 bars, repeating with fills.';
  const out = await r.tabPorts.check(makeRecord({ ...INPUT, kind: 'phrase', lines: [] }, META), [head, 'Make it 2 bars long.']); assert.deepEqual(out, [null, null], 'the second line reads only AFTER the first');
  const alone = await r.tabPorts.check(makeRecord({ ...INPUT, kind: 'phrase', lines: [] }, META), ['Make it 2 bars long.']); assert.notEqual(alone[0], null);
  const bar = await r.tabPorts.check(makeRecord({ ...INPUT, kind: 'bar', lines: [] }, META), ['Start with 16 steps in 4/4 at 118 beats per minute: kick on steps 1 and 9.', 'Set the tempo to 100.']); assert.deepEqual(bar, [null, null]);
  for (let i = 0; i < 25; i++) r.port.record({ ...INPUT, sentence: `sentence ${i}` }); await r.settle();
  assert.match(await r.failureText(), /^Failed sentences \(top 20 of 25 different, 25 in all\)/);
});

test('the tracker keeps a bar\'s dedupe key apart from every other note and from the list notes', () => {
  const { t, got } = tracker();
  t!.bar('bars/b.md', 'x', [], null, 'cancelled'); t!.bar('bars/c.md', 'x', [], null, 'cancelled'); assert.equal(got.length, 2, 'the same sentence on another bar is another record');
  t!.rejected('phrases/p.md', { message: 'm', column: 1 }, ''); t!.fail('phrases/p.md', 'x', 'none'); assert.equal(got.length, 3, 'and on a phrase too');
});

// ---- fourth round -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the byte count INCLUDES the `cut` field the record will carry: a record that fits only without it is still trimmed', () => {
  const mk = (padLen: number) => makeRecord({ ...INPUT, sentence: 'x'.repeat(501), lines: Array.from({ length: 50 }, (_, i) => `${String(i).padStart(3, '0')}${'L'.repeat(40 + padLen)}`) }, META);
  const sizeWith = (r: FailedRecord) => Buffer.byteLength(recordLine(r));
  let boundary = -1;
  for (let pad = 0; pad < 260; pad++) { const r = mk(pad); if (r.lines.length < 50) { boundary = pad; break; } }
  assert.ok(boundary > 0, 'some line length makes the 50 lines too big'); const fits = mk(boundary - 1); assert.equal(fits.lines.length, 50);
  assert.ok(sizeWith(fits) <= 8192 && sizeWith(fits) > 8192 - 60, 'the last record that keeps all its lines is within 60 bytes of the limit (the cut field is counted)');
  assert.ok(sizeWith(mk(boundary)) <= 8192, 'the first trimmed record fits'); assert.deepEqual(mk(boundary).cut, ['sentence', 'lines']);
  const bare = (r: FailedRecord): FailedRecord => { const { cut: _c, ...rest } = r; return rest as FailedRecord; };
  assert.ok(sizeWith(bare(fits)) + 8192 - sizeWith(fits) > 0 && sizeWith(bare(mk(boundary - 1))) < sizeWith(fits), 'without the cut field the same record is shorter: the cut field counts');
});

test('store: the LOCK serialises a slow rewrite and an append (the record is never lost); an existing valid vault id is cached after its first read', async () => {
  const files = new Map<string, string>(); const tick = async (n: number) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
  const slow: FileAdapter = { read: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('x'); return t; }, write: async (p, t) => { await tick(20); files.set(p, t); }, append: async (p, t) => { files.set(p, (files.get(p) ?? '') + t); }, exists: async (p) => files.has(p) };
  const s = createFailedStore({ adapter: slow, dir: DIR, enabled: () => true, build: () => 'b', now: () => 1_700_000_000_000, rand: () => 0.5, warn: () => {} });
  await s.record({ ...INPUT, sentence: 'one' }); const { records } = await s.load();
  await Promise.all([s.save(records.map((r) => ({ ...r, resolution: { kind: 'not-a-request' as const, time: 't' } }))), s.record({ ...INPUT, sentence: 'two' })]);
  assert.deepEqual((await s.load()).records.map((r) => r.sentence), ['one', 'two'], 'the append waited for the write');
  const m = memory({ 'plug/failed-prompts-vault-id.txt': 'v-abc123\n' }); const t = mkStore(m); await t.record(INPUT); m.calls.length = 0; await t.record(INPUT); assert.deepEqual(m.calls, ['append plug/failed-prompts.jsonl'], 'read once, then remembered');
});

test('copyFailureList returns the text it copied', async () => {
  const { deps } = reviewDeps(); const r = createReview(deps); r.port.record({ ...INPUT, sentence: 'z' }); await r.settle(); const text = await r.copyFailureList(); assert.equal(text, await r.failureText()); assert.match(text, /\n1\tz$/);
});
