// scripts/vaults.mjs
//
// CW-release-prep-improvements (drain 2026-07-29-2300) Change 3.
//
// JS accessor for scripts/vaults.txt — the canonical bundled-vault
// list. Mirrors the scripts/exclusions.mjs precedent from drain 1610:
// one place to change, so a new vault is a one-line edit rather than
// an edit-three-files-and-hope ritual.
//
// Why a .txt plus this thin accessor rather than putting the array in
// this module directly: release-prep.sh is bash and cannot import an
// .mjs. Plain text is the lowest common denominator both consumers
// parse trivially; this module keeps the .mjs side from duplicating
// the parse.

// Music-edition Phase 2: the list is per-edition. scripts/vaults.txt is the LEAN list (default),
// scripts/vaults.music.txt the MUSIC list; scripts/editions.mjs owns the parsing and the rule that
// edition membership is decided by edition, never by directory contents.
import { editionConfig, ALL_VAULTS } from "./editions.mjs";

/** Canonical bundled-vault names for the CURRENT edition (FORGE_EDITION), in list-file order. */
export const BUNDLED_VAULTS = editionConfig().vaults;

/** Same list as a Set, for allowlist checks. */
export const KNOWN_VAULTS = new Set(BUNDLED_VAULTS);

/** Every vault ANY edition can bundle. sync-bundled-vault.mjs validates explicit names against this,
 *  so `node scripts/sync-bundled-vault.mjs music-theory` works from a lean checkout; `--all` still
 *  means "this edition's vaults". */
export const ALL_KNOWN_VAULTS = new Set(ALL_VAULTS);
