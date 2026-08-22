// v0.2.333 Phase 5 two-vault split (drain 2026-08-06-1800) — drift
// guard for the HAND-SYNCED bundled-vault name lists.
//
// scripts/vaults.txt is the canonical list, but four src/ files carry
// their own copies because they are bundled into main.js and cannot
// read vaults.txt at runtime (documented in vaults.txt's header).
// Per the bundle-subset HARD RULE (cc-prompt-queue.md), a drain that
// adds a vault must ship drift detection in the same drain: this test
// extracts each list FROM THE PRODUCTION SOURCE (no inline mirrors —
// the v0.2.22 fixture-drift trap) and asserts the sync relations.
//
// If this test fails after you added/renamed a bundled vault: update
// scripts/vaults.txt AND the sets in src/welcome.ts, src/chips.ts,
// src/pyodide-host.ts (both lists), src/forge-action.ts, and
// src/re-extract-bundled-vault-modal.ts together.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** Parse scripts/vaults.txt exactly like scripts/vaults.mjs does. */
function vaultsTxt(): string[] {
  return readSrc('scripts/vaults.txt')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
}

/** Extract the string members of an array/Set literal bound to
 *  `name` in the given source text. Fails loudly when the binding is
 *  missing so a rename of the constant breaks THIS test, not the
 *  guarantee. */
function extractNames(source: string, name: string): string[] {
  // Anchored to an ASSIGNMENT at line start (optionally const/export
  // const, optional type annotation) so comment mentions of the same
  // identifier can never be matched — the unanchored version of this
  // regex mis-captured a comment's neighbor literal on first write.
  const m = source.match(
    new RegExp(
      `^\\s*(?:export\\s+)?(?:const\\s+)?${name}\\s*(?::[^=\\n]*)?=` +
      `[^\\[\\n]*\\[([\\s\\S]*?)\\]`,
      'm',
    ),
  );
  assert.ok(m, `could not find ${name} assignment in production source`);
  const members = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
  assert.ok(members.length > 0, `${name} literal parsed to zero names`);
  return members;
}

import {
  BUNDLED_VAULT_NAMES as SHARED_NAMES,
  BUNDLED_VAULT_NAME_SET as SHARED_SET,
} from './bundled-vault-extraction-core.ts';

const CANONICAL = vaultsTxt();
const pyodideHost = readSrc('src/pyodide-host.ts');
const mountSkip = extractNames(pyodideHost, 'BUNDLED_LIBRARY_NAMES');
const pythonV1 = extractNames(pyodideHost, '_BUNDLED_LIBRARIES_V1');
const actionBundled = extractNames(readSrc('src/forge-action.ts'), 'BUNDLED_VAULTS');

test('vaults.txt is the post-split canonical set', () => {
  assert.deepEqual(
    [...CANONICAL].sort(),
    ['forge-moda', 'forge-tutorial', 'music-core', 'music-theory'],
  );
});

test('every bundle-resolved lib (python resolution order) is canonical + mount-skipped', () => {
  for (const v of pythonV1) {
    assert.ok(CANONICAL.includes(v), `_BUNDLED_LIBRARIES_V1 has non-canonical ${v}`);
    assert.ok(mountSkip.includes(v), `BUNDLED_LIBRARY_NAMES missing bundle lib ${v}`);
  }
  assert.deepEqual(pythonV1, ['forge-moda', 'music-theory', 'music-core']);
});

test('forge-action BUNDLED_VAULTS ⊆ canonical', () => {
  for (const v of actionBundled) {
    assert.ok(CANONICAL.includes(v), `forge-action BUNDLED_VAULTS has non-canonical ${v}`);
  }
});

test('rename completeness: forge-music is gone from every live list', () => {
  for (const [label, names] of [
    ['vaults.txt', CANONICAL],
    ['shared BUNDLED_VAULT_NAMES', [...SHARED_NAMES]],
    ['_BUNDLED_LIBRARIES_V1', pythonV1],
    ['forge-action BUNDLED_VAULTS', actionBundled],
  ] as Array<[string, string[]]>) {
    assert.ok(!names.includes('forge-music'), `${label} still lists forge-music`);
  }
});

test('mount-skip list keeps the legacy names (stale-dir neutralization)', () => {
  // These two are mount-skip-ONLY entries — they keep a stale
  // pre-rename forge-music/ or the parked forge-music.bak.legacy/
  // out of the user-vault MEMFS mount. See pyodide-host.ts comment.
  assert.ok(mountSkip.includes('forge-music'));
  assert.ok(mountSkip.includes('forge-music.bak.legacy'));
  // Drain 2026-08-08-1200 — the driver's manual mid-migration rename
  // (`forge-music.legacy/`, no `.bak.` segment) must also be skipped:
  // it defeats the engine's `\.bak\.` exclusion and collided with the
  // music-theory bundle. Mount-skip neutralizes it in EVERY vault,
  // including ones the park can't fire in (backup slot already taken).
  assert.ok(mountSkip.includes('forge-music.legacy'));
});

test('assets/vaults/ dirs match the canonical set (no orphan forge-music)', () => {
  for (const v of CANONICAL) {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'assets', 'vaults', v, 'forge.toml')),
      `assets/vaults/${v}/forge.toml missing — run: node scripts/sync-bundled-vault.mjs ${v}`,
    );
  }
  assert.ok(
    !fs.existsSync(path.join(ROOT, 'assets', 'vaults', 'forge-music')),
    'assets/vaults/forge-music still exists — the rename git mv is incomplete',
  );
});

// ---------------------------------------------------------------------
// Drain 2026-08-22-0920 — retire the hand-maintained copies.
//
// The guards above pin six lists to vaults.txt, which catches drift but
// still requires six edits per vault. Three of them were the SAME set,
// spelled three times: welcome.ts + chips.ts (KNOWN_BUNDLED_LIBRARIES,
// "intentional duplication" per their comments) and the re-extract
// modal. They now import one exported constant. The remaining three
// are deliberately NOT the canonical set — mount-skip is canonical ∪
// legacy names, _BUNDLED_LIBRARIES_V1 is a 3-item resolution order,
// forge-action's is a subset — so they keep their own literals and
// their own assertions above.

test('the canonical vault-name set is exported once and equals vaults.txt', () => {
  assert.deepEqual([...SHARED_NAMES], CANONICAL,
    'the shared constant must be vaults.txt, in vaults.txt order');
  assert.ok(SHARED_NAMES.length > 0, 'shared constant must not be empty');
  for (const v of CANONICAL) assert.ok(SHARED_SET.has(v), `shared set missing ${v}`);
});

/** Does this source spell out the whole canonical set as literals? */
function relistsCanonicalSet(source) {
  return CANONICAL.every((v) => new RegExp(`['"]${v}['"]`).test(source));
}

test('non-vacuity: the re-listing detector actually detects a re-listing', () => {
  // A deliberate-mismatch fixture — if this passed, the sweep below
  // would be asserting nothing.
  const fixture = `const X = ['${CANONICAL.join("', '")}'];`;
  assert.equal(relistsCanonicalSet(fixture), true);
  assert.equal(relistsCanonicalSet(`const X = ['forge-moda'];`), false);
});

test('no source file re-lists the canonical vault names by hand', () => {
  // Only the module that OWNS the constant may spell the names.
  // pyodide-host.ts deliberately gets no exemption: its two lists are
  // library-RESOLUTION sets (mount-skip = resolved libs ∪ legacy dirs;
  // _BUNDLED_LIBRARIES_V1 = a 3-entry order) and neither spells the
  // canonical four — so if one ever grows into a copy of the bundle
  // set, this fails instead of quietly allowing it.
  const ALLOWED = new Set(['bundled-vault-extraction-core.ts']);
  const offenders = fs
    .readdirSync(path.join(ROOT, 'src'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .filter((f) => !f.includes('.generated.'))
    .filter((f) => !ALLOWED.has(f))
    .filter((f) => relistsCanonicalSet(readSrc(`src/${f}`)));
  assert.deepEqual(offenders, [],
    'these files spell out the bundled-vault set instead of importing it');
});

test('welcome.ts and chips.ts consume the shared set', () => {
  for (const rel of ['src/welcome.ts', 'src/chips.ts']) {
    const src = readSrc(rel);
    assert.match(src, /BUNDLED_VAULT_NAME_SET/,
      `${rel} must import the shared membership set`);
    assert.ok(!/KNOWN_BUNDLED_LIBRARIES\s*=/.test(src),
      `${rel} must no longer define its own list`);
  }
});
