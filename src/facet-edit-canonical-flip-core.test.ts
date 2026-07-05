// v0.2.260 drain 1400 §3.2 — I5 executable tests.
//
// I5: "Editing any facet body immediately makes THAT facet the source;
// others become stale."

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { computeCanonicalFacetAfterEdit } from './facet-edit-canonical-flip-core.ts';

describe('computeCanonicalFacetAfterEdit (I5)', () => {
  it('Description body edited on aligned note → canonical becomes description', () => {
    const result = computeCanonicalFacetAfterEdit({
      descMismatch: true,
      recipeMismatch: false,
      pythonMismatch: false,
      storedCanonical: 'synced',
    });
    assert.equal(result, 'description');
  });

  it('Recipe edited on note where Description had prior drift → canonical becomes recipe (I5 driver case)', () => {
    // Driver's slow_burn scenario: Description drifted in earlier
    // session; canonical_facet was written as 'description'. User now
    // edits Recipe. Semantic: Recipe wins because it's the FRESH edit.
    const result = computeCanonicalFacetAfterEdit({
      descMismatch: true,       // residual drift
      recipeMismatch: true,     // fresh edit
      pythonMismatch: false,
      storedCanonical: 'description',
    });
    assert.equal(result, 'recipe');
  });

  it('Python edited where both Description and Recipe had prior drift → canonical becomes python (downstream-wins tiebreak)', () => {
    // storedCanonical = 'recipe' (residual). Body drift on desc + python.
    // Fresh set = {description, python}. Downstream-wins → python.
    // Matches prompt §3.2 case 3.
    const result = computeCanonicalFacetAfterEdit({
      descMismatch: true,
      recipeMismatch: true,
      pythonMismatch: true,
      storedCanonical: 'recipe',
    });
    assert.equal(result, 'python');
  });

  it('Sequential edits: Recipe first, then Description → canonical ends at description', () => {
    // Step 1: user edits Recipe on aligned note.
    const step1 = computeCanonicalFacetAfterEdit({
      descMismatch: false,
      recipeMismatch: true,
      pythonMismatch: false,
      storedCanonical: 'synced',
    });
    assert.equal(step1, 'recipe');

    // Step 2: canonical is now 'recipe'. User edits Description.
    const step2 = computeCanonicalFacetAfterEdit({
      descMismatch: true,     // fresh edit
      recipeMismatch: true,   // residual from step 1
      pythonMismatch: false,
      storedCanonical: 'recipe',  // just written
    });
    assert.equal(step2, 'description');
  });

  it('Same-facet rapid typing: canonical stays put (no churn)', () => {
    // storedCanonical is already 'description'; user is still editing
    // Description; only Description drifted. Handler should return
    // 'description' (idempotent).
    const result = computeCanonicalFacetAfterEdit({
      descMismatch: true,
      recipeMismatch: false,
      pythonMismatch: false,
      storedCanonical: 'description',
    });
    assert.equal(result, 'description');
  });

  it('No drift → returns synced', () => {
    const result = computeCanonicalFacetAfterEdit({
      descMismatch: false,
      recipeMismatch: false,
      pythonMismatch: false,
      storedCanonical: 'description',
    });
    assert.equal(result, 'synced');
  });

  it('Fresh drift only on a facet that WAS the stored canonical → keep stored', () => {
    const result = computeCanonicalFacetAfterEdit({
      descMismatch: false,
      recipeMismatch: true,
      pythonMismatch: false,
      storedCanonical: 'recipe',
    });
    assert.equal(result, 'recipe');
  });

  it('Absent stored canonical + fresh drift on Description → description', () => {
    const result = computeCanonicalFacetAfterEdit({
      descMismatch: true,
      recipeMismatch: false,
      pythonMismatch: false,
      storedCanonical: null,
    });
    assert.equal(result, 'description');
  });
});
