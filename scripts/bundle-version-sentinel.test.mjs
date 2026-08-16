// Drain 2026-08-16-1400 — the build must write assets/.bundle-version.
//
// Until now that file was written ONLY by the plugin at runtime
// (src/restore-inlined-assets.ts), yet it is tracked and it ships inside
// the release zip. Two consequences, both observed:
//
//   - v0.2.358 shipped it stale (0.2.356), costing every installer an
//     unnecessary restore of ~137 inlined asset files on first launch.
//     v0.2.359 only got it right because a verification grep failed and
//     the drain stopped to investigate.
//   - it drifts out-of-band in the working tree whenever a local Obsidian
//     runs the plugin against this directory.
//
// The version has exactly one source: manifest.json, via the same
// `bundleVersion` that inline-bundled-assets.mjs bakes into
// BUNDLED_ASSETS_VERSION (§8 — never computed twice).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SENTINEL_FILENAME,
  writeBundleVersionSentinel,
} from './bundle-version-sentinel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function tempAssetsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-sentinel-'));
}

test('bundle-version-sentinel: writes the version to assets/.bundle-version', () => {
  const dir = tempAssetsDir();
  try {
    const written = writeBundleVersionSentinel(dir, '9.9.9');
    assert.equal(path.basename(written), SENTINEL_FILENAME);
    assert.equal(fs.readFileSync(written, 'utf-8'), '9.9.9');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('bundle-version-sentinel: byte-format matches what the plugin writes at runtime', () => {
  // restore-inlined-assets.ts does `adapter.write(sentinelPath,
  // BUNDLED_ASSETS_VERSION)` — no trailing newline. Matching it exactly
  // means a local plugin run rewriting the file produces no diff. (The
  // comparison itself is .trim()-ed, so this is about noise, not
  // correctness — but noise is what let the file drift unnoticed.)
  const dir = tempAssetsDir();
  try {
    const written = writeBundleVersionSentinel(dir, '1.2.3');
    const raw = fs.readFileSync(written);
    assert.equal(raw.toString(), '1.2.3');
    assert.equal(raw.at(-1), '3'.charCodeAt(0), 'must not end with a newline');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('bundle-version-sentinel: overwrites a stale value rather than appending', () => {
  const dir = tempAssetsDir();
  try {
    writeBundleVersionSentinel(dir, '0.0.1');
    writeBundleVersionSentinel(dir, '0.0.2');
    assert.equal(
      fs.readFileSync(path.join(dir, SENTINEL_FILENAME), 'utf-8'), '0.0.2');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('bundle-version-sentinel: creates the assets dir if it is missing', () => {
  const parent = tempAssetsDir();
  const dir = path.join(parent, 'assets');
  try {
    writeBundleVersionSentinel(dir, '4.5.6');
    assert.equal(fs.readFileSync(path.join(dir, SENTINEL_FILENAME), 'utf-8'), '4.5.6');
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('bundle-version-sentinel: refuses an empty version rather than writing a blank sentinel', () => {
  // A blank sentinel would never equal BUNDLED_ASSETS_VERSION, so every
  // launch would re-restore every inlined file, forever. Loud beats that.
  const dir = tempAssetsDir();
  try {
    assert.throws(() => writeBundleVersionSentinel(dir, ''), /version/i);
    assert.throws(() => writeBundleVersionSentinel(dir, undefined), /version/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --------------------------------------------------- the acceptance shape

test('bundle-version-sentinel: inline-bundled-assets.mjs writes it, no manual step', () => {
  // §4's acceptance: `npm run build` then grep must pass with nothing done
  // by hand. This asserts the build script actually calls the helper —
  // it fails the moment someone drops the call back out.
  const src = fs.readFileSync(
    path.join(__dirname, 'inline-bundled-assets.mjs'), 'utf-8');
  assert.match(src, /writeBundleVersionSentinel\(/);
  assert.match(src, /from ["']\.\/bundle-version-sentinel\.mjs["']/);
});

test('bundle-version-sentinel: the repo sentinel agrees with manifest.json', () => {
  // The drift guard. This is the check that would have caught v0.2.358's
  // stale sentinel before it shipped. If it fails, run `npm run build`.
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
  const sentinel = fs.readFileSync(
    path.join(ROOT, 'assets', SENTINEL_FILENAME), 'utf-8').trim();
  assert.equal(sentinel, manifest.version,
    `assets/${SENTINEL_FILENAME} is ${sentinel} but manifest.json is `
    + `${manifest.version} — run npm run build`);
});
