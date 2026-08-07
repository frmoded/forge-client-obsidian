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

const CANONICAL = vaultsTxt();
const welcomeKnown = extractNames(readSrc('src/welcome.ts'), 'KNOWN_BUNDLED_LIBRARIES');
const chipsKnown = extractNames(readSrc('src/chips.ts'), 'KNOWN_BUNDLED_LIBRARIES');
const pyodideHost = readSrc('src/pyodide-host.ts');
const mountSkip = extractNames(pyodideHost, 'BUNDLED_LIBRARY_NAMES');
const pythonV1 = extractNames(pyodideHost, '_BUNDLED_LIBRARIES_V1');
const actionBundled = extractNames(readSrc('src/forge-action.ts'), 'BUNDLED_VAULTS');
const modalNames = extractNames(
  readSrc('src/re-extract-bundled-vault-modal.ts'), 'BUNDLED_VAULT_NAMES',
);

test('vaults.txt is the post-split canonical set', () => {
  assert.deepEqual(
    [...CANONICAL].sort(),
    ['forge-moda', 'forge-tutorial', 'music-core', 'music-theory'],
  );
});

test('welcome.ts + chips.ts KNOWN sets cover every canonical vault', () => {
  for (const v of CANONICAL) {
    assert.ok(welcomeKnown.includes(v), `welcome.ts KNOWN set missing ${v}`);
    assert.ok(chipsKnown.includes(v), `chips.ts KNOWN set missing ${v}`);
  }
});

test('re-extract modal offers exactly the canonical vaults', () => {
  assert.deepEqual([...modalNames].sort(), [...CANONICAL].sort());
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
    ['welcome KNOWN', welcomeKnown],
    ['chips KNOWN', chipsKnown],
    ['_BUNDLED_LIBRARIES_V1', pythonV1],
    ['forge-action BUNDLED_VAULTS', actionBundled],
    ['modal BUNDLED_VAULT_NAMES', modalNames],
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
