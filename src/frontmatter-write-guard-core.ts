// Drain 2026-10-11-0900 §4 — pure core of the "a deleted note stays deleted" guard around the plugin's own frontmatter writes.
// See frontmatter-write-guard-core.test.ts for the full account of the writer that re-created ClaudeQA's `regression_16th_hihat`.
//
// Obsidian's `fileManager.processFrontMatter` is read -> transform -> `fs.writeFile`, which CREATES a missing file. The plugin's
// `vault.on('modify')` handlers call it in response to events that an external `git checkout` + `git rm` produce, so the write can
// land after the delete. This guard (a) never starts a write to a path that is gone and (b) undoes a write that resurrected a path
// that was deleted while it ran. No Obsidian imports (pure-core convention).

export interface DeletionTracker {
  /** A vault `delete` event for `path` was observed at time `at` (ms). */
  noteDeleted(path: string, at: number): void;
  /** Was `path` deleted at or after `since`? */
  deletedSince(path: string, since: number): boolean;
}

export function createDeletionTracker(opts: { keepMs?: number } = {}): DeletionTracker {
  const keepMs = opts.keepMs ?? 10_000;
  const at = new Map<string, number>();
  return {
    noteDeleted(path, t) {
      at.set(path, t);
      for (const [p, when] of at) if (t - when > keepMs) at.delete(p);   // bounded: forget what no write could still be racing
    },
    deletedSince(path, since) {
      const when = at.get(path);
      return when !== undefined && when >= since;
    },
  };
}

export interface GuardedWriteDeps {
  path: string;
  now(): number;
  tracker: DeletionTracker;
  exists(): Promise<boolean>;
  /** Remove the file (used only to undo a resurrection). */
  remove(): Promise<void>;
  /** The actual `processFrontMatter` call. */
  write(): Promise<void>;
  /** Wait `ms` — lets a delayed filesystem event arrive before the verdict. */
  settle(ms: number): Promise<void>;
  /** 0 = do not wait (user-initiated writes); the tracker is still consulted. */
  settleMs?: number;
  log?(message: string): void;
}

export type GuardedWriteOutcome = 'written' | 'skipped-missing' | 'undone-resurrection';

/** Event-driven writers (the modify handlers that race a `git rm`) wait this long for a late delete event before they judge. */
export const EVENT_WRITE_SETTLE_MS = 300;

export async function guardedFrontMatterWrite(deps: GuardedWriteDeps): Promise<GuardedWriteOutcome> {
  const start = deps.now();
  if (!(await deps.exists())) {
    deps.log?.(`frontmatter write skipped: ${deps.path} no longer exists`);
    return 'skipped-missing';
  }
  await deps.write();
  const settleMs = deps.settleMs ?? 0;
  if (settleMs > 0) await deps.settle(settleMs);
  // A delete observed while we were writing, and the file is there now: it is there because OUR write created it.
  if (deps.tracker.deletedSince(deps.path, start) && (await deps.exists())) {
    await deps.remove();
    deps.log?.(`frontmatter write resurrected ${deps.path} after a delete; removed it again`);
    return 'undone-resurrection';
  }
  return 'written';
}
