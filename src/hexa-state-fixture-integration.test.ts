// v0.2.264 drain 2026-07-03-1500 — L41 fixture-driven integration
// tests for hexa-state visibility. Each fixture note maps to a
// distinct hexa-state pattern; test asserts computeFacetStates
// produces the expected suffix map + suffixTextForState renders
// the expected string.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { computeFacetStates, FacetState, suffixTextForState } from './facet-state-core.ts';
import { whichLayerIsCanonical } from './facet-hash-core.ts';
import {
  extractDescription,
  extractRecipeSection,
  extractPythonSection,
  getFrontmatterField,
} from './v2-note-core.ts';

const FIXTURE_DIR = path.resolve(process.cwd(), 'test/fixtures/vault');

async function readFixture(name: string): Promise<string> {
  const p = path.join(FIXTURE_DIR, name);
  return readFile(p, 'utf8');
}

function makeReaders(body: string) {
  const twoArg = (b: string, k: string): string | null => {
    const v = getFrontmatterField(b, k);
    return typeof v === 'string' ? v : null;
  };
  const oneArg = {
    getFrontmatterField: (k: string): string | null => {
      const v = getFrontmatterField(body, k);
      return typeof v === 'string' ? v : null;
    },
  };
  return { twoArg, oneArg };
}

test('L41 hexa fixture: all-aligned description-canonical → source / derived_from_description / derived_from_recipe', async () => {
  const body = await readFixture('hexa_all_aligned_description_canonical.md');
  const { twoArg, oneArg } = makeReaders(body);
  const canonical = await whichLayerIsCanonical(body, {
    extractDescription,
    extractRecipeSection,
    extractPythonSection,
    getFrontmatterField: twoArg,
  });
  const states = computeFacetStates(canonical, oneArg);
  assert.equal(states.description, FacetState.Source);
  assert.equal(states.recipe, FacetState.DerivedFromDescription);
  assert.equal(states.python, FacetState.DerivedFromRecipe);
  // Rendered suffix strings match §2.2 table.
  assert.equal(suffixTextForState(states.description), '— source');
  assert.equal(suffixTextForState(states.recipe), '— derived from Description');
  assert.equal(suffixTextForState(states.python), '— derived from Recipe');
});

test('L41 hexa fixture: python-canonical → upstream Description + Recipe both `— ignored`', async () => {
  const body = await readFixture('hexa_python_canonical_upstream_ignored.md');
  const { twoArg, oneArg } = makeReaders(body);
  const canonical = await whichLayerIsCanonical(body, {
    extractDescription,
    extractRecipeSection,
    extractPythonSection,
    getFrontmatterField: twoArg,
  });
  const states = computeFacetStates(canonical, oneArg);
  assert.equal(states.description, FacetState.Ignored);
  assert.equal(states.recipe, FacetState.Ignored);
  assert.equal(states.python, FacetState.Source);
  assert.equal(suffixTextForState(states.description), '— ignored');
  assert.equal(suffixTextForState(states.recipe), '— ignored');
  assert.equal(suffixTextForState(states.python), '— source');
});

test('L41 hexa fixture: recipe out-of-date → transitive Python out-of-date (Q3)', async () => {
  const body = await readFixture('hexa_recipe_out_of_date_transitive_python.md');
  const { twoArg, oneArg } = makeReaders(body);
  const canonical = await whichLayerIsCanonical(body, {
    extractDescription,
    extractRecipeSection,
    extractPythonSection,
    getFrontmatterField: twoArg,
  });
  const states = computeFacetStates(canonical, oneArg);
  assert.equal(states.description, FacetState.Source);
  assert.equal(states.recipe, FacetState.DerivedFromDescriptionOutOfDate);
  // TRANSITIVE per Q3: Python out-of-date even though its own
  // parent-hash matches current recipe_hash.
  assert.equal(states.python, FacetState.DerivedFromRecipeOutOfDate);
  assert.equal(
    suffixTextForState(states.recipe),
    '— derived from Description, out of date',
  );
  assert.equal(
    suffixTextForState(states.python),
    '— derived from Recipe, out of date',
  );
});
