import { shouldSubmitOnKey } from './submit-on-key-core.ts';
// v0.2.77 — pure-function tests for the snippet-template emitters in
// modal.ts. The modal UI itself depends on the obsidian runtime; we
// test only the body-emission functions, which are static + pure.
//
// v0.2.231 — actionTemplate now emits V2 shape (Description + Recipe).
// canonicalActionTemplate retired in favor of the unified V2 template.
//
// v0.2.239 — S9 v11.3 uniform-visibility contract: template now also
// seeds a `# Python` section with `def compute(context): return None`.
// All three facets always visible + editable.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { actionTemplate } from './modal-templates-core.ts';
import { computeFacetHash } from './facet-hash-core.ts';
import {
  extractDescription,
  extractPythonSection,
  extractRecipeSection,
} from './v2-note-core.ts';

test('actionTemplate declares type: action', async () => {
  const body = await actionTemplate('my_snippet');
  assert.match(body, /^type:\s*action$/m);
});

test('actionTemplate emits # Description heading (V2 shape)', async () => {
  const body = await actionTemplate('my_snippet');
  assert.match(body, /^# Description$/m);
});

test('actionTemplate emits # Recipe heading (V2 shape)', async () => {
  const body = await actionTemplate('my_snippet');
  assert.match(body, /^# Recipe$/m);
});

test('actionTemplate does NOT emit # English heading (V1 retired)', async () => {
  const body = await actionTemplate('my_snippet');
  assert.doesNotMatch(body, /^# English$/m);
});

test('actionTemplate emits # Python heading (v0.2.239 S9 v11.3 uniform visibility)', async () => {
  const body = await actionTemplate('my_snippet');
  assert.match(body, /^# Python$/m);
});

test('actionTemplate seeds Python with def compute(context): return None', async () => {
  const body = await actionTemplate('my_snippet');
  assert.match(body, /def compute\(context\):/);
  assert.match(body, /return None/);
});

test('actionTemplate does NOT declare inputs: [] (V1 frontmatter retired)', async () => {
  const body = await actionTemplate('my_snippet');
  assert.doesNotMatch(body, /^inputs:\s*\[\]$/m);
});

test('actionTemplate does NOT declare facet_form (v0.2.121 — field retired)', async () => {
  const body = await actionTemplate('my_snippet');
  assert.doesNotMatch(body, /^facet_form:/m);
});

test('actionTemplate description echoes the snippet name', async () => {
  const body = await actionTemplate('printer');
  assert.match(body, /^description:\s*printer$/m);
});

// --- drain 2026-08-03-1245: Enter-submits in the new-action-note dialog ---

test('drain-1245: plain Enter submits', () => {
  assert.equal(
    shouldSubmitOnKey({ key: 'Enter', isComposing: false, shiftKey: false }),
    true,
  );
});

test('drain-1245: Enter during IME composition does NOT submit', () => {
  // Committing a Japanese/Chinese candidate uses Enter. Submitting here
  // would create a note named after a half-finished composition.
  assert.equal(
    shouldSubmitOnKey({ key: 'Enter', isComposing: true, shiftKey: false }),
    false,
  );
});

test('drain-1245: Shift-Enter does NOT submit', () => {
  assert.equal(
    shouldSubmitOnKey({ key: 'Enter', isComposing: false, shiftKey: true }),
    false,
  );
});

test('drain-1245: other keys never submit', () => {
  for (const key of ['a', 'Escape', 'Tab', 'NumpadEnter', ' ']) {
    assert.equal(
      shouldSubmitOnKey({ key, isComposing: false, shiftKey: false }),
      false,
      `${key} must not submit`,
    );
  }
});

// --- Drain 2026-08-03-1610 — full V2a hexa-state at creation ---------------
//
// Pre-drain the template emitted `type: action` + `description: <name>` only,
// leaving the hexa-state to reactive stampers (maybeUpdateSourceFacet on edit,
// seedSourceFacetForOpenFiles on layout-ready). Driver hit the pre-stamp
// window on v0.2.308 and v0.2.314: create a note, click Forge immediately,
// and the frontmatter isn't there yet. Stamping at creation removes the window
// rather than narrowing it.

test('drain-1610: actionTemplate stamps every hexa-state field at creation', async () => {
  const body = await actionTemplate('my_snippet');
  for (const field of [
    'source_facet', 'sync_state', 'recipe_version',
    'description_hash', 'recipe_hash', 'python_hash',
    'recipe_derived_from_description_hash', 'recipe_derived_from_source_hash',
    'python_derived_from_recipe_hash', 'python_derived_from_source_hash',
    'english_hash',
  ]) {
    assert.match(body, new RegExp(`^${field}:`, 'm'), `missing ${field}`);
  }
});

test('drain-1610: stamped hashes match the facets the extractors return', async () => {
  // The load-bearing assertion. If a stamped hash disagreed with what the
  // view plugin computes at render, the note would render as hand-edited the
  // instant it was created — the same class of wrong state this drain fixes,
  // just arrived at differently. Recompute from the emitted body and compare.
  const body = await actionTemplate('my_snippet');
  const fm = (key: string) => body.match(new RegExp(`^${key}: (.+)$`, 'm'))?.[1];

  assert.equal(fm('description_hash'), await computeFacetHash(extractDescription(body)));
  assert.equal(fm('recipe_hash'), await computeFacetHash(extractRecipeSection(body) ?? ''));
  assert.equal(fm('python_hash'), await computeFacetHash(extractPythonSection(body) ?? ''));
});

test('drain-1610: python_hash covers the seeded def, not the empty string', async () => {
  // Drain 1610's §Symptom lists `python_hash: <sha256 of empty>`, but the
  // template seeds `def compute(context): return None`. Hashing empty there
  // would mark Python hand-edited on creation.
  const body = await actionTemplate('my_snippet');
  const fm = (key: string) => body.match(new RegExp(`^${key}: (.+)$`, 'm'))?.[1];
  assert.notEqual(fm('python_hash'), await computeFacetHash(''));
  assert.equal(fm('recipe_hash'), await computeFacetHash(''));
});

test('drain-1610: opens Description-source, Recipe not yet derived', async () => {
  const body = await actionTemplate('my_snippet');
  assert.match(body, /^source_facet: description$/m);
  assert.match(body, /^sync_state: stale-recipe$/m);
  assert.match(body, /^recipe_version: 0$/m);
});
