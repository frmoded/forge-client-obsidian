// Music-edition Phase 2 — the per-edition configuration DATA. Pure (no obsidian, no generated files),
// so node --test can pin BOTH editions' expectations explicitly instead of only whichever edition the
// ambient build happens to be.
//
// Which edition is "current" is decided in exactly one place: src/edition-selected.ts (committed as
// lean; scripts/build-main.mjs redirects it to edition-selected.music.ts for FORGE_EDITION=music — the
// same mechanism, and the same env var, as the Phase 1 music-edition seam). The build scripts that
// choose which ASSETS to bundle read the same FORGE_EDITION through scripts/editions.mjs; the lists
// here are pinned to scripts/vaults.txt / scripts/vaults.music.txt by src/bundled-vault-names.test.ts,
// so the runtime view and the build view of "which vaults ship" cannot drift apart silently.

export type Edition = 'lean' | 'music';

/** Bundled vaults each edition ships, in scripts/vaults*.txt order. */
export const EDITION_VAULT_NAMES = {
  lean: ['forge-moda', 'forge-tutorial'],
  music: ['forge-moda', 'music-theory', 'forge-tutorial', 'music-core'],
} as const satisfies Record<Edition, readonly string[]>;

/** Python-side library resolution order (_BUNDLED_LIBRARIES_V1 in pyodide-host.ts): real bundles only,
 *  not forge-tutorial (a tutorial vault is not a resolution library). */
export const EDITION_PYTHON_LIBRARIES = {
  lean: ['forge-moda'],
  music: ['forge-moda', 'music-theory', 'music-core'],
} as const satisfies Record<Edition, readonly string[]>;

/** Vaults `installVault` treats as bundled no-installs (forge-action.ts). */
export const EDITION_INSTALLABLE_BUNDLED = EDITION_PYTHON_LIBRARIES;

/** Vault-setup wizard flavors each edition offers. 'music' is the one the lean strip removed. */
export const EDITION_WIZARD_FLAVORS = {
  lean: ['quick', 'moda', 'moda-learning', 'multi', 'empty'],
  music: ['quick', 'moda', 'moda-learning', 'music', 'multi', 'empty'],
} as const satisfies Record<Edition, readonly string[]>;

/** The user-facing sentence fragment for the "install skipped" notice. LEAN's text is byte-identical to
 *  what main shipped before this phase. */
export function bundledVaultsPhrase(edition: Edition): string {
  const names = EDITION_INSTALLABLE_BUNDLED[edition];
  return names.length === 1
    ? `vault (${names[0]}) is`
    : `vaults (${names.join(', ')}) are`;
}
