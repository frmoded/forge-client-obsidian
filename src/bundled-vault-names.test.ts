// v0.2.333 Phase 5 two-vault split (drain 2026-08-06-1800) — drift
// guard for the HAND-SYNCED bundled-vault name lists.
//
// Music-edition Phase 2: there are now TWO canonical lists — scripts/vaults.txt (lean) and
// scripts/vaults.music.txt (music) — and this test pins BOTH editions' expectations explicitly (from
// src/edition-core.ts), instead of only whichever edition the ambient build happens to be.
//
// The list files are the canonical source, but src/ files carry their own copies because they are
// bundled into main.js and cannot read them at runtime (documented in vaults.txt's header).
// Per the bundle-subset HARD RULE (cc-prompt-queue.md), a drain that
// adds a vault must ship drift detection in the same drain: this test
// extracts each list FROM THE PRODUCTION SOURCE (no inline mirrors —
// the v0.2.22 fixture-drift trap) and asserts the sync relations.
//
// If this test fails after you added/renamed a bundled vault: update
// scripts/vaults.txt AND the sets in src/welcome.ts, (formerly src/chips.ts),
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

/** Parse a vault list file exactly like scripts/editions.mjs does. */
function vaultFile(rel: string): string[] {
  return readSrc(rel)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
}
function vaultsTxt(): string[] {
  return vaultFile('scripts/vaults.txt');
}
function vaultsMusicTxt(): string[] {
  return vaultFile('scripts/vaults.music.txt');
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
import {
  EDITION_VAULT_NAMES,
  EDITION_PYTHON_LIBRARIES,
  EDITION_INSTALLABLE_BUNDLED,
  EDITION_WIZARD_FLAVORS,
  bundledVaultsPhrase,
  type Edition,
} from './edition-core.ts';
import { EDITION } from './edition-selected.ts';

const EDITIONS_UNDER_TEST: Edition[] = ['lean', 'music'];
const FILES: Record<Edition, string[]> = { lean: vaultsTxt(), music: vaultsMusicTxt() };
// The CURRENT (ambient, committed = lean) edition's canonical list; the per-edition tests below
// cover both.
const CANONICAL = FILES[EDITION];
const pyodideHost = readSrc('src/pyodide-host.ts');
const mountSkip = extractNames(pyodideHost, 'BUNDLED_LIBRARY_NAMES');
const forgeActionSrc = readSrc('src/forge-action.ts');

test('the committed tree is the LEAN edition (music is selected only by the build)', () => {
  assert.equal(EDITION, 'lean');
});

test('vaults.txt (lean) and vaults.music.txt (music) are the two canonical sets', () => {
  assert.deepEqual([...FILES.lean].sort(), ['forge-moda', 'forge-tutorial']);
  assert.deepEqual(
    [...FILES.music].sort(),
    ['forge-moda', 'forge-tutorial', 'music-core', 'music-theory'],
  );
});

test('edition-core vault lists equal the list files, in order, for BOTH editions', () => {
  for (const ed of EDITIONS_UNDER_TEST) {
    assert.deepEqual([...EDITION_VAULT_NAMES[ed]], FILES[ed], `${ed}: EDITION_VAULT_NAMES != vaults list file`);
  }
});

test('every bundle-resolved lib (python resolution order) is canonical + mount-skipped, per edition', () => {
  for (const ed of EDITIONS_UNDER_TEST) {
    for (const v of EDITION_PYTHON_LIBRARIES[ed]) {
      assert.ok(FILES[ed].includes(v), `${ed}: python resolution order has non-canonical ${v}`);
      assert.ok(mountSkip.includes(v), `${ed}: BUNDLED_LIBRARY_NAMES (mount-skip) missing bundle lib ${v}`);
    }
  }
  assert.deepEqual([...EDITION_PYTHON_LIBRARIES.lean], ['forge-moda']);
  assert.deepEqual([...EDITION_PYTHON_LIBRARIES.music], ['forge-moda', 'music-theory', 'music-core']);
});

test('pyodide-host.ts derives _BUNDLED_LIBRARIES_V1 from the edition (no hand-spelled copy)', () => {
  assert.match(
    pyodideHost,
    /^_BUNDLED_LIBRARIES_V1 = \$\{JSON\.stringify\(EDITION_PYTHON_LIBRARIES\[EDITION\]\)\}$/m,
  );
});

test('forge-action BUNDLED_VAULTS is derived from the edition and ⊆ that edition canonical set', () => {
  assert.match(forgeActionSrc, /BUNDLED_VAULTS = new Set<string>\(EDITION_INSTALLABLE_BUNDLED\[EDITION\]\)/);
  for (const ed of EDITIONS_UNDER_TEST) {
    for (const v of EDITION_INSTALLABLE_BUNDLED[ed]) {
      assert.ok(FILES[ed].includes(v), `${ed}: installable-bundled has non-canonical ${v}`);
    }
  }
});

test('wizard: the Music flavor exists in the music edition only (lean strip removed it)', () => {
  assert.ok(!(EDITION_WIZARD_FLAVORS.lean as readonly string[]).includes('music'));
  assert.ok((EDITION_WIZARD_FLAVORS.music as readonly string[]).includes('music'));
  // Everything else is identical, in the same order.
  assert.deepEqual(
    EDITION_WIZARD_FLAVORS.music.filter((f) => f !== 'music'),
    [...EDITION_WIZARD_FLAVORS.lean],
  );
});

test('install-skipped notice: LEAN text is byte-identical to what main shipped; music names its vaults', () => {
  assert.equal(bundledVaultsPhrase('lean'), 'vault (forge-moda) is');
  assert.equal(
    `Forge: install of "x" skipped — only the built-in ${bundledVaultsPhrase('lean')} available right now. More vaults are planned.`,
    'Forge: install of "x" skipped — only the built-in vault (forge-moda) is available right now. More vaults are planned.',
  );
  assert.equal(bundledVaultsPhrase('music'), 'vaults (forge-moda, music-theory, music-core) are');
});

test('rename completeness: forge-music is gone from every live list, both editions', () => {
  for (const ed of EDITIONS_UNDER_TEST) {
    for (const [label, names] of [
      [`${ed} vault list file`, FILES[ed]],
      [`${ed} EDITION_VAULT_NAMES`, [...EDITION_VAULT_NAMES[ed]]],
      [`${ed} python resolution order`, [...EDITION_PYTHON_LIBRARIES[ed]]],
      [`${ed} installable-bundled`, [...EDITION_INSTALLABLE_BUNDLED[ed]]],
    ] as Array<[string, string[]]>) {
      assert.ok(!names.includes('forge-music'), `${label} still lists forge-music`);
    }
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
  // LEAN's vaults must always be present. The music vaults are required only by a MUSIC build
  // (scripts/check-edition-assets.mjs enforces that, with the sync command); here we only insist a
  // music vault dir, if present, is a real bundle rather than a half-synced stub.
  for (const v of FILES.lean) {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'assets', 'vaults', v, 'forge.toml')),
      `assets/vaults/${v}/forge.toml missing — run: node scripts/sync-bundled-vault.mjs ${v}`,
    );
  }
  for (const v of FILES.music.filter((n) => !FILES.lean.includes(n))) {
    const dir = path.join(ROOT, 'assets', 'vaults', v);
    if (fs.existsSync(dir)) {
      assert.ok(fs.existsSync(path.join(dir, 'forge.toml')), `assets/vaults/${v}/ exists but has no forge.toml — half-synced`);
    }
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
// spelled three times: welcome.ts + chips.ts, since retired (KNOWN_BUNDLED_LIBRARIES,
// "intentional duplication" per their comments) and the re-extract
// modal. They now import one exported constant. The remaining three
// are deliberately NOT the canonical set — mount-skip is canonical ∪
// legacy names, _BUNDLED_LIBRARIES_V1 is a 3-item resolution order,
// forge-action's is a subset — so they keep their own literals and
// their own assertions above.

test('the canonical vault-name set is exported once and equals the current edition\'s list file', () => {
  assert.deepEqual([...SHARED_NAMES], CANONICAL,
    'the shared constant must be the current edition\'s list file, in file order');
  assert.ok(SHARED_NAMES.length > 0, 'shared constant must not be empty');
  for (const v of CANONICAL) assert.ok(SHARED_SET.has(v), `shared set missing ${v}`);
});

/** Does this source spell out the whole canonical set as literals? */
function relistsCanonicalSet(source, sets = [FILES.lean, FILES.music]) {
  // A re-listing is ONE array literal that spells every canonical name of EITHER edition —
  // not a file that merely mentions each name somewhere (with a two-name
  // canonical set, plain mentions in prose/strings are common).
  const groups = source.match(/\[[^\]]*\]/g) ?? [];
  return groups.some((g) => sets.some((set) => set.every((v) => new RegExp(`['"]${v}['"]`).test(g))));
}

test('non-vacuity: the re-listing detector actually detects a re-listing', () => {
  // A deliberate-mismatch fixture — if this passed, the sweep below
  // would be asserting nothing.
  for (const ed of EDITIONS_UNDER_TEST) {
    const fixture = `const X = ['${FILES[ed].join("', '")}'];`;
    assert.equal(relistsCanonicalSet(fixture), true, `${ed} re-listing not detected`);
  }
  assert.equal(relistsCanonicalSet(`const X = ['forge-moda'];`), false);
});

test('no source file re-lists the canonical vault names by hand', () => {
  // Only the module that OWNS the constant may spell the names.
  // pyodide-host.ts deliberately gets no exemption: its two lists are
  // library-RESOLUTION sets (mount-skip = resolved libs ∪ legacy dirs;
  // _BUNDLED_LIBRARIES_V1 = a 3-entry order) and neither spells the
  // canonical four — so if one ever grows into a copy of the bundle
  // set, this fails instead of quietly allowing it.
  // welcome.ts's sweepLegacyBakDirs `candidates` is a FIXED historical set
  // (the two vaults that ever produced `<lib>.bak.<version>` litter), not
  // "the current bundle" — it equals the canonical set on the lean branch
  // only by coincidence, so it is exempt from the by-hand-copy check.
  // edition-core.ts is where the per-edition lists now live (Phase 2) — it owns them, like
  // bundled-vault-extraction-core.ts owned the single list before.
  const ALLOWED = new Set(['bundled-vault-extraction-core.ts', 'edition-core.ts', 'welcome.ts']);
  const offenders = fs
    .readdirSync(path.join(ROOT, 'src'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .filter((f) => !f.includes('.generated.'))
    .filter((f) => !ALLOWED.has(f))
    .filter((f) => relistsCanonicalSet(readSrc(`src/${f}`)));
  assert.deepEqual(offenders, [],
    'these files spell out the bundled-vault set instead of importing it');
});

test('welcome.ts consumes the shared set (chips.ts, its former twin, was retired with the palette on 2026-10-07)', () => {
  for (const rel of ['src/welcome.ts']) {
    const src = readSrc(rel);
    assert.match(src, /BUNDLED_VAULT_NAME_SET/,
      `${rel} must import the shared membership set`);
    assert.ok(!/KNOWN_BUNDLED_LIBRARIES\s*=/.test(src),
      `${rel} must no longer define its own list`);
  }
});
