// Beat-as-data Phase 5b (drain 2026-10-06-1200) — the autosave pipeline that replaces the Rhythm Box's "Save to note" button.
//
// Pure core: no obsidian, no real timers. The clock (`setTimer`/`clearTimer`) and the one atomic write (`write`) are INJECTED, so
// every rule below is unit-tested deterministically. The view (rhythm-edit-view.ts) wires them to window timers and `vault.process`.
//
// Rules, as implemented:
//   * DEBOUNCE   every submit() restarts a 600 ms window; a burst of edits is ONE write carrying the LAST payload.
//   * ONE WRITE  at most one write is in flight. A payload that arrives mid-write is not dropped: it waits for its own debounce, and
//                if that fires while the write is still running it is QUEUED and written the moment the running write finishes.
//   * FLUSH      flush() cancels the debounce, writes the latest payload NOW, and resolves only when nothing is pending or in flight
//                (used on close, on switching back to JSON, on navigating away, and on plugin unload).
//   * ERRORS     a failed write leaves an `error` status that is NOT cleared by the next edit — only by the next successful save.
//                A refused / invalid write does not stop autosave; a STALE one (the note changed on disk) HALTS it: the pipeline
//                reports a `conflict`, ignores further edits and never writes over the external change until resume().
//   * STATUS     saving | saved | error | conflict | idle, reported through onStatus — "saved" is never claimed while a newer edit is
//                still waiting.

export type SaveOutcome =
  | { ok: true }
  | { ok: false; kind: 'invalid' | 'stale' | 'refused' | 'error'; message: string };

export type AutosaveStatus =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved' }
  | { state: 'error'; message: string }
  | { state: 'conflict'; message: string };

export const DEFAULT_DEBOUNCE_MS = 600;

export interface AutosaveDeps {
  debounceMs?: number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** The one atomic write. Resolves with the outcome; may also reject (treated as an error outcome). */
  write(payload: unknown): Promise<SaveOutcome>;
  onStatus(status: AutosaveStatus): void;
}

export interface AutosavePipeline {
  /** The widget changed pattern data: remember the latest payload and (re)start the debounce. Ignored while halted. */
  submit(payload: unknown): void;
  /** Write the latest payload now; resolves when nothing is pending or in flight. Never writes while halted. */
  flush(): Promise<void>;
  /** An external change was detected while a save was pending: drop the pending edit, stop writing, report the conflict. */
  halt(message: string): void;
  /** The user reloaded from the note: clear the halt and any error. */
  resume(): void;
  status(): AutosaveStatus;
  /** True while an edit is waiting for its debounce, a write is in flight, or one is queued. */
  busy(): boolean;
  dispose(): void;
}

export function createAutosavePipeline(deps: AutosaveDeps): AutosavePipeline {
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  let latest: unknown;
  let hasLatest = false;
  let timer: unknown = null;
  let inflight: Promise<void> | null = null;
  let queued = false;
  let halted = false;
  let lastError: string | null = null;
  let current: AutosaveStatus = { state: 'idle' };

  const emit = (s: AutosaveStatus) => { current = s; deps.onStatus(s); };
  /** Show "saving" — unless an error is being displayed, which persists until a save succeeds. */
  const emitSaving = () => { if (lastError === null) emit({ state: 'saving' }); };

  function clearTimerIfAny() {
    if (timer !== null) { deps.clearTimer(timer); timer = null; }
  }

  function startWrite() {
    if (halted || !hasLatest) return;
    if (inflight) { queued = true; return; }
    const payload = latest;
    hasLatest = false;
    emitSaving();
    inflight = (async () => {
      let outcome: SaveOutcome;
      try {
        outcome = await deps.write(payload);
      } catch (e) {
        outcome = { ok: false, kind: 'error', message: `Not saved: ${(e as Error)?.message ?? e}` };
      }
      inflight = null;
      if (outcome.ok === false) {
        lastError = outcome.message;
        if (outcome.kind === 'stale') {
          halted = true;
          hasLatest = false;
          queued = false;
          clearTimerIfAny();
          emit({ state: 'conflict', message: outcome.message });
        } else {
          emit({ state: 'error', message: outcome.message });
        }
      } else {
        lastError = null;
        if (!(hasLatest || queued || timer !== null)) emit({ state: 'saved' });
      }
      if (queued) { queued = false; startWrite(); }
    })();
  }

  return {
    submit(payload) {
      if (halted) return;
      latest = payload;
      hasLatest = true;
      emitSaving();
      clearTimerIfAny();
      timer = deps.setTimer(() => { timer = null; startWrite(); }, debounceMs);
    },
    async flush() {
      if (halted) return;
      clearTimerIfAny();
      startWrite();
      while (inflight) await inflight;
    },
    halt(message) {
      halted = true;
      hasLatest = false;
      queued = false;
      clearTimerIfAny();
      lastError = message;
      emit({ state: 'conflict', message });
    },
    resume() {
      halted = false;
      hasLatest = false;
      queued = false;
      lastError = null;
      clearTimerIfAny();
      emit({ state: 'idle' });
    },
    status: () => current,
    busy: () => hasLatest || timer !== null || inflight !== null || queued,
    dispose() { clearTimerIfAny(); },
  };
}
