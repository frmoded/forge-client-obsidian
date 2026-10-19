// Drain 2026-10-13-2100 §2 — `exercises/scale_quality_quiz` ships FULLY DERIVED, so that opening it and pressing Run writes nothing.
//
// Before: it shipped Description + Recipe only (`python_hash` = sha256(""), no `# Python`). The file-open backfill inserted a stub
// `# Python` and voided the lineage; Run then replaced the stub with the engine's transpile and re-stamped. Two rewrites of a
// bundled library note without the user editing it — after which the plugin manifest reads the note as EDITED and it stops
// auto-updating (a `.bundled` sidecar appears instead).
//
// The fixture is the note exactly as it now ships. Every claim below goes through the plugin's OWN functions or the REAL bundled
// engine (the same Pyodide + `assets/engine` + production Python block the plugin boots), never a mirror:
//   - the open-time writers (`backfillV113Shape`, `planOpenSeed`) find nothing to write;
//   - the write that follows Run (`applyPythonWriteBack`), given what the ENGINE transpiles from the Recipe, returns the note
//     byte-for-byte — so the shipped `# Python` IS the engine's output, not merely self-consistent;
//   - the dropdown comes from the transpiled signature (`_forge_get_input_enums`), which is why no `input_enums:` is shipped: the
//     plugin never writes that key, and a parallel declaration is exactly what drain 2026-08-16-1700 retired;
//   - there are no value slots, so there is no slot cache to ship and no LLM round trip on Run.
//
// Drift: this fixture mirrors a vault note, so its guard is the prebuild/release gate `scripts/check-open-time-writes.mjs`, which
// reads the BUNDLED copy (what ships) and fails if it would be written — see the wiring pins at the bottom.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { auditNote } from '../scripts/check-open-time-writes-core.mjs';
import { applyPythonWriteBack } from './python-write-back-core.ts';
import { computeFacetHash, whichLayerIsSource } from './facet-hash-core.ts';
import { extractPythonSection, extractRecipeSection, getFrontmatterField, extractDescription } from './v2-note-core.ts';
import { hasTypedLetsInRecipe } from './typed-lets-inputs-stamp-core.ts';
import { resolveForgeGesture } from './source-aware-forge-click-core.ts';
import { engine } from './test-support/real-rhythm-engine.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const QUIZ = fs.readFileSync(path.join(ROOT, 'test/fixtures/vault/shipped_scale_quality_quiz_fully_derived.md'), 'utf8');
const ID = 'scale_quality_quiz';

const asString = (b: string, k: string) => { const v = getFrontmatterField(b, k); return typeof v === 'string' ? v : null; };

async function engineTranspile(body: string): Promise<string> {
  const py = await engine();
  py.FS.writeFile(`/bundle/user-vault/${ID}.md`, body);
  py.globals.set('_sid', ID);
  return String(py.runPython('_forge_resolve_action_code(_sid, True)'));
}

test('opening the note writes nothing: the file-open backfill and the layout-ready sweep both find nothing to do', async () => {
  const r = await auditNote(QUIZ);
  assert.equal(r.applies, true, 'it is a V2 action note, so the open-time writers DO look at it');
  assert.deepEqual(r.open, []);
});

test('Run writes nothing — given the engine\'s own transpile of the shipped Recipe, the write-back returns the note byte-for-byte', async () => {
  const transpiled = await engineTranspile(QUIZ);
  const shipped = extractPythonSection(QUIZ)!;
  assert.equal(transpiled.trim(), shipped.trim(), 'the shipped # Python is what the engine produces from the shipped Recipe');
  const written = applyPythonWriteBack(QUIZ, {
    python: transpiled,
    pythonHash: await computeFacetHash(transpiled),
    englishHash: null,
    sourceLayer: await whichLayerIsSource(QUIZ, {
      extractDescription, extractRecipeSection, extractPythonSection, getFrontmatterField: asString,
    }),
    resolvedSlots: null,
  });
  assert.equal(written, QUIZ);
});

test('the dropdown is derived from the transpiled signature — no input_enums: is shipped, and none is needed', async () => {
  assert.equal(getFrontmatterField(QUIZ, 'input_enums'), null);
  const py = await engine();
  py.FS.writeFile(`/bundle/user-vault/${ID}.md`, QUIZ);
  py.globals.set('_sid', ID);
  const proxy = py.runPython('_forge_get_input_enums(_sid)');
  const enums = proxy.toJs({ dict_converter: Object.fromEntries });
  proxy.destroy?.();
  const guess = enums.guess instanceof Map ? [...enums.guess] : Array.from(enums.guess);
  assert.deepEqual(guess, ['major', 'minor', 'diminished', 'augmented']);
});

test('the typed-Input stamper has nothing to stamp: the engine derives exactly the inputs the note already declares', async () => {
  const recipe = extractRecipeSection(QUIZ)!;
  assert.equal(hasTypedLetsInRecipe(recipe), true, 'the Recipe declares a typed Input, so the stamper does look at this note');
  const py = await engine();
  py.globals.set('_recipe', recipe);
  const proxy = py.runPython('_forge_derive_typed_lets_input_names(_recipe)');
  const names = proxy.toJs();
  proxy.destroy?.();
  assert.deepEqual(Array.from(names), ['guess']);
  assert.match(QUIZ, /^inputs:\n {2}- guess$/m, 'frontmatter inputs: already equals the derived list → reconcileInputs is a no-op');
});

test('the HAMMER on the derived quiz transpiles — verdict synced + stored source_facet: description never reaches /generate (drain 2026-10-14-0900 §1)', async () => {
  // The exact observed sequence: `whichLayerIsSource verdict = synced`, then `gesture = generate { probe: synced, stored: description }`
  // and an LLM rewrote the quiz. Through the plugin's own probe + the plugin's own gesture function.
  const probe = await whichLayerIsSource(QUIZ, {
    extractDescription, extractRecipeSection, extractPythonSection, getFrontmatterField: asString,
  });
  assert.equal(probe, 'synced');
  assert.equal(asString(QUIZ, 'source_facet'), 'description');
  assert.equal(resolveForgeGesture(probe, 'description'), 'transpile');
});

test('no value slots: nothing for a slot cache to hold, so no LLM resolve on Run', () => {
  assert.doesNotMatch(extractRecipeSection(QUIZ)!, /\{\{/);
  assert.equal(asString(QUIZ, 'slots_cache'), null);
});

test('NON-VACUITY — the same note WITHOUT its # Python reads as written on open and on Run (the state it used to ship in)', async () => {
  const before = QUIZ.replace(/\n# Python\n[\s\S]*$/, '\n');
  assert.equal(extractPythonSection(before), null);
  const r = await auditNote(before);
  assert.ok(r.open.some((x: string) => /stub # Python/.test(x)), `open must flag the stub insert, got ${JSON.stringify(r.open)}`);
  assert.ok(r.run.length > 0, 'and Run would add the section');
});

test('NON-VACUITY — a stale python_hash is flagged on Run', async () => {
  const stale = QUIZ.replace(/^python_hash: .*$/m, 'python_hash: 0000000000000000000000000000000000000000000000000000000000000000');
  assert.notEqual(stale, QUIZ);
  assert.ok((await auditNote(stale)).run.length > 0);
});

test('NON-VACUITY — the empty-SHA english_hash remnant is flagged on Run (the writer heals it, i.e. rewrites the note)', async () => {
  const withRemnant = QUIZ.replace(/\n---\n\n# Description/, '\nenglish_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n---\n\n# Description');
  assert.notEqual(withRemnant, QUIZ);
  assert.ok((await auditNote(withRemnant)).run.length > 0);
});

test('every note on the read-only ratchet exists in the bundle — a typo fails here, not only at build time', () => {
  const list = fs.readFileSync(path.join(ROOT, 'scripts/open-time-readonly.txt'), 'utf8')
    .split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);
  // 24 since drain 2026-10-19-1530: five notes whose Python the real engine would still rewrite were taken off it until they are re-derived (Phase B).
  assert.ok(list.length >= 24, `the ratchet should carry the derived + library-gated clean notes, has ${list.length}`);
  const missing = list.filter((rel) => !fs.existsSync(path.join(ROOT, 'assets/vaults', rel)));
  assert.deepEqual(missing, []);
});

test('WIRING (mechanism pin) — the gate runs in prebuild and in release.sh\'s preflight, and the note is on the required list', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.prebuild, /check-open-time-writes/);
  assert.match(pkg.scripts['check-open-time-writes'], /check-open-time-writes\.mjs/);
  const release = fs.readFileSync(path.join(ROOT, 'scripts/release.sh'), 'utf8');
  assert.match(release, /node scripts\/check-open-time-writes\.mjs/);
  const required = fs.readFileSync(path.join(ROOT, 'scripts/open-time-readonly.txt'), 'utf8');
  assert.match(required, /^music-theory\/exercises\/scale_quality_quiz\.md$/m);
});
