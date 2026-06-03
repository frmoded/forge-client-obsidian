// Pure-core decision: when the plugin loads, should we re-extract a
// bundled vault into the user's vault root? The answer depends on
// comparing the bundled vault's forge.toml version against the
// extracted (in-vault) one.
//
// Eliminates the recurring "delete ~/<vault>/forge-music + Cmd-Q +
// reopen" smoke step that bit every bundled-vault release in the
// v0.2.x music-week arc.
//
// Pure-core extraction No. 11. No `obsidian` import — `node --test`
// exercises this without a shim, same pattern as copy-dir-core,
// forge-music-gate, forge-toml-stub, engine-bundle-drift-core, etc.

/** Parse the `version = "..."` line out of a forge.toml body.
 *  Returns null if absent or malformed.
 *
 *  Tolerant of:
 *  - Single or double quotes (TOML requires double; tolerate single).
 *  - Bare (unquoted) values (TOML doesn't allow this; tolerate).
 *  - Whitespace around `=` (no whitespace, single space, tab, runs).
 *
 *  Rejects:
 *  - Comment lines (`# version = ...`).
 *  - Multi-line / array values (forge.toml versions are always
 *    single-line semver — multi-line isn't part of the format).
 *
 *  Active line wins: `# version = "0.3.7"\nversion = "0.3.8"\n`
 *  returns `"0.3.8"`. */
export function parseForgeTomlVersion(tomlBody: string): string | null {
  for (const rawLine of tomlBody.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    // Match `version = <value>` where value is quoted or bare.
    // Capture the value sans quotes.
    const m = line.match(/^version\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))\s*$/);
    if (m) {
      // Whichever capture group matched.
      return m[1] ?? m[2] ?? m[3] ?? null;
    }
    // A non-comment line that starts with `version` but doesn't match
    // the expected shape is malformed; bail rather than scan further.
    if (/^version\s*=/.test(line)) return null;
  }
  return null;
}

export type BundledVaultVersionStatus =
  | { kind: 'match'; version: string }
  | { kind: 'drift'; bundled: string; extracted: string }
  | { kind: 'no-extracted' }      // first install — just extract
  | { kind: 'no-bundled' }        // bundled forge.toml missing — bail
  | { kind: 'unparseable'; reason: string };  // either side malformed — log + skip

/** Given the bundled and extracted forge.toml bodies (or null if a
 *  side is absent), decide what welcome.ts should do.
 *
 *  - `null bundled` → 'no-bundled' (can't extract from nothing).
 *    Takes precedence over `null extracted` because the bundled
 *    side being missing is the unrecoverable error.
 *  - `null extracted` → 'no-extracted' (first install — just copy).
 *  - Bundled body present but version unparseable → 'unparseable'
 *    with reason mentioning "bundled" so the caller's warn log is
 *    diagnosable.
 *  - Extracted body present but version unparseable → 'unparseable'
 *    with reason mentioning "extracted". This is the safe choice:
 *    if we can't determine the extracted version, we don't know
 *    which `.bak.<version>` name to use, so skipping avoids data loss.
 *  - Both versions parseable + equal → 'match'.
 *  - Both versions parseable + different → 'drift'. The caller
 *    backs up to `<targetDir>.bak.<extracted>` and re-extracts. */
export function compareBundledVaultVersion(
  bundledTomlBody: string | null,
  extractedTomlBody: string | null,
): BundledVaultVersionStatus {
  if (bundledTomlBody === null) {
    return { kind: 'no-bundled' };
  }
  if (extractedTomlBody === null) {
    return { kind: 'no-extracted' };
  }

  const bundledVersion = parseForgeTomlVersion(bundledTomlBody);
  if (bundledVersion === null) {
    return {
      kind: 'unparseable',
      reason: 'bundled forge.toml has no parseable version line',
    };
  }

  const extractedVersion = parseForgeTomlVersion(extractedTomlBody);
  if (extractedVersion === null) {
    return {
      kind: 'unparseable',
      reason: 'extracted forge.toml has no parseable version line',
    };
  }

  if (bundledVersion === extractedVersion) {
    return { kind: 'match', version: bundledVersion };
  }
  return {
    kind: 'drift',
    bundled: bundledVersion,
    extracted: extractedVersion,
  };
}
