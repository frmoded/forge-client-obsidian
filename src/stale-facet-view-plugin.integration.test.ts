// v0.2.264 — CM6 integration tests for the hexa-state visibility
// ViewPlugin. Per CM6 HARD RULE: mount in a real CM6 EditorView and
// verify decoration classes + suffix text appear in the rendered
// cm-content after the async state-detection settles.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIntegrationHarness } from './test-helpers/cm6-harness.ts';
import { staleFacetViewPlugin } from './stale-facet-view-plugin.ts';

// A V2 note WITH stored hashes that don't match the body (recipe was
// hand-edited). Under v11.6, whichLayerIsSource will infer Recipe
// canonical from hash mismatches → Description + Python render `— ignored`.
const RECIPE_CANONICAL_MISMATCH_NOTE = `---
type: action
description_hash: 0000000000000000000000000000000000000000000000000000000000000000
recipe_hash: 1111111111111111111111111111111111111111111111111111111111111111
python_hash: 2222222222222222222222222222222222222222222222222222222222222222
source_facet: recipe
---

# Description

A note where every facet is stale because the hashes are nonsense.

# Recipe

Let x = 1.
Return x.

# Python

def compute(context):
  return 1
`;

const SYNCED_NOTE_NO_HASHES = `---
type: action
---

# Description

Plain V2 note with no stored hashes.

# Recipe

Return.
`;

async function waitForDecorations(harness: any, timeoutMs = 200): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await harness.flush();
    await new Promise(r => setTimeout(r, 10));
  }
}

test('CM6 integration: hexa-state plugin mounts without throwing', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(RECIPE_CANONICAL_MISMATCH_NOTE, [staleFacetViewPlugin]);
    await harness.flush();
    assert.ok(view, 'view must be created');
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: canonical=recipe → Description + Python render as `— ignored`', async () => {
  // v0.2.264 — v11.6 hexa-state. source_facet=recipe → Description
  // is upstream of canonical → `— ignored`. Python's parent-hash
  // absent → `— derived from Recipe, out of date`.
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(RECIPE_CANONICAL_MISMATCH_NOTE, [staleFacetViewPlugin]);
    await waitForDecorations(harness);
    const html = view.contentDOM.innerHTML;
    assert.ok(
      html.includes('forge-facet-ignored'),
      `expected forge-facet-ignored body class; got: ${html.slice(0, 600)}`,
    );
    assert.ok(
      html.includes('— ignored'),
      `expected literal "— ignored" text in DOM (Description); got: ${html.slice(0, 600)}`,
    );
    assert.ok(
      html.includes('— source'),
      `expected literal "— source" text (Recipe is canonical); got: ${html.slice(0, 600)}`,
    );
    assert.ok(
      html.includes('— derived from Recipe, out of date'),
      `expected Python "— derived from Recipe, out of date"; got: ${html.slice(0, 600)}`,
    );
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: synced/description-canonical → downstream `— derived from X, out of date`', async () => {
  // v0.2.264 — synced state delegates to Description canonical
  // (v11.4.1 preserved). SYNCED_NOTE_NO_HASHES has no parent-hash
  // fields → Recipe renders `— derived from Description, out of date`
  // and Python renders `— derived from Recipe, out of date`.
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(SYNCED_NOTE_NO_HASHES, [staleFacetViewPlugin]);
    await waitForDecorations(harness);
    const html = view.contentDOM.innerHTML;
    assert.ok(
      html.includes('— source'),
      `expected "— source" on Description; got: ${html.slice(0, 600)}`,
    );
    assert.ok(
      html.includes('— derived from Description, out of date'),
      `expected Recipe "— derived from Description, out of date"; got: ${html.slice(0, 600)}`,
    );
    assert.ok(
      html.includes('forge-facet-out-of-date'),
      `expected forge-facet-out-of-date body class; got: ${html.slice(0, 600)}`,
    );
  } finally {
    harness.destroy();
  }
});

// Drain 2026-10-15-2100 §1 — the panel must say what the note's own `source_facet` says when the hash probe answers `synced`.
// CCQA: on the shipped `hello_world` (`source_facet: recipe`, all hashes consistent) the headings read "Description — source" and
// "Recipe — derived from Description". The probe's `synced` was being read as Description. Real shipped bytes, not a hand-built twin.
import fs from 'node:fs';
import path from 'node:path';

const HELLO_WORLD = fs.readFileSync(
  path.resolve(import.meta.dirname, '..', 'assets', 'vaults', 'forge-tutorial', '01-hello', 'hello_world.md'), 'utf8');

test('CM6 integration (real hello_world): source_facet: recipe + consistent hashes → Recipe "— source", Description "— ignored", Python "— derived from Recipe"', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(HELLO_WORLD, [staleFacetViewPlugin]);
    await waitForDecorations(harness);
    const html = view.contentDOM.innerHTML;
    assert.ok(!html.includes('derived from Description'), `no facet is derived from the Description on a recipe-source note; got: ${html.slice(0, 900)}`);
    const suffixes = [...html.matchAll(/— (source|ignored|derived from [A-Za-z]+(?:, out of date)?)/g)].map((m) => m[0]);
    assert.deepEqual(suffixes, ['— ignored', '— source', '— derived from Recipe'], 'Description, Recipe, Python — in document order');
  } finally {
    harness.destroy();
  }
});

test('CM6 integration (real hello_world): the same bytes with source_facet: description keep the Description-source reading (non-vacuity of the fix)', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(HELLO_WORLD.replace('source_facet: recipe', 'source_facet: description'), [staleFacetViewPlugin]);
    await waitForDecorations(harness);
    const suffixes = [...view.contentDOM.innerHTML.matchAll(/— (source|ignored|derived from [A-Za-z]+(?:, out of date)?)/g)].map((m) => m[0]);
    assert.equal(suffixes[0], '— source', 'Description is the source when the note says so');
  } finally {
    harness.destroy();
  }
});

// ---- 2026-10-31-1140 (M16a): a note whose SOURCE is its Recipe (applied by "Update from Recipe": the real writers) is drawn by the same plugin, from the same status function ------------------------------------------------------
async function recipeSourcedNote(): Promise<string> {
  const { PHRASE_DEFAULTS, noteContentFor } = await import('./phrase-core.ts');
  const { applyRecipeText } = await import('./description-apply-core.ts');
  const { extractRecipeSection } = await import('./v2-note-core.ts');
  const base = noteContentFor('phrase_001', { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 });
  const recipe = extractRecipeSection(base) ?? '';
  const edited = base.replace(recipe, recipe.replace('8 bars', '6 bars'));
  const done = applyRecipeText(edited, 'phrase_001', 'phrase', { bars: ['bar_007'], phrases: ['phrase_001'], arrangements: [], compositions: [], kits: [] }, extractRecipeSection(edited) ?? '');
  assert.ok(done.ok);
  return done.ok ? done.text : '';
}
const suffixesOf = (html: string): string[] => [...html.matchAll(/— (source|ignored|derived from [A-Za-z]+(?:, out of date)?)/g)].map((m) => m[0]);

test('CM6 integration (M16a): a Recipe-SOURCED note: Description "— derived from Recipe", Recipe "— source", Python "— derived from Recipe"; the Recipe moved on (hand edit) turns the Description and the Python "out of date"; the same note WITHOUT the Description stamp keeps the old reading "— ignored" (P3)', async () => {
  const text = await recipeSourcedNote();
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(text, [staleFacetViewPlugin]);
    await waitForDecorations(harness);
    assert.deepEqual(suffixesOf(view.contentDOM.innerHTML), ['— derived from Recipe', '— source', '— derived from Recipe']);
  } finally { harness.destroy(); }
  const moved = text.replace('Repeat it for 6 bars', 'Repeat it for 5 bars');
  assert.notEqual(moved, text);
  const h2 = createIntegrationHarness();
  try {
    const view = h2.mount(moved, [staleFacetViewPlugin]);
    await waitForDecorations(h2);
    assert.deepEqual(suffixesOf(view.contentDOM.innerHTML), ['— derived from Recipe, out of date', '— source', '— derived from Recipe, out of date']);
  } finally { h2.destroy(); }
  const h3 = createIntegrationHarness();
  try {
    const view = h3.mount(text.replace(/^description_derived_from_recipe_hash: .*\n/m, ''), [staleFacetViewPlugin]);
    await waitForDecorations(h3);
    assert.deepEqual(suffixesOf(view.contentDOM.innerHTML), ['— ignored', '— source', '— derived from Recipe']);
  } finally { h3.destroy(); }
});
