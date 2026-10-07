// v0.2.77 — tests for the editor-toolbar Forge button visibility gate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgeButtonShouldShow, edgesToggleShouldShow } from './forge-button-gate-core.ts';

test('forgeButtonShouldShow: action snippet → true', () => {
  assert.equal(forgeButtonShouldShow({ type: 'action' }), true);
});

// Beat-as-data Phase 5c (drain 2026-10-07-0100) — REASON FOR THE CHANGE: this test used to assert `data → true`. The hammer on a
// `type: data` note is a leftover: in-process, the engine's resolve_action_code returns None for EVERY data note (rhythm json, plain json,
// a json list with no content_type, a jpeg wrapper), which the plugin reads as "free-text English, ask /generate" — so the click either
// shows a misleading "needs free-text Python generation / no token" notice or, with a token, sends the data note to the LLM. Data notes
// hold a value; nothing in them can be forged. The value is shown by the panel's data preview on file-open, and the panel stays
// reachable through the "Open Forge panel" command.
test('forgeButtonShouldShow: data snippet → FALSE (the hammer does nothing useful on a data note; see the reason above)', () => {
  assert.equal(forgeButtonShouldShow({ type: 'data' }), false);
});

test('forgeButtonShouldShow: a rhythm data note (type: data, content_type: json) → false', () => {
  assert.equal(forgeButtonShouldShow({ type: 'data', content_type: 'json' } as never), false);
});

// The edges-panel toggle used to share that predicate. It does NOT go away with the hammer: the edges panel lists Outgoing AND Incoming
// call edges for a note, and a data note is exactly the kind of thing other notes call (show_colors -> colors).
test('edgesToggleShouldShow: action and data notes → true (the old shared predicate, kept for the edges toggle)', () => {
  assert.equal(edgesToggleShouldShow({ type: 'action' }), true);
  assert.equal(edgesToggleShouldShow({ type: 'data' }), true);
});

test('edgesToggleShouldShow: no frontmatter, no type, snapshot, unknown or non-string type → false', () => {
  for (const fm of [undefined, null, {}, { type: 'snapshot' }, { type: 'experiment' }, { type: 42 }, { type: ['action'] }]) {
    assert.equal(edgesToggleShouldShow(fm as never), false, JSON.stringify(fm));
  }
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
