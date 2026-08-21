// Drain 2026-08-21-2300 — first launch must extract EVERY vault the
// bundle carries.
//
// The observed failure (CCQA BRAT smoke step 4, fresh empty vault,
// v0.2.363): forge-moda + forge-tutorial extracted; music-theory +
// music-core logged "extracted root missing; skip" — the same
// condition that triggers extraction for the other two.
//
// ROOT CAUSE (not a stale hardcoded list): music-theory + music-core
// extraction sat behind the v0.2.15 music-domain opt-in gate
// (`vaultDeclaresMusic(forge.toml)`), while forge-moda +
// forge-tutorial are unconditional. On a fresh vault the v0.2.14 stub
// writes `domains = []`, so the gate is false and both music vaults
// are skipped before ensureBundledVault is ever reached — the sweep
// then reports their absent extracted roots.
//
// The fix derives the extraction set from the bundle's own contents
// rather than any hand-maintained list, so a future fifth vault
// cannot repeat this.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { vaultDeclaresMusic } from './forge-music-gate.ts';
import { FORGE_TOML_STUB_BODY } from './forge-toml-stub.ts';
import {
  BUNDLED_VAULTS_ROOT,
  FALLBACK_BUNDLED_VAULTS,
  deriveBundledVaultNames,
} from './bundled-vault-extraction-core.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

/** What Obsidian's `adapter.list()` returns for the bundle dir: full
 *  vault-relative folder paths, not basenames. */
function listingFor(names: string[]): string[] {
  return names.map((n) => `${BUNDLED_VAULTS_ROOT}/${n}`);
}

test('fresh vault: every vault the bundle carries is scheduled for extraction', () => {
  // The exact fresh-install shape from the smoke report: all four
  // bundled, none extracted yet.
  const derived = deriveBundledVaultNames(
    listingFor(['forge-moda', 'music-theory', 'forge-tutorial', 'music-core']),
  );
  assert.equal(derived.source, 'bundle');
  assert.deepEqual(
    derived.names,
    ['forge-moda', 'forge-tutorial', 'music-core', 'music-theory'],
    'all four bundled vaults must be extracted on first launch',
  );
});

test('the root cause is the domain gate, and the derivation ignores it', () => {
  // Regression witness. The fresh-vault stub declares no domains, so
  // the v0.2.15 music gate was — and still is — false there. That is
  // exactly why music-theory/music-core never reached extraction.
  assert.equal(
    vaultDeclaresMusic(FORGE_TOML_STUB_BODY),
    false,
    'fresh-vault stub still declares no domains (unchanged)',
  );
  // The derived set must include them anyway: extraction coverage is
  // no longer a function of the vault's declared domains.
  const derived = deriveBundledVaultNames(
    listingFor(['forge-moda', 'music-theory', 'forge-tutorial', 'music-core']),
  );
  assert.ok(derived.names.includes('music-theory'));
  assert.ok(derived.names.includes('music-core'));
});

test('a fifth bundled vault needs no code change', () => {
  const derived = deriveBundledVaultNames(
    listingFor(['forge-moda', 'forge-tutorial', 'music-core', 'music-theory', 'forge-poetry']),
  );
  assert.ok(
    derived.names.includes('forge-poetry'),
    'a vault added to assets/vaults/ must extract without editing a list',
  );
});

test('empty or unreadable listing falls back rather than extracting nothing', () => {
  // Non-vacuity guard: an adapter quirk that returns no folders must
  // not silently degrade a fresh install to zero extracted vaults —
  // that would be worse than the bug being fixed.
  for (const bad of [[], undefined, null]) {
    const derived = deriveBundledVaultNames(bad as string[] | undefined);
    assert.equal(derived.source, 'fallback');
    assert.deepEqual(derived.names, [...FALLBACK_BUNDLED_VAULTS].sort());
  }
  assert.ok(FALLBACK_BUNDLED_VAULTS.length > 0, 'fallback must not be empty');
});

test('listing hygiene: basenames, dedupe, sorted, no dotfiles', () => {
  const derived = deriveBundledVaultNames([
    `${BUNDLED_VAULTS_ROOT}/music-theory/`,
    `${BUNDLED_VAULTS_ROOT}/forge-moda`,
    `${BUNDLED_VAULTS_ROOT}/forge-moda`,
    `${BUNDLED_VAULTS_ROOT}/.DS_Store`,
  ]);
  assert.deepEqual(derived.names, ['forge-moda', 'music-theory']);
});

test('the derived set agrees with scripts/vaults.txt (no hand-maintained drift)', () => {
  // Derived-not-hand-maintained evidence: what ships under
  // assets/vaults/ IS the canonical vaults.txt list. If they ever
  // diverge, the bundle wins at runtime and this fails loudly.
  const onDisk = fs
    .readdirSync(path.join(REPO, 'assets', 'vaults'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();
  const canonical = fs
    .readFileSync(path.join(REPO, 'scripts', 'vaults.txt'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
    .sort();
  assert.ok(onDisk.length > 0, 'assets/vaults must not be empty');
  assert.deepEqual(onDisk, canonical);
  assert.deepEqual(deriveBundledVaultNames(listingFor(onDisk)).names, canonical);
});

test('welcome.ts extracts from the derived set, not a hardcoded list', () => {
  const src = fs.readFileSync(path.join(REPO, 'src', 'welcome.ts'), 'utf8');
  assert.ok(
    src.includes('deriveBundledVaultNames'),
    'welcome.ts must derive the bundled-vault set',
  );
  assert.ok(
    !/\[\s*'forge-moda',\s*'music-theory',\s*'forge-tutorial',\s*'music-core'\s*\]/.test(src),
    'the sweep loop must iterate the derived set, not a hardcoded array',
  );
  assert.ok(
    !src.includes('vaultDeclaresMusic'),
    'extraction coverage must not depend on the declared domains',
  );
});
