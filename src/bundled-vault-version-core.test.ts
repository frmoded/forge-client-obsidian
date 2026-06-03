// Pure-core tests for bundled-vault-version-core.ts.
//
// Compares a bundled vault's forge.toml version against the extracted
// (in-vault) version so welcome.ts can decide whether to back up +
// re-extract on plugin load. Eliminates the recurring "rm -rf
// ~/<vault>/forge-music + Cmd-Q + reopen" smoke step (~10 drains in
// the v0.2.x music week).
//
// Pure-core extraction No. 11 in the series. Same `node --test` +
// `node:assert/strict` convention as forge-music-gate, copy-dir-core,
// forge-toml-stub, engine-bundle-drift, chips, closed-beta-ux,
// forge-action, freeze-edge, install-md-pin, compute-kwargs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseForgeTomlVersion,
  compareBundledVaultVersion,
} from './bundled-vault-version-core.ts';

// --- parseForgeTomlVersion ---

test('parseForgeTomlVersion: double-quoted value', () => {
  const body = 'name = "forge-music"\nversion = "0.3.8"\n';
  assert.equal(parseForgeTomlVersion(body), '0.3.8');
});

test('parseForgeTomlVersion: single-quoted value', () => {
  const body = "version = '0.3.8'\n";
  assert.equal(parseForgeTomlVersion(body), '0.3.8');
});

test('parseForgeTomlVersion: bare (unquoted) value', () => {
  // TOML actually requires strings to be quoted, but be tolerant.
  const body = 'version = 0.3.8\n';
  assert.equal(parseForgeTomlVersion(body), '0.3.8');
});

test('parseForgeTomlVersion: whitespace tolerance around equals', () => {
  assert.equal(parseForgeTomlVersion('version="0.3.8"\n'), '0.3.8');
  assert.equal(parseForgeTomlVersion('version  =  "0.3.8"\n'), '0.3.8');
  assert.equal(parseForgeTomlVersion('version\t=\t"0.3.8"\n'), '0.3.8');
});

test('parseForgeTomlVersion: missing version line returns null', () => {
  const body = 'name = "forge-music"\ndomains = ["music"]\n';
  assert.equal(parseForgeTomlVersion(body), null);
});

test('parseForgeTomlVersion: commented-out version line is skipped', () => {
  // A user with `# version = "0.3.7"` as a comment + no active version
  // line should get null, not "0.3.7".
  const body = '# version = "0.3.7"\nname = "forge-music"\n';
  assert.equal(parseForgeTomlVersion(body), null);
});

test('parseForgeTomlVersion: active line wins over earlier comment', () => {
  const body = '# version = "0.3.7"\nversion = "0.3.8"\n';
  assert.equal(parseForgeTomlVersion(body), '0.3.8');
});

test('parseForgeTomlVersion: multi-line domains array does not confuse the parser', () => {
  // TOML allows arrays to span lines. We should still find the
  // single-line version assignment without getting tripped up.
  const body = [
    'name = "forge-music"',
    'version = "0.3.8"',
    'domains = [',
    '  "music",',
    '  "moda",',
    ']',
    '',
  ].join('\n');
  assert.equal(parseForgeTomlVersion(body), '0.3.8');
});

test('parseForgeTomlVersion: empty body returns null', () => {
  assert.equal(parseForgeTomlVersion(''), null);
});

// --- compareBundledVaultVersion ---

test('compareBundledVaultVersion: match — same version both sides', () => {
  const bundled = 'version = "0.3.8"\n';
  const extracted = 'version = "0.3.8"\n';
  assert.deepEqual(compareBundledVaultVersion(bundled, extracted), {
    kind: 'match',
    version: '0.3.8',
  });
});

test('compareBundledVaultVersion: drift — different versions', () => {
  const bundled = 'version = "0.3.8"\n';
  const extracted = 'version = "0.3.5"\n';
  assert.deepEqual(compareBundledVaultVersion(bundled, extracted), {
    kind: 'drift',
    bundled: '0.3.8',
    extracted: '0.3.5',
  });
});

test('compareBundledVaultVersion: no-extracted — null extracted body (first install)', () => {
  const bundled = 'version = "0.3.8"\n';
  assert.deepEqual(compareBundledVaultVersion(bundled, null), {
    kind: 'no-extracted',
  });
});

test('compareBundledVaultVersion: no-bundled — null bundled body (asset missing)', () => {
  const extracted = 'version = "0.3.5"\n';
  assert.deepEqual(compareBundledVaultVersion(null, extracted), {
    kind: 'no-bundled',
  });
});

test('compareBundledVaultVersion: no-bundled wins over no-extracted when both null', () => {
  // Both null means the bundled forge.toml is missing — that's the
  // load-bearing signal (we can't extract from a missing source).
  assert.deepEqual(compareBundledVaultVersion(null, null), {
    kind: 'no-bundled',
  });
});

test('compareBundledVaultVersion: unparseable bundled body', () => {
  const bundled = 'name = "forge-music"\n';  // no version line
  const extracted = 'version = "0.3.5"\n';
  const result = compareBundledVaultVersion(bundled, extracted);
  assert.equal(result.kind, 'unparseable');
  if (result.kind === 'unparseable') {
    assert.match(result.reason, /bundled/i);
  }
});

test('compareBundledVaultVersion: unparseable extracted body', () => {
  const bundled = 'version = "0.3.8"\n';
  const extracted = 'name = "forge-music"\n';  // no version line
  const result = compareBundledVaultVersion(bundled, extracted);
  assert.equal(result.kind, 'unparseable');
  if (result.kind === 'unparseable') {
    assert.match(result.reason, /extracted/i);
  }
});

test('compareBundledVaultVersion: comment-only version on extracted side is unparseable', () => {
  const bundled = 'version = "0.3.8"\n';
  const extracted = '# version = "0.3.5"\n';
  const result = compareBundledVaultVersion(bundled, extracted);
  assert.equal(result.kind, 'unparseable');
});

test('compareBundledVaultVersion: multi-line domains array on both sides does not confuse drift detection', () => {
  const bundled = [
    'name = "forge-music"',
    'version = "0.3.8"',
    'domains = [',
    '  "music",',
    ']',
    '',
  ].join('\n');
  const extracted = [
    'name = "forge-music"',
    'version = "0.3.5"',
    'domains = [',
    '  "music",',
    ']',
    '',
  ].join('\n');
  assert.deepEqual(compareBundledVaultVersion(bundled, extracted), {
    kind: 'drift',
    bundled: '0.3.8',
    extracted: '0.3.5',
  });
});
