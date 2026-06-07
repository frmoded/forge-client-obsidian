// v0.2.71 hotfix — pure-core helper that reads a freshly-written
// file off disk and explicitly syncs it into Pyodide MEMFS BEFORE
// the next operation that depends on MEMFS being current.
//
// Motivating bug: v0.2.70's slot-cache writeback at
// main.ts:handleSlotCacheMiss races the immediate `computeSnippet`
// retry. `vault.process` writes to disk; `vault.on('modify')` re-
// syncs MEMFS asynchronously; the retry beats the handler and the
// engine sees stale MEMFS → re-raises SlotCacheMissError → defensive
// abort fires → user-visible failure.
//
// Mirrors the v0.2.19 preflight pattern at main.ts:1502-1532 used
// for the /generate flow. The fix is one extra synchronous round-
// trip through the existing syncUserVaultFile / _forge_sync_user_file
// infrastructure (pyodide-host.ts:1069 / pyodide-host.ts:604).
//
// Pure-core extraction #30. No `obsidian` import; runs cleanly under
// `node --test`.

/** Minimal adapter for reading a file's current contents off disk.
 *  Real implementations wrap `app.vault.read(file)` or equivalent;
 *  tests construct an in-memory stub. */
export interface FileReader {
  readPath(path: string): Promise<string>;
}

/** Minimal adapter for syncing a path's content into Pyodide MEMFS.
 *  Real implementations call `host.syncUserVaultFile(relPath, content)`
 *  (pyodide-host.ts:1069); tests construct a recording stub. */
export interface MemfsSyncer {
  syncFileToMemfs(relPath: string, content: string): Promise<void>;
}

/** Read `filePath` via `reader`, then push the fresh content into
 *  MEMFS via `syncer`. Errors from either step propagate to the
 *  caller — production sites wrap in try/catch and log+continue per
 *  defense-in-depth (the retry's defensive abort catches the failure
 *  mode if MEMFS truly didn't catch up).
 *
 *  Pure: no side effects of its own; orchestrates the side-effects
 *  encapsulated by the injected adapters. */
export async function syncFileToMemfsAfterWrite(
  filePath: string,
  reader: FileReader,
  syncer: MemfsSyncer,
): Promise<void> {
  const freshContent = await reader.readPath(filePath);
  await syncer.syncFileToMemfs(filePath, freshContent);
}
