// v0.2.218 — Pure-core grace-period spinner state machine.
//
// Driver smoke 2026-06-30: Forge-click had no visible "working" state
// during multi-second compute (LLM /generate, /resolve-slot, moda
// simulations). Cohort saw silence, sometimes double-clicked, assumed
// Forge was dead.
//
// Design (per the prompt's §1.2):
//   - Show spinner ONLY after 200ms in-flight time. Fast snippets
//     (compute < 200ms) skip the flash entirely.
//   - Each start(label) cancels any pending timer and replaces with
//     the new label (concurrent calls don't stack).
//   - stop() clears the timer if pending; clears the text if shown.
//   - Caller injects setText (status-bar update) so the core stays
//     pure + testable without an Obsidian runtime.

export interface ForgeSpinnerOptions {
  /** Milliseconds to wait before showing the spinner. Defaults to 200. */
  gracePeriodMs?: number;
  /** Injected setText — typically wired to status bar item's setText.
   *  Empty string clears the bar. */
  setText: (s: string) => void;
  /** Injected setTimeout (default: globalThis.setTimeout) — exposed
   *  for fake-timer tests. */
  setTimeout?: (cb: () => void, ms: number) => unknown;
  /** Injected clearTimeout (default: globalThis.clearTimeout) — pair
   *  with setTimeout. */
  clearTimeout?: (handle: unknown) => void;
}

export class ForgeSpinner {
  private gracePeriodMs: number;
  private setText: (s: string) => void;
  private _setTimeout: (cb: () => void, ms: number) => unknown;
  private _clearTimeout: (handle: unknown) => void;
  private pendingTimer: unknown = null;
  private isShown = false;

  constructor(opts: ForgeSpinnerOptions) {
    this.gracePeriodMs = opts.gracePeriodMs ?? 200;
    this.setText = opts.setText;
    this._setTimeout = opts.setTimeout ?? ((cb, ms) => setTimeout(cb, ms));
    this._clearTimeout = opts.clearTimeout ?? ((h) => clearTimeout(h as any));
  }

  /** Start a spinner with the given label. If already-shown, replaces
   *  the visible text immediately. If pending (under grace), replaces
   *  the pending label without resetting the grace timer (we want to
   *  show SOMETHING by grace + start_time, not push it out). */
  start(label: string): void {
    // v0.2.228 diagnostic round 2: driver reports v0.2.225 spinner fix
    // didn't close the murmuration-first-click gap. Inline console.warn
    // so console output shows whether wrap fires, when grace expires,
    // and whether setText is reached. Remove after root cause is
    // observed at runtime (drain 2026-07-01-2200).
    try {
      console.warn(`[spinner-diag] start("${label}") at ${performance.now().toFixed(1)}ms`);
    } catch { /* perf API edge case */ }
    if (this.isShown) {
      this.setText(label);
      return;
    }
    if (this.pendingTimer !== null) {
      // Pending: cancel old timer, schedule new with new label.
      // Caller convention: each start() represents a new operation,
      // so the timer resets with the new label.
      this._clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.pendingTimer = this._setTimeout(() => {
      this.pendingTimer = null;
      this.isShown = true;
      try {
        console.warn(`[spinner-diag] setText("${label}") after grace at ${performance.now().toFixed(1)}ms`);
      } catch { /* perf API edge case */ }
      this.setText(label);
    }, this.gracePeriodMs);
  }

  /** Stop the spinner. Clears the pending timer if any, clears the
   *  visible text if shown. Idempotent: stop() with nothing pending +
   *  nothing shown is a no-op. */
  stop(): void {
    // v0.2.228 diagnostic round 2 — see start() comment.
    try {
      console.warn(`[spinner-diag] stop() at ${performance.now().toFixed(1)}ms (pending=${this.pendingTimer !== null}, shown=${this.isShown})`);
    } catch { /* perf API edge case */ }
    if (this.pendingTimer !== null) {
      this._clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    if (this.isShown) {
      this.isShown = false;
      this.setText('');
    }
  }

  /** Convenience: wrap an async operation with a spinner. The
   *  spinner starts before the promise awaits and stops in finally —
   *  so errors clean up the bar correctly. Returns the operation's
   *  result.
   *
   *  Usage:
   *    const result = await spinner.wrap('Forge: 🔥 running …',
   *      () => host.runSnippet(...));
   */
  async wrap<T>(label: string, op: () => Promise<T>): Promise<T> {
    this.start(label);
    try {
      return await op();
    } finally {
      this.stop();
    }
  }
}
