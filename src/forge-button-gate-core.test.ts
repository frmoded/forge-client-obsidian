// v0.2.77 — tests for the editor-toolbar Forge button visibility gate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgeButtonShouldShow } from './forge-button-gate-core.ts';

test('forgeButtonShouldShow: action snippet → true', () => {
  assert.equal(forgeButtonShouldShow({ type: 'action' }), true);
});

test('forgeButtonShouldShow: data snippet → true', () => {
  assert.equal(forgeButtonShouldShow({ type: 'data' }), true);
});

test('forgeButtonShouldShow: undefined frontmatter → false', () => {
  assert.equal(forgeButtonShouldShow(undefined), false);
});

test('forgeButtonShouldShow: null frontmatter → false', () => {
  assert.equal(forgeButtonShouldShow(null), false);
});

test('forgeButtonShouldShow: frontmatter without `type` → false', () => {
  assert.equal(forgeButtonShouldShow({}), false);
});

test('forgeButtonShouldShow: snapshot type → false', () => {
  // Snapshots are auto-generated; users shouldn't Forge-click them.
  assert.equal(forgeButtonShouldShow({ type: 'snapshot' }), false);
});

test('forgeButtonShouldShow: unknown type string → false', () => {
  // Future-proof: a new type the gate doesn't know about defaults
  // to hidden, not shown. Prevents accidentally exposing the button
  // on a not-yet-supported snippet shape.
  assert.equal(forgeButtonShouldShow({ type: 'experiment' }), false);
});

test('forgeButtonShouldShow: non-string type → false', () => {
  // Defensive against malformed frontmatter (e.g. number, array).
  assert.equal(forgeButtonShouldShow({ type: 42 }), false);
  assert.equal(forgeButtonShouldShow({ type: ['action'] }), false);
});
