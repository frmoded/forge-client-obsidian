// v0.2.205 — CM6 integration test for the Phase 2.5 §2.1 stale-facet
// ViewPlugin. Per CM6 HARD RULE: mount in a real CM6 EditorView and
// verify the decoration class appears in the rendered cm-content
// after the async stale-detection settles.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIntegrationHarness } from './test-helpers/cm6-harness.ts';
import { staleFacetViewPlugin } from './stale-facet-view-plugin.ts';

// A V2 note WITH stored hashes that don't match the body (recipe was
// hand-edited). description_hash + recipe_hash + python_hash are
// pinned to known-bad values so detectStaleFacets returns a non-empty
// set. The actual stored values were captured from a real
// /generate run and then mutated to force "recipe stale".
const STALE_RECIPE_NOTE = `---
type: action
description_hash: 0000000000000000000000000000000000000000000000000000000000000000
recipe_hash: 1111111111111111111111111111111111111111111111111111111111111111
python_hash: 2222222222222222222222222222222222222222222222222222222222222222
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
  // detectStaleFacets is async (sha256 via SubtleCrypto). The
  // ViewPlugin dispatches a no-op transaction when the result lands.
  // Poll a few times to let microtasks settle.
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await harness.flush();
    await new Promise(r => setTimeout(r, 10));
  }
}

test('CM6 integration: stale-facet plugin mounts without throwing', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(STALE_RECIPE_NOTE, [staleFacetViewPlugin]);
    await harness.flush();
    assert.ok(view, 'view must be created');
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: stale facets render with forge-facet-stale class (v11.4)', async () => {
  // v0.2.243 — Constitution V2a v11.4 tri-state. Recipe canonical
  // in STALE_RECIPE_NOTE → Description + Python both stale → body
  // marks with forge-facet-stale class.
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(STALE_RECIPE_NOTE, [staleFacetViewPlugin]);
    await waitForDecorations(harness);
    const html = view.contentDOM.innerHTML;
    assert.ok(
      html.includes('forge-facet-stale'),
      `expected forge-facet-stale in DOM after async state-compute; got: ${html.slice(0, 600)}`,
    );
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: tri-state suffix widgets render (source/derived/stale)', async () => {
  // v0.2.243 — Constitution V2a v11.4 tri-state. All three facets
  // get a suffix widget indicating their state. STALE_RECIPE_NOTE
  // has recipe canonical → Description + Python are stale; Recipe
  // is source.
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(STALE_RECIPE_NOTE, [staleFacetViewPlugin]);
    await waitForDecorations(harness);
    const html = view.contentDOM.innerHTML;
    assert.ok(
      html.includes('forge-facet-suffix'),
      `expected forge-facet-suffix widget in DOM; got: ${html.slice(0, 600)}`,
    );
    assert.ok(
      html.includes('— source'),
      `expected literal "— source" text in DOM (Recipe is source); got: ${html.slice(0, 600)}`,
    );
    assert.ok(
      html.includes('— stale'),
      `expected literal "— stale" text in DOM (Description/Python stale); got: ${html.slice(0, 600)}`,
    );
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: no hashes → synced canonical → all source, no body marks', async () => {
  // v0.2.243 — When no hashes are stored, whichLayerIsCanonical
  // returns 'synced' → all facets are source. Source facets get NO
  // body decoration (full color). Suffix widgets still render.
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(SYNCED_NOTE_NO_HASHES, [staleFacetViewPlugin]);
    await waitForDecorations(harness);
    const html = view.contentDOM.innerHTML;
    assert.ok(
      !html.includes('forge-facet-stale'),
      'V2 note with no stored hashes → synced → no stale body marks',
    );
    assert.ok(
      !html.includes('forge-facet-derived'),
      'V2 note with no stored hashes → synced → no derived body marks',
    );
  } finally {
    harness.destroy();
  }
});
