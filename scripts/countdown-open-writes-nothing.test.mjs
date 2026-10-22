// Drain 2026-10-22-1520 — forge-tutorial's `countdown` ships a REAL, engine-derived `# Python` so that opening it writes nothing (constitution v31 S8 / B7.3; driver decision, Iteration 504 option A).
//
// WHAT HAPPENED (measured, FEEDBACK step 1): countdown shipped bare. Opening it in the source vault made the plugin's file-open backfill insert the stub `# Python` (`return None`) and stamp the hashes;
// the modify handler then flipped `source_facet` to `python` (a stale pre-backfill baseline), and Run on that file prints NOTHING (the stub is Python-canonical) — the chapter-6 lesson (3, 2, 1, Liftoff!) breaks.
//
// This file is the strong proof that it no longer can, and that the proof can fail:
//   * the REAL `backfillV113Shape`, applied to the SHIPPED bytes (the bundle copy AND the source-vault file), makes zero actions and returns the very same bytes — compared against the ORIGINAL
//     bytes of the real file, never against the function's own second pass (Measurement validity rule 2);
//   * the plugin's own audit (open AND the Run write-back, modelled with the engine's RECORDED Python) lists no write;
//   * the `# Python` IS the engine's recorded output for the note's own Recipe, and the Description and Recipe are byte-for-byte the ones shipped before (nothing authored was touched);
//   * NON-VACUITY: the same checks FAIL on the two frozen artifacts of the incident — the bare bytes of b1bdedb (open writes) and the stamped-stub bytes the driver found at 19:41 on 2026-10-21 (Run writes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditNote } from './check-open-time-writes-core.mjs';
import { loadRecording, recordedPythonFor } from './engine-recording.mjs';
import { backfillV113Shape } from '../src/v11-3-backfill-core.ts';
import { computeFacetHash } from '../src/facet-hash-core.ts';
import * as v2 from '../src/v2-note-core.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REL = 'forge-tutorial/06-loops/countdown';
const BUNDLE_FILE = path.join(ROOT, 'assets/vaults/forge-tutorial/06-loops/countdown.md');
const SOURCE_FILE = path.resolve(ROOT, '../forge-tutorial/06-loops/countdown.md');
const FIX = path.join(ROOT, 'test/fixtures/countdown');
const BARE = fs.readFileSync(path.join(FIX, 'countdown.bare-HEAD-b1bdedb.md'), 'utf8');
const STAMPED_STUB = fs.readFileSync(path.join(FIX, 'countdown.stamped-stub.md'), 'utf8');
const RECORDING = loadRecording(path.join(ROOT, 'test/fixtures/engine-transpile/shipped-notes.json'));

const asString = (b, k) => { const v = v2.getFrontmatterField(b, k); return typeof v === 'string' ? v : null; };
const helpers = {
  extractDescription: v2.extractDescription, extractRecipeSection: v2.extractRecipeSection, extractPythonSection: v2.extractPythonSection, getFrontmatterField: asString,
  setFrontmatterField: v2.setFrontmatterField, removeFrontmatterField: v2.removeFrontmatterField, replacePythonSection: v2.replacePythonSection, computeFacetHash,
};
const norm = (s) => (s ?? '').trim();
const NO_ACTIONS = { pythonSection: false, hashes: [], derivedFromFields: [], canonicalHashRepairs: [], canonicalFacetSeeded: null, derivedFromParentSeeded: [], stubSyncRepairs: [], stubReplacedClaims: [] };

const SHIPPED = { 'the bundle copy (assets/vaults/forge-tutorial)': BUNDLE_FILE, 'the source vault file (../forge-tutorial)': SOURCE_FILE };

for (const [label, file] of Object.entries(SHIPPED)) {
  test(`OPENING WRITES NOTHING — ${label}: the real backfill makes zero actions and returns the very same bytes`, async () => {
    assert.ok(fs.existsSync(file), `${file} must exist (a missing sibling is a failure, not a skip)`);
    const original = fs.readFileSync(file, 'utf8');
    const r = await backfillV113Shape(original, helpers);
    assert.equal(r.changed, false);
    assert.deepEqual(r.actions, NO_ACTIONS);
    assert.equal(r.newBody, original, 'byte-identical to the ORIGINAL bytes of the file');
  });

  test(`OPEN + RUN WRITE NOTHING — ${label}: the plugin's own audit, with Run modelled by the engine's RECORDED Python, lists no write`, async () => {
    const original = fs.readFileSync(file, 'utf8');
    const enginePython = recordedPythonFor(RECORDING, REL, original);
    assert.equal(typeof enginePython, 'string', 'the recording has the engine\'s Python for countdown\'s own Recipe');
    const a = await auditNote(original, { libraryGated: false, enginePython });
    assert.deepEqual(a, { applies: true, open: [], run: [] });
  });

  test(`THE # Python IS THE ENGINE'S OWN OUTPUT, the facet declares its source, and nothing authored changed — ${label}`, () => {
    const original = fs.readFileSync(file, 'utf8');
    assert.equal(norm(v2.extractPythonSection(original)?.replace(/^```python\n|\n```$/g, '')), norm(recordedPythonFor(RECORDING, REL, original)), 'the shipped Python is what the real engine produced for this Recipe');
    assert.equal(asString(original, 'source_facet'), 'synced', 'all three facets agree and none was hand-edited: the Python is the engine\'s transpile of the Recipe, which the Description produced (what the restamp fixed point elects; the same value the 26 notes of drain 2026-10-21-1200 got)');
    assert.equal(v2.extractDescription(original), v2.extractDescription(BARE), 'the Description is the shipped one, untouched');
    assert.equal(norm(v2.extractRecipeSection(original)), norm(v2.extractRecipeSection(BARE)), 'the Recipe is the shipped one, untouched');
    assert.ok(!/return None/.test(original), 'no stub');
  });
}

test('the bundle copy and the source file are the same bytes (the bundle mirrors the vault)', () => {
  assert.equal(fs.readFileSync(BUNDLE_FILE, 'utf8'), fs.readFileSync(SOURCE_FILE, 'utf8'));
});

test('NON-VACUITY 1 — the BARE note (what shipped until now): opening it writes (stub + stamps), and the audit says so', async () => {
  const r = await backfillV113Shape(BARE, helpers);
  assert.equal(r.changed, true);
  assert.equal(r.actions.pythonSection, true);
  assert.deepEqual(r.actions.hashes, ['description_hash', 'recipe_hash', 'python_hash']);
  const a = await auditNote(BARE, { libraryGated: false, enginePython: recordedPythonFor(RECORDING, REL, BARE) });
  assert.ok(a.open.length > 0, `the audit lists the open-time writes: ${a.open.join(' | ')}`);
});

test('NON-VACUITY 2 — the STAMPED-STUB bytes the driver found at 19:41 (frozen from the prompt): the backfill is quiet but Run WRITES (the engine\'s Python replaces the stub), so the note is NOT clean', async () => {
  const r = await backfillV113Shape(STAMPED_STUB, helpers);
  assert.equal(r.changed, false, 'already stamped: opening it again changes nothing — which is exactly why this is not enough');
  const a = await auditNote(STAMPED_STUB, { libraryGated: false, enginePython: recordedPythonFor(RECORDING, REL, STAMPED_STUB) });
  assert.deepEqual(a.open, []);
  assert.ok(a.run.length > 0, `Run would rewrite it: ${a.run.join(' | ')}`);
  assert.equal(asString(STAMPED_STUB, 'source_facet'), 'python');
  assert.match(v2.extractPythonSection(STAMPED_STUB), /return None/);
});
