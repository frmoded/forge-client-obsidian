// Drain 2026-09-09-0930 (BYOK Phase 1) — pure-core extraction per the
// standing convention (no `import 'obsidian'`, testable without the
// Obsidian shim). This decision was inline in two near-identical
// payload-construction call sites in main.ts; extracted so it has one
// definition and a direct test.

/** The subset of ForgeSettings this decision needs. Narrow structural
 *  type rather than importing the full ForgeSettings interface, so
 *  this file stays obsidian-import-free. */
export interface BYOKSettingsSlice {
  useOwnAnthropicKey: boolean;
  ownAnthropicKey: string;
}

/** What goes on the wire as AlphaGenerateRequest.user_anthropic_key.
 *
 *  Toggle off → undefined, always (the key field's content is
 *  irrelevant when the toggle is off).
 *  Toggle on + non-empty key → that key.
 *  Toggle on + empty key → undefined, NOT an empty string — matches
 *  the hosted service's own "malformed/absent = shared key" handling
 *  (forge-transpile's anthropic_client._client_for), so the two sides
 *  agree on what "no key" looks like on the wire. */
export function resolveUserAnthropicKey(
  settings: BYOKSettingsSlice,
): string | undefined {
  return settings.useOwnAnthropicKey && settings.ownAnthropicKey
    ? settings.ownAnthropicKey
    : undefined;
}
