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
import { EDITION_VAULT_NAMES } from './edition-core.ts';
import {
  BUNDLED_VAULT_NAMES,
  FALLBACK_BUNDLED_VAULTS,
  bundledVaultsRoot,
  bundledWelcomePaths,
  deriveBundledVaultNames,
  pluginAssetsRoot,
} from './bundled-vault-extraction-core.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

/** What Obsidian's `adapter.list()` returns for the bundle dir: full
 *  vault-relative folder paths, not basenames. */
const BUNDLED_VAULTS_ROOT = bundledVaultsRoot('.obsidian/plugins/forge-actions');
function listingFor(names: string[]): string[] {
  return names.map((n) => `${BUNDLED_VAULTS_ROOT}/${n}`);
}

// ---- Drain 2026-10-13-2100 §3: the EDITION decides what is extracted, never the disk listing ------------------------------
// Before: `deriveBundledVaultNames` returned whatever folders `assets/vaults/` listed. A lean build deployed beside a music-bearing
// assets folder (the assets are deployed wholesale; the edition is chosen at BUILD time, never by what is on disk) extracted
// music-theory and music-core into a vault that never asked for them. The source-vault gate (`sourceVaultNames`) was widened to
// stop that landing inside the music-theory SOURCE repo; this is the other half: a lean install never extracts music content at all.
//
// The listing is still consulted — but only to answer "is the folder physically there?" for names the edition already claimed.
const ALL_FOUR = ['forge-moda', 'music-theory', 'forge-tutorial', 'music-core'];

test('lean edition, polluted folder (all four on disk): ONLY the lean pair is extracted — the repro', () => {
  const derived = deriveBundledVaultNames(listingFor(ALL_FOUR), 'lean');
  assert.deepEqual(derived.names, ['forge-moda', 'forge-tutorial']);
  assert.deepEqual(derived.ignored, ['music-core', 'music-theory'], 'what the folder carried that this edition does not ship is reported');
  assert.equal(derived.source, 'edition');
});

test('music edition, fresh install: all four bundled vaults are scheduled (the original drain-2300 fix still holds)', () => {
  const derived = deriveBundledVaultNames(listingFor(ALL_FOUR), 'music');
  assert.deepEqual(derived.names, ['forge-moda', 'forge-tutorial', 'music-core', 'music-theory']);
  assert.deepEqual(derived.ignored, []);
});

test('the root cause of drain 2300 was the domain gate, and the derivation still ignores it', () => {
  // Regression witness. The fresh-vault stub declares no domains, so the v0.2.15 music gate was — and still is — false there.
  assert.equal(vaultDeclaresMusic(FORGE_TOML_STUB_BODY), false, 'fresh-vault stub still declares no domains (unchanged)');
  const derived = deriveBundledVaultNames(listingFor(ALL_FOUR), 'music');
  assert.ok(derived.names.includes('music-theory') && derived.names.includes('music-core'));
});

test('a vault the bundle carries but NO edition names is not extracted (a fifth folder needs an edition-table entry)', () => {
  for (const edition of ['lean', 'music'] as const) {
    const derived = deriveBundledVaultNames(listingFor([...ALL_FOUR, 'forge-poetry']), edition);
    assert.ok(!derived.names.includes('forge-poetry'), `${edition}: the disk listing must not add names`);
    assert.ok(derived.ignored.includes('forge-poetry'));
  }
});

test('a name the edition claims but the bundle lacks is reported as missing, not invented', () => {
  const derived = deriveBundledVaultNames(listingFor(['forge-moda']), 'lean');
  assert.deepEqual(derived.names, ['forge-moda']);
  assert.deepEqual(derived.missing, ['forge-tutorial']);
});

test('empty or unreadable listing falls back to the edition table rather than extracting nothing', () => {
  // Non-vacuity guard: an adapter quirk that returns no folders must not silently degrade a fresh install to zero extracted vaults.
  for (const bad of [[], undefined, null]) {
    for (const edition of ['lean', 'music'] as const) {
      const derived = deriveBundledVaultNames(bad as string[] | undefined, edition);
      assert.equal(derived.source, 'fallback');
      assert.deepEqual(derived.names, [...EDITION_VAULT_NAMES[edition]].sort());
    }
  }
  assert.ok(FALLBACK_BUNDLED_VAULTS.length > 0, 'fallback must not be empty');
});

test('listing hygiene: basenames, dedupe, sorted, no dotfiles', () => {
  const derived = deriveBundledVaultNames([
    `${BUNDLED_VAULTS_ROOT}/music-theory/`,
    `${BUNDLED_VAULTS_ROOT}/forge-moda`,
    `${BUNDLED_VAULTS_ROOT}/forge-moda`,
    `${BUNDLED_VAULTS_ROOT}/.DS_Store`,
  ], 'music');
  assert.deepEqual(derived.names, ['forge-moda', 'music-theory']);
  assert.deepEqual(derived.ignored, [], 'dotfiles are not vaults, so they are not "ignored vaults" either');
});

test('MECHANISM pin — the default edition is the build\'s own EDITION (the ambient test edition is lean, so a value test cannot see this)', () => {
  const src = fs.readFileSync(path.join(REPO, 'src', 'bundled-vault-extraction-core.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(src, /edition: Edition = EDITION,/);
});

test('the current edition is the default (the shipped call site passes no edition)', () => {
  assert.deepEqual(
    deriveBundledVaultNames(listingFor(ALL_FOUR)).names,
    [...BUNDLED_VAULT_NAMES].sort(),
  );
});

test('the derived set agrees with the vault list files (no hand-maintained drift), for BOTH editions', () => {
  // assets/vaults/ holds the vaults of EVERY edition (the edition is chosen at BUILD time by scripts/editions.mjs), so what is
  // tracked there is the UNION of scripts/vaults.txt (lean) and scripts/vaults.music.txt (music). Each edition's own list must be
  // exactly what the edition table yields from a listing of that union — i.e. the table, not the folder, is what decides.
  const readList = (file: string) => fs
    .readFileSync(path.join(REPO, 'scripts', file), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
  const lean = readList('vaults.txt');
  const music = readList('vaults.music.txt');
  const onDisk = fs
    .readdirSync(path.join(REPO, 'assets', 'vaults'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();
  const union = [...new Set([...lean, ...music])].sort();
  assert.ok(onDisk.length > 0, 'assets/vaults must not be empty');
  assert.deepEqual(onDisk, union, 'assets/vaults must hold exactly the union of both editions\' vaults');
  for (const [edition, list] of [['lean', lean], ['music', music]] as const) {
    assert.deepEqual(
      deriveBundledVaultNames(listingFor(onDisk), edition).names,
      [...list].sort(),
      `${edition}: extraction from the full on-disk union must equal that edition's list file`,
    );
  }
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


test('welcome.ts names what it LEFT ALONE (a polluted folder is visible in the console, not silent) and keeps the source-vault gate', () => {
  const src = fs.readFileSync(path.join(REPO, 'src', 'welcome.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(src, /derived\.ignored/, 'the ignored folders are reported');
  assert.match(src, /derived\.missing/, 'a name the edition ships but the folder lacks is reported');
  assert.match(src, /sourceVaultNames\(/, 'the source-vault gate still reads every edition\'s names + the listing (§3 keeps it)');
});

// ---- Drain 2026-10-10-2100 (b): the extraction SOURCE root ------------------------------------------------------------
// The plugin id changed `forge` → `forge-actions` at v0.5.0 (commit beb5854) but this root stayed `.obsidian/plugins/forge/…`: on an
// upgraded vault the extractor kept reading the stale v0.4.0 folder (ClaudeQA: music-theory 0.11.18, no music_instruments/), and on a
// fresh install of 0.5+ the folder does not exist at all. The root is now derived from the folder Obsidian loaded the plugin from.

test('roots are derived from the plugin folder Obsidian loaded (manifest.dir), never from a hard-coded id', () => {
  assert.equal(pluginAssetsRoot('.obsidian/plugins/forge-actions'), '.obsidian/plugins/forge-actions/assets');
  assert.equal(bundledVaultsRoot('.obsidian/plugins/forge-actions'), '.obsidian/plugins/forge-actions/assets/vaults');
  assert.equal(bundledVaultsRoot('.obsidian/plugins/some-other-folder/'), '.obsidian/plugins/some-other-folder/assets/vaults', 'trailing slash tolerated');
  assert.deepEqual(bundledWelcomePaths('.obsidian/plugins/forge-actions'), {
    welcome: '.obsidian/plugins/forge-actions/assets/welcome/welcome.md',
    greet: '.obsidian/plugins/forge-actions/assets/welcome/greet.md',
  });
});

test('no plugin source file hard-codes the pre-0.5.0 plugin folder `.obsidian/plugins/forge/`', () => {
  const stripped = (src: string) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const offenders: string[] = [];
  for (const f of fs.readdirSync(path.join(REPO, 'src'))) {
    if (!f.endsWith('.ts') || f.endsWith('.test.ts') || f.includes('.generated.')) continue;
    const body = stripped(fs.readFileSync(path.join(REPO, 'src', f), 'utf8'));
    if (/plugins\/forge(?![-\w])/.test(body)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], 'derive the folder from manifest.dir (or the pluginDir parameter) instead');
});

test('main.ts hands the loaded plugin folder to the first-run extraction, the asset restore and the Forge action host', () => {
  const stripped = (src: string) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const main = stripped(fs.readFileSync(path.join(REPO, 'src', 'main.ts'), 'utf8'));
  assert.match(main, /runFirstRunCheck\(this\.app, this\.manifest\.dir\)/);
  assert.match(main, /restoreInlinedAssets\(this\.app, this\.manifest\.id, this\.manifest\.dir\)/);
  assert.match(main, /pluginDir: this\.manifest\.dir/, 'the ForgeHost carries it so ensureBundledFor re-extracts from the same place');
  assert.match(main, /loadBundledVaultOptions\(this\.app\.vault\.adapter, this\.manifest\.dir\)/);
});
