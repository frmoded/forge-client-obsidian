// Drain 2026-10-13-2100 §2/§5 — the open-time-writes gate (report + ratchet). The decisions themselves are the plugin's own
// functions (backfillV113Shape, planOpenSeed, applyPythonWriteBack), each tested where it lives; THIS pins what the gate builds on
// them: that it names the right writes, that it fails only for REQUIRED notes, and that a typo cannot read as clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { auditNote, auditVault, parseRequiredList } from './check-open-time-writes-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, 'check-open-time-writes.mjs');
const DERIVED = fs.readFileSync(path.join(__dirname, '..', 'test/fixtures/vault/shipped_scale_quality_quiz_fully_derived.md'), 'utf8');
const WITHOUT_PYTHON = DERIVED.replace(/\n# Python\n[\s\S]*$/, '\n');

function vaultWith(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'otw-'));
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return root;
}
const cli = (...args) => spawnSync(process.execPath, ['--no-warnings', '--experimental-strip-types', CLI, ...args], { encoding: 'utf8' });

test('a fully derived note writes nothing; the same note without # Python names the stub insert and the Run write', async () => {
  assert.deepEqual(await auditNote(DERIVED), { applies: true, open: [], run: [] });
  const r = await auditNote(WITHOUT_PYTHON);
  assert.ok(r.open.some((x) => /inserts a stub # Python/.test(x)));
  assert.ok(r.open.some((x) => /voids python_hash/.test(x)), 'the stale lineage claims are voided on open');
  assert.deepEqual(r.run, ['adds a # Python section (none shipped)']);
});

test('a bundled-library note is NEVER written on open (drain 2026-10-14-0900 §2): only the Run-time write remains', async () => {
  const gated = await auditNote(WITHOUT_PYTHON, { libraryGated: true });
  assert.deepEqual(gated.open, []);
  assert.deepEqual(gated.run, ['adds a # Python section (none shipped)']);
  // the identical note in an AUTHORING vault still reads as written on open — the gate is the library dir, not a blanket skip
  assert.ok((await auditNote(WITHOUT_PYTHON, { libraryGated: false })).open.length > 0);
});

test('library gating also silences the layout-ready sweep (the second open-time writer)', async () => {
  const unseeded = DERIVED.replace(/^recipe_derived_from_description_hash: .*\n/m, '');
  assert.deepEqual((await auditNote(unseeded, { libraryGated: true })).open, []);
  assert.deepEqual((await auditNote(unseeded, { libraryGated: false })).open, ['seeds recipe_derived_from_description_hash']);
});

test('the layout-ready sweep is audited too: with the backfill isolated, a missing v11.6 parent hash is flagged on open', async () => {
  assert.match(DERIVED, /^recipe_derived_from_description_hash: /m);
  const unseeded = DERIVED.replace(/^recipe_derived_from_description_hash: .*\n/m, '');
  assert.notEqual(unseeded, DERIVED);
  const noBackfill = { backfill: async (b) => ({ changed: false, newBody: b, actions: {} }) };
  assert.deepEqual((await auditNote(unseeded, noBackfill)).open, ['seeds recipe_derived_from_description_hash']);
  // and in production order the backfill gets there first and names the same write
  assert.deepEqual((await auditNote(unseeded)).open, ['seeds recipe_derived_from_description_hash']);
});

test('the backfill\'s own seeds are named, not summarised as "rewrites the body"', async () => {
  assert.deepEqual((await auditNote(DERIVED.replace(/^source_facet: .*\n/m, ''))).open, ['seeds source_facet: synced']);
  assert.deepEqual((await auditNote(DERIVED.replace(/^source_facet: /m, 'canonical_facet: '))).open, ['seeds source_facet: description']);
});

test('notes the open-time writers skip are not audited (data notes, non-V2 notes)', async () => {
  assert.equal((await auditNote('---\ntype: data\n---\n\n# Description\n\nA list.\n\n# Body\n\n[1]\n')).applies, false);
  assert.equal((await auditNote('just prose, no frontmatter\n')).applies, false);
});

test('auditVault lists only the notes that write, with vault-relative posix paths, skipping dot-dirs', async () => {
  const root = vaultWith({
    'exercises/good.md': DERIVED,
    'exercises/bad.md': WITHOUT_PYTHON,
    '.obsidian/plugins/x/bad.md': WITHOUT_PYTHON,
    'notes/prose.md': '# just prose\n',
  });
  const r = await auditVault(root);
  assert.equal(r.applicable, 2);
  assert.deepEqual(r.writing.map((w) => w.path), ['exercises/bad.md']);
});

test('parseRequiredList ignores comments and blanks', () => {
  assert.deepEqual(parseRequiredList('# c\n\nmusic-theory/a.md # trailing\n  music-theory/b.md  \n'), ['music-theory/a.md', 'music-theory/b.md']);
});

test('CLI: --report exits 0 even when notes would write, and lists them', () => {
  const root = vaultWith({ 'exercises/bad.md': WITHOUT_PYTHON });
  const r = cli('--report', root);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /bad\.md/);
  assert.match(r.stdout, /1 of 1 action note/);
});

test('CLI: a REQUIRED note that would write fails (1) and names why; a clean one passes (0)', () => {
  const root = vaultWith({ 'exercises/bad.md': WITHOUT_PYTHON, 'exercises/good.md': DERIVED });
  const name = path.basename(root);
  const bad = cli('--as-source-vault', '--require', `${name}/exercises/bad.md`, root);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /WRITES\s+.*exercises\/bad\.md/);
  assert.match(bad.stderr, /on open: inserts a stub # Python/);
  assert.match(bad.stderr, /on run:\s+adds a # Python section/);
  // the same note audited as a BUNDLED-LIBRARY note (the default): opening writes nothing; only Run can
  const lib = cli('--require', `${name}/exercises/bad.md`, root);
  assert.equal(lib.status, 1);
  assert.doesNotMatch(lib.stderr, /on open:/);
  assert.match(lib.stderr, /on run:\s+adds a # Python section/);
  const good = cli('--require', `${name}/exercises/good.md`, root);
  assert.equal(good.status, 0);
});

test('CLI: a note that writes but is NOT required does not fail the gate', () => {
  const root = vaultWith({ 'exercises/bad.md': WITHOUT_PYTHON, 'exercises/good.md': DERIVED });
  const r = cli('--require', `${path.basename(root)}/exercises/good.md`, root);
  assert.equal(r.status, 0);
});

test('CLI: a required note that is not there is exit 2 — a typo must not read as clean', () => {
  const root = vaultWith({ 'exercises/good.md': DERIVED });
  const r = cli('--require', `${path.basename(root)}/exercises/nope.md`, root);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /MISSING/);
});

test('CLI: a missing vault directory is exit 2', () => {
  assert.equal(cli('--report', '/no/such/dir/anywhere').status, 2);
});

test('CLI: --list-clean prints exactly the audited notes that would not be written, as <vault>/<path> lines', () => {
  const root = vaultWith({ 'exercises/good.md': DERIVED, 'exercises/bad.md': WITHOUT_PYTHON, 'notes/prose.md': '# just prose\n' });
  const r = cli('--list-clean', root);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), `${path.basename(root)}/exercises/good.md`);
});
