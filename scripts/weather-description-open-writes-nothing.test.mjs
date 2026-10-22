// Drain 2026-10-22-1955 — forge-tutorial's `05-conditionals/weather` Description now says what its Recipe says (the value 72, the threshold 80, both outputs). Only the Description line, the
// `description_hash` the shipped-description-hash gate demands match it, and the vault's forge.toml changed; the Recipe, the `# Python`, `source_facet` and every `*_derived_from_*` stamp are
// byte-for-byte what they were (the NULL action on lineage, tutorial style guide drain-2100 precedent).
//
// What this proves, on the REAL shipped bytes and against the ORIGINAL bytes (Measurement validity rule 2):
//   * the real `backfillV113Shape` makes zero actions and returns the very same bytes (opening writes nothing), and the plugin's own audit (open AND Run, Run modelled with the engine's RECORDED
//     Python for weather's own Recipe) lists no write;
//   * against the frozen bytes of the note before this drain (2e9e777): ONLY the `description_hash` line and the Description line differ — the Recipe, the `# Python` and every other frontmatter line
//     are identical, so nothing authored below the Description moved;
//   * the facet states: `source_facet: recipe` makes the Recipe the SOURCE and the Python derived from it IN SYNC — a Description edit cannot make this note read "out of date";
//   * the shipped-description-hash invariant holds, and NON-VACUITY: the same Description with the OLD hash fails that invariant, so the stamp move is what the gate demanded, not decoration.
//   * the file's mtime is unchanged by running all of this (nothing here, or in the plugin functions it calls, wrote it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditNote } from './check-open-time-writes-core.mjs';
import { checkNote } from './check-bundled-description-hashes-core.mjs';
import { loadRecording, recordedPythonFor } from './engine-recording.mjs';
import { backfillV113Shape } from '../src/v11-3-backfill-core.ts';
import { computeFacetHash } from '../src/facet-hash-core.ts';
import { computeFacetStates, FacetState } from '../src/facet-state-core.ts';
import * as v2 from '../src/v2-note-core.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REL = 'forge-tutorial/05-conditionals/weather';
const BUNDLE_FILE = path.join(ROOT, 'assets/vaults/forge-tutorial/05-conditionals/weather.md');
const SOURCE_FILE = path.resolve(ROOT, '../forge-tutorial/05-conditionals/weather.md');
const BEFORE = fs.readFileSync(path.join(ROOT, 'test/fixtures/weather/weather.before-2e9e777.md'), 'utf8');
const RECORDING = loadRecording(path.join(ROOT, 'test/fixtures/engine-transpile/shipped-notes.json'));
const NEW_DESCRIPTION = 'Sets the temperature to 72. Returns "It\'s hot." if the temperature is above 80, and "It\'s pleasant." otherwise.';

const asString = (b, k) => { const v = v2.getFrontmatterField(b, k); return typeof v === 'string' ? v : null; };
const helpers = {
  extractDescription: v2.extractDescription, extractRecipeSection: v2.extractRecipeSection, extractPythonSection: v2.extractPythonSection, getFrontmatterField: asString,
  setFrontmatterField: v2.setFrontmatterField, removeFrontmatterField: v2.removeFrontmatterField, replacePythonSection: v2.replacePythonSection, computeFacetHash,
};
const NO_ACTIONS = { pythonSection: false, hashes: [], derivedFromFields: [], canonicalHashRepairs: [], canonicalFacetSeeded: null, derivedFromParentSeeded: [], stubSyncRepairs: [], stubReplacedClaims: [] };
const lines = (s) => s.split('\n');
const SHIPPED = { 'the bundle copy (assets/vaults/forge-tutorial)': BUNDLE_FILE, 'the source vault file (../forge-tutorial)': SOURCE_FILE };
const mtimes = () => Object.values(SHIPPED).map((f) => fs.statSync(f).mtimeMs);
const mtimesBefore = mtimes();

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
    assert.equal(typeof enginePython, 'string', 'the recording has the engine\'s Python for weather\'s own Recipe');
    assert.deepEqual(await auditNote(original, { libraryGated: false, enginePython }), { applies: true, open: [], run: [] });
  });

  test(`ONLY THE DESCRIPTION CHANGED — ${label}: against the frozen bytes before this drain, the Description line and the description_hash differ and NOTHING else does`, () => {
    const now = fs.readFileSync(file, 'utf8');
    const a = lines(BEFORE), b = lines(now);
    assert.equal(a.length, b.length, 'same number of lines');
    const diff = a.map((l, i) => [l, b[i]]).filter(([x, y]) => x !== y);
    assert.equal(diff.length, 2, `exactly two lines differ, got ${JSON.stringify(diff)}`);
    assert.ok(diff.some(([x, y]) => /^description_hash: /.test(x) && /^description_hash: /.test(y)), 'one is the description_hash line');
    assert.ok(diff.some(([x, y]) => x === 'Chooses what to say based on a value.' && y === NEW_DESCRIPTION), 'the other is the Description line, exactly the new text');
    assert.equal(v2.extractRecipeSection(now), v2.extractRecipeSection(BEFORE), 'the Recipe is byte-identical');
    assert.equal(v2.extractPythonSection(now), v2.extractPythonSection(BEFORE), 'the # Python is byte-identical');
    for (const k of ['recipe_hash', 'python_hash', 'source_facet', 'recipe_derived_from_source_hash', 'recipe_derived_from_description_hash', 'python_derived_from_source_hash', 'python_derived_from_recipe_hash']) {
      assert.equal(asString(now, k), asString(BEFORE, k), `${k} is byte-unchanged (the null action on lineage)`);
    }
  });

  test(`THE NOTE NEVER READS "OUT OF DATE" — ${label}: source_facet is recipe, so the Recipe is the source and the Python is derived from it, in sync`, async () => {
    const now = fs.readFileSync(file, 'utf8');
    assert.equal(asString(now, 'source_facet'), 'recipe');
    const hashes = { description: await computeFacetHash(v2.extractDescription(now)), recipe: await computeFacetHash(v2.extractRecipeSection(now)), python: await computeFacetHash(v2.extractPythonSection(now)) };
    const states = computeFacetStates('recipe', { getFrontmatterField: (k) => asString(now, k) }, hashes);
    assert.deepEqual(states, { description: FacetState.Ignored, recipe: FacetState.Source, python: FacetState.DerivedFromRecipe });
  });

  test(`the shipped-description-hash invariant holds — ${label}`, async () => {
    const r = await checkNote(fs.readFileSync(file, 'utf8'));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.skipped, undefined, 'the invariant APPLIES to this note (it has a stored hash and a Description)');
  });
}

test('the bundle copy and the source file are the same bytes (the bundle mirrors the vault)', () => {
  assert.equal(fs.readFileSync(BUNDLE_FILE, 'utf8'), fs.readFileSync(SOURCE_FILE, 'utf8'));
});

test('NON-VACUITY — the new Description with the OLD description_hash (a hand edit without the stamp the gate demands) FAILS the shipped-description-hash invariant', async () => {
  const handEdited = BEFORE.replace('Chooses what to say based on a value.', NEW_DESCRIPTION);
  const r = await checkNote(handEdited);
  assert.equal(r.ok, false);
  assert.notEqual(r.stored, r.actual);
});

test('NON-VACUITY — the same note shipped BARE (no # Python, the way countdown shipped until 2e9e777) DOES write on open: the proof that the zero-action result above can fail', async () => {
  const bare = fs.readFileSync(SOURCE_FILE, 'utf8').replace(/\n# Python[\s\S]*$/, '\n');
  assert.ok(!/# Python/.test(bare));
  const r = await backfillV113Shape(bare, helpers);
  assert.equal(r.changed, true, 'opening a bare note inserts the stub # Python and stamps hashes');
  assert.equal(r.actions.pythonSection, true);
});

test('MTIME — running all of the above touched neither shipped file (a pure check, but the property is stated on the real files, not on a copy)', () => {
  assert.deepEqual(mtimes(), mtimesBefore);
});
