// v0.2.254 drain 2026-07-03-1100 (L41 sample-vault fixture) —
// integration test for the Description-canonical auto-forge path.
//
// Fixture: test/fixtures/vault/description_canonical_needs_regen.md
//
// State: description_hash is SHA-256-of-empty which does NOT match
// the actual Description body. Recipe/Python stored hashes also don't
// match their bodies. Under upstream-wins semantics (v0.2.252),
// canonical detection returns 'description' (upstream mismatch wins
// even when all three drift).
//
// Assertion: decideForgeClickAction('description') returns
// 'auto_generate_then_run' — the v0.2.254 replacement for the pre-
// v0.2.254 'abort_recipe_stale' action. Main.ts's forgeSnippet branch
// calls this.generate() + this.runSnippet() when this signal fires.
//
// Regression guard: fixture body must NOT reference the retired
// "Forge: Generate Recipe from Description" command anywhere on
// disk, since that's the exact string cohort was told to invoke
// pre-v0.2.254.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { TextEncoder } from 'node:util';
import { webcrypto } from 'node:crypto';
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
import { whichLayerIsSource } from './facet-hash-core.ts';
import { decideForgeClickAction } from './source-aware-forge-click-core.ts';
import { sourceLayerStatusTooltip } from './source-layer-status-bar-core.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(
  __dirname, '..', 'test', 'fixtures', 'vault',
  'description_canonical_needs_regen.md',
);

const fmReader = (body: string, key: string): string | null => {
  const v = getFrontmatterField(body, key);
  return typeof v === 'string' ? v : null;
};

describe('L41 description-canonical fixture (v0.2.254 auto-forge)', () => {
  it('reads from disk without error', async () => {
    const body = await readFile(FIXTURE_PATH, 'utf-8');
    assert.ok(body.length > 0);
    assert.ok(body.includes('type: action'));
    assert.ok(body.includes('# Description'));
    assert.ok(body.includes('# Recipe'));
    assert.ok(body.includes('# Python'));
  });

  it('canonical detection returns "description" (upstream-wins v0.2.252 + Description drifted here)', async () => {
    const body = await readFile(FIXTURE_PATH, 'utf-8');
    const canonical = await whichLayerIsSource(body, {
      extractDescription,
      extractRecipeSection,
      extractPythonSection,
      getFrontmatterField: fmReader,
    });
    assert.equal(canonical, 'description');
  });

  it('decideForgeClickAction("description") → "auto_generate_then_run" (v0.2.254 pipeline)', () => {
    const action = decideForgeClickAction('description');
    assert.equal(action, 'auto_generate_then_run');
  });

  it('tooltip describes the auto-forge pipeline (not the retired command)', () => {
    const tooltip = sourceLayerStatusTooltip('description');
    assert.match(tooltip, /auto-run the full pipeline/);
    assert.doesNotMatch(tooltip, /Forge: Generate Recipe from Description/);
  });

  it('fixture body itself does NOT reference the retired command', async () => {
    const body = await readFile(FIXTURE_PATH, 'utf-8');
    assert.doesNotMatch(body, /Forge: Generate Recipe from Description/);
  });
});
