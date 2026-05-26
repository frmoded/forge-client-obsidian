// Post-build regression checks on the bundled main.js. These tests
// catch symbols that should be excluded from the shipped plugin —
// most importantly, any path that would have the renderer process
// spawn external processes (e.g. the v0.2.x uvicorn auto-spawn).
//
// The bundle is at the repo root because esbuild's --outfile=main.js
// writes there; if the test file is moved to a different directory,
// adjust BUNDLE_PATH accordingly.
//
// `node --test` runs files independently. If main.js isn't built
// yet (developer running tests pre-build), the suite skips rather
// than fails — the load-bearing case is "release prep ran build first."

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const BUNDLE_PATH = path.resolve(process.cwd(), 'main.js');

function readBundleOrSkip(t: any): string | null {
  if (!fs.existsSync(BUNDLE_PATH)) {
    t.skip(`bundle not found at ${BUNDLE_PATH} — run \`npm run build\` first`);
    return null;
  }
  return fs.readFileSync(BUNDLE_PATH, 'utf8');
}

test('bundle: no spawnForgeServer symbol (v0.2.8 auto-spawn removed)', (t) => {
  const bundled = readBundleOrSkip(t);
  if (bundled === null) return;
  // The function was deleted in v0.2.8 — finding it in the bundle
  // means the source still references it or a dev accidentally re-
  // introduced the auto-spawn.
  assert.ok(
    !bundled.includes('spawnForgeServer'),
    'spawnForgeServer should be gone from the bundled main.js',
  );
});

test('bundle: no ensureServerRunning symbol (v0.2.8)', (t) => {
  const bundled = readBundleOrSkip(t);
  if (bundled === null) return;
  assert.ok(
    !bundled.includes('ensureServerRunning'),
    'ensureServerRunning should be gone from the bundled main.js',
  );
});

test('bundle: no pingServer symbol (v0.2.8 cruft removal)', (t) => {
  const bundled = readBundleOrSkip(t);
  if (bundled === null) return;
  assert.ok(
    !bundled.includes('pingServer'),
    'pingServer was unused; should be gone from the bundled main.js',
  );
});

test('bundle: no hardcoded developer venv path', (t) => {
  const bundled = readBundleOrSkip(t);
  if (bundled === null) return;
  // The auto-spawn hardcoded `/Users/odedfuhrmann/projects/forge/.venv/bin/python`.
  // Even if a regression re-added the symbols above, finding that
  // literal string in the bundle would be a smoking gun for the same
  // bug class. Defensive belt-and-suspenders alongside the symbol checks.
  assert.ok(
    !bundled.includes('.venv/bin/python'),
    'hardcoded venv path should not appear in the bundle',
  );
});

test('bundle: no spawn(...) call wired to the engine FastAPI entry', (t) => {
  const bundled = readBundleOrSkip(t);
  if (bundled === null) return;
  // We can't assert `child_process` is absent — transitive deps may
  // legitimately reference it. The renderer-process spawn we removed
  // passed `forge.api.server:app` as the uvicorn argv. That literal
  // only existed inside spawnForgeServer; finding it now means the
  // spawn call was reintroduced. (Bare "uvicorn" appears in unrelated
  // explanatory comments, so it's too noisy to grep for directly.)
  assert.ok(
    !bundled.includes('forge.api.server:app'),
    'engine ASGI app literal should not appear — it was only used by the removed spawn',
  );
});
