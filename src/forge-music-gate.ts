// Pure-core gate decision: should we extract bundled forge-music
// into the vault? Yes iff the vault's forge.toml declares "music"
// in its domains array.
//
// Split out per the convention established in v0.2.13/v0.2.14
// (closed-beta-ux.ts, copy-dir-core.ts, forge-toml-stub.ts): obsidian-
// import-free helper file for `node --test` to exercise without a
// shim. Six-and-counting pure-core extractions; pattern is durable.

/** True when the given forge.toml body declares "music" in an active
 *  domains array. Matches both `domains = ["music"]` and
 *  `domains = ["music", "other"]` (order irrelevant). Rejects
 *  commented-out declarations (`# domains = ["music"]`) so a user
 *  who removed music but kept the comment doesn't get the
 *  extraction.
 *
 *  Whitespace tolerance: no whitespace, single space, tab, multiple
 *  spaces around `=`, `[`, `]` and inside the array — all match.
 *  Multi-line domains arrays (TOML allows this) are NOT supported by
 *  this regex; if a user hand-authors a multi-line `domains` array,
 *  they get no extraction. Acceptable: the v0.2.14 stub forge.toml
 *  writes single-line `domains = []`, and the EditVaultDomainsModal
 *  also writes single-line. Multi-line would be unusual. */
export function vaultDeclaresMusic(tomlBody: string): boolean {
  // Split into lines and check each one independently. Rejects
  // comment lines (those starting with optional whitespace + `#`)
  // by walking lines and finding the first non-comment `domains =`
  // assignment.
  for (const rawLine of tomlBody.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    // Look for `domains = [...]` shape with "music" listed as a
    // quoted element. The pattern allows arbitrary whitespace +
    // other quoted elements before / after.
    if (/^domains\s*=\s*\[.*"music".*\]\s*$/.test(line)) return true;
    // First non-comment line that matches `domains\s*=` but doesn't
    // include "music" — definitive no.
    if (/^domains\s*=/.test(line)) return false;
  }
  return false;
}
