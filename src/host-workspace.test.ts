// 2026-10-27-1000: the shared host-faithful stand-in (test-support/host-workspace.ts) tested as a tool, because every wiring test trusts it. The point of each test is that the double does what Obsidian does (the walk stops on a truthy
// return, per split; layout-change arrives after the settle; time moves only when asked), and a guard that no test writes its own copy again (a hand-rolled walk hid the 2026-10-26-1545 incident for a day).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { HOST_LAYOUT_SETTLE_MS, installHostClock, iterateAllLeavesLikeObsidian, obsidianWorkspace } from './test-support/host-workspace.ts';

test('the walk goes root, left, right, floating, and a truthy return stops THAT split only', () => {
  const seen: string[] = [];
  iterateAllLeavesLikeObsidian<string>(() => ({ root: ['r1', 'r2', 'r3'], left: ['l1', 'l2'], right: ['x1'], floating: ['f1', 'f2'] }))((l) => { seen.push(l); return l === 'r2' || l === 'f1'; });
  assert.deepEqual(seen, ['r1', 'r2', 'l1', 'l2', 'x1', 'f1'], 'r3 and f2 are skipped, the other splits are walked in full');
  const none: string[] = [];
  iterateAllLeavesLikeObsidian<string>(() => ({ root: ['a'] }))((l) => { none.push(l); });
  assert.deepEqual(none, ['a'], 'a missing split is empty, a callback that returns nothing sees every leaf');
});

test('the walk reads the splits at every call and the callback may edit them mid-walk', () => {
  const ws = obsidianWorkspace<string>({ root: ['a', 'b'], left: [], right: [], floating: [] });
  const seen: string[] = [];
  ws.iterateAllLeaves((l) => { seen.push(l); ws.splits.root.splice(0); });
  assert.deepEqual(seen, ['a', 'b'], 'the walk goes over a copy');
  ws.iterateAllLeaves((l) => { seen.push(l); });
  assert.deepEqual(seen, ['a', 'b'], 'the second walk sees the edited splits');
});

test('the clock: time is frozen until advanced; timers run in due order, ties in creation order; a timer started by a timer runs inside the same advance when due; clearTimeout cancels', async () => {
  const win: { setTimeout?: unknown; clearTimeout?: unknown } = {};
  const realNow = Date.now;
  const clock = installHostClock(win);
  try {
    const log: string[] = [];
    const t0 = Date.now();
    (globalThis.setTimeout as unknown as (f: () => void, ms: number) => unknown)(() => log.push('b@' + (Date.now() - t0)), 20);
    (win.setTimeout as (f: () => void, ms: number) => unknown)(() => log.push('a@' + (Date.now() - t0)), 10);
    (globalThis.setTimeout as unknown as (f: () => void, ms: number) => unknown)(() => log.push('b2@' + (Date.now() - t0)), 20);
    const cancelled = (globalThis.setTimeout as unknown as (f: () => void, ms: number) => unknown)(() => log.push('never'), 5);
    (globalThis.clearTimeout as unknown as (t: unknown) => void)(cancelled);
    (globalThis.setTimeout as unknown as (f: () => void, ms: number) => unknown)(() => {
      log.push('c@' + (Date.now() - t0));
      (globalThis.setTimeout as unknown as (f: () => void, ms: number) => unknown)(() => log.push('c-child@' + (Date.now() - t0)), 15);
    }, 30);
    await clock.flush();
    assert.deepEqual(log, [], 'nothing runs while time stands still');
    assert.equal(Date.now(), t0);
    await clock.advance(19);
    assert.deepEqual(log, ['a@10']);
    assert.equal(Date.now() - t0, 19, 'the clock stands at the end of the advance');
    await clock.advance(1);
    assert.deepEqual(log, ['a@10', 'b@20', 'b2@20']);
    await clock.advance(30);
    assert.deepEqual(log, ['a@10', 'b@20', 'b2@20', 'c@30', 'c-child@45'], 'the child (30 + 15) ran in the same advance');
  } finally { clock.restore(); }
  assert.equal(Date.now, realNow, 'restore puts Date.now back');
  assert.equal(win.setTimeout, undefined, 'and the window\'s setTimeout');
});

test('layout-change reaches the handlers HOST_LAYOUT_SETTLE_MS after it is announced, not inside the call that caused it', async () => {
  const clock = installHostClock();
  try {
    const heard: number[] = [];
    const t0 = clock.now();
    clock.deliverAfterSettle([() => heard.push(clock.now() - t0)]);
    assert.deepEqual(heard, [], 'not synchronously');
    await clock.advance(HOST_LAYOUT_SETTLE_MS - 1);
    assert.deepEqual(heard, [], 'not before the settle');
    await clock.advance(1);
    assert.deepEqual(heard, [HOST_LAYOUT_SETTLE_MS]);
    clock.deliverAfterSettle(undefined);
    await clock.advance(HOST_LAYOUT_SETTLE_MS);
  } finally { clock.restore(); }
});

test('GUARD: no test file writes its own `iterateAllLeaves` (the shared one in test-support/host-workspace.ts is the only walk a test double has); the guard sees a hand-rolled one', () => {
  const handRolled = /(^\s*iterateAllLeaves\s*\(|\biterateAllLeaves\s*:|\biterateAllLeaves\s*=[^=])/;      // a method, a property, an assignment: not a call
  assert.ok(handRolled.test('workspace: { iterateAllLeaves: (cb) => { for (const l of leaves) cb(l); } }'), 'a property');
  assert.ok(handRolled.test('iterateAllLeaves(callback: (leaf: Leaf) => unknown): void {'), 'a method');
  assert.ok(handRolled.test('ws.iterateAllLeaves = (cb) => leaves.forEach(cb)'), 'an assignment');
  assert.ok(!handRolled.test('app.workspace.iterateAllLeaves((l) => { all.add(l); });'), 'a call is not a definition');
  const offenders: string[] = [];
  for (const f of readdirSync(new URL('.', import.meta.url))) {
    if (!f.endsWith('.test.ts') || f === 'host-workspace.test.ts') continue;
    readFileSync(new URL(f, import.meta.url), 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return;
      if (handRolled.test(line) && !/iterateAllLeaves:\s*iterateAllLeavesLikeObsidian\b/.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(offenders, [], 'use iterateAllLeavesLikeObsidian from test-support/host-workspace.ts');
});
