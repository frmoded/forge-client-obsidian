// v0.2.69 — pure-core gate for the legacy capital-W `Welcome.md`
// + sentinel block in welcome.ts's runFirstRunCheck. Extracted so the
// gate can be tested without an Obsidian shim.
//
// Founding consumer: src/welcome.ts. Closes the v0.2.66 follow-up gap
// where the lowercase `welcome.md` extractor was source-vault-gated
// but the older capital-W `Welcome.md` creator was not. forge-music's
// source vault (`name = "forge-music"`) installing v0.2.68 saw a
// phantom `Welcome.md` appear at vault root every first-run, despite
// v0.2.66's symmetric gate covering the `ensureWelcomeFiles` path.
//
// The capital-W vs lowercase distinction is what hid the asymmetry
// from previous reviews.
//
// Pure-core extraction No. 26. No `obsidian` import; runs cleanly
// under `node --test`.

/** Decide whether the legacy capital-W `Welcome.md` should be created
 *  for the current first-run check.
 *
 *  Truth table (collapses to: only on the steady-state "fresh user
 *  vault" case):
 *
 *    | hasSentinel | sourceVaultName | result |
 *    | ----------- | --------------- | ------ |
 *    | false       | null            | true   |  // fresh user vault
 *    | false       | 'forge-music'   | false  |  // source vault, skip
 *    | false       | 'forge-moda'    | false  |  // source vault, skip
 *    | true        | null            | false  |  // already initialized
 *    | true        | 'forge-music'   | false  |  // idempotency
 *    | true        | 'forge-moda'    | false  |  // idempotency
 *
 *  Note: the sentinel itself is written by welcome.ts regardless of
 *  source-vault status — preserving idempotency means future reloads
 *  short-circuit instead of re-checking the gate. This helper governs
 *  only the Welcome.md write, not the sentinel write.
 *
 *  Pure: no side effects; safe to call repeatedly. */
export function shouldCreateLegacyWelcomeMd(
  hasSentinel: boolean,
  sourceVaultName: string | null,
): boolean {
  if (hasSentinel) return false;
  if (sourceVaultName !== null) return false;
  return true;
}
