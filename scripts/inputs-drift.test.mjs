// Drain 2026-08-16-0910 — the release preflight's `inputs:`-frontmatter
// drift gate.
//
// Two layers, on purpose:
//
//   1. Pure-core cases over `interpretCheckResult`, covering every exit
//      code and every spawn failure the real call can produce — including
//      the ones that are hard to stage for real (no Python on PATH).
//   2. Integration cases that actually spawn `stamp_inputs.py --check`
//      against fixture vaults on disk. These are the ones that prove the
//      gate isn't vacuous: a deliberately drifted note MUST turn it red.
//      Without that, "the check passes" only means "the check ran".
//
// The drifted fixture is built in a temp directory rather than by editing
// and reverting a bundled note — a test that mutates the repo is one
// interrupted run away from leaving drift behind.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  OUTCOME,
  interpretCheckResult,
  parseDriftingPaths,
  resolveInterpreter,
} from './inputs-drift-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STAMP_SCRIPT = path.resolve(ROOT, '..', 'forge', 'scripts', 'stamp_inputs.py');

// ------------------------------------------------------------ pure core

test('inputs-drift: exit 0 is clean', () => {
  const v = interpretCheckResult({ vaultName: 'forge-tutorial', vaultPath: '/x', status: 0 });
  assert.equal(v.ok, true);
  assert.equal(v.outcome, OUTCOME.CLEAN);
  assert.match(v.message, /clean/);
});

test('inputs-drift: exit 1 is drift, and the failing notes are named', () => {
  const v = interpretCheckResult({
    vaultName: 'forge-tutorial',
    vaultPath: '/x',
    status: 1,
    stdout: '  DRIFT: /x/03-functions/excited.md\n  DRIFT: /x/08-recursion/factorial.md\n',
  });
  assert.equal(v.ok, false);
  assert.equal(v.outcome, OUTCOME.DRIFT);
  assert.match(v.message, /excited\.md/);
  assert.match(v.message, /factorial\.md/);
  // A failure the reader can act on without going hunting.
  assert.match(v.message, /stamp_inputs\.py \/x/);
});

test('inputs-drift: a missing interpreter FAILS — it is never a silent skip', () => {
  const v = interpretCheckResult({
    vaultName: 'music-core',
    vaultPath: '/x',
    error: Object.assign(new Error('spawnSync python3 ENOENT'), { code: 'ENOENT' }),
  });
  assert.equal(v.ok, false);
  assert.equal(v.outcome, OUTCOME.INTERPRETER_MISSING);
  assert.match(v.message, /Python not found/);
  // The distinction the whole rule turns on.
  assert.match(v.message, /not a skip/i);
});

test('inputs-drift: exit 2 is reported as a usage error, not as drift', () => {
  const v = interpretCheckResult({
    vaultName: 'forge-moda',
    vaultPath: '/nope',
    status: 2,
    stderr: 'ERROR: not a directory: /nope',
  });
  assert.equal(v.ok, false);
  assert.equal(v.outcome, OUTCOME.USAGE_ERROR);
  assert.match(v.message, /not a directory/);
});

test('inputs-drift: an undocumented exit code fails loudly rather than passing', () => {
  const v = interpretCheckResult({ vaultName: 'x', vaultPath: '/x', status: 137 });
  assert.equal(v.ok, false);
  assert.equal(v.outcome, OUTCOME.UNKNOWN);
  assert.match(v.message, /137/);
});

test('inputs-drift: drift reported with no named paths still fails', () => {
  const v = interpretCheckResult({ vaultName: 'x', vaultPath: '/x', status: 1, stdout: '' });
  assert.equal(v.ok, false);
  assert.equal(v.outcome, OUTCOME.DRIFT);
});

test('inputs-drift: parseDriftingPaths reads the script\'s own line shape', () => {
  const stdout = [
    '  DRIFT: /v/a.md',
    '  all notes already carry the derived inputs: — nothing to do',
    '  DRIFT: /v/b.md',
    '',
  ].join('\n');
  assert.deepEqual(parseDriftingPaths(stdout), ['/v/a.md', '/v/b.md']);
});

test('inputs-drift: the venv interpreter wins when it exists, python3 otherwise', () => {
  assert.equal(resolveInterpreter('/f/.venv/bin/python', () => true), '/f/.venv/bin/python');
  assert.equal(resolveInterpreter('/f/.venv/bin/python', () => false), 'python3');
});

// ---------------------------------------------------------- integration

const NOTE_WITH_INPUT = `---
type: action
inputs:
  - word
---

# Description

Fixture.

# Recipe

Input word: str = "hooray".
Return word + "!".
`;

const NOTE_WITHOUT_INPUT = `---
type: action
---

# Description

No Input keyword anywhere — nothing for the pass to check.

# Recipe

Let x: int = 5.
Return x + 1.
`;

/** Spawn the real check the same way the preflight does. */
function runCheck(vaultPath) {
  const venv = path.resolve(ROOT, '..', 'forge', '.venv', 'bin', 'python');
  const interpreter = resolveInterpreter(venv, p => fs.existsSync(p));
  const r = spawnSync(interpreter, [STAMP_SCRIPT, '--check', vaultPath], { encoding: 'utf-8' });
  return interpretCheckResult({
    vaultName: path.basename(vaultPath),
    vaultPath,
    status: r.status,
    error: r.error,
    stdout: r.stdout,
    stderr: r.stderr,
  });
}

function tempVault(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inputs-drift-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  return dir;
}

const hasStampScript = fs.existsSync(STAMP_SCRIPT);
const skipIfNoScript = { skip: hasStampScript ? false : 'forge sibling repo not checked out' };

test('inputs-drift: a correctly stamped vault passes', skipIfNoScript, () => {
  const dir = tempVault({ 'a/excited.md': NOTE_WITH_INPUT });
  try {
    const v = runCheck(dir);
    assert.equal(v.ok, true, v.message);
    assert.equal(v.outcome, OUTCOME.CLEAN);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('inputs-drift: a DRIFTED note turns the gate red — the check is not vacuous',
  skipIfNoScript, () => {
    // Same note, but `inputs:` no longer agrees with the Recipe. This is
    // the case the gate exists for; if it passes, the gate is decoration.
    const drifted = NOTE_WITH_INPUT.replace('  - word', '  - wrongname');
    const dir = tempVault({ 'a/excited.md': drifted });
    try {
      const v = runCheck(dir);
      assert.equal(v.ok, false, 'a drifted note MUST fail the preflight');
      assert.equal(v.outcome, OUTCOME.DRIFT);
      assert.match(v.message, /excited\.md/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

test('inputs-drift: a vault with no Input-keyword notes passes cleanly, not skipped',
  skipIfNoScript, () => {
    const dir = tempVault({ 'a/letonly.md': NOTE_WITHOUT_INPUT });
    try {
      const v = runCheck(dir);
      assert.equal(v.ok, true, v.message);
      assert.equal(v.outcome, OUTCOME.CLEAN);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

test('inputs-drift: a path that is not a directory is a usage error', skipIfNoScript, () => {
  const v = runCheck(path.join(os.tmpdir(), 'inputs-drift-no-such-dir-9910'));
  assert.equal(v.ok, false);
  assert.equal(v.outcome, OUTCOME.USAGE_ERROR);
});

test('inputs-drift: every real bundled vault passes today', skipIfNoScript, () => {
  const names = fs.readFileSync(path.join(__dirname, 'vaults.txt'), 'utf8')
    .split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  assert.ok(names.length > 0);
  for (const name of names) {
    const v = runCheck(path.join(ROOT, 'assets', 'vaults', name));
    assert.equal(v.ok, true, `${name}: ${v.message}`);
  }
});
