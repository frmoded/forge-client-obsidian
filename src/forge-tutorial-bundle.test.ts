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

/** Build a throwaway mini-repo so the bundle tests never write to the
 *  SHIPPED `assets/vaults/`.
 *
 *  Both `sync-bundled-vault.mjs` and `build-release-zip.mjs` derive their
 *  root from their OWN `__dirname` (`const ROOT = path.resolve(__dirname,
 *  "..")`), not from `cwd` — so passing `cwd` cannot redirect them, and a
 *  symlinked `scripts/` cannot either, because Node resolves a module to
 *  its realpath before computing `import.meta.url`. `scripts/` therefore
 *  has to be a real copy; it is a handful of `.mjs` files plus
 *  `vaults.txt`, which those scripts read relative to their own dir.
 *
 *  Everything the scripts only READ is symlinked rather than copied —
 *  `assets/pyodide` alone is tens of megabytes. `assets/vaults` is the
 *  thing under test, so it is a real, writable copy.
 *
 *  Drain 2026-08-26-2130. */
function makeTempRepo(): { root: string; cleanup: () => void } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'fco-bundle-test-'));
  const root = path.join(base, 'repo');
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });

  fs.cpSync(path.join(REPO, 'scripts'), path.join(root, 'scripts'), { recursive: true });
  fs.cpSync(path.join(REPO, 'assets', 'vaults'), path.join(root, 'assets', 'vaults'), {
    recursive: true,
  });
  for (const child of fs.readdirSync(path.join(REPO, 'assets'))) {
    if (child === 'vaults') continue;
    fs.symlinkSync(path.join(REPO, 'assets', child), path.join(root, 'assets', child));
  }
  for (const f of ['main.js', 'manifest.json', 'styles.css', 'package.json', 'node_modules']) {
    const src = path.join(REPO, f);
    if (fs.existsSync(src)) fs.symlinkSync(src, path.join(root, f));
  }
  // The scripts resolve each source vault as `<root>/../<name>`, and the
  // engine drift check as `<root>/../forge/forge`. Symlink the real ones:
  // they are read-only for these tests.
  for (const sib of ['forge', 'forge-tutorial', 'forge-moda', 'music-theory', 'music-core']) {
    const src = path.resolve(REPO, '..', sib);
    if (fs.existsSync(src)) fs.symlinkSync(src, path.join(base, sib));
  }
  return { root, cleanup: () => fs.rmSync(base, { recursive: true, force: true }) };
}

test('forge-tutorial bundle: required files present', () => {
  // Smoke check that sync-bundled-vault has been run for tutorial.
  // Without these, ensureBundledForgeTutorial silently no-ops with a
  // warning (per ensureBundledVault's "no source" path).
  // v0.2.258 drain 1300 — _meta/_chips.md removed from required set;
  // palette auto-populates from action-note discovery (no `_chips.md`
  // schema anywhere in the tutorial bundle).
  const required = [
    'forge.toml',
    'README.md',
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
  // Drain 2026-08-26-2130 — against a temp copy, never the shipped bundle.
  const tmp = makeTempRepo();
  try {
    const script = path.join(tmp.root, 'scripts', 'sync-bundled-vault.mjs');
    // First run.
    execSync(`node ${script} forge-tutorial`, { cwd: tmp.root, stdio: 'pipe' });
    // Second run — must be a clean no-op.
    const out = execSync(`node ${script} forge-tutorial`, {
      cwd: tmp.root, encoding: 'utf8',
    });
    assert.match(
      out,
      /0 added, 0 updated/,
      `Second sync run was not a no-op. Output:\n${out}`,
    );
    // The script must have operated on the COPY. Grep-verify the positive:
    // the temp path is what it reported, not merely that the real one is absent.
    // realpath: macOS resolves /var -> /private/var, and the script prints
    // the resolved path. Comparing the unresolved one fails on a correct fix.
    const realTmp = fs.realpathSync(tmp.root);
    assert.ok(
      out.includes(`bundle: ${realTmp}`),
      `sync ran against a path that is not the temp copy. Output:\n${out}`,
    );
    assert.ok(
      !out.includes(`bundle: ${REPO}/assets`),
      'sync targeted the SHIPPED bundle',
    );
  } finally {
    tmp.cleanup();
  }
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
  // Drain 2026-08-26-2130 — the marker goes into a TEMP copy of the
  // bundle. Previously it was appended to the real shipped forge.toml with
  // only a `finally` protecting it, so a killed run (Ctrl-C, OOM, CI
  // timeout) left `# DRIFT_TEST_MARKER` inside the asset users install.
  // Now a killed run leaves a stray directory in /tmp instead.
  const tmp = makeTempRepo();
  const bundledToml = path.join(tmp.root, 'assets', 'vaults', 'forge-tutorial', 'forge.toml');
  try {
    // Append a stray line to force drift.
    fs.appendFileSync(bundledToml, '\n# DRIFT_TEST_MARKER\n');
    let detected = false;
    try {
      // Build-release-zip runs the preflight; if drift is detected, it
      // exits 1. Capture stderr.
      execSync('node scripts/build-release-zip.mjs', {
        cwd: tmp.root, stdio: 'pipe',
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
    // A throwaway tree: nothing to restore, and nothing lost if this
    // never runs. That relocation of the blast radius IS the fix.
    tmp.cleanup();
  }
});

test('welcome.ts + chips.ts share one bundled-library set (no dual list)', () => {
  // Drain 2026-08-22-0920 — this test used to grep both files for the
  // four literal names, guarding a dual list that was declared
  // "intentional duplication". The dual list is gone: both files
  // import BUNDLED_VAULT_NAME_SET. Kept (not deleted) because the
  // property it protects is unchanged — the two glue layers must
  // agree about what a bundled library is — and re-pointed at the
  // mechanism that now guarantees it. bundled-vault-names.test.ts
  // remains the stricter guard, including the vaults.txt pinning.
  const welcomeSrc = fs.readFileSync(
    path.join(REPO, 'src', 'welcome.ts'), 'utf8');
  const chipsSrc = fs.readFileSync(
    path.join(REPO, 'src', 'chips.ts'), 'utf8');
  for (const [label, src] of [['welcome.ts', welcomeSrc], ['chips.ts', chipsSrc]]) {
    assert.match(
      src, /BUNDLED_VAULT_NAME_SET/,
      `${label} must take its bundled-library set from the shared constant.`);
    assert.ok(
      !/KNOWN_BUNDLED_LIBRARIES\s*=\s*new Set/.test(src),
      `${label} must not re-declare its own bundled-library set.`);
  }
});
