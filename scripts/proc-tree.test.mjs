// 2026-10-30-1010 - scripts/dev/proc-tree.mjs on its own: the pure parts (the process table read, the descendants of a pid) and the guards of the one function that signals (what it will never touch, the order it signals in, the switch that
// turns the walk off). The real leak it closes is proven on the real runner in mutate-runner-orphans.test.mjs; here process.kill is a recorder, so nothing is ever signalled.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { descendantsOf, killTree, parsePs } from './dev/proc-tree.mjs';

const ROWS = [
  { pid: 100, ppid: 1, pgid: 100 },        // the test file (leads its group)
  { pid: 101, ppid: 100, pgid: 100 },      // its child, same group
  { pid: 102, ppid: 101, pgid: 102 },      // a detached grandchild (its own group)
  { pid: 103, ppid: 102, pgid: 102 },      // and its child
  { pid: 200, ppid: 1, pgid: 200 },        // someone else's
  { pid: 201, ppid: 200, pgid: 200 },
  { pid: 300, ppid: 1, pgid: 300 },        // "this process" in the guard tests
];

function recorded(fn) {
  const calls = [];
  const saved = process.kill;
  process.kill = (target, sig) => { calls.push([target, sig]); return true; };
  try { return { result: fn(), calls }; } finally { process.kill = saved; }
}

test('parsePs reads pid, ppid and pgid; anything that is not three whole numbers is dropped', () => {
  assert.deepEqual(parsePs('  100     1   100\n  101   100   100\n'), [{ pid: 100, ppid: 1, pgid: 100 }, { pid: 101, ppid: 100, pgid: 100 }]);
  assert.deepEqual(parsePs('PID PPID PGID\n12 x 3\n1 2\n\n 7 8 9 10\n 4 5 6'), [{ pid: 4, ppid: 5, pgid: 6 }]);
  assert.deepEqual(parsePs(''), []);
});

test('descendantsOf: children, grandchildren and their children, in the order met; never the root, never an unrelated process', () => {
  assert.deepEqual(descendantsOf(ROWS, 100).map((r) => r.pid), [101, 102, 103]);
  assert.deepEqual(descendantsOf(ROWS, 102).map((r) => r.pid), [103]);
  assert.deepEqual(descendantsOf(ROWS, 103), []);
  assert.deepEqual(descendantsOf(ROWS, 999), [], 'a pid that is not in the table has no descendants');
  assert.deepEqual(descendantsOf(ROWS, 200).map((r) => r.pid), [201]);
});

test('descendantsOf never walks through pid 1, even when a damaged table puts it under the root (every orphan is its child)', () => {
  const damaged = [...ROWS, { pid: 1, ppid: 100, pgid: 100 }];
  assert.deepEqual(descendantsOf(damaged, 100).map((r) => r.pid), [101, 102, 103], 'init is not a descendant and nothing is reached through it');
});

test('descendantsOf: a damaged table with a loop in it terminates and lists each process once', () => {
  const loop = [{ pid: 5, ppid: 6, pgid: 5 }, { pid: 6, ppid: 5, pgid: 6 }, { pid: 7, ppid: 6, pgid: 7 }];
  assert.deepEqual(descendantsOf(loop, 5).map((r) => r.pid).sort(), [6, 7]);
});

test('killTree: the group, then every descendant and the group each one leads; STOP everything before KILLING anything; the pid itself last', () => {
  const { result, calls } = recorded(() => killTree(100, { rows: [...ROWS, { pid: process.pid, ppid: 1, pgid: 300 }] }));
  assert.deepEqual(result, [101, 102, 103]);
  const stops = calls.filter(([, s]) => s === 'SIGSTOP'), kills = calls.filter(([, s]) => s === 'SIGKILL');
  assert.deepEqual(stops.map(([t]) => t), [-100, -102, 101, 102, 103], 'the groups (the test file\'s and the detached child\'s), then the processes');
  assert.deepEqual(kills.map(([t]) => t), [-100, -102, 101, 102, 103, 100]);
  assert.ok(calls.findIndex(([, s]) => s === 'SIGKILL') > calls.findLastIndex(([, s]) => s === 'SIGSTOP'), 'nothing is killed until everything is stopped');
});

test('killTree never touches this process, its group, a process below pid 2, or anything that is not under the pid it was given', () => {
  const me = process.pid;
  const rows = [...ROWS, { pid: me, ppid: 100, pgid: 100 }, { pid: 400, ppid: me, pgid: 100 }, { pid: 1, ppid: 100, pgid: 100 }];
  // this process sits UNDER 100 and shares its group: the group of 100 is signalled (it is the group asked for) but no victim pgid equal to ours adds anything, and this pid is not a victim
  const { result, calls } = recorded(() => killTree(100, { rows }));
  assert.ok(!result.includes(me), 'not this process');
  assert.ok(!result.includes(1), 'not init');
  assert.ok(!calls.some(([t]) => t === me || t === 1 || t === -1 || t === 0), 'nothing signalled at this pid, 1 or 0');
  assert.ok(!calls.some(([t]) => t === 200 || t === 201 || t === -200), 'nothing outside the tree');
  for (const bad of [1, 0, -5, 2.5, NaN, '100', null, undefined]) assert.deepEqual(recorded(() => killTree(bad, { rows: ROWS })).calls, [], `killTree(${String(bad)}) signals nothing`);
});

test('killTree with the walk off (FORGE_TREE_KILL=off, the control of the tests that measure it) is what it always was: the group, then the pid - and no process table is read', () => {
  const { result, calls } = recorded(() => killTree(100, { enabled: false, rows: ROWS }));
  assert.deepEqual(result, []);
  assert.deepEqual(calls.map(([t, s]) => [t, s]), [[-100, 'SIGSTOP'], [-100, 'SIGKILL'], [100, 'SIGKILL']]);
  const saved = process.env.FORGE_TREE_KILL;
  try { process.env.FORGE_TREE_KILL = 'off'; assert.deepEqual(recorded(() => killTree(100, { rows: ROWS })).result, [], 'the environment switch is the default of `enabled`'); } finally { if (saved === undefined) delete process.env.FORGE_TREE_KILL; else process.env.FORGE_TREE_KILL = saved; }
});

test('killTree survives a process table it cannot read: it falls back to the group and the pid, and says nothing', () => {
  const { result, calls } = recorded(() => killTree(100, { rows: { find() { throw new Error('ps failed'); } } }));
  assert.deepEqual(result, []);
  assert.ok(calls.some(([t, s]) => t === -100 && s === 'SIGKILL') && calls.some(([t, s]) => t === 100 && s === 'SIGKILL'));
});
