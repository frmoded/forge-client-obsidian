// Drain 2026-09-08-1240 — L41 sample-vault fixture integration test.
//
// Fixture: test/fixtures/vault/gate_m_lineage_current_hand_edit.md — a
// verbatim snapshot of forge-tutorial's 02-variables/fix_me.md as read
// from the driver's live vault at drain time: `source_facet: recipe`,
// `python_derived_from_recipe_hash` EQUAL to `recipe_hash` (lineage
// current from an earlier /generate, no transpile this session at all).
//
// This test simulates the REAL production sequence
// (`captureFacetHashCacheForFile` on file-open, then a hand-edit modify
// event) using the plugin's actual pure-core functions
// (computeFacetHash, extractPythonSection, changedFacets,
// decideSourceWriteFromChange) against the real fixture bytes — not
// synthetic hash strings. It is the closest proof available without a
// live Obsidian instance that the fix works on the actual note the
// driver hit, per cc-prompt-queue.md's smoke-automation stance ("push
// every assertion that doesn't require Obsidian UI into the suite").
//
// The live-Obsidian click-through itself (§4.5 of the drain prompt)
// still needs a driver smoke — see this drain's FEEDBACK §6.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

if (typeof (globalThis as any).crypto === 'undefined') {
  (globalThis as any).crypto = webcrypto;
}
if (typeof (globalThis as any).TextEncoder === 'undefined') {
  (globalThis as any).TextEncoder = TextEncoder as any;
}

import {
  extractDescription,
  extractRecipeSection,
  extractPythonSection,
  getFrontmatterField,
} from './v2-note-core.ts';
import { computeFacetHash } from './facet-hash-core.ts';
import {
  changedFacets,
  decideSourceWriteFromChange,
  type FacetHashes,
} from './facet-edit-tracker-core.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(
  __dirname, '..', 'test', 'fixtures', 'vault',
  'gate_m_lineage_current_hand_edit.md',
);

/** Mirrors captureFacetHashCacheForFile's + maybeUpdateSourceFacet's
 *  hash-cache snapshot shape exactly (main.ts:5441-5451 / 5474-5482
 *  as of this drain) — including the new pyDerivedFrom field. */
async function snapshot(body: string): Promise<FacetHashes> {
  return {
    desc: await computeFacetHash(extractDescription(body)),
    recipe: await computeFacetHash(extractRecipeSection(body) ?? ''),
    python: await computeFacetHash(extractPythonSection(body) ?? ''),
    pyDerivedFrom: getFrontmatterField(body, 'python_derived_from_recipe_hash'),
  };
}

describe('L41 sample-vault fixture: gate_m_lineage_current_hand_edit (drain 2026-09-08-1240)', () => {
  it('reads from disk without error and matches the real note\'s lineage-current shape', async () => {
    const body = await readFile(FIXTURE_PATH, 'utf-8');
    const recipeHash = getFrontmatterField(body, 'recipe_hash');
    const pyDerivedFrom = getFrontmatterField(body, 'python_derived_from_recipe_hash');
    assert.equal(getFrontmatterField(body, 'source_facet'), 'recipe');
    assert.equal(pyDerivedFrom, recipeHash, 'fixture must start lineage-current, same as the real note');
  });

  it('THE FIX: hand-editing # Python on this real note flips source_facet to python', async () => {
    const before = await readFile(FIXTURE_PATH, 'utf-8');

    // Step 1 — simulate captureFacetHashCacheForFile at file-open: the
    // caller's cache is seeded from the note's PRE-EXISTING state, with
    // NO edit having happened yet this session.
    const cached = await snapshot(before);

    // Step 2 — simulate the driver's hand-edit: the fixture's own
    // intended fix per its Description (drop the stray quotes around
    // `greeting` on the Return line), applied to the Python body only —
    // frontmatter is untouched, exactly like a real editor keystroke.
    const after = before.replace("return 'greeting'", 'return greeting');
    assert.notEqual(after, before, 'the edit must actually change the Python body');

    // Step 3 — simulate the modify-event handler's read.
    const current = await snapshot(after);
    const changed = changedFacets(current, cached);
    assert.deepEqual(changed, ['python'], 'only the Python facet moved');

    const pythonLineageIsCurrent =
      typeof current.pyDerivedFrom === 'string' && current.pyDerivedFrom === current.recipe;
    assert.equal(pythonLineageIsCurrent, true, 'lineage is still nominally current — the trap Gate M fell into');

    const pythonLineageStampJustWritten =
      cached !== null && cached.pyDerivedFrom !== current.pyDerivedFrom;
    assert.equal(pythonLineageStampJustWritten, false, 'the hand-edit never touched the frontmatter stamp');

    const storedSource = getFrontmatterField(before, 'source_facet');
    const target = decideSourceWriteFromChange(
      changed, storedSource as any, pythonLineageIsCurrent, pythonLineageStampJustWritten,
    );

    assert.equal(target, 'python', 'the real note must flip to python-canonical on this hand-edit');
  });

  it('THE BUG, PINNED: the same real note, called with the pre-fix 3-arg signature, still swallows the edit', async () => {
    // Non-vacuity in the strongest form (matches Gate M's own existing
    // convention just above in facet-edit-tracker-core.test.ts): the
    // IDENTICAL fixture and edit, but omitting the new 4th argument
    // (which defaults to `true` for backward compatibility), reproduces
    // the exact bug this drain fixes. If this ever returns 'python',
    // the default has changed and every pre-existing 3-arg call site
    // silently changed behavior — which would need its own audit.
    const before = await readFile(FIXTURE_PATH, 'utf-8');
    const cached = await snapshot(before);
    const after = before.replace("return 'greeting'", 'return greeting');
    const current = await snapshot(after);
    const changed = changedFacets(current, cached);
    const pythonLineageIsCurrent =
      typeof current.pyDerivedFrom === 'string' && current.pyDerivedFrom === current.recipe;
    const storedSource = getFrontmatterField(before, 'source_facet');

    const preFixTarget = decideSourceWriteFromChange(changed, storedSource as any, pythonLineageIsCurrent);
    assert.equal(preFixTarget, null, 'reproduces the exact bug: the pre-fix 3-arg call swallows the edit');
  });
});
