// v0.2.76 — tests for the forge-tutorial bundle wiring.
//
// Verifies:
// 1. The bundled forge-tutorial dir exists with required files.
// 2. `isSourceVault` recognizes a forge-tutorial source repo so the
//    welcome.ts gate fires.
// 3. `sync-bundled-vault.mjs` is idempotent (no-op on clean tree).
// 4. The build-release-zip drift check catches a forced drift.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { isSourceVault } from './source-vault-core.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const BUNDLE_DIR = path.join(REPO, 'assets', 'vaults', 'forge-tutorial');

test('forge-tutorial bundle: required files present', () => {
  // Smoke check that sync-bundled-vault has been run for tutorial.
  // Without these, ensureBundledForgeTutorial silently no-ops with a
  // warning (per ensureBundledVault's "no source" path).
  const required = [
    'forge.toml',
    'README.md',
    '_meta/_chips.md',
    '01-hello/Hello.md',
    '01-hello/hello_world.md',
    '09-slots/Slots.md',
  ];
  for (const rel of required) {
    const p = path.join(BUNDLE_DIR, rel);
    assert.ok(
      fs.existsSync(p),
      `Bundled forge-tutorial missing ${rel}. Run: npm run sync-bundled-vaults`,
    );
  }
});

test('forge-tutorial bundle: forge.toml declares correct name', () => {
  const body = fs.readFileSync(path.join(BUNDLE_DIR, 'forge.toml'), 'utf8');
  assert.match(
    body,
    /name\s*=\s*"forge-tutorial"/,
    'Bundled forge-tutorial/forge.toml must declare name = "forge-tutorial".',
  );
});

test('isSourceVault: recognizes forge-tutorial as a source repo', () => {
  // When the user opens ~/projects/forge-tutorial/ as a vault, the
  // forge.toml's `name = "forge-tutorial"` plus inclusion in
  // KNOWN_BUNDLED_LIBRARIES should make isSourceVault return the
  // matched name — driving the gate in welcome.ts to skip
  // ensureBundledForgeTutorial so the source repo doesn't get
  // bundled content extracted INTO it.
  const knownLibs = new Set(['forge-moda', 'forge-music', 'forge-tutorial']);
  const tomlBody = 'name = "forge-tutorial"\nversion = "0.1.0"\n';
  assert.equal(isSourceVault(tomlBody, knownLibs), 'forge-tutorial');
});

test('isSourceVault: non-source vault does NOT trigger gate', () => {
  const knownLibs = new Set(['forge-moda', 'forge-music', 'forge-tutorial']);
  const tomlBody = 'name = "my-vault"\nversion = "1.0"\n';
  assert.equal(isSourceVault(tomlBody, knownLibs), null);
});

test('sync-bundled-vault: idempotent — second run produces no changes', () => {
  // Run sync twice; second invocation MUST produce "0 added, 0 updated".
  // This catches regressions in the diff logic (e.g. writing files
  // unconditionally) that would make the drift check trip every release.
  const sourceRoot = path.resolve(REPO, '..', 'forge-tutorial');
  if (!fs.existsSync(sourceRoot)) {
    console.log(
      'sync-bundled-vault idempotence test: skipped (no sibling forge-tutorial repo).',
    );
    return;
  }
  const script = path.join(REPO, 'scripts', 'sync-bundled-vault.mjs');
  // First run.
  execSync(`node ${script} forge-tutorial`, { cwd: REPO, stdio: 'pipe' });
  // Second run — must be a clean no-op.
  const out = execSync(`node ${script} forge-tutorial`, {
    cwd: REPO, encoding: 'utf8',
  });
  assert.match(
    out,
    /0 added, 0 updated/,
    `Second sync run was not a no-op. Output:\n${out}`,
  );
});

test('sync-bundled-vault: drift detection catches forced edit', () => {
  // Force a drift: copy the bundled forge.toml to a tmp file, modify the
  // bundled one, run the drift check, verify it exits non-zero, restore.
  // Uses build-release-zip.mjs's preflight via a controlled subprocess.
  const sourceRoot = path.resolve(REPO, '..', 'forge-tutorial');
  if (!fs.existsSync(sourceRoot)) {
    console.log(
      'sync-bundled-vault drift test: skipped (no sibling forge-tutorial repo).',
    );
    return;
  }
  const bundledToml = path.join(BUNDLE_DIR, 'forge.toml');
  const backup = path.join(os.tmpdir(), 'forge-tutorial-toml.bak');
  fs.copyFileSync(bundledToml, backup);
  try {
    // Append a stray line to force drift.
    fs.appendFileSync(bundledToml, '\n# DRIFT_TEST_MARKER\n');
    let detected = false;
    try {
      // Build-release-zip runs the preflight; if drift is detected, it
      // exits 1. Capture stderr.
      execSync('node scripts/build-release-zip.mjs', {
        cwd: REPO, stdio: 'pipe',
      });
    } catch (e) {
      const stderr = String((e as { stderr?: Buffer }).stderr ?? '');
      if (
        stderr.includes('BUNDLED-VAULT DRIFT DETECTED') &&
        stderr.includes('forge-tutorial')
      ) {
        detected = true;
      }
    }
    assert.ok(
      detected,
      'Bundled-vault drift check did not flag the forced edit. ' +
      'The release-preflight protection is silently skipped.',
    );
  } finally {
    // Restore — must run regardless of test outcome.
    fs.copyFileSync(backup, bundledToml);
    fs.unlinkSync(backup);
  }
});

test('KNOWN_BUNDLED_LIBRARIES coherence: welcome.ts + chips.ts agree', () => {
  // Read source files and assert both sets include 'forge-tutorial'.
  // Stops the welcome/chips dual-list from drifting again silently.
  const welcomeSrc = fs.readFileSync(
    path.join(REPO, 'src', 'welcome.ts'), 'utf8');
  const chipsSrc = fs.readFileSync(
    path.join(REPO, 'src', 'chips.ts'), 'utf8');
  for (const lib of ['forge-moda', 'forge-music', 'forge-tutorial']) {
    assert.match(
      welcomeSrc, new RegExp(`'${lib}'`),
      `welcome.ts KNOWN_BUNDLED_LIBRARIES missing ${lib}.`);
    assert.match(
      chipsSrc, new RegExp(`'${lib}'`),
      `chips.ts KNOWN_BUNDLED_LIBRARIES missing ${lib}.`);
  }
});
