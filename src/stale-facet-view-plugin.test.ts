// v0.2.205 — Phase 2.5 §2.1: pure-core tests for the stale-facet
// extension's range helpers + decoration builder. The CM6 integration
// coverage (asserting the class actually paints in a real EditorView)
// lives in stale-facet-view-plugin.integration.test.ts.

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  findH1HeadingOffset,
  findNextH1OffsetAfter,
  h1SectionRange,
  buildStaleFacetDecorations,
} from './stale-facet-view-plugin.ts';

const V2_BODY = `---
type: action
---

# Description

Some description prose.

# Recipe

Let x = 1.
Return x.

# Python

def compute(context):
  return 1
`;

describe('findH1HeadingOffset', () => {
  test('finds # Description', () => {
    const off = findH1HeadingOffset(V2_BODY, 'Description');
    assert.ok(off > 0);
    assert.equal(V2_BODY.slice(off, off + 13), '# Description');
  });

  test('finds # Recipe', () => {
    const off = findH1HeadingOffset(V2_BODY, 'Recipe');
    assert.equal(V2_BODY.slice(off, off + 8), '# Recipe');
  });

  test('returns -1 when absent', () => {
    assert.equal(findH1HeadingOffset(V2_BODY, 'Slots'), -1);
  });
});

describe('h1SectionRange', () => {
  test('Description range excludes the heading line', () => {
    const r = h1SectionRange(V2_BODY, 'Description');
    assert.ok(r);
    const slice = V2_BODY.slice(r!.from, r!.to);
    assert.ok(slice.startsWith('\nSome description'));
    assert.ok(!slice.includes('# Recipe'));
  });

  test('Recipe range bounded by # Python', () => {
    const r = h1SectionRange(V2_BODY, 'Recipe');
    assert.ok(r);
    const slice = V2_BODY.slice(r!.from, r!.to);
    assert.ok(slice.includes('Let x = 1.'));
    assert.ok(!slice.includes('# Python'));
  });

  test('Python range runs to EOF when no further H1', () => {
    const r = h1SectionRange(V2_BODY, 'Python');
    assert.ok(r);
    assert.equal(r!.to, V2_BODY.length);
  });

  test('returns null when section absent', () => {
    assert.equal(h1SectionRange(V2_BODY, 'Slots' as any), null);
  });
});

describe('buildStaleFacetDecorations', () => {
  test('empty stale set → no decorations', () => {
    const decos = buildStaleFacetDecorations(V2_BODY, new Set());
    assert.equal(decos.size, 0);
  });

  test('description-only stale → 1 decoration', () => {
    const decos = buildStaleFacetDecorations(
      V2_BODY, new Set(['description']),
    );
    assert.equal(decos.size, 1);
  });

  test('all three stale → 3 decorations', () => {
    const decos = buildStaleFacetDecorations(
      V2_BODY, new Set(['description', 'recipe', 'python']),
    );
    assert.equal(decos.size, 3);
  });

  test('stale facet missing from body → no range added (defensive)', () => {
    // V1 body has no # Python heading; asking for python-stale on it
    // should produce 0 decorations rather than crash.
    const v1Body = '# Description\n\nfoo\n\n# Recipe\n\nReturn.\n';
    const decos = buildStaleFacetDecorations(v1Body, new Set(['python']));
    assert.equal(decos.size, 0);
  });
});
