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

// ---- Drain 2026-10-18-1200 ------------------------------------------------------------------------------------------------------

const OLD_LINEAGE = fs.readFileSync(path.join(__dirname, '..', 'test/fixtures/vault/shipped_recipe_source_description_rooted_lineage.md'), 'utf8');

test('the gate is STRICT about lineage: a recipe-source library note stamped with the DESCRIPTION hash (the pre-2026-10-15 stamp) is flagged on Run; rooted at the Recipe it is clean', async () => {
  // This is the case that turned the gate red on four shipped notes. The gate asks "would the plugin's Run writer change this note?";
  // a note carrying the stamp the writer used to produce answers yes, and that is the signal to restamp it at the source
  // (scripts/restamp-library-notes.mjs) rather than to loosen the gate.
  const flagged = await auditNote(OLD_LINEAGE, { libraryGated: true });
  assert.deepEqual(flagged.run, ['rewrites # Python / python_hash / lineage / english_hash']);
  const rerooted = OLD_LINEAGE.replace(/^python_derived_from_source_hash: .*$/m, `python_derived_from_source_hash: ${/^recipe_hash: (.*)$/m.exec(OLD_LINEAGE)[1]}`);
  const clean = await auditNote(rerooted, { libraryGated: true });
  assert.deepEqual({ open: clean.open, run: clean.run }, { open: [], run: [] });
});

// The verdict must come from assets/vaults ALONE. The sync mirrors each source repo's HEAD (never its working tree), so the bundle cannot
// carry anyone's uncommitted edits — and the gate must not look anywhere else. Both halves are pinned: the behaviour (a sibling checkout
// with a different note makes no difference) and the mechanism (the script names no path outside its own root and starts no process).
function gateTree(siblings) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'otw-tree-'));
  const client = path.join(root, 'forge-client-obsidian');
  fs.mkdirSync(path.join(client, 'scripts'), { recursive: true });
  for (const f of ['check-open-time-writes.mjs', 'check-open-time-writes-core.mjs', 'engine-recording.mjs']) fs.copyFileSync(path.join(__dirname, f), path.join(client, 'scripts', f));
  fs.symlinkSync(path.join(__dirname, '..', 'src'), path.join(client, 'src'));
  const book = path.join(client, 'assets', 'vaults', 'music-theory', 'exercises');
  fs.mkdirSync(book, { recursive: true });
  fs.writeFileSync(path.join(book, 'good.md'), DERIVED);
  fs.writeFileSync(path.join(client, 'scripts', 'open-time-readonly.txt'), 'music-theory/exercises/good.md\n');
  for (const [rel, body] of Object.entries(siblings)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return { root, client };
}
const runGate = (client, cwd) => spawnSync(process.execPath, ['--no-warnings', '--experimental-strip-types', path.join(client, 'scripts', 'check-open-time-writes.mjs')], { encoding: 'utf8', cwd });

test('the gate\'s verdict does not depend on ../music-theory (or any sibling checkout): same output with no sibling, a poisoned sibling, and a sibling that is a different version of the same note', () => {
  const none = gateTree({});
  const poisoned = gateTree({
    'music-theory/exercises/good.md': WITHOUT_PYTHON,                       // the SAME path, a note the gate would flag
    'music-theory/exercises/other.md': WITHOUT_PYTHON,
    'forge-tutorial/exercises/good.md': WITHOUT_PYTHON,
  });
  const baseline = runGate(none.client, none.client);
  assert.equal(baseline.status, 0, baseline.stderr);
  assert.match(baseline.stdout, /ok \(1 required read-only note/);
  for (const cwd of [poisoned.client, path.join(poisoned.root, 'music-theory'), poisoned.root]) {
    const r = runGate(poisoned.client, cwd);
    assert.equal(r.status, baseline.status, `cwd ${cwd}`);
    assert.equal(r.stdout, baseline.stdout);
    assert.equal(r.stderr, baseline.stderr);
  }
});

test('non-vacuity: the same tree WITH a flagged note in assets/vaults IS red — the independence test is not just "always green"', () => {
  const t = gateTree({});
  fs.writeFileSync(path.join(t.client, 'assets', 'vaults', 'music-theory', 'exercises', 'good.md'), WITHOUT_PYTHON);
  const r = runGate(t.client, t.client);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /WRITES\s+music-theory\/exercises\/good\.md/);
});

test('MECHANISM pin: the gate names no path outside its own root and runs no other process (if either changes, reassess independence — do not just rewrite)', () => {
  for (const f of ['check-open-time-writes.mjs', 'check-open-time-writes-core.mjs', 'engine-recording.mjs']) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /child_process|execSync|spawn|git /, `${f} starts no process`);
    assert.doesNotMatch(src, /["']\.\.["']\s*,\s*["']music|projects\/|homedir|process\.env\.HOME/i, `${f} names no sibling checkout`);
  }
  const main = fs.readFileSync(path.join(__dirname, 'check-open-time-writes.mjs'), 'utf8');
  assert.match(main, /path\.join\(ROOT, "assets", "vaults"\)/, 'the default scan is exactly assets/vaults under its own root');
});
