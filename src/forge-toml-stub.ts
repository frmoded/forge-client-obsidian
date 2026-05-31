// Pure-core stub-forge.toml writer. Lives in its own file so
// `node --test` can exercise it without importing `obsidian` —
// same pattern as closed-beta-ux.ts and copy-dir-core.ts.

/** Structural adapter type for the toml stub work. Captures exactly
 *  the two methods `ensureForgeTomlStub` touches. The real Obsidian
 *  DataAdapter is a superset. */
export interface TomlStubAdapter {
  exists(path: string): Promise<boolean>;
  write(path: string, data: string): Promise<void>;
}

export const FORGE_TOML_STUB_PATH = 'forge.toml';

/** The V1 closed-beta default forge.toml. Declares zero domains —
 *  the bundled forge-moda runs from plugin assets regardless of
 *  what's listed here, so an empty domains array is the right
 *  starting state. The comments guide the user on extending later
 *  when v1.1+ ships additional domain libraries. */
export const FORGE_TOML_STUB_BODY = `# Forge vault manifest
# This file declares which domain libraries this vault depends on.
# For V1 closed beta, leave empty — forge-moda is pre-bundled into
# the plugin and available without being declared here.

domains = []

# When v1.1+ ships additional domains (e.g. "music"), add them to
# the list above, e.g.:
# domains = ["music"]
`;

/** Write the V1 default forge.toml into the vault root if missing.
 *  Pre-empts the InitializeForgeVaultWizard auto-open trigger
 *  (forge-action.ts:80 — "no forge.toml present"), which otherwise
 *  greets a fresh-vault user on first ribbon Forge click with a
 *  wizard that would then dispatch to the now-neutered installVault.
 *
 *  Returns true when the stub was written, false when an existing
 *  forge.toml was preserved. The boolean is mostly for logging /
 *  testing — callers don't branch on it. */
export async function ensureForgeTomlStub(
  adapter: TomlStubAdapter,
): Promise<boolean> {
  if (await adapter.exists(FORGE_TOML_STUB_PATH)) {
    return false;
  }
  await adapter.write(FORGE_TOML_STUB_PATH, FORGE_TOML_STUB_BODY);
  return true;
}
