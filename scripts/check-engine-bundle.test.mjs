// CW-check-engine-bundle-automated-test (drain 2026-07-22-0800).
//
// Automates the three-step manual verification from drain 1730's
// FEEDBACK §Test coverage (clean → mutate → revert). The check
// script is load-bearing on the release path (wired into `prebuild`
// per drain 1500), so a silent behavior regression would break
// every downstream build.
//
// Isolation (rewritten drain 2026-10-19-1530): the mutation lives in a TEMPORARY COPY of the bundle, never in the real working tree. It used to
// append a marker to the real assets/engine/forge/__init__.py for the length of the test and revert with `git checkout --`; `node --test` runs files
// concurrently, so any other test that read the bundle in that window (the open-time-writes gate's engine-digest check, now) saw a corrupted engine
// and failed at random — and a crash mid-test left the driver's tree dirty. The copy needs the real sibling forge repo to compare against (the check
// resolves it as `<root>/../forge`), so a symlink to it stands in; without that sibling the test is SKIPPED, visibly, not passed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_ROOT = path.resolve(__dirname, '..');
const REAL_SIBLING = path.resolve(REAL_ROOT, '..', 'forge', 'forge');
const MUTATED_REL = 'assets/engine/forge/__init__.py';
const MUTATION_MARKER = '\n# forge test mutation — see check-engine-bundle.test.mjs\n';

/** A private tree: `<tmp>/forge-client-obsidian/{scripts/check-engine-bundle.mjs, src -> real src, assets/engine/forge (a COPY)}` and `<tmp>/forge -> the real sibling`. */
function privateTree() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ceb-'));
  const root = path.join(base, 'forge-client-obsidian');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(REAL_ROOT, 'scripts', 'check-engine-bundle.mjs'), path.join(root, 'scripts', 'check-engine-bundle.mjs'));
  fs.symlinkSync(path.join(REAL_ROOT, 'src'), path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'assets', 'engine'), { recursive: true });
  fs.cpSync(path.join(REAL_ROOT, 'assets', 'engine', 'forge'), path.join(root, 'assets', 'engine', 'forge'), { recursive: true });
  fs.symlinkSync(path.resolve(REAL_ROOT, '..', 'forge'), path.join(base, 'forge'));
  return { base, root };
}
const runCheck = (root) => spawnSync('node', ['--no-warnings', '--experimental-strip-types', path.join(root, 'scripts', 'check-engine-bundle.mjs')], { cwd: root, encoding: 'utf8' });

test('check-engine-bundle: baseline → mutate → revert lifecycle (on a private copy of the bundle)', { skip: fs.existsSync(REAL_SIBLING) ? false : 'no sibling forge repo at ../forge — the drift check has nothing to compare against' }, () => {
  const { base, root } = privateTree();
  try {
    const target = path.join(root, MUTATED_REL);
    assert.ok(fs.existsSync(target), `test target missing: ${MUTATED_REL}. Update MUTATED_REL if the engine bundle was reorganized.`);

    // Step 1: baseline. A fresh copy of a bundle that matches the sibling → clean drift check.
    const baseline = runCheck(root);
    assert.equal(baseline.status, 0, `baseline expected exit 0. stdout:\n${baseline.stdout}\nstderr:\n${baseline.stderr}`);
    assert.match(baseline.stdout, /Engine-bundle drift check: clean/, `baseline stdout missing "clean" line. stdout:\n${baseline.stdout}`);

    // Step 2: mutate + re-check → drift detected.
    const originalBytes = fs.readFileSync(target);
    fs.writeFileSync(target, Buffer.concat([originalBytes, Buffer.from(MUTATION_MARKER)]));
    const drifted = runCheck(root);
    assert.notEqual(drifted.status, 0, `mutated run expected non-zero exit. stdout:\n${drifted.stdout}\nstderr:\n${drifted.stderr}`);
    // The script emits drift lines on stderr — check both streams so a future re-route (stdout<->stderr) does not silently break the test.
    const combined = drifted.stdout + drifted.stderr;
    assert.match(combined, /content-mismatch/, `mutated run missing "content-mismatch" status. combined:\n${combined}`);
    const bundleRel = MUTATED_REL.replace(/^assets\/engine\//, '');
    assert.ok(combined.includes(bundleRel), `mutated run missing bundle-relative path ${bundleRel}. combined:\n${combined}`);

    // Step 3: revert (put the bytes back) → clean again.
    fs.writeFileSync(target, originalBytes);
    const reverted = runCheck(root);
    assert.equal(reverted.status, 0, `reverted run expected exit 0. stdout:\n${reverted.stdout}\nstderr:\n${reverted.stderr}`);
    assert.match(reverted.stdout, /Engine-bundle drift check: clean/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
