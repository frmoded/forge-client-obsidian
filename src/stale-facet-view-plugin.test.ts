// v0.2.264 — pure-core tests for the facet-state extension's range
// helpers + decoration builder. CM6 integration coverage lives in
// stale-facet-view-plugin.integration.test.ts.
//
// v0.2.264 (drain 1500) — hexa-state visibility. Body marks:
//   source → no body decoration
//   derived_from_* → forge-facet-derived (60%)
//   derived_from_*_out_of_date → forge-facet-out-of-date (50%)
//   ignored → forge-facet-ignored (40%)

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
    const decos = buildFacetStateDecorations(V2_BODY, ALL_SOURCE);
    assert.equal(decos.size, 3);
  });

  test('all-ignored → 6 decorations (3 widgets + 3 body marks)', () => {
    const allIgnored: Record<FacetName, FacetState> = {
      description: FacetState.Ignored,
      recipe: FacetState.Ignored,
      python: FacetState.Ignored,
    };
    const decos = buildFacetStateDecorations(V2_BODY, allIgnored);
    assert.equal(decos.size, 6);
  });

  test('mixed states (Recipe source, Description + Python ignored) → 5 decorations', () => {
    const states: Record<FacetName, FacetState> = {
      description: FacetState.Ignored,
      recipe: FacetState.Source,
      python: FacetState.Ignored,
    };
    const decos = buildFacetStateDecorations(V2_BODY, states);
    assert.equal(decos.size, 5);
  });

  test('derived state → widget + derived body mark', () => {
    const states: Record<FacetName, FacetState> = {
      description: FacetState.Source,
      recipe: FacetState.DerivedFromDescription,
      python: FacetState.DerivedFromRecipe,
    };
    const decos = buildFacetStateDecorations(V2_BODY, states);
    // Description: 1 widget (source, no body mark).
    // Recipe: 1 widget + 1 body mark.
    // Python: 1 widget + 1 body mark.
    assert.equal(decos.size, 5);
  });

  test('out-of-date state → widget + out-of-date body mark', () => {
    const states: Record<FacetName, FacetState> = {
      description: FacetState.Source,
      recipe: FacetState.DerivedFromDescriptionOutOfDate,
      python: FacetState.DerivedFromRecipeOutOfDate,
    };
    const decos = buildFacetStateDecorations(V2_BODY, states);
    // 3 widgets + 2 body marks (Recipe + Python out-of-date).
    assert.equal(decos.size, 5);
  });

  test('canonical=python → Description + Recipe ignored, Python source', () => {
    // Verifies upstream-of-canonical facets get body decoration.
    const states: Record<FacetName, FacetState> = {
      description: FacetState.Ignored,
      recipe: FacetState.Ignored,
      python: FacetState.Source,
    };
    const decos = buildFacetStateDecorations(V2_BODY, states);
    // 3 widgets + 2 body marks (Description + Recipe ignored).
    assert.equal(decos.size, 5);
  });

  test('body missing a heading → still produces widgets for present facets', () => {
    const v1Body = '# Description\n\nfoo\n\n# Python\n\ndef compute(c): pass\n';
    const states: Record<FacetName, FacetState> = {
      description: FacetState.Source,
      recipe: FacetState.Ignored,  // Recipe heading absent → skipped
      python: FacetState.Source,
    };
    const decos = buildFacetStateDecorations(v1Body, states);
    assert.equal(decos.size, 2);
  });

  test('sorted order preserved (RangeSetBuilder invariant, L33)', () => {
    const states: Record<FacetName, FacetState> = {
      description: FacetState.Ignored,
      recipe: FacetState.Source,
      python: FacetState.DerivedFromRecipeOutOfDate,
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
