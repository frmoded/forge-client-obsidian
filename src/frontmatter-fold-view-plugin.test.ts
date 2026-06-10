// v0.2.102 — pure-core tests for computeFrontmatterFoldRange.
// Edge cases per prompt §4.A: no frontmatter, single `---`,
// well-formed frontmatter, content with `---` inside YAML values.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFrontmatterFoldRange,
  readFrontmatterType,
} from './frontmatter-fold-view-plugin.ts';

// v0.2.111 — readFrontmatterType tests. Used in place of Obsidian's
// metadataCache so the StateField gate fires on first build without
// waiting for workspace.getActiveViewOfType to settle.
test('readFrontmatterType: action', () => {
  const doc = `---
type: action
inputs: []
---
# English
`;
  assert.equal(readFrontmatterType(doc), 'action');
});

test('readFrontmatterType: data', () => {
  assert.equal(readFrontmatterType(`---\ntype: data\n---\n`), 'data');
});

test('readFrontmatterType: quoted value', () => {
  assert.equal(readFrontmatterType(`---\ntype: "action"\n---\n`), 'action');
  assert.equal(readFrontmatterType(`---\ntype: 'data'\n---\n`), 'data');
});

test('readFrontmatterType: missing frontmatter', () => {
  assert.equal(readFrontmatterType('# English\n\nplain note'), null);
});

test('readFrontmatterType: no type field', () => {
  assert.equal(readFrontmatterType(`---\nfoo: bar\n---\n`), null);
});

test('readFrontmatterType: type after other keys', () => {
  const doc = `---
inputs: []
type: action
---
`;
  assert.equal(readFrontmatterType(doc), 'action');
});

test('readFrontmatterType: unclosed frontmatter', () => {
  assert.equal(readFrontmatterType(`---\ntype: action\n# no closer\n`), 'action');
  // (Tolerant: returns the value even without a closing delimiter,
  // since the gate's purpose is "does this file claim to be a
  // snippet" — a missing closer is malformed but the intent is
  // clear.)
});


test('computeFrontmatterFoldRange: well-formed frontmatter', () => {
  const doc = `---
type: action
inputs: []
---

# English

Print "hello".
`;
  const r = computeFrontmatterFoldRange(doc);
  assert.ok(r, 'must return a range');
  // v0.2.116 — back to `from = lines[0].length = 3` (end of opening
  // `---` line). The v0.2.115 block:true Decoration.replace path
  // was abandoned for a CSS-only approach in v0.2.116; this helper
  // is now purely informational.
  assert.equal(r!.from, 3);
  // `to` should land just before the newline after the closing `---`.
  // Lines: 0 `---`, 1 `type: action`, 2 `inputs: []`, 3 `---`.
  // Char counts: 3 + 1 + 12 + 1 + 10 + 1 + 3 = 31.
  const closeLineEnd = doc.indexOf('---', 4) + 3;
  assert.equal(r!.to, closeLineEnd);
});

test('computeFrontmatterFoldRange: no opening delimiter', () => {
  const doc = '# English\n\nPlain note with no frontmatter.\n';
  assert.equal(computeFrontmatterFoldRange(doc), null);
});

test('computeFrontmatterFoldRange: single `---` (malformed, no closer)', () => {
  const doc = `---
type: action

# English
`;
  assert.equal(computeFrontmatterFoldRange(doc), null,
    'must return null when closing `---` is absent');
});

test('computeFrontmatterFoldRange: empty document', () => {
  assert.equal(computeFrontmatterFoldRange(''), null);
});

test('computeFrontmatterFoldRange: empty frontmatter (open immediately closed)', () => {
  const doc = `---
---
# English
`;
  const r = computeFrontmatterFoldRange(doc);
  assert.ok(r, 'must return a range even for empty frontmatter');
  // v0.2.116 — back to end of opening `---` line.
  assert.equal(r!.from, 3);
});

test('computeFrontmatterFoldRange: range covers opening `---` end through closing `---` end', () => {
  // Verify the range produces a fold that leaves the opening `---`
  // visible with a fold-triangle but hides everything from after
  // line 0 through the closing `---` inclusive.
  const doc = `---
foo: bar
---

body
`;
  const r = computeFrontmatterFoldRange(doc);
  assert.ok(r);
  const folded = doc.slice(r!.from, r!.to);
  assert.ok(folded.includes('foo: bar'), 'folded slice must include YAML body');
  assert.ok(folded.endsWith('---'), 'folded slice must end with the closing delimiter');
});
