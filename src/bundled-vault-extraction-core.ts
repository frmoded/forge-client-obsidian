// Pure-core derivation of the bundled-vault set. Lives in its own
// obsidian-import-free file so `node --test` can exercise it — the
// convention from copy-dir-core.ts / forge-toml-stub.ts.
//
// Drain 2026-08-21-2300. Before this, welcome.ts extracted a
// hand-written list of vaults through three separate helpers, one of
// which (the music pair) was additionally gated on the vault's
// declared domains. A fresh vault's stub forge.toml declares
// `domains = []`, so BRAT's first launch extracted two of four
// bundled vaults and the sweep reported the other two as
// "extracted root missing; skip".
//
// The set is now derived from what the bundle actually carries, so
// adding a fifth vault to assets/vaults/ (and scripts/vaults.txt)
// needs no edit here.

/** Where the plugin's restored assets live: `<plugin folder>/assets`. Drain 2026-10-10-2100 — derived from the folder Obsidian loaded
 *  the plugin from (`this.manifest.dir`), never from a hard-coded id: the id changed `forge` → `forge-actions` at v0.5.0 and the old
 *  literal kept pointing extraction at the stale pre-rename folder. */
export function pluginAssetsRoot(pluginDir: string): string {
  return `${pluginDir.replace(/\/+$/, '')}/assets`;
}

/** Where the plugin's bundled vaults live inside the user's vault (the SOURCE of every extraction). */
export function bundledVaultsRoot(pluginDir: string): string {
  return `${pluginAssetsRoot(pluginDir)}/vaults`;
}

/** The two welcome notes the plugin ships (extracted to the vault root on first run). */
export function bundledWelcomePaths(pluginDir: string): { welcome: string; greet: string } {
  const root = `${pluginAssetsRoot(pluginDir)}/welcome`;
  return { welcome: `${root}/welcome.md`, greet: `${root}/greet.md` };
}

import { EDITION_VAULT_NAMES, type Edition } from './edition-core.ts';
import { EDITION } from './edition-selected.ts';

/** The bundled vaults this build ships, in scripts/vaults.txt (lean) / vaults.music.txt (music) order.
 *  ONE definition for the whole plugin (drain 2026-08-22-0920): every
 *  site that needs "is this one of ours?" imports from here instead of
 *  spelling the names again. A test pins it to scripts/vaults.txt and
 *  fails if any source file re-lists the set by hand.
 *
 *  Note the two remaining name lists in pyodide-host.ts are NOT this
 *  set and keep their own literals on purpose: the MEMFS mount-skip
 *  list is this set PLUS the legacy forge-music dirs, and
 *  _BUNDLED_LIBRARIES_V1 is a three-entry Python resolution order.
 *  Both are pinned to the canonical set by the same test file. */
export const BUNDLED_VAULT_NAMES: readonly string[] = EDITION_VAULT_NAMES[EDITION];

/** Every name ANY edition can bundle (the type is a superset; membership checks use the current
 *  edition's BUNDLED_VAULT_NAMES / BUNDLED_VAULT_NAME_SET). */
export type BundledVaultName =
  | typeof EDITION_VAULT_NAMES.lean[number]
  | typeof EDITION_VAULT_NAMES.music[number];

/** Membership form, for the "is this vault a bundled library's source
 *  repo?" checks in welcome.ts (and formerly chips.ts). */
export const BUNDLED_VAULT_NAME_SET: ReadonlySet<string> =
  new Set<string>(BUNDLED_VAULT_NAMES);

/** The names under which a vault root may declare itself the SOURCE REPO of a bundled library (drain 2026-10-12-1700 §3).
 *  Deliberately NOT the current edition's list: the gate must agree with what extraction would actually do, and extraction extracts
 *  whatever the plugin folder carries (see deriveBundledVaultNames). A lean build deployed beside a music-bearing assets folder used
 *  to extract music-theory INTO the music-theory source repo, because the gate only knew the lean pair. So: every name ANY edition
 *  can bundle, plus the folder names found in the plugin's `assets/vaults/` listing (a vault the constant has never heard of). */
export function sourceVaultNames(listedFolders: readonly string[] | undefined | null): ReadonlySet<string> {
  const names = new Set<string>([...EDITION_VAULT_NAMES.lean, ...EDITION_VAULT_NAMES.music]);
  for (const folder of listedFolders ?? []) {
    const name = String(folder).split('/').filter(Boolean).pop() ?? '';
    if (name !== '' && !name.startsWith('.')) names.add(name);
  }
  return names;
}

/** Last-resort set, used ONLY when listing the bundle dir yields
 *  nothing. An adapter quirk must not silently downgrade a fresh
 *  install to zero extracted vaults — that would be a worse failure
 *  than the one drain 2300 fixed. Same names as the constant above;
 *  named separately because the ROLE is different (a fallback, not a
 *  membership test) and the log says which one was used. */
export const FALLBACK_BUNDLED_VAULTS: string[] = [...BUNDLED_VAULT_NAMES];

export interface DerivedBundledVaults {
  /** Vault names to extract, sorted for deterministic logging. Always a subset of the EDITION's name table. */
  names: string[];
  /** 'edition' when the table was intersected with a readable listing; 'fallback' when the listing was empty/unreadable and the
   *  whole table is used. Callers log the distinction so a silent fallback is never mistaken for a real derivation. */
  source: 'edition' | 'fallback';
  /** Folders the bundle carries that THIS edition does not ship (e.g. music vaults beside a lean build). Never extracted. */
  ignored: string[];
  /** Names the edition ships but the bundle folder does not carry — reported, never invented. */
  missing: string[];
}

const basenamesOf = (folders: readonly string[] | undefined | null): string[] => {
  const out = new Set<string>();
  for (const folder of folders ?? []) {
    const name = String(folder).split('/').filter(Boolean).pop() ?? '';
    if (name !== '' && !name.startsWith('.')) out.add(name);
  }
  return [...out];
};

/** Which bundled vaults to extract (drain 2026-10-13-2100 §3: THE EDITION DECIDES; the disk never does).
 *
 *  The edition table (`EDITION_VAULT_NAMES`) is the only source of membership. `assets/vaults/` is deployed wholesale and carries
 *  every edition's vaults, so a listing says what is physically THERE, not what this build is. Before this, the set WAS the
 *  listing, so a lean build deployed beside a music-bearing folder extracted music-theory and music-core into a vault that never
 *  asked for them (and, from the music-theory source vault, into the source repo — the source-vault gate stops that case too).
 *
 *  The listing is consulted only as a presence filter over names the edition already claimed. An empty/unreadable listing falls
 *  back to the whole table: an adapter quirk must not silently degrade a fresh install to zero extracted vaults.
 *  `edition` defaults to the build's own (the shipped call site passes nothing); tests name both. */
export function deriveBundledVaultNames(
  folders: readonly string[] | undefined | null,
  edition: Edition = EDITION,
): DerivedBundledVaults {
  const wanted: readonly string[] = EDITION_VAULT_NAMES[edition];
  const listed = basenamesOf(folders);
  if (listed.length === 0) {
    return { names: [...wanted].sort(), source: 'fallback', ignored: [], missing: [] };
  }
  const present = new Set(listed);
  return {
    names: wanted.filter((n) => present.has(n)).sort(),
    source: 'edition',
    ignored: listed.filter((n) => !wanted.includes(n)).sort(),
    missing: wanted.filter((n) => !present.has(n)).sort(),
  };
}
