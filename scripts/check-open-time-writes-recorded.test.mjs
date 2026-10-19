// Drain 2026-10-19-1530 — the open-time-writes gate's RECORDED-ENGINE mode. The gate used to model "Run" by feeding the writer the note's OWN
// Python, which can never see whether the engine's transpile equals what ships (Iteration 82 §2.3: 5 notes on the "Run writes nothing" ratchet
// would still be rewritten by a real Run). It now models Run with the Python the REAL engine returned, recorded by scripts/record-engine-transpile.py
// into test/fixtures/engine-transpile/shipped-notes.json, and refuses to run on a recording that is stale relative to the bundled engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { auditNote, auditVault, parseRequiredList } from './check-open-time-writes-core.mjs';
import { engineBundleDigest, loadRecording, recordedPythonFor, recordingProblems } from './engine-recording.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(__dirname, 'check-open-time-writes.mjs');
const ENGINE_DIR = path.join(ROOT, 'assets', 'engine', 'forge');
const RECORDING = loadRecording(path.join(ROOT, 'test', 'fixtures', 'engine-transpile', 'shipped-notes.json'));
const HELLO = 'forge-tutorial/01-hello/hello_world';
const TRIAD = 'music-theory/exercises/build_triad';
const cli = (...args) => spawnSync(process.execPath, ['--no-warnings', '--experimental-strip-types', CLI, ...args], { encoding: 'utf8' });
const noteOf = (rel) => RECORDING.notes[rel].note;
// Drain 2026-10-20-1100: build_triad was re-derived (Phase B), so the recording's `note` is now clean. The "a note whose Python is not what the engine produces" exemplar
// is therefore the PINNED pre-Phase-B bytes (music-theory baf108d: `def compute(context):` — the signature lacks the inputs), never the moving recording.
const NOT_DERIVED_TRIAD = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'vault', 'shipped_not_derived_build_triad_signature_lacks_inputs.md'), 'utf8');
function vaultNamed(name, files) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'otwr-'));
  const root = path.join(base, name);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return root;
}
function copyEngine() {
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), 'otwr-engine-'));
  fs.cpSync(ENGINE_DIR, dst, { recursive: true });
  return dst;
}

test('engineBundleDigest: deterministic, sensitive to an in-scope file, blind to an out-of-scope one (non-vacuity both ways)', () => {
  const a = engineBundleDigest(ENGINE_DIR);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(engineBundleDigest(ENGINE_DIR), a);
  const copy = copyEngine();
  assert.equal(engineBundleDigest(copy), a, 'a byte-identical copy digests the same');
  fs.mkdirSync(path.join(copy, 'api'), { recursive: true });
  fs.writeFileSync(path.join(copy, 'api', 'x.py'), 'not shipped\n');
  assert.equal(engineBundleDigest(copy), a, 'api/ is out of scope (the sync script does not bundle it)');
  fs.appendFileSync(path.join(copy, 'music', 'lib.py'), '\n# one more line\n');
  assert.notEqual(engineBundleDigest(copy), a, 'an in-scope engine file changed');
});

test('THE STALENESS GUARD: the recorded fixture is current against the bundled engine and the shipped Recipes — else re-record', () => {
  assert.deepEqual(recordingProblems(RECORDING, { engineDir: ENGINE_DIR, vaultsDir: path.join(ROOT, 'assets', 'vaults') }), []);
});

test('a recording made against a DIFFERENT engine is refused, with the command that fixes it', () => {
  const copy = copyEngine();
  fs.appendFileSync(path.join(copy, 'music', 'lib.py'), '\n# the engine moved on\n');
  const problems = recordingProblems(RECORDING, { engineDir: copy });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /stale/i);
  assert.match(problems[0], /record-engine-transpile\.py/);
});

test('a note whose Recipe changed since it was recorded is reported and its recorded Python is NOT used', () => {
  const tampered = structuredClone(RECORDING);
  tampered.notes[HELLO].recipe += '\nPrint "changed".';
  const vaults = fs.mkdtempSync(path.join(os.tmpdir(), 'otwr-vaults-'));
  const note = path.join(vaults, `${HELLO}.md`);
  fs.mkdirSync(path.dirname(note), { recursive: true });
  fs.writeFileSync(note, noteOf(HELLO));
  const problems = recordingProblems(tampered, { vaultsDir: vaults });
  assert.ok(problems.some((p) => p.includes(HELLO) && /recipe/i.test(p)), problems.join('\n'));
  assert.equal(recordedPythonFor(tampered, HELLO, noteOf(HELLO)), null, 'a recording of a different Recipe proves nothing');
  assert.equal(typeof recordedPythonFor(RECORDING, HELLO, noteOf(HELLO)), 'string');
});

test('auditNote with the ENGINE\'s Python: hello_world is clean, build_triad is not (its Python is not what the engine produces)', async () => {
  assert.deepEqual(await auditNote(noteOf(HELLO), { libraryGated: true, enginePython: RECORDING.notes[HELLO].python }), { applies: true, open: [], run: [] });
  const triad = await auditNote(NOT_DERIVED_TRIAD, { libraryGated: true, enginePython: RECORDING.notes[TRIAD].python });
  assert.equal(triad.run.length, 1);
  assert.match(triad.run[0], /engine/i);
  // the OLD model — the note's own Python — called the same note clean: the blind spot this mode closes
  assert.deepEqual(await auditNote(NOT_DERIVED_TRIAD, { libraryGated: true }), { applies: true, open: [], run: [] });
  // and the re-derived build_triad (what ships now) is clean under the engine's Python: the gate agrees with the fix
  assert.deepEqual(await auditNote(noteOf(TRIAD), { libraryGated: true, enginePython: RECORDING.notes[TRIAD].python }), { applies: true, open: [], run: [] });
});

test('auditNote without a recording is the old model, unchanged (the fallback is explicit, not silent: see auditVault.unrecorded)', async () => {
  assert.deepEqual(await auditNote(noteOf(HELLO), { libraryGated: true }), { applies: true, open: [], run: [] });
});

test('auditVault in recorded mode: only the not-derived note writes; a note with no recording is modelled the old way AND listed as unrecorded', async () => {
  const unrecorded = noteOf(HELLO).replace('hello_world', 'hello_worlds'); // same bytes under a name the recording does not know
  const dir = vaultNamed('music-theory', { 'exercises/build_triad.md': NOT_DERIVED_TRIAD, 'exercises/orphan.md': unrecorded });
  const r = await auditVault(dir, { libraryGated: true, recording: RECORDING });
  assert.deepEqual(r.writing.map((w) => w.path), ['exercises/build_triad.md']);
  assert.deepEqual(r.unrecorded, ['exercises/orphan.md']);
});

test('CLI: a REQUIRED note the engine would rewrite fails the gate with the engine named; with --no-recording the old model passes it', () => {
  const dir = vaultNamed('music-theory', { 'exercises/build_triad.md': NOT_DERIVED_TRIAD });
  const withRec = cli('--require', TRIAD + '.md', '--recording', path.join(ROOT, 'test', 'fixtures', 'engine-transpile', 'shipped-notes.json'), dir);
  assert.equal(withRec.status, 1, withRec.stdout + withRec.stderr);
  assert.match(withRec.stderr, /WRITES\s+music-theory\/exercises\/build_triad\.md/);
  assert.match(withRec.stderr, /engine/i);
  const old = cli('--require', TRIAD + '.md', '--no-recording', dir);
  assert.equal(old.status, 0, old.stdout + old.stderr);
});

test('CLI: a stale recording FAILS the gate before any note is judged (exit 1, re-record hint)', () => {
  const stale = structuredClone(RECORDING);
  stale.engine_bundle_digest = '0'.repeat(64);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'otwr-rec-')), 'rec.json');
  fs.writeFileSync(file, JSON.stringify(stale));
  const dir = vaultNamed('forge-tutorial', { '01-hello/hello_world.md': noteOf(HELLO) });
  const r = cli('--recording', file, '--engine-dir', ENGINE_DIR, '--require', HELLO + '.md', dir);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /stale/i);
  assert.match(r.stderr, /record-engine-transpile\.py/);
});

test('THE RATCHET CLAIM MATCHES WHAT A REAL RUN DOES: every required note that has a recording is clean under the engine\'s own Python', async () => {
  const required = parseRequiredList(fs.readFileSync(path.join(ROOT, 'scripts', 'open-time-readonly.txt'), 'utf8')).map((r) => r.replace(/\.md$/, ''));
  const offenders = [];
  let checked = 0;
  for (const rel of required) {
    const rec = RECORDING.notes[rel];
    if (!rec || typeof rec.note !== 'string') continue;
    checked++;
    const r = await auditNote(rec.note, { libraryGated: true, enginePython: rec.python });
    if (r.open.length || r.run.length) offenders.push(`${rel}: ${[...r.open, ...r.run].join('; ')}`);
  }
  assert.ok(checked >= 15, `only ${checked} required notes have a recording`);
  assert.deepEqual(offenders, []);
});

test('THE REAL BUNDLE GATE runs in recorded mode by default (no flags) and says so — a gate that silently fell back to the old model would be green for the wrong reason', () => {
  const r = cli();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Run modelled with the engine's recorded output/);
  assert.match(r.stdout, /ok \(\d+ required read-only note/);
  const old = cli('--no-recording');
  assert.equal(old.status, 0, old.stdout + old.stderr);
  assert.match(old.stdout, /no engine recording/);
});
