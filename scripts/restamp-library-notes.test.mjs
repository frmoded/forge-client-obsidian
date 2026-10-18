// Drain 2026-10-18-1200 §2 — restamp a SHIPPED library note to exactly what the plugin would write, at the source.
//
// Why it exists: the open-time-writes gate (scripts/check-open-time-writes.mjs) went red on four notes after the lineage root became the
// note's stored source facet (drain 2026-10-15-2100). Those four were stamped by the OLD rule (`synced` read as Description), so a
// `source_facet: recipe` note shipped with its Description hash as `python_derived_from_source_hash`; the corrected writer wants the Recipe
// hash. The fix lives at the SOURCE vault, and the way to produce "exactly what the plugin would write" is to ask the plugin's own
// functions — never a hand edit — and to ask them until they stop changing the note.
//
// Fixtures are the verbatim live artifacts (test/fixtures/vault): the old fix_me.md and the unstamped slow_burn/chorus.md as shipped in
// forge-tutorial a844084 / music-theory 1add308. A pinned fixture, never the moving tree (a test that uses HEAD as its "before" expires
// the moment the source is fixed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { restampNote } from './restamp-library-notes-core.mjs';
import { auditNote } from './check-open-time-writes-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fx = (n) => fs.readFileSync(path.join(__dirname, '..', 'test/fixtures/vault', n), 'utf8');
const OLD_LINEAGE = fx('shipped_recipe_source_description_rooted_lineage.md');
const UNSTAMPED = fx('shipped_unstamped_slow_burn_chorus.md');
const CLEAN = fx('shipped_scale_quality_quiz_fully_derived.md');
const CLI = path.join(__dirname, 'restamp-library-notes.mjs');
const cli = (...args) => spawnSync(process.execPath, ['--no-warnings', '--experimental-strip-types', CLI, ...args], { encoding: 'utf8' });
const fm = (b, k) => new RegExp(`^${k}: (.*)$`, 'm').exec(b)?.[1] ?? null;
const bodyOf = (b) => b.replace(/^---\n[\s\S]*?\n---\n/, '');
const section = (b, h) => new RegExp(`^# ${h}\\n([\\s\\S]*?)(?=^# |$(?![\\s\\S]))`, 'm').exec(b)?.[1] ?? null;

async function assertClean(note, label) {
  for (const libraryGated of [true, false]) {
    const r = await auditNote(note, { libraryGated });
    assert.deepEqual({ open: r.open, run: r.run }, { open: [], run: [] }, `${label}: nothing written (${libraryGated ? 'as a bundled-library note' : 'opened in an authoring vault'})`);
  }
}

test('the founding artifact: the old fix_me is flagged on Run, and restamping re-roots ONLY the lineage line at the Recipe hash', async () => {
  const before = await auditNote(OLD_LINEAGE, { libraryGated: true });
  assert.deepEqual(before.run, ['rewrites # Python / python_hash / lineage / english_hash'], 'the premise: the gate flags it');
  const r = await restampNote(OLD_LINEAGE);
  assert.equal(r.changed, true);
  assert.equal(fm(r.next, 'python_derived_from_source_hash'), fm(OLD_LINEAGE, 'recipe_hash'), 'source_facet: recipe → the lineage root is the RECIPE hash');
  const a = OLD_LINEAGE.split('\n'), b = r.next.split('\n');
  assert.equal(a.length, b.length);
  assert.deepEqual(a.map((l, i) => (l === b[i] ? null : i)).filter((i) => i !== null).length, 1, 'exactly one line differs');
  assert.equal(bodyOf(r.next), bodyOf(OLD_LINEAGE), 'Description, Recipe and Python text are byte-identical');
  await assertClean(r.next, 'restamped fix_me');
});

test('an UNSTAMPED shipped note (slow_burn/chorus): restamping gives it every stamp the plugin would, and the result is a fixed point', async () => {
  const before = await auditNote(UNSTAMPED, { libraryGated: true });
  assert.ok(before.run.length > 0, 'the premise: the gate flags it');
  const r = await restampNote(UNSTAMPED);
  assert.equal(r.changed, true);
  for (const k of ['description_hash', 'recipe_hash', 'python_hash', 'source_facet', 'python_derived_from_source_hash']) assert.notEqual(fm(r.next, k), null, k);
  for (const h of ['Description', 'Recipe']) assert.equal(section(r.next, h), section(UNSTAMPED, h), `# ${h} is untouched`);
  assert.equal(section(r.next, 'Python')?.trim(), section(UNSTAMPED, 'Python')?.trim(), 'and so is the Python text');
  await assertClean(r.next, 'restamped chorus');
});

test('idempotent, and a note that is already what the plugin would write is returned byte-for-byte', async () => {
  for (const note of [OLD_LINEAGE, UNSTAMPED]) {
    const once = await restampNote(note);
    const twice = await restampNote(once.next);
    assert.equal(twice.changed, false);
    assert.equal(twice.next, once.next);
  }
  const clean = await restampNote(CLEAN);
  assert.equal(clean.changed, false, 'no-op stays no-op');
  assert.equal(clean.next, CLEAN);
});

test('a Description-source note keeps its Description root (the other half of the rule)', async () => {
  const note = OLD_LINEAGE.replace('source_facet: recipe', 'source_facet: description');
  const r = await restampNote(note);
  assert.equal(fm(r.next, 'python_derived_from_source_hash'), fm(note, 'description_hash'));
  assert.equal(r.changed, false, 'its stamps already say so');
});

test('notes the plugin\'s writers skip (data notes, non-V2 notes) are returned untouched', async () => {
  const data = '---\ntype: data\ncontent_type: json\n---\n\n```json\n{}\n```\n';
  const r = await restampNote(data);
  assert.deepEqual({ changed: r.changed, next: r.next }, { changed: false, next: data });
  const v1 = '---\ntype: action\n---\n\nPrint "hello".\n';
  assert.equal((await restampNote(v1)).changed, false);
});

test('a note that does not settle is an error, not a silent half-restamp', async () => {
  await assert.rejects(() => restampNote(UNSTAMPED, { maxPasses: 0 }), /did not reach a fixed point/);
});

test('a fixed point is CONFIRMED, not assumed: one pass that still changes the note cannot be reported as done', async () => {
  await assert.rejects(() => restampNote(UNSTAMPED, { maxPasses: 1 }), /did not reach a fixed point/, 'pass 1 changed it; nothing confirmed it stopped');
  const ok = await restampNote(UNSTAMPED, { maxPasses: 2 });
  assert.equal(ok.changed, true);
});

test('the layout-ready sweep is part of it: a legacy note (canonical_facet, no v11.6 parent hash) is migrated the way the plugin migrates it', async () => {
  const legacy = OLD_LINEAGE
    .replace('source_facet: recipe', 'canonical_facet: recipe')
    .replace(/^recipe_derived_from_description_hash: .*\n/m, '')
    .replace(/^python_derived_from_recipe_hash: .*\n/m, '');
  assert.equal(fm(legacy, 'source_facet'), null);
  const r = await restampNote(legacy);
  assert.equal(fm(r.next, 'source_facet'), 'recipe', 'the new field name');
  assert.equal(fm(r.next, 'canonical_facet'), null, 'the legacy name is dropped');
  assert.notEqual(fm(r.next, 'recipe_derived_from_description_hash'), null, 'the v11.6 parent hash is seeded');
  assert.equal(fm(r.next, 'python_derived_from_source_hash'), fm(legacy, 'recipe_hash'), 'and a recipe-source note is rooted at the Recipe');
  await assertClean(r.next, 'migrated legacy note');
});

test('with the backfill isolated, the layout-ready sweep alone still migrates a legacy note (step 2 is real, just shadowed by step 1 today)', async () => {
  const legacy = OLD_LINEAGE.replace('source_facet: recipe', 'canonical_facet: recipe');
  const noBackfill = async (b) => ({ changed: false, newBody: b, actions: {} });
  const r = await restampNote(legacy, { backfill: noBackfill });
  assert.equal(fm(r.next, 'source_facet'), 'recipe');
  assert.equal(fm(r.next, 'canonical_facet'), null);
});

test('CLI: --check lists the notes that would change (exit 1) and passes clean ones (0); without it the files are rewritten in place', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'restamp-'));
  const bad = path.join(dir, 'bad.md'), good = path.join(dir, 'good.md');
  fs.writeFileSync(bad, OLD_LINEAGE); fs.writeFileSync(good, CLEAN);
  const check = cli('--check', bad, good);
  assert.equal(check.status, 1);
  assert.match(check.stdout, /bad\.md/);
  assert.doesNotMatch(check.stdout, /good\.md/);
  assert.equal(fs.readFileSync(bad, 'utf8'), OLD_LINEAGE, '--check never writes');
  assert.equal(cli('--check', good).status, 0);
  const write = cli(bad, good);
  assert.equal(write.status, 0);
  assert.match(write.stdout, /restamped .*bad\.md/);
  assert.notEqual(fs.readFileSync(bad, 'utf8'), OLD_LINEAGE);
  assert.equal(fs.readFileSync(good, 'utf8'), CLEAN, 'a clean note is not touched');
  assert.equal(cli('--check', bad, good).status, 0, 'and after the write, --check agrees');
  assert.equal(cli('--check', path.join(dir, 'missing.md')).status, 2, 'a missing file is exit 2 — a typo must not read as clean');
  assert.equal(cli().status, 2, 'no files is a usage error');
});
