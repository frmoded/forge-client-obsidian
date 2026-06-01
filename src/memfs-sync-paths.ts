// Pure-core path filter for the vault.on('modify') MEMFS sync hook
// added in v0.2.18. Decides which paths get pushed into Pyodide's
// MEMFS-mounted user vault and which are skipped (Obsidian config,
// plugin state, trashed notes).
//
// Eighth pure-core extraction in this arc — same convention as
// closed-beta-ux.ts, copy-dir-core.ts, forge-toml-stub.ts,
// forge-music-gate.ts. obsidian-import-free so `node --test` can
// exercise it without a shim.

/** True when the given vault-relative path should be excluded from
 *  the MEMFS sync hook. The check is intentionally a prefix walk —
 *  Obsidian uses forward slashes on every platform, so cross-OS
 *  path normalization isn't a concern here.
 *
 *  Categories skipped:
 *  - `.obsidian/` — workspace state, plugin install + data, app
 *    preferences. Editing files inside the plugin install dir
 *    (`assets/vaults/forge-moda/...`) is NOT a vault-side operation
 *    and shouldn't refresh the user-vault registry.
 *  - `.forge/` — sentinel + future cache files Forge manages.
 *  - `.trash/` — deleted notes Obsidian moves here when "Move to
 *    system trash" or "Move to .trash folder" is the delete behavior.
 *
 *  Non-markdown paths are also skipped — the caller's TFile-shape
 *  filter handles that case, but the predicate is belt-and-suspenders
 *  in case it gets called with raw strings from other code paths. */
export function shouldSkipForMemfsSync(vaultRelPath: string): boolean {
  if (vaultRelPath.startsWith('.obsidian/')) return true;
  if (vaultRelPath.startsWith('.forge/')) return true;
  if (vaultRelPath.startsWith('.trash/')) return true;
  if (!vaultRelPath.endsWith('.md')) return true;
  return false;
}
