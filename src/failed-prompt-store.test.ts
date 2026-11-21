// 2026-11-20-1004 - the store: the queue file in the plugin's own data folder (never data.json), the random vault id kept once in its own file, a lock so a composer's append and the tab's rewrite never interleave, and P3: with the setting OFF
// nothing at all is written (not even read).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createFailedStore, type FileAdapter } from './failed-prompt-store.ts';
import { FAILED_FILE, RESOLVED_FILE } from './failed-prompt-core.ts';
import type { FailureInput } from './failed-prompt-core.ts';

const DIR = '.obsidian/plugins/forge-actions';
const INPUT: FailureInput = { kind: 'phrase', sentence: 'swap them', lines: ['Keep bars 1 to 2.'], barCount: 4, grammarError: { message: 'bad', column: 1 }, service: { result: 'none' } };

function memory(initial: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(initial)); const calls: string[] = [];
  const adapter: FileAdapter = {
    read: async (p) => { calls.push(`read ${p}`); const t = files.get(p); if (t === undefined) throw new Error('ENOENT'); return t; },
    write: async (p, t) => { calls.push(`write ${p}`); await Promise.resolve(); files.set(p, t); },
    append: async (p, t) => { calls.push(`append ${p}`); await Promise.resolve(); files.set(p, (files.get(p) ?? '') + t); },
    exists: async (p) => { calls.push(`exists ${p}`); return files.has(p); },
  };
  return { files, calls, adapter };
}
let n = 0;
const make = (m: ReturnType<typeof memory>, over: Partial<Parameters<typeof createFailedStore>[0]> = {}) => createFailedStore({ adapter: m.adapter, dir: DIR, enabled: () => true, build: () => '0.5.41 music abc', now: () => Date.parse('2026-11-21T01:02:03Z') + (n++) * 1000, rand: () => 0.42, warn: () => {}, ...over });

test('P3: with the setting OFF nothing is read or written: no file, no folder, no id', async () => {
  const m = memory(); const s = make(m, { enabled: () => false });
  assert.equal(await s.record(INPUT), false); assert.deepEqual(m.calls, []); assert.equal(m.files.size, 0);
  assert.deepEqual(await s.load(), { records: [], bad: 0 }); assert.deepEqual(m.calls, [], 'not even a read');
  assert.equal(s.pendingCount(), 0);
});

test('ON: one record is ONE appended JSON line in the plugin folder; the file name is exactly failed-prompts.jsonl; data.json is never touched', async () => {
  const m = memory(); const s = make(m);
  assert.equal(await s.record(INPUT), true);
  const text = m.files.get(`${DIR}/${FAILED_FILE}`)!; assert.equal(text.split('\n').length, 2); assert.ok(text.endsWith('\n'));
  const r = JSON.parse(text.trim()); assert.equal(r.sentence, 'swap them'); assert.equal(r.build, '0.5.41 music abc'); assert.equal(r.resolution, null); assert.match(r.id, /^fp-/);
  assert.ok(![...m.files.keys(), ...m.calls].some((x) => /data\.json/.test(x)), 'data.json is never named');
  assert.equal(await s.record({ ...INPUT, sentence: 'second' }), true); assert.equal(m.files.get(`${DIR}/${FAILED_FILE}`)!.trim().split('\n').length, 2);
  assert.equal(s.pendingCount(), 2);
});

test('the vault id is random, made ONCE, kept in its own file, never the vault name; two stores on the same folder share it', async () => {
  const m = memory(); const s = make(m); await s.record(INPUT); await s.record(INPUT);
  const ids = m.files.get(`${DIR}/${FAILED_FILE}`)!.trim().split('\n').map((l) => JSON.parse(l)['vault-id']); assert.equal(ids[0], ids[1]); assert.match(ids[0], /^v-[a-z0-9]+$/);
  const again = make(m); await again.record(INPUT); assert.equal(JSON.parse(m.files.get(`${DIR}/${FAILED_FILE}`)!.trim().split('\n')[2])['vault-id'], ids[0]);
  const idFiles = [...m.files.keys()].filter((k) => k !== `${DIR}/${FAILED_FILE}`); assert.deepEqual(idFiles, [`${DIR}/failed-prompts-vault-id.txt`]);
});

test('a write that fails is said once through `warn` and never throws into the composer', async () => {
  const m = memory(); const said: string[] = [];
  const bad: FileAdapter = { ...m.adapter, append: async () => { throw new Error('disk full'); }, write: async () => { throw new Error('disk full'); } };
  const s = createFailedStore({ adapter: bad, dir: DIR, enabled: () => true, build: () => 'b', now: () => 1, rand: () => 0.5, warn: (x) => { said.push(x); } });
  assert.equal(await s.record(INPUT), false); assert.equal(said.length, 1); assert.match(said[0], /disk full/);
});

test('load / save: the whole queue is rewritten under the SAME lock as the appends (a record made while the tab saves is never lost)', async () => {
  const m = memory(); const s = make(m);
  await s.record({ ...INPUT, sentence: 'one' });
  const { records } = await s.load(); assert.equal(records.length, 1);
  const saving = s.save(records.map((r) => ({ ...r, resolution: { kind: 'not-a-request' as const, time: 't' } })));
  const recording = s.record({ ...INPUT, sentence: 'two' });
  await Promise.all([saving, recording]);
  const after = (await s.load()).records; assert.deepEqual(after.map((r) => r.sentence), ['one', 'two']); assert.equal(after[0].resolution?.kind, 'not-a-request'); assert.equal(after[1].resolution, null);
  assert.equal(s.pendingCount(), 1);
});

test('load counts broken lines and keeps going; a missing file is an empty queue', async () => {
  const m = memory({ [`${DIR}/${FAILED_FILE}`]: 'junk\n' }); const s = make(m);
  assert.deepEqual(await s.load(), { records: [], bad: 1 });
  assert.deepEqual(await make(memory()).load(), { records: [], bad: 0 });
});

test('export writes failed-prompts-resolved.jsonl NEXT TO the queue with the resolved records only, and says how many', async () => {
  const m = memory(); const s = make(m);
  await s.record({ ...INPUT, sentence: 'a' }); await s.record({ ...INPUT, sentence: 'b' });
  const { records } = await s.load(); await s.save([{ ...records[0], resolution: { kind: 'lines', lines: ['Keep bar 1.'], time: 't' } }, records[1]]);
  assert.deepEqual(await s.exportResolved(), { count: 1, file: `${DIR}/${RESOLVED_FILE}` });
  assert.equal(JSON.parse(m.files.get(`${DIR}/${RESOLVED_FILE}`)!.trim()).sentence, 'a');
  const none = make(memory()); assert.deepEqual(await none.exportResolved(), { count: 0, file: `${DIR}/${RESOLVED_FILE}` });
});

test('the personal table follows the queue: a "lines" resolution is offered for the same sentence; undo takes it away; the pending count and `onChange` follow every change', async () => {
  const m = memory(); const s = make(m); let changes = 0; s.onChange(() => { changes++; });
  await s.record({ ...INPUT, sentence: 'Swap them.' });
  assert.equal(s.known('swap them'), null);
  const { records } = await s.load(); await s.save([{ ...records[0], resolution: { kind: 'lines', lines: ['Move bar 3 one bar left.'], time: '2026-11-22T00:00:00Z' } }]);
  assert.deepEqual(s.known('SWAP them!'), ['Move bar 3 one bar left.']); assert.equal(s.pendingCount(), 0);
  await s.save([{ ...records[0], resolution: null }]); assert.equal(s.known('swap them'), null); assert.equal(s.pendingCount(), 1);
  assert.ok(changes >= 3);
});

test('the personal table is read once at start when the setting is on (so a lookup costs no file read), and with the setting OFF it is empty', async () => {
  const m = memory(); const first = make(m); await first.record({ ...INPUT, sentence: 'Swap them.' });
  const { records } = await first.load(); await first.save([{ ...records[0], resolution: { kind: 'lines', lines: ['Keep bar 1.'], time: 't' } }]);
  const later = make(m); await later.refresh(); m.calls.length = 0;
  assert.deepEqual(later.known('swap them'), ['Keep bar 1.']); assert.deepEqual(m.calls, [], 'a lookup reads nothing');
  const off = make(m, { enabled: () => false }); await off.refresh(); assert.equal(off.known('swap them'), null);
});
