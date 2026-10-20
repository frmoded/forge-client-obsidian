// score_first_experiment M0 (drain 2026-10-21-1100) — a vault's PROFILE: one constant key in its forge.toml.
//
//   profile = "score_first"
//
// is how a vault says "the score is the thing you look at here". It is a CONSTANT OF THE VAULT, never a setting: there is no command, no menu and no toggle that
// writes or flips it (driver decision, 2026-10-20). Its only job is to keep every OTHER vault exactly as it is (principle P3): a vault without the key — the
// tutorial vault, music-theory, music-core, forge-moda, any lean-edition vault, any vault whose forge.toml is missing or unreadable — has no profile, and nothing in the
// plugin behaves differently for it. Every score-first behaviour asks `isScoreFirstVault` and nothing else; this is the one place that reads the key.
//
// Pure core (no obsidian): the plugin has no TOML parser (each reader of forge.toml is a small line parser — forge-music-gate.ts, vault-imports-local-core.ts,
// source-vault-core.ts), so this one reads exactly what it needs and no more: a TOP-LEVEL `profile = "<string>"` line. The engine's own manifest reader ignores unknown
// keys (verified: forge.core.manifest._from_dict reads name/version/description/dependencies/domains only), so the key costs nothing there.

export const PROFILE_KEY = 'profile';
export const PROFILE_SCORE_FIRST = 'score_first';

/** The raw value of the top-level `profile` key, or null: absent, commented out, not a quoted string, or placed inside a [table] (in TOML every key after a `[table]`
 *  header belongs to that table — so a `profile` under `[imports]` is NOT the vault's profile, and the key must therefore come BEFORE `[imports]`). The first
 *  `profile` line wins; scanning stops at the first table header. */
export function readVaultProfile(tomlBody: string | null | undefined): string | null {
  if (typeof tomlBody !== 'string') return null;
  for (const rawLine of tomlBody.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('[')) return null;                       // first table header: everything after it belongs to that table
    const m = line.match(/^profile\s*=\s*(?:"([^"]*)"|'([^']*)')\s*(?:#.*)?$/);
    if (m) return (m[1] ?? m[2] ?? '').trim() || null;
    if (/^profile\s*=/.test(line)) return null;                  // `profile = something-unquoted`: malformed, so no profile (never a guess)
  }
  return null;
}

/** True iff the forge.toml text declares `profile = "score_first"` (exactly; any other value, or none, is the default behaviour). */
export function isScoreFirstToml(tomlBody: string | null | undefined): boolean {
  return readVaultProfile(tomlBody) === PROFILE_SCORE_FIRST;
}

/** The two vault-adapter calls it needs (Obsidian's `DataAdapter` satisfies this structurally). */
export interface ProfileAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
}

/** Is this vault score-first? Reads `forge.toml` at the vault root. NEVER throws and never writes: a missing, unreadable or odd forge.toml is simply "not score-first",
 *  because the default has to be "behave as before". */
export async function isScoreFirstVault(vault: { adapter: ProfileAdapter }): Promise<boolean> {
  try {
    if (!(await vault.adapter.exists('forge.toml'))) return false;
    return isScoreFirstToml(await vault.adapter.read('forge.toml'));
  } catch (e) {
    console.error('Forge: isScoreFirstVault could not read forge.toml; treating the vault as a normal vault', e);
    return false;
  }
}
