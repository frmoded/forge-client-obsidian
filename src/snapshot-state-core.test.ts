// Pure-core tests for parseSnapshotState.
//
// v0.2.44 — extracted so the right-click menu's state-aware Freeze /
// Unfreeze toggle (gray out the inapplicable action) can be tested
// without Pyodide. The production wiring in main.ts reads the
// snapshot body via Pyodide's FS.readFile (sync, MEMFS), then hands
// the body to this parser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSnapshotState } from './snapshot-state-core.ts';

test('parseSnapshotState: live state', () => {
  const body = `---
type: snapshot
caller: authoring/hello_random
callee: authoring/random_name
state: live
captured_at: '2026-06-03T00:00:00Z'
content_type: text
---

\`\`\`text
qzfmx
\`\`\`
`;
  assert.equal(parseSnapshotState(body), 'live');
});

test('parseSnapshotState: frozen state', () => {
  const body = `---
state: frozen
caller: x
callee: y
---
body
`;
  assert.equal(parseSnapshotState(body), 'frozen');
});

test('parseSnapshotState: null body returns no-snapshot', () => {
  assert.equal(parseSnapshotState(null), 'no-snapshot');
});

test('parseSnapshotState: empty string returns no-snapshot', () => {
  assert.equal(parseSnapshotState(''), 'no-snapshot');
});

test('parseSnapshotState: malformed body (no frontmatter) returns no-snapshot', () => {
  assert.equal(parseSnapshotState('just plain text, no YAML'), 'no-snapshot');
});

test('parseSnapshotState: frontmatter without a state field returns no-snapshot', () => {
  const body = `---
type: snapshot
caller: x
callee: y
---
body
`;
  assert.equal(parseSnapshotState(body), 'no-snapshot');
});

test('parseSnapshotState: tolerates whitespace and quoting around the state value', () => {
  assert.equal(parseSnapshotState(`---\nstate:   live  \n---\n`), 'live');
  assert.equal(parseSnapshotState(`---\nstate: 'frozen'\n---\n`), 'frozen');
  assert.equal(parseSnapshotState(`---\nstate: "live"\n---\n`), 'live');
});

test('parseSnapshotState: only matches state in the frontmatter block (not body)', () => {
  // Defensive: a body that happens to mention `state: frozen` in
  // prose shouldn't trick the parser into reading the wrong field.
  const body = `---
type: snapshot
---

This is body text that mentions \`state: frozen\` in a code snippet.
`;
  assert.equal(parseSnapshotState(body), 'no-snapshot');
});

test('parseSnapshotState: unknown state value returns no-snapshot (defensive)', () => {
  // If a future state value appears (e.g., 'archived'), don't pretend
  // it's live or frozen — return no-snapshot so the menu shows the
  // capture-prompt fallback rather than a misleading enabled action.
  const body = `---
state: archived
---
body
`;
  assert.equal(parseSnapshotState(body), 'no-snapshot');
});
