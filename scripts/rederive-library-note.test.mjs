// Drain 2026-10-20-1100 §2 — re-derive a shipped library note: replace its stored `# Python` with what the REAL engine transpiles from its Recipe, then
// stamp the lineage the way the plugin would (the restamp tool's fixed point). The four hand-written notes the 1530 review recommended re-deriving
// (slow_burn/chorus, slow_burn/solo_chorus, percussion/loom, slow_burn/slow_burn) are the customers; the tool is generic.
//
// The inputs are the notes AS THEY SHIPPED (test/fixtures/engine-transpile/rederive-comparison.json keeps their bytes — a test that read them from
// the moving source tree would expire the moment they are re-derived) and the engine's Python for them (recorded by scripts/record-engine-transpile.py,
// restated in the same fixture).
//
// The standing rule (the driver's, 2026-10-19): NEVER stamp lineage over a stub or hand-written Python. The tool therefore refuses to stamp anything
// the engine did not produce, and refuses to run over a note whose source is its Python (a hand edit that is the point of the note).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { rederiveNote } from './rederive-library-note-core.mjs';
import { auditNote } from './check-open-time-writes-core.mjs';
import { restampNote } from './restamp-library-notes-core.mjs';
import { DEFAULT_PYTHON_STUB } from '../src/v11-3-backfill-core.ts';
import { extractDescription, extractPythonSection, extractRecipeSection } from '../src/v2-note-core.ts';
const OLD_LINEAGE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test/fixtures/vault', 'shipped_recipe_source_description_rooted_lineage.md'), 'utf8');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test/fixtures/engine-transpile/rederive-comparison.json'), 'utf8'));
const RELS = Object.keys(FIX.notes).sort();
const CHORUS = 'music-theory/slow_burn/chorus';
const recordingFor = (rel, over = {}) => ({ notes: { [rel]: { recipe: FIX.notes[rel].recipe, python: FIX.notes[rel].new_python, ...over } } });
const fmKeys = (b) => Object.fromEntries([...(/^---\n([\s\S]*?)\n---/.exec(b)?.[1] ?? '').split('\n')].map((l) => [l.split(':')[0], l.slice(l.indexOf(':') + 1).trim()]));
const norm = (s) => (s ?? '').trim();

test('the premise: the four fixtures are hand-written notes the gate says a Run would rewrite, and a real engine Python exists for each', async () => {
  assert.deepEqual(RELS, ['music-theory/percussion/loom', 'music-theory/slow_burn/chorus', 'music-theory/slow_burn/slow_burn', 'music-theory/slow_burn/solo_chorus']);
  for (const rel of RELS) {
    const e = FIX.notes[rel];
    assert.notEqual(norm(e.old_python), norm(e.new_python), `${rel}: hand-written Python differs from the engine's`);
    const audit = await auditNote(e.old_note, { libraryGated: true, enginePython: e.new_python });
    assert.deepEqual(audit.run, ["rewrites # Python / python_hash / lineage — the engine's transpile of the Recipe differs from the shipped note"], `${rel}: the gate flags it`);
  }
});

for (const rel of RELS) {
  test(`${rel}: re-deriving puts the ENGINE's Python in, leaves Description and Recipe byte-identical, and the note settles (a second run changes nothing)`, async () => {
    const e = FIX.notes[rel];
    const r = await rederiveNote(e.old_note, { rel, recording: recordingFor(rel) });
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.changed, true);
    assert.equal(norm(extractPythonSection(r.next)), norm(e.new_python), 'the Python IS the engine\'s transpile');
    assert.equal(extractDescription(r.next), extractDescription(e.old_note), 'Description untouched');
    assert.equal(extractRecipeSection(r.next), extractRecipeSection(e.old_note), 'Recipe untouched');
    const again = await rederiveNote(r.next, { rel, recording: recordingFor(rel) });
    assert.equal(again.ok, true);
    assert.equal(again.changed, false, 'a fixed point');
    assert.equal(again.next, r.next);
    const fixed = await restampNote(r.next);
    assert.equal(fixed.changed, false, 'and the restamp tool has nothing left to do');
  });

  test(`${rel}: after re-deriving, the gate\'s model of Run (with the engine's recorded Python) and of opening the note both write NOTHING`, async () => {
    const e = FIX.notes[rel];
    const r = await rederiveNote(e.old_note, { rel, recording: recordingFor(rel) });
    for (const libraryGated of [true, false]) {
      const audit = await auditNote(r.next, { libraryGated, enginePython: e.new_python });
      assert.deepEqual({ open: audit.open, run: audit.run }, { open: [], run: [] }, `libraryGated=${libraryGated}`);
    }
  });
}

test('only the Python facet and its stamps change: the other frontmatter lines are byte-identical and source_facet is untouched', async () => {
  const e = FIX.notes[CHORUS];
  const r = await rederiveNote(e.old_note, { rel: CHORUS, recording: recordingFor(CHORUS) });
  const before = fmKeys(e.old_note), after = fmKeys(r.next);
  const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]).sort();
  for (const k of changed) assert.ok(/^python_(hash|derived_from_)/.test(k), `unexpected frontmatter change: ${k}`);
  assert.equal(after.source_facet, before.source_facet, 'source_facet is not touched (it is "synced" in the shipped chorus: Description, Recipe and Python agreed)');
  assert.equal(after.recipe_hash, before.recipe_hash);
  assert.equal(after.description_hash, before.description_hash);
});

test('it also SETTLES the stamps the writer alone leaves stale: a note carrying the old (Description-rooted) lineage comes out exactly as the restamp tool would leave it', async () => {
  // fix_me as shipped before drain 2026-10-15-2100: right Python, wrong lineage root. The engine's Python for it is its own (the premise below); the writer
  // rewrites python_hash but not the older lineage line, so without the restamp fixed point the note would not be one the gate calls clean.
  const py = extractPythonSection(OLD_LINEAGE);
  const rel = 'forge-tutorial/02-variables/fix_me';
  const rec = { notes: { [rel]: { recipe: extractRecipeSection(OLD_LINEAGE), python: py } } };
  const r = await rederiveNote(OLD_LINEAGE, { rel, recording: rec });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.next, (await restampNote(OLD_LINEAGE)).next, 'the same bytes the restamp tool produces');
  assert.notEqual(r.next, OLD_LINEAGE, 'the premise: the old lineage was stale, so something changed');
  for (const libraryGated of [true, false]) {
    const audit = await auditNote(r.next, { libraryGated, enginePython: py });
    assert.deepEqual({ open: audit.open, run: audit.run }, { open: [], run: [] });
  }
});

test('a note with NO stamps at all comes out fully stamped — Description, Recipe and Python hashes and lineage, exactly what the gate calls clean (the restamp fixed point, not the writer alone)', async () => {
  const e = FIX.notes[CHORUS];
  const bare = e.old_note.replace(/^---\n[\s\S]*?\n---/, '---\ntype: action\n---');
  assert.equal(fmKeys(bare).description_hash, undefined, 'the premise: no stamps');
  const r = await rederiveNote(bare, { rel: CHORUS, recording: recordingFor(CHORUS) });
  assert.equal(r.ok, true, r.reason);
  for (const k of ['description_hash', 'recipe_hash', 'python_hash', 'source_facet', 'recipe_derived_from_description_hash', 'python_derived_from_recipe_hash']) {
    assert.ok(fmKeys(r.next)[k], `${k} is stamped`);
  }
  for (const libraryGated of [true, false]) {
    const audit = await auditNote(r.next, { libraryGated, enginePython: e.new_python });
    assert.deepEqual({ open: audit.open, run: audit.run }, { open: [], run: [] }, `libraryGated=${libraryGated}`);
  }
});

// ---- the refusals: never stamp over what the engine did not produce ---------------------------------------------------------------

test('REFUSES with no recorded engine Python for the note, and says how to get one — it never falls back to the note\'s own Python', async () => {
  const e = FIX.notes[CHORUS];
  for (const recording of [{ notes: {} }, null, undefined, { notes: { [CHORUS]: { recipe: e.recipe } } }]) {
    const r = await rederiveNote(e.old_note, { rel: CHORUS, recording });
    assert.equal(r.ok, false);
    assert.match(r.reason, /no recorded engine Python/i);
    assert.match(r.reason, /record-engine-transpile/);
  }
});

test('REFUSES a recording of a DIFFERENT Recipe (Python is a function of the Recipe; a stale recording proves nothing about this note)', async () => {
  const e = FIX.notes[CHORUS];
  const r = await rederiveNote(e.old_note, { rel: CHORUS, recording: recordingFor(CHORUS, { recipe: e.recipe + '\nPlay [[something_else]].' }) });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Recipe/i);
});

test('REFUSES an engine "transpile" that is the stub: a stub is never the source of a lineage claim', async () => {
  const e = FIX.notes[CHORUS];
  for (const stub of [DEFAULT_PYTHON_STUB, `${DEFAULT_PYTHON_STUB}\n`, 'def compute(context):\n    return None']) {
    const r = await rederiveNote(e.old_note, { rel: CHORUS, recording: recordingFor(CHORUS, { python: stub }) });
    assert.equal(r.ok, false, JSON.stringify(stub));
    assert.match(r.reason, /stub/i);
  }
  // NON-VACUITY: the same note with the real engine Python is accepted
  assert.equal((await rederiveNote(e.old_note, { rel: CHORUS, recording: recordingFor(CHORUS) })).ok, true);
});

test('REFUSES a note whose SOURCE is its Python (source_facet: python): re-deriving would destroy the hand edit that is the point of the note', async () => {
  const e = FIX.notes[CHORUS];
  const handEdited = e.old_note.replace(/^source_facet: .*$/m, 'source_facet: python');
  assert.notEqual(handEdited, e.old_note, 'the premise: the fixture carries a source_facet line to change');
  const r = await rederiveNote(handEdited, { rel: CHORUS, recording: recordingFor(CHORUS) });
  assert.equal(r.ok, false);
  assert.match(r.reason, /source_facet: python|Python is the source/i);
});

test('REFUSES a note the plugin\'s writers skip (not type: action, or not V2 shape): there is nothing to derive', async () => {
  const data = '---\ntype: data\ncontent_type: json\n---\n\n```json\n{}\n```\n';
  const r = await rederiveNote(data, { rel: 'music-theory/rhythm_data/x', recording: { notes: { 'music-theory/rhythm_data/x': { recipe: '', python: 'def compute(context):\n    return 1' } } } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /action|V2/i);
});

test('a note that has NO # Python at all gets the engine\'s (not a stub), stamped — the other way a note ships fully derived', async () => {
  const e = FIX.notes[CHORUS];
  const noPython = e.old_note.replace(/\n# Python[\s\S]*$/, '\n');
  assert.equal(extractPythonSection(noPython), null, 'the premise');
  const r = await rederiveNote(noPython, { rel: CHORUS, recording: recordingFor(CHORUS) });
  assert.equal(r.ok, true, r.reason);
  assert.equal(norm(extractPythonSection(r.next)), norm(e.new_python));
  assert.notEqual(norm(extractPythonSection(r.next)), norm(DEFAULT_PYTHON_STUB));
});

// ---- the command line ---------------------------------------------------------------------------------------------------------

const CLI = path.join(__dirname, 'rederive-library-note.mjs');
const cli = (cwd, ...args) => spawnSync(process.execPath, ['--no-warnings', '--experimental-strip-types', CLI, ...args], { cwd, encoding: 'utf8' });
function makeVault(name = 'music-theory') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rederive-'));
  const vault = path.join(root, 'checkout-dir-that-is-not-the-vault-name');
  fs.mkdirSync(path.join(vault, 'slow_burn'), { recursive: true });
  fs.writeFileSync(path.join(vault, 'forge.toml'), `name = "${name}"\nversion = "0.0.1"\n`);
  const e = FIX.notes[CHORUS];
  fs.writeFileSync(path.join(vault, 'slow_burn', 'chorus.md'), e.old_note);
  const rec = path.join(root, 'rec.json');
  fs.writeFileSync(rec, JSON.stringify(recordingFor(CHORUS)));
  return { root, vault, rec, note: path.join(vault, 'slow_burn', 'chorus.md') };
}

test('CLI --check: lists the notes that would change, exits 1, writes NOTHING; a re-derived note then passes --check with exit 0', () => {
  const t = makeVault();
  const before = fs.readFileSync(t.note, 'utf8');
  const c = cli(t.vault, '--check', '--recording', t.rec, t.note);
  assert.equal(c.status, 1, c.stderr);
  assert.match(c.stdout, /slow_burn\/chorus\.md/);
  assert.equal(fs.readFileSync(t.note, 'utf8'), before, '--check wrote nothing');
  const run = cli(t.vault, '--recording', t.rec, t.note);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /re-derived/);
  assert.notEqual(fs.readFileSync(t.note, 'utf8'), before);
  assert.equal(cli(t.vault, '--check', '--recording', t.rec, t.note).status, 0);
  assert.equal(cli(t.vault, '--recording', t.rec, t.note).stdout.trim(), '', 'a second run prints nothing and changes nothing');
});

test('CLI: the note\'s recorded name is <vault name from forge.toml>/<path without .md> — NOT the checkout directory\'s name (a worktree is called anything)', () => {
  const t = makeVault('music-theory');
  assert.equal(cli(t.vault, '--recording', t.rec, t.note).status, 0);
  const other = makeVault('some-other-vault');
  const bad = cli(other.vault, '--recording', other.rec, other.note);
  assert.equal(bad.status, 2, 'a recording for music-theory/… does not apply to a vault named some-other-vault');
  assert.match(bad.stderr, /no recorded engine Python/i);
});

test('CLI: a refusal exits 2 and names the note and the reason; a missing file exits 2; no arguments is a usage error', () => {
  const t = makeVault();
  fs.writeFileSync(t.rec, JSON.stringify(recordingFor(CHORUS, { python: DEFAULT_PYTHON_STUB })));
  const refused = cli(t.vault, '--recording', t.rec, t.note);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /chorus\.md/);
  assert.match(refused.stderr, /stub/i);
  assert.equal(cli(t.vault, '--recording', t.rec, path.join(t.vault, 'nope.md')).status, 2);
  assert.equal(cli(t.vault).status, 2);
});
