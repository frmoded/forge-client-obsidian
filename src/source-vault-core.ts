// Pure-core helper that detects when an Obsidian vault is itself the
// source repo for a bundled library (e.g. `~/projects/forge-music/`
// opened directly as a vault — "Path A" in forge-music's authoring
// workflow). When detected, code paths that assume a normal user
// vault (chip discovery scoping to library subdirs, auto-extract
// of bundled library content) need a different shape.
//
// The detection rule: the vault root's `forge.toml` has a `name =
// "..."` field that exactly matches one of the names a caller
// considers a "known bundled library." Caller supplies the set
// (typically the names welcome.ts knows how to extract: forge-moda
// and forge-music today).
//
// Founding consumer: chips.ts v0.2.62, surfaces the source-vault's
// own subdirs (e.g. `percussion/`, `percussion_lab/`) as the library's
// content for chip auto-discovery. Brief (c) per forge-music cowork.
// Future consumer: welcome.ts auto-extract guards (brief (e)).
//
// Pure-core extraction No. 23. No `obsidian` import; runs cleanly
// under `node --test`.

/** Inspect `rootTomlBody` (the body of `forge.toml` at the vault
 *  root, or null if absent) and return the matched library name when
 *  the vault IS itself a source repo for a known bundled library.
 *  Returns null otherwise.
 *
 *  Detection rule: a `name = "..."` line in the toml body whose
 *  value (single or double quotes both tolerated) is exactly equal
 *  to one of the strings in `knownLibraries`. Whitespace and a
 *  trailing comment after the value are tolerated.
 *
 *  Defensive: null body → null result (vault has no forge.toml,
 *  it's not a source vault — common for ad-hoc user vaults).
 *  Malformed `name = ...` line → null (no false positives).
 *  Comment lines starting with `#` are ignored.
 *
 *  Idempotent + side-effect-free; safe to call repeatedly. */
/** Decide whether the welcome-flow's bundled-content extractors
 *  (ensureBundledForgeModa, ensureBundledForgeMusic, ensureWelcomeFiles)
 *  should skip when the vault root has been detected as a source repo.
 *
 *  v0.2.66 — symmetric gate. Any non-null `sourceVaultName` triggers
 *  the skip regardless of which library is being extracted (the
 *  same-name vs cross-library distinction is gone). forge-music's
 *  repo (`name = "forge-music"`) opened as a vault no longer gets
 *  forge-moda extracted into it either.
 *
 *  Pure: caller (welcome.ts) wraps the boolean in the actual extract
 *  call. */
export function shouldSkipBundledExtract(
  sourceVaultName: string | null,
): boolean {
  return sourceVaultName !== null;
}

export function isSourceVault(
  rootTomlBody: string | null,
  knownLibraries: Set<string>,
): string | null {
  if (rootTomlBody === null) return null;
  if (rootTomlBody === '') return null;
  for (const rawLine of rootTomlBody.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    // Match `name = <value>` where value is quoted or bare. Same
    // tolerance shape as bundled-vault-version-core's parseForgeTomlVersion.
    const m = line.match(/^name\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))(?:\s*#.*)?$/);
    if (!m) {
      // A non-comment line that starts with `name` but doesn't match
      // the expected shape is malformed; bail rather than scan further.
      if (/^name\s*=/.test(line)) return null;
      continue;
    }
    const value = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (value !== '' && knownLibraries.has(value)) return value;
    return null;
  }
  return null;
}
