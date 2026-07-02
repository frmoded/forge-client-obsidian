// v0.2.243 — pure-core tests for the facet-state extension's range
// helpers + decoration builder. CM6 integration coverage lives in
// stale-facet-view-plugin.integration.test.ts.
//
// Renamed decoration builder from buildStaleFacetDecorations
// (v0.2.239 v11.3 binary) to buildFacetStateDecorations
// (v0.2.243 v11.4 tri-state).

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  findH1HeadingOffset,
  findNextH1OffsetAfter,
  h1SectionRange,
  findH1HeadingEndOffset,
  buildFacetStateDecorations,
} from './stale-facet-view-plugin.ts';
import { FacetState, type FacetName } from './facet-state-core.ts';

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

const ALL_SOURCE: Record<FacetName, FacetState> = {
  description: FacetState.Source,
  recipe: FacetState.Source,
  python: FacetState.Source,
};

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

describe('findNextH1OffsetAfter', () => {
  test('finds # Recipe after # Description', () => {
    const descOff = findH1HeadingOffset(V2_BODY, 'Description');
    const nextOff = findNextH1OffsetAfter(V2_BODY, descOff);
    assert.equal(V2_BODY.slice(nextOff, nextOff + 8), '# Recipe');
  });
});

describe('h1SectionRange', () => {
  test('Description range excludes heading line + covers body', () => {
    const r = h1SectionRange(V2_BODY, 'Description');
    assert.ok(r);
    assert.ok(V2_BODY.slice(r!.from, r!.to).includes('Some description prose'));
    assert.ok(!V2_BODY.slice(r!.from, r!.to).includes('# Description'));
  });

  test('returns null when heading absent', () => {
    assert.equal(h1SectionRange(V2_BODY, 'Slots' as any), null);
  });
});

describe('findH1HeadingEndOffset', () => {
  test('end offset lies at newline after heading text', () => {
    const end = findH1HeadingEndOffset(V2_BODY, 'Description');
    assert.equal(V2_BODY[end], '\n');
    assert.equal(V2_BODY.slice(end - 13, end), '# Description');
  });

  test('returns -1 when heading absent', () => {
    assert.equal(findH1HeadingEndOffset(V2_BODY, 'Slots'), -1);
  });
});

describe('buildFacetStateDecorations', () => {
  test('all-source → 3 suffix widgets only (no body marks)', () => {
    // Source facets get the "— source" suffix widget but no body
    // decoration; they render at full color.
    const decos = buildFacetStateDecorations(V2_BODY, ALL_SOURCE);
    assert.equal(decos.size, 3);
  });

  test('all-stale → 6 decorations (3 widgets + 3 body marks)', () => {
    const allStale: Record<FacetName, FacetState> = {
      description: FacetState.Stale,
      recipe: FacetState.Stale,
      python: FacetState.Stale,
    };
    const decos = buildFacetStateDecorations(V2_BODY, allStale);
    assert.equal(decos.size, 6);
  });

  test('mixed states (Recipe source, Description + Python stale) → 5 decorations', () => {
    // Recipe: 1 widget (source, no body mark).
    // Description: 1 widget + 1 body mark.
    // Python: 1 widget + 1 body mark.
    const states: Record<FacetName, FacetState> = {
      description: FacetState.Stale,
      recipe: FacetState.Source,
      python: FacetState.Stale,
    };
    const decos = buildFacetStateDecorations(V2_BODY, states);
    assert.equal(decos.size, 5);
  });

  test('derived state → widget + derived body mark (distinct from stale)', () => {
    const states: Record<FacetName, FacetState> = {
      description: FacetState.Source,
      recipe: FacetState.Source,
      python: FacetState.Derived,
    };
    const decos = buildFacetStateDecorations(V2_BODY, states);
    // 3 source widgets + 1 derived widget already at Description + Recipe
    // headings, but here it's 2 sources + 1 derived = 3 widgets total,
    // plus 1 body mark for Python.
    assert.equal(decos.size, 4);
  });

  test('body missing a heading → still produces widgets for present facets', () => {
    // V1-like body: no # Recipe. buildFacetStateDecorations mounts
    // widgets only for headings that exist; unpresent headings return
    // -1 from findH1HeadingEndOffset and are skipped.
    const v1Body = '# Description\n\nfoo\n\n# Python\n\ndef compute(c): pass\n';
    const states: Record<FacetName, FacetState> = {
      description: FacetState.Source,
      recipe: FacetState.Stale,  // Recipe heading absent → skipped
      python: FacetState.Source,
    };
    const decos = buildFacetStateDecorations(v1Body, states);
    assert.equal(decos.size, 2);
  });

  test('sorted order preserved (RangeSetBuilder invariant)', () => {
    // Regression guard: two stale + one source facets. All positions
    // must be strictly non-decreasing.
    const states: Record<FacetName, FacetState> = {
      description: FacetState.Stale,
      recipe: FacetState.Source,
      python: FacetState.Stale,
    };
    const decos = buildFacetStateDecorations(V2_BODY, states);
    let lastFrom = -1;
    decos.between(0, V2_BODY.length, (from) => {
      assert.ok(from >= lastFrom, `positions must be sorted; ${from} < ${lastFrom}`);
      lastFrom = from;
      return;
    });
  });

  test('suffix widget mounts at end-of-heading offset (not on newline)', () => {
    const decos = buildFacetStateDecorations(V2_BODY, ALL_SOURCE);
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
