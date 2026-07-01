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
  findH1HeadingEndOffset,
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

describe('findH1HeadingEndOffset', () => {
  test('returns offset just before newline of heading line', () => {
    const end = findH1HeadingEndOffset(V2_BODY, 'Description');
    assert.equal(V2_BODY[end], '\n');
    assert.equal(V2_BODY.slice(end - 13, end), '# Description');
  });

  test('returns -1 when heading absent', () => {
    assert.equal(findH1HeadingEndOffset(V2_BODY, 'Slots'), -1);
  });
});

describe('buildStaleFacetDecorations', () => {
  test('empty stale set → no decorations', () => {
    const decos = buildStaleFacetDecorations(V2_BODY, new Set());
    assert.equal(decos.size, 0);
  });

  test('description-only stale → 2 decorations (widget + mark)', () => {
    // v0.2.239: each stale facet emits a widget (after heading) +
    // a mark (on body).
    const decos = buildStaleFacetDecorations(
      V2_BODY, new Set(['description']),
    );
    assert.equal(decos.size, 2);
  });

  test('all three stale → 6 decorations (3 widgets + 3 marks)', () => {
    const decos = buildStaleFacetDecorations(
      V2_BODY, new Set(['description', 'recipe', 'python']),
    );
    assert.equal(decos.size, 6);
  });

  test('stale facet missing from body → no range added (defensive)', () => {
    // V1 body has no # Python heading; asking for python-stale on it
    // should produce 0 decorations rather than crash.
    const v1Body = '# Description\n\nfoo\n\n# Recipe\n\nReturn.\n';
    const decos = buildStaleFacetDecorations(v1Body, new Set(['python']));
    assert.equal(decos.size, 0);
  });

  test('two stale → 4 decorations in sorted order', () => {
    // Regression guard: RangeSetBuilder demands sorted input.
    // Recipe + Python stale → widget-Recipe, mark-Recipe, widget-Python,
    // mark-Python. Positions must be strictly non-decreasing.
    const decos = buildStaleFacetDecorations(
      V2_BODY, new Set(['recipe', 'python']),
    );
    assert.equal(decos.size, 4);
    // Iterate to confirm we can enumerate without throwing.
    let count = 0;
    let lastFrom = -1;
    decos.between(0, V2_BODY.length, (from) => {
      assert.ok(from >= lastFrom, `decoration positions must be sorted; ${from} < ${lastFrom}`);
      lastFrom = from;
      count++;
      return;
    });
    assert.equal(count, 4);
  });

  test('widget mounts at end-of-heading offset (not on newline)', () => {
    // The widget should sit at the position of `\n` (i.e. AFTER
    // "Description") so CM6 renders it inline with the heading.
    const stale = new Set<'description' | 'recipe' | 'python'>(['description']);
    const decos = buildStaleFacetDecorations(V2_BODY, stale);
    const descEnd = findH1HeadingEndOffset(V2_BODY, 'Description');
    let sawWidgetHere = false;
    decos.between(descEnd, descEnd + 1, (from, to) => {
      if (from === descEnd && to === descEnd) {
        sawWidgetHere = true;
      }
      return;
    });
    assert.ok(sawWidgetHere, 'widget decoration should mount at end-of-heading offset');
  });
});
