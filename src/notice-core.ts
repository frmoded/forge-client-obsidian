// Drain 2026-08-14-0350 — single point of control for the user-facing
// message prefix, plus the swallow used by notice().
//
// Kept as a `-core` module (no `obsidian` import) so both concerns are
// directly unit-testable; main.ts is not, because it imports the Obsidian
// runtime.

/**
 * The prefix on user-facing plugin messages.
 *
 * An Obsidian Notice carries NO attribution of its own — toasts appear in a
 * shared corner with nothing identifying which plugin spoke. This prefix is
 * the only thing telling a user that "no active note to copy." came from
 * here rather than from any of the other plugins in their vault. That is
 * why drain 0290 flagged it for a decision rather than stripping it during
 * the Forge-word retirement, and why the driver's answer was to keep it.
 *
 * It lives here so changing it is one edit rather than a 113-site sweep.
 */
export const NOTICE_PREFIX = 'Forge: ';

/** Apply the standard prefix to a user-facing message. */
export function prefixed(message: string): string {
  return `${NOTICE_PREFIX}${message}`;
}

/**
 * Attach a terminal error handler to a fire-and-forget render promise.
 *
 * `notice()` is declared `: void` and dispatches an async `forgeOutput(...)`.
 * Before this existed it discarded the promise with a bare `void`, so a
 * rejection escaped as an unhandled promise rejection — and, critically, a
 * caller's own try/catch around `this.notice(...)` could never catch it,
 * because `notice()` had already returned. Drain 0300 hit exactly that: the
 * onload staleness warning crashed inside `getRightLeaf`, and the failure
 * surfaced as an unrelated "failed after 3 attempts" message somewhere else
 * entirely.
 *
 * Deliberately terminal: it logs and stops. No retry — re-rendering after a
 * render failure risks looping the same failure, and the caller has no way
 * to react anyway. Per the "load-bearing diagnostics belong in the primary
 * user surface" rule, the console here is a LAST-RESORT fallback: the
 * primary surface was already attempted and failed. It is not a substitute
 * for rendering.
 */
export function swallowRenderFailure(
  render: Promise<unknown>,
  report: (err: unknown) => void,
): void {
  void render.catch(report);
}
