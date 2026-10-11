// Drain 2026-10-10-2100 (a) — find a vault-authored file (a widget .html) when the bundled library is a SUBFOLDER of the
// user's vault rather than the vault root. Pure core: no Obsidian, no globals; the host injects its three lookups.
//
// Why: `music_instruments/resources/html/rhythm_box.html` is a path relative to the ROOT OF THE MUSIC-THEORY VAULT. That is the
// vault root only in the driver's dev vault. In every normal user vault the bundled library is extracted as `music-theory/…`,
// so a root-absolute lookup (the Beat Box view, and every `html-embed` block in the bundled notes) can never succeed there.
//
// Order — each tier is tried only when the previous one missed:
//   1. 'vault-root'            the vault file at the root-relative path. Today's behaviour; the dev vault and any user override win.
//   2. 'bundled-vault-folder'  the same path under each bundled-vault folder the plugin knows (`<name>/<path>`).
//   3. 'plugin-bundle'         the plugin's own inlined copy (`vaults/<name>/<path>` in BUNDLED_ASSETS). It needs no extraction, so it
//                              holds even if the user deleted — or never got — the extracted folder. This tier is the guarantee.
//
// The set of bundled-vault names is INJECTED (the host passes BUNDLED_VAULT_NAMES); this file keeps no list of its own.

export type BundledAwareTier = 'vault-root' | 'bundled-vault-folder' | 'plugin-bundle';

export interface BundledAwareDeps {
  /** The bundled vaults this build ships, in the plugin's own order (BUNDLED_VAULT_NAMES). */
  bundledVaultNames: readonly string[];
  /** The text of the vault file at `path`, or null when there is no such file. May throw (reported as "unreadable"). */
  readVaultFile(path: string): Promise<string | null>;
  /** The inlined plugin asset for `key` (`vaults/<name>/<path>`), or undefined. */
  inlinedAsset(key: string): string | undefined;
}

export interface SearchStep {
  tier: BundledAwareTier;
  /** What was looked at: a vault path (tiers 1-2) or an inlined asset key (tier 3). */
  location: string;
}

export type BundledAwareResult =
  | { ok: true; html: string; tier: BundledAwareTier; location: string }
  | { ok: false; searched: string[]; message: string };

/** The key under which the plugin inlines `<vault>/<relPath>` (build: scripts/inline-bundled-assets.mjs keys by path under assets/). */
export function inlinedAssetKey(vaultName: string, relPath: string): string {
  return `vaults/${vaultName}/${relPath}`;
}

/** A path that may be joined under a bundled folder / asset key: relative, and no `..` segment. */
function isJoinable(relPath: string): boolean {
  if (relPath.startsWith('/')) return false;
  return !relPath.split('/').some((seg) => seg === '..');
}

/** The exact lookup order for `relPath` — exported so tests (and the refusal message) read ONE definition. */
export function searchOrder(relPath: string, bundledVaultNames: readonly string[]): SearchStep[] {
  const steps: SearchStep[] = [{ tier: 'vault-root', location: relPath }];
  if (!isJoinable(relPath)) return steps;
  for (const name of bundledVaultNames) steps.push({ tier: 'bundled-vault-folder', location: `${name}/${relPath}` });
  for (const name of bundledVaultNames) steps.push({ tier: 'plugin-bundle', location: inlinedAssetKey(name, relPath) });
  return steps;
}

const TIER_LABEL: Record<BundledAwareTier, string> = {
  'vault-root': 'vault root',
  'bundled-vault-folder': 'bundled vault folder',
  'plugin-bundle': 'plugin bundle',
};

export async function resolveBundledAwareFile(
  relPath: string,
  deps: BundledAwareDeps,
): Promise<BundledAwareResult> {
  const searched: string[] = [];
  for (const step of searchOrder(relPath, deps.bundledVaultNames)) {
    const label = `${TIER_LABEL[step.tier]}: ${step.location}`;
    let text: string | null | undefined;
    try {
      text = step.tier === 'plugin-bundle'
        ? deps.inlinedAsset(step.location)
        : await deps.readVaultFile(step.location);
    } catch {
      searched.push(`${label} (unreadable)`);
      continue;
    }
    if (text === null || text === undefined) {
      searched.push(`${label} (not found)`);
      continue;
    }
    if (text.trim() === '') {
      searched.push(`${label} (empty)`);
      continue;
    }
    return { ok: true, html: text, tier: step.tier, location: step.location };
  }
  return {
    ok: false,
    searched,
    message: `not found. Searched — ${searched.join('; ')}.`,
  };
}
