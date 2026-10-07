// Beat-as-data Phase 5c (drain 2026-10-07-0100) — let "Restore to last commit" cooperate with a Beat Box that AUTOSAVES.
//
// The existing restore order is flush -> checkout -> reload (restore-note-to-git-core.ts RESTORE_STEPS). A Beat Box is a second kind of
// open editor: it can have an edit waiting in the autosave debounce, and after the checkout it must show what git put on disk.
// This wraps the checkout:
//   HOLD     each Beat Box showing a restored path flushes its pending save, then silences autosave (no queued save can land later);
//   checkout (the caller's function — returns an outcome or throws);
//   RELEASE  each held Beat Box reloads from disk and resumes autosave — ALWAYS, even if the checkout failed or threw, so the widget
//            never keeps showing a state the note no longer has.
// If a HOLD fails the checkout is not run at all: we cannot promise that a queued autosave will not overwrite the restored file.

export interface RestoreParticipant {
  path: string;
  /** Write any pending autosave NOW, without holding. Called before `git status`, so a note whose only difference from HEAD is an edit still
   *  waiting in the 600 ms debounce is seen as modified (and restorable) rather than "already matches the last commit". */
  flush(): Promise<void>;
  /** Flush any pending autosave, then silence the pipeline. */
  hold(): Promise<void>;
  /** Reload the widget from the note on disk and resume autosave. */
  release(): Promise<void>;
}

/** Flush the participants for these paths (errors are swallowed: the hold step reports a failing flush where it matters). */
export async function flushRestoreParticipants(participants: readonly RestoreParticipant[], paths: readonly string[]): Promise<void> {
  await Promise.allSettled(participants.filter((p) => paths.includes(p.path)).map((p) => p.flush()));
}

export async function runRestoreWithHolds<T>(
  participants: readonly RestoreParticipant[],
  restoredPaths: readonly string[],
  checkout: () => T | Promise<T>,
): Promise<T> {
  const affected = participants.filter((p) => restoredPaths.includes(p.path));
  const settled = await Promise.allSettled(affected.map((p) => p.hold()));
  const holdFailure = settled.find((s) => s.status === 'rejected') as PromiseRejectedResult | undefined;
  try {
    if (holdFailure) throw holdFailure.reason;
    return await checkout();
  } finally {
    await Promise.allSettled(affected.map((p) => p.release()));
  }
}

// ---- who takes part ---------------------------------------------------------------------------------------------------
// restore-note-to-git.ts must not import the Beat Box view (which imports the restore function for its header action). Views register a
// provider instead; the restore asks for the participants at the moment it runs.
const providers = new Set<() => readonly RestoreParticipant[]>();

/** Register a source of restore participants (e.g. the open Beat Box views). Returns an unregister function. */
export function registerRestoreParticipants(provider: () => readonly RestoreParticipant[]): () => void {
  providers.add(provider);
  return () => { providers.delete(provider); };
}

export function collectRestoreParticipants(): RestoreParticipant[] {
  return [...providers].flatMap((p) => [...p()]);
}
