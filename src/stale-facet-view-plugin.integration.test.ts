// v0.2.264 — CM6 integration tests for the hexa-state visibility
// ViewPlugin. Per CM6 HARD RULE: mount in a real CM6 EditorView and
// verify decoration classes + suffix text appear in the rendered
// cm-content after the async state-detection settles.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIntegrationHarness } from './test-helpers/cm6-harness.ts';
import { staleFacetViewPlugin } from './stale-facet-view-plugin.ts';

// A V2 note WITH stored hashes that don't match the body (recipe was
// hand-edited). Under v11.6, whichLayerIsCanonical will infer Recipe
// canonical from hash mismatches → Description + Python render `— ignored`.
const RECIPE_CANONICAL_MISMATCH_NOTE = `---
type: action
description_hash: 0000000000000000000000000000000000000000000000000000000000000000
recipe_hash: 1111111111111111111111111111111111111111111111111111111111111111
python_hash: 2222222222222222222222222222222222222222222222222222222222222222
canonical_facet: recipe
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
  // v0.2.264 — v11.6 hexa-state. canonical_facet=recipe → Description
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
