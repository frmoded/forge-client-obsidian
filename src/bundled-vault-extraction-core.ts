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

/** Where the plugin's bundled vaults live inside the user's vault. */
export const BUNDLED_VAULTS_ROOT =
  '.obsidian/plugins/forge-client-obsidian/assets/vaults';

/** Last-resort set, used ONLY when listing the bundle dir yields
 *  nothing. An adapter quirk must not silently downgrade a fresh
 *  install to zero extracted vaults — that would be a worse failure
 *  than the one this drain fixes. Keep in step with
 *  scripts/vaults.txt; the runtime derivation is what actually
 *  governs, and a test pins the two together. */
export const FALLBACK_BUNDLED_VAULTS = [
  'forge-moda', 'forge-tutorial', 'music-core', 'music-theory',
];

export interface DerivedBundledVaults {
  /** Vault names to extract, sorted for deterministic logging. */
  names: string[];
  /** 'bundle' when derived from the listing, 'fallback' when the
   *  listing was empty/unreadable. Callers log the distinction so a
   *  silent fallback is never mistaken for a real derivation. */
  source: 'bundle' | 'fallback';
}

/** Turn an `adapter.list(BUNDLED_VAULTS_ROOT).folders` result into the
 *  set of bundled vault names. Obsidian returns vault-relative full
 *  paths; we want basenames. Dotted entries (.DS_Store and friends)
 *  are not vaults. */
export function deriveBundledVaultNames(
  folders: string[] | undefined | null,
): DerivedBundledVaults {
  const names = new Set<string>();
  for (const folder of folders ?? []) {
    const name = String(folder).split('/').filter(Boolean).pop() ?? '';
    if (name === '' || name.startsWith('.')) continue;
    names.add(name);
  }
  if (names.size === 0) {
    return { names: [...FALLBACK_BUNDLED_VAULTS].sort(), source: 'fallback' };
  }
  return { names: [...names].sort(), source: 'bundle' };
}
