import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSourceVault, shouldSkipBundledExtract } from './source-vault-core.ts';

const KNOWN = new Set(['forge-music', 'forge-moda']);

// ---------- shouldSkipBundledExtract (v0.2.66 symmetric gate) ----------
//
// The 5 cases from prompt 2026-06-06-1900 §Tests, mapped onto the pure-
// core decision layer. welcome.ts wraps each gate around the
// corresponding extractor; the pure-core helper captures the boolean.

test('shouldSkipBundledExtract: cross-library — forge-music vault skips forge-moda extract', () => {
  // Brief (e) followup load-bearing case: vault root `name = "forge-music"`
  // means ensureBundledForgeModa() must NOT fire (v0.2.64 narrow same-name
  // gate had let it through, polluting `~/projects/forge-music/forge-moda/`).
  assert.equal(shouldSkipBundledExtract('forge-music'), true);
});

test('shouldSkipBundledExtract: cross-library reverse — forge-moda vault skips forge-music extract', () => {
  // Symmetric to the above. Less common in practice (forge-moda is the
  // default-on library) but the gate behavior must be symmetric.
  assert.equal(shouldSkipBundledExtract('forge-moda'), true);
});

test('shouldSkipBundledExtract: same-library — forge-music vault still skips forge-music (v0.2.64 regression)', () => {
  // The original same-name skip rule must keep working under the new
  // symmetric gate.
  assert.equal(shouldSkipBundledExtract('forge-music'), true);
});

test('shouldSkipBundledExtract: normal vault — null source → do NOT skip (regression)', () => {
  // ~/forge-vaults/smoke-v0.2.13 has `name = "smoke-v0.2.13"` which is
  // NOT in KNOWN_BUNDLED_LIBRARIES, so isSourceVault returns null and
  // both library extractions proceed normally.
  assert.equal(shouldSkipBundledExtract(null), false);
});

test('shouldSkipBundledExtract: welcome.md gate — any source vault skips welcome (regression from v0.2.64)', () => {
  // ensureWelcomeFiles uses the same helper now (was already symmetric
  // in v0.2.64; this regression-tests the existing behavior).
  assert.equal(shouldSkipBundledExtract('forge-music'), true);
  assert.equal(shouldSkipBundledExtract('forge-moda'), true);
  assert.equal(shouldSkipBundledExtract(null), false);
});

test('shouldSkipBundledExtract: idempotent (same input → same output)', () => {
  for (const v of ['forge-music', 'forge-moda', null]) {
    const a = shouldSkipBundledExtract(v);
    const b = shouldSkipBundledExtract(v);
    assert.equal(a, b);
  }
});

test('isSourceVault: null body → null (no forge.toml present)', () => {
  assert.equal(isSourceVault(null, KNOWN), null);
});

test('isSourceVault: empty body → null', () => {
  assert.equal(isSourceVault('', KNOWN), null);
});

test('isSourceVault: forge-music forge.toml → "forge-music"', () => {
  const body = [
    'name = "forge-music"',
    'version = "0.3.9"',
    'description = "Forge vault for music composition and analysis."',
    'domains = ["music"]',
  ].join('\n');
  assert.equal(isSourceVault(body, KNOWN), 'forge-music');
});

test('isSourceVault: forge-moda forge.toml → "forge-moda"', () => {
  const body = [
    'name = "forge-moda"',
    'version = "0.4.17"',
    'domains = ["moda"]',
  ].join('\n');
  assert.equal(isSourceVault(body, KNOWN), 'forge-moda');
});

test('isSourceVault: user vault with `name = "my-cohort-vault"` → null', () => {
  // The user can declare any name; only matches against known bundled
  // libraries surface as source vaults.
  const body = 'name = "my-cohort-vault"\ndomains = ["moda"]';
  assert.equal(isSourceVault(body, KNOWN), null);
});

test('isSourceVault: forge.toml without name field → null', () => {
  const body = 'domains = ["music"]\nversion = "0.0.1"';
  assert.equal(isSourceVault(body, KNOWN), null);
});

test('isSourceVault: KNOWN list controls recognition (unrecognized name → null)', () => {
  const body = 'name = "forge-music"\n';
  // Pass an empty set — "forge-music" no longer recognized → null.
  assert.equal(isSourceVault(body, new Set()), null);
  // Pass an unrelated set → still null.
  assert.equal(isSourceVault(body, new Set(['forge-physics'])), null);
});

test('isSourceVault: idempotent (same input → same result)', () => {
  const body = 'name = "forge-music"\ndomains = ["music"]';
  assert.equal(isSourceVault(body, KNOWN), isSourceVault(body, KNOWN));
});

test('isSourceVault: single-quoted name accepted (TOML tolerant)', () => {
  const body = "name = 'forge-moda'\n";
  assert.equal(isSourceVault(body, KNOWN), 'forge-moda');
});

test('isSourceVault: trailing comment after value tolerated', () => {
  const body = 'name = "forge-music"  # source-of-truth';
  assert.equal(isSourceVault(body, KNOWN), 'forge-music');
});

test('isSourceVault: commented-out name line ignored, active name wins', () => {
  const body = [
    '# name = "forge-moda"',
    'name = "forge-music"',
  ].join('\n');
  assert.equal(isSourceVault(body, KNOWN), 'forge-music');
});

test('isSourceVault: malformed `name = ` line → null (no false positive)', () => {
  // A `name =` line that doesn't parse cleanly bails; we don't fall
  // through to a possible second `name =` line, since toml semantics
  // would consider repeated keys an error anyway.
  const body = 'name = invalid-bare-value-with-space oops\n';
  assert.equal(isSourceVault(body, KNOWN), null);
});

test('isSourceVault: whitespace around = tolerated', () => {
  assert.equal(isSourceVault('name="forge-moda"', KNOWN), 'forge-moda');
  assert.equal(isSourceVault('name   =   "forge-moda"', KNOWN), 'forge-moda');
});

// v0.2.64 — production-set regression (per brief (e)). Verifies the
// exact set both welcome.ts and chips.ts use against the typical
// cohort-vault shape that should NOT trigger source-vault gating.
test('isSourceVault: production set excludes a normal cohort vault', () => {
  const PROD_SET = new Set(['forge-moda', 'forge-music']);
  // Cohort vault with arbitrary name + the two cohort domains.
  const body = [
    'name = "smoke-v0.2.13"',
    'domains = ["moda", "music"]',
  ].join('\n');
  assert.equal(isSourceVault(body, PROD_SET), null);
});

test('isSourceVault: production set includes forge-music source repo', () => {
  const PROD_SET = new Set(['forge-moda', 'forge-music']);
  const body = [
    'name = "forge-music"',
    'version = "0.3.9"',
    'description = "Forge vault for music composition and analysis."',
    'domains = ["music"]',
  ].join('\n');
  assert.equal(isSourceVault(body, PROD_SET), 'forge-music');
});

test('isSourceVault: production set includes forge-moda source repo', () => {
  const PROD_SET = new Set(['forge-moda', 'forge-music']);
  const body = [
    'name = "forge-moda"',
    'version = "0.4.17"',
    'domains = ["moda"]',
  ].join('\n');
  assert.equal(isSourceVault(body, PROD_SET), 'forge-moda');
});
