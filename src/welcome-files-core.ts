// Pure-core helper for the v0.2.56 first-install welcome flow.
// welcome.ts wraps this with the App adapter.
//
// Per the 2026-06-05-1145 prompt: every fresh-install Forge vault
// gets `welcome.md` + `greet.md` at vault root. Forge-clicking
// welcome.md on first launch produces "Welcome to Forge.\nHello world"
// in the output panel — the "low floor" Mission property delivered
// as a concrete artifact.
//
// Idempotent + respectful of user intent: extracts only when BOTH
// files are absent. Partial deletion (one present, the other not)
// is intentional state — don't restore.
//
// Pure-core extraction No. 21. No `obsidian` import; node --test
// exercises this without a shim via the WelcomeFilesAdapter
// narrow interface.

/** Narrow adapter shape this helper consumes. Obsidian's
 *  `app.vault.adapter` satisfies this at runtime; the test suite
 *  satisfies it with an in-memory stub. */
export interface WelcomeFilesAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, body: string): Promise<void>;
}

/** Vault-relative paths the helper writes to. */
export const WELCOME_VAULT_PATH = 'welcome.md';
export const GREET_VAULT_PATH = 'greet.md';

/** Plugin-asset paths the helper reads from. Caller must pass the
 *  bundled source paths so the helper stays adapter-agnostic. */
export interface WelcomeBundledPaths {
  welcomeBundle: string;
  greetBundle: string;
}

/** Outcome of an extraction attempt; surfaced for caller logging. */
export type WelcomeExtractionResult =
  | { kind: 'extracted' }                            // both files written
  | { kind: 'skip-existing' }                        // at least one already present (preserve user intent)
  | { kind: 'skip-no-bundle'; missing: string }      // bundled asset missing (dev mode / corrupt install)
  | { kind: 'error'; message: string };               // write/read failure

/** Extract `welcome.md` + `greet.md` to vault root, but ONLY when
 *  neither already exists. Returns the outcome so the caller can
 *  log appropriately.
 *
 *  Behavior matrix:
 *  - Both vault files present → skip (preserve user edits).
 *  - One vault file present → skip (respect partial deletion as
 *    intentional state — user kept one for their own work).
 *  - Both absent + bundled assets present → extract both.
 *  - Both absent + bundled asset missing → skip + warn (caller logs).
 *  - I/O error during read/write → return error.
 *
 *  Idempotent: re-running with both files present is a no-op
 *  ('skip-existing'). */
export async function ensureWelcomeFiles(
  adapter: WelcomeFilesAdapter,
  paths: WelcomeBundledPaths,
): Promise<WelcomeExtractionResult> {
  try {
    const welcomeHere = await adapter.exists(WELCOME_VAULT_PATH);
    const greetHere = await adapter.exists(GREET_VAULT_PATH);
    if (welcomeHere || greetHere) {
      return { kind: 'skip-existing' };
    }
    const welcomeBundleHere = await adapter.exists(paths.welcomeBundle);
    if (!welcomeBundleHere) {
      return { kind: 'skip-no-bundle', missing: paths.welcomeBundle };
    }
    const greetBundleHere = await adapter.exists(paths.greetBundle);
    if (!greetBundleHere) {
      return { kind: 'skip-no-bundle', missing: paths.greetBundle };
    }
    const welcomeBody = await adapter.read(paths.welcomeBundle);
    const greetBody = await adapter.read(paths.greetBundle);
    await adapter.write(WELCOME_VAULT_PATH, welcomeBody);
    await adapter.write(GREET_VAULT_PATH, greetBody);
    return { kind: 'extracted' };
  } catch (e) {
    return { kind: 'error', message: (e as Error).message };
  }
}
