// Retire-the-library-note-palette drain (2026-10-07-0200), migration check: an existing install whose saved workspace layout still
// holds a `forge-chips` pane must load cleanly — no error, no empty ghost pane ("view type not registered"). The view type is no longer
// registered, so the leaves are detached once at layout-ready.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEGACY_VIEW_TYPES, detachLegacyViewLeaves, type LegacyWorkspace } from './legacy-view-cleanup-core.ts';

function fakeWorkspace(leaves: Record<string, number>) {
  const detached: string[] = [];
  const ws: LegacyWorkspace = {
    getLeavesOfType: (t) => new Array(leaves[t] ?? 0).fill({}),
    detachLeavesOfType: (t) => { detached.push(t); leaves[t] = 0; },
  };
  return { ws, detached, leaves };
}

test('the retired palette view type is on the legacy list', () => {
  assert.deepEqual([...LEGACY_VIEW_TYPES], ['forge-chips']);
});

test('saved forge-chips panes are detached and counted; other views are untouched', () => {
  const { ws, detached, leaves } = fakeWorkspace({ 'forge-chips': 2, markdown: 3, 'forge-output': 1 });
  assert.equal(detachLegacyViewLeaves(ws), 2);
  assert.deepEqual(detached, ['forge-chips']);
  assert.equal(leaves.markdown, 3);
  assert.equal(leaves['forge-output'], 1);
});

test('no legacy panes → nothing detached, 0 returned (a clean install pays nothing)', () => {
  const { ws, detached } = fakeWorkspace({ markdown: 1 });
  assert.equal(detachLegacyViewLeaves(ws), 0);
  assert.deepEqual(detached, []);
});

test('idempotent: a second pass finds nothing', () => {
  const { ws } = fakeWorkspace({ 'forge-chips': 1 });
  assert.equal(detachLegacyViewLeaves(ws), 1);
  assert.equal(detachLegacyViewLeaves(ws), 0);
});

test('a workspace that throws on one type does not stop the sweep or the plugin load', () => {
  const ws: LegacyWorkspace = { getLeavesOfType: () => { throw new Error('layout not ready'); }, detachLeavesOfType: () => {} };
  assert.equal(detachLegacyViewLeaves(ws), 0);
});
