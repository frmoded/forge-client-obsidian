// Drain 2530 — decide whether to refresh the note's `# Python`
// section after a successful `Run only` compute.
//
// Extracted as a pure-core so the L60 caller-integration invariant —
// "refresh fires ONLY on successful runs, ONLY when the caller opted
// in by passing a file" — is testable without an Obsidian fixture.
//
// The runSnippet path in main.ts:
//   1. captures `file` from the active view (or the fallback caller).
//   2. calls `computeSnippetWithArgs(..., file)` — the file gets
//      threaded into `refreshPythonAfter`.
//   3. after compute returns 2xx, main.ts calls `writeSourcePythonBack(file)`.
//   4. on 4xx/5xx or handler-slot-miss failure, main.ts returns early
//      without hitting the refresh call — the # Python section keeps
//      its "out of date" state so the user can see something's wrong.
//
// This pure-core captures the gate at step 3 as a boolean function so
// unit tests can assert every combination.

/** Decision: should the compute-success path call
 *  `writeSourcePythonBack` to refresh the note's `# Python` section?
 *
 *  - `computeHttpStatus` is the `res.status` from the compute call.
 *  - `refreshRequestedFile` is truthy when the caller (runSnippet)
 *    opted in by passing its captured `file`. Undefined = caller
 *    doesn't want a refresh (e.g. forgeSnippet's Forge-button flow
 *    already writes Python back BEFORE the compute call).
 *
 *  Contract:
 *  - HTTP 4xx / 5xx → false (don't clobber "out of date" state; the
 *    stale Python is the SIGNAL something went wrong).
 *  - HTTP < 400 + refresh requested → true (fire the write-back).
 *  - Refresh NOT requested (undefined) → false regardless of status
 *    (other callers manage their own write-back timing).
 */
export function shouldRefreshPythonAfterRun(
  computeHttpStatus: number,
  refreshRequestedFile: unknown,
): boolean {
  if (!refreshRequestedFile) return false;
  if (computeHttpStatus >= 400) return false;
  return true;
}
