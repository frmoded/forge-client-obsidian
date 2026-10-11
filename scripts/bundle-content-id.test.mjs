// Drain 2026-10-10-2100 (b) — the bundle's CONTENT IDENTITY.
//
// `.bundle-version` is the plugin's manifest version, which is the same across many different builds. CCQA's ClaudeQA vault read
// `0.6.1` for builds that carried different notes, so a version-keyed refresh never fired. The identity below is a hash of every
// inlined file's path AND content: it changes exactly when what the plugin would restore changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeBundleContentId } from './bundle-content-id.mjs';
import {
  CONTENT_ID_FILENAME,
  writeBundleContentIdSentinel,
} from './bundle-version-sentinel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const A = [['vaults/x/a.md', 'alpha'], ['vaults/x/b.md', 'beta']];

test('content id: 16 lowercase hex chars, deterministic', () => {
  const id = computeBundleContentId(A);
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.equal(computeBundleContentId(A), id);
});

test('content id: independent of the order entries are supplied in', () => {
  assert.equal(computeBundleContentId([...A].reverse()), computeBundleContentId(A));
});

test('content id: changes when a file\'s CONTENT changes, a file is ADDED, REMOVED, or RENAMED', () => {
  const base = computeBundleContentId(A);
  assert.notEqual(computeBundleContentId([['vaults/x/a.md', 'alpha!'], A[1]]), base, 'content');
  assert.notEqual(computeBundleContentId([...A, ['vaults/x/c.md', 'gamma']]), base, 'added');
  assert.notEqual(computeBundleContentId([A[0]]), base, 'removed');
  assert.notEqual(computeBundleContentId([['vaults/x/a2.md', 'alpha'], A[1]]), base, 'renamed');
});

test('content id: a path/content boundary shift cannot collide (separators are unambiguous)', () => {
  assert.notEqual(
    computeBundleContentId([['ab', 'c']]),
    computeBundleContentId([['a', 'bc']]),
  );
});

test('content id sentinel: written to assets/.bundle-content-id with no trailing newline; refuses an empty id', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-content-id-'));
  try {
    const written = writeBundleContentIdSentinel(dir, 'deadbeefdeadbeef');
    assert.equal(path.basename(written), CONTENT_ID_FILENAME);
    assert.equal(fs.readFileSync(written, 'utf8'), 'deadbeefdeadbeef');
    assert.throws(() => writeBundleContentIdSentinel(dir, ''), /content id/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the generator bakes the id, writes the sentinel from the SAME value, and the stub module exports it too', () => {
  const gen = fs.readFileSync(path.join(__dirname, 'inline-bundled-assets.mjs'), 'utf8');
  assert.match(gen, /computeBundleContentId\(/);
  assert.match(gen, /export const BUNDLED_ASSETS_CONTENT_ID = \$\{JSON\.stringify\(contentId\)\};/);
  assert.match(gen, /writeBundleContentIdSentinel\(.*contentId\)/);
  const build = fs.readFileSync(path.join(__dirname, 'build-main.mjs'), 'utf8');
  assert.match(build, /BUNDLED_ASSETS_CONTENT_ID = "stub"/);
});

test('the sentinel is a build output, not a tracked file (no per-commit churn)', () => {
  const ig = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  assert.match(ig, /^assets\/\.bundle-content-id$/m);
  assert.match(ig, /^assets\/\.extracted-bundle-ids\.json$/m);
});
