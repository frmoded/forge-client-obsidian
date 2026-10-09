// Drain 2026-10-09-2200 — header-action installation that cannot miss a cold start.
//
// THE BUG (CCQA, twice in ~9 reloads): after the first "Reload app without saving" of a session the restored note's header had NONE of the
// Forge actions — including the ones that are not gated on the note's type (Restore, New Forge note) — until another note was opened.
//
// ROOT CAUSE (see the drain's FEEDBACK for the evidence): `syncButtons()` only ever ran from onload (before any layout exists, so
// `getActiveViewOfType(MarkdownView)` is null and it returns), from `layout-change`, and from a debounced vault `modify`. A restored tab is a
// DEFERRED view until its container is inserted/clicked; its real MarkdownView appears later, and nothing guarantees a `layout-change` fires
// AFTER the view (and its file) exists with the leaf active (Obsidian's own `rerender()` drops the load when the leaf is `working`, and
// loads of different leaves fire layout-change at moments the ACTIVE leaf may still be deferred). Opening another note fires layout-change
// with a loaded active view — which is why that "fixed" it. Not a gate evaluating false (Restore/New note are ungated): the sync did not run
// against a usable view.
//
// THE FIX, in three parts: (1) subscribe to every event that can follow a deferred view becoming usable — `active-leaf-change`, `file-open`,
// `metadataCache` `resolved`/`changed`, workspace layout-ready — not just `layout-change`; (2) make the sync idempotent and skip-able
// (signature = note path + frontmatter type; skip only when the actions are present AND current), so extra triggers cost nothing and never
// duplicate or flicker; (3) coalesce bursts with a short debounce. Pure core, Obsidian injected (like the other *-core.ts files).

/** Workspace events after which a header sync must run (a restored leaf's view can become usable after any of them). */
export const HEADER_SYNC_WORKSPACE_EVENTS = ['layout-change', 'active-leaf-change', 'file-open'] as const;
/** Metadata-cache events: the frontmatter `type` that gates the Forge button arrives with these on a cold start. */
export const HEADER_SYNC_METADATA_EVENTS = ['resolved', 'changed'] as const;
export const HEADER_SYNC_DEBOUNCE_MS = 60;
/** After layout-ready, three more catch-up passes. The sync is idempotent and costs one query per view when nothing changed, so this is a
 *  safety net for the one ordering no event can be proven to cover: a restored leaf whose view finishes loading with NO event at all. */
export const HEADER_SYNC_CATCH_UP_MS = [300, 1200, 4000] as const;

/** What a view's header was last built for. A different note or a changed frontmatter `type` changes the set of actions. */
export function headerSignature(path: string | null | undefined, type: unknown): string {
  return `${path ?? ''}|${typeof type === 'string' ? type : ''}`;
}

/** Rebuild only when the actions are missing, or were built for something else. */
export function needsHeaderSync(i: { signature: string; lastSignature: string | undefined; actionsPresent: boolean }): boolean {
  return !i.actionsPresent || i.lastSignature !== i.signature;
}

export interface HeaderSyncScheduler {
  request(): void;
  runNow(): void;
  dispose(): void;
}

export interface HeaderSyncSchedulerDeps {
  debounceMs?: number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  run(): void;
}

export function createHeaderSyncScheduler(deps: HeaderSyncSchedulerDeps): HeaderSyncScheduler {
  const ms = deps.debounceMs ?? HEADER_SYNC_DEBOUNCE_MS;
  let timer: unknown = null;
  let disposed = false;
  const clear = () => { if (timer !== null) { deps.clearTimer(timer); timer = null; } };
  const run = () => {
    if (disposed) return;
    try { deps.run(); } catch (e) { console.warn('[forge] header sync failed:', e); }
  };
  return {
    request() {
      if (disposed) return;
      clear();
      timer = deps.setTimer(() => { timer = null; run(); }, ms);
    },
    runNow() {
      clear();
      run();
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}

/** The slice of Obsidian this needs (adapters in main.ts: `app.workspace.on`, `app.metadataCache.on`, `app.workspace.onLayoutReady`). */
export interface HeaderSyncHost {
  onWorkspace(event: string, handler: () => void): void;
  onMetadata(event: string, handler: () => void): void;
  onLayoutReady(handler: () => void): void;
}

export interface HeaderSyncInstall {
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Sync the header actions of EVERY open markdown view (idempotent). */
  sync(): void;
  debounceMs?: number;
  /** Override the subscribed events — used only by the test that reproduces the OLD wiring. */
  events?: { workspace: readonly string[]; metadata: readonly string[] };
}

/** Subscribe the scheduler to every event that can follow a view becoming usable, and catch up at layout-ready. */
export function installHeaderSync(host: HeaderSyncHost, deps: HeaderSyncInstall): { scheduler: HeaderSyncScheduler; dispose(): void } {
  const scheduler = createHeaderSyncScheduler({
    debounceMs: deps.debounceMs, setTimer: deps.setTimer, clearTimer: deps.clearTimer, run: deps.sync,
  });
  const events = deps.events ?? { workspace: HEADER_SYNC_WORKSPACE_EVENTS, metadata: HEADER_SYNC_METADATA_EVENTS };
  for (const ev of events.workspace) host.onWorkspace(ev, () => scheduler.request());
  for (const ev of events.metadata) host.onMetadata(ev, () => scheduler.request());
  // Layout-ready: the workspace is laid out and restored leaves exist. Sync at once, and once more after the debounce (a leaf that is still
  // deferred right now is picked up by the events above, and by this second pass if its view arrives in the meantime).
  const catchUps: unknown[] = [];
  host.onLayoutReady(() => {
    scheduler.runNow();
    scheduler.request();
    for (const ms of HEADER_SYNC_CATCH_UP_MS) catchUps.push(deps.setTimer(() => scheduler.runNow(), ms));
  });
  return { scheduler, dispose: () => { catchUps.forEach((h) => deps.clearTimer(h)); scheduler.dispose(); } };
}
