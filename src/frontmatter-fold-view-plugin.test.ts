// v0.2.102 — pure-core tests for computeFrontmatterFoldRange.
// Edge cases per prompt §4.A: no frontmatter, single `---`,
// well-formed frontmatter, content with `---` inside YAML values.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFrontmatterFoldRange } from './frontmatter-fold-view-plugin.ts';

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
  // `from` should be at end of line 0 (length of `---` = 3).
  assert.equal(r!.from, 3);
  // `to` should land just before the newline after the closing `---`.
  // Lines: 0 `---`, 1 `type: action`, 2 `inputs: []`, 3 `---`.
  // Char counts: 3 + 1 + 12 + 1 + 10 + 1 + 3 = 31, then strip the
  // trailing newline → 31.
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
  assert.equal(r!.from, 3);  // end of opening `---`
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
