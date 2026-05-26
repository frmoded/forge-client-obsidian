// Pure-core helpers for the v0.2.7 closed-beta polish: detecting
// network-refusal errors (so post-/generate dep-sync stays quiet when
// no uvicorn is running) and composing the first-run welcome message.
//
// Lives in its own file (no obsidian imports) so node --test can
// exercise it without the Obsidian shim that main.ts pulls in.

/** True when the error message looks like a no-server / no-route
 *  network failure rather than a real engine bug. Closed-beta users
 *  intentionally don't run uvicorn, so post-/generate dependency-sync
 *  calls hit ECONNREFUSED on every Forge-click; we want to log that
 *  exactly once per session, not every click.
 *
 *  Pattern set mirrors what shows up in Chromium/Electron / Node /
 *  Obsidian's requestUrl error surfaces:
 *    - ERR_CONNECTION_REFUSED (Chromium fetch)
 *    - ECONNREFUSED            (Node net stack)
 *    - ENOTFOUND               (DNS miss — user typo'd serverUrl)
 *    - ENETUNREACH             (no route)
 *
 *  Anything else (HTTP 4xx/5xx, "request failed status N", thrown
 *  TypeErrors, etc.) falls through to the regular console.warn so
 *  real bugs still surface.
 */
export function isNetRefusalError(msg: string): boolean {
  return /ERR_CONNECTION_REFUSED|ECONNREFUSED|ENOTFOUND|ENETUNREACH/i.test(msg);
}

/** Compose the first-run welcome notice text. Token-already-set is
 *  rare on a true first install but possible if data.json was migrated
 *  from another vault — give those users the shorter acknowledgement.
 *  Empty-token (the closed-beta-typical path) gets the explicit setup
 *  nudge so they know exactly where to paste their token before they
 *  hit the "Set your transpile token…" Notice during a Forge-click. */
export function welcomeMessage(hasToken: boolean): string {
  return hasToken
    ? 'Forge is ready. Open Settings → Forge to review your configuration.'
    : 'Welcome to Forge. To enable AI-powered snippet generation, paste your transpile token at Settings → Forge → Transpile service → Transpile service token.';
}
