import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSourceVault } from './source-vault-core.ts';

const KNOWN = new Set(['forge-music', 'forge-moda']);

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
