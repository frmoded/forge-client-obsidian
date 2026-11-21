// 2026-11-21-1011 - a note's chat history follows the NOTE, not its path (the CCQA F9 proposal, accepted). The history is `settings.dialogHistory[notePath]` in the plugin's own data.json; the creation time of the note that wrote it is kept beside it
// in `settings.dialogCtime[notePath]`. (a) a RENAME moves the entry to the new path (with the file's own time), (b) a DELETE drops it, (c) the store ignores a list whose time is not the file's (dialog-core.ts settingsStore): a note re-created at an
// old path, or a reset done outside Obsidian that gave no event, does not show yesterday's conversation. Music-composer code behind the list-model seam: lean never carries it (its stubs change nothing). P3: with no history nothing is made, nothing changes.
/** 2026-11-19-0997: this core is the LIST MODEL's (reached only through src/list-model-selected.ts); list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_DIALOG_FOLLOW_CORE = 'forge-list-model-core:dialog-follow-core';

export interface DialogHistorySettings { dialogHistory?: unknown; dialogCtime?: unknown }
const own = (o: Record<string, unknown>, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const record = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** A note was renamed: its history (and the time kept with it) moves to the new path, REPLACING whatever a former note left there. A note with NO history changes nothing (a second event for the same move must not drop the list the first one moved; a leftover of a former note is the creation time's business, see settingsStore). `ctime` is the file's own creation time now (a rename keeps it) and, when given, is what is stored. True = the settings changed (save them). */
export function moveDialogHistory(settings: DialogHistorySettings, from: string, to: string, ctime?: number): boolean {
  const h = record(settings.dialogHistory); if (h === null || from === to) return false;
  const times = record(settings.dialogCtime);
  if (!own(h, from)) return false;
  h[to] = h[from]; delete h[from];
  const kept = times !== null && own(times, from) ? times[from] : undefined;
  if (times !== null) { delete times[from]; delete times[to]; }
  const stamp = typeof ctime === 'number' ? ctime : kept;
  if (typeof stamp === 'number') { const t = times ?? (settings.dialogCtime = {}) as Record<string, unknown>; t[to] = stamp; }
  return true;
}

/** A note was deleted: its history and its time go. True = the settings changed. */
export function dropDialogHistory(settings: DialogHistorySettings, path: string): boolean {
  const h = record(settings.dialogHistory), times = record(settings.dialogCtime);
  const inH = h !== null && own(h, path), inT = times !== null && own(times, path);
  if (!inH && !inT) return false;
  if (inH) delete h![path]; if (inT) delete times![path];
  return true;
}

// ---- the plugin's side, as small as the shared code can be (lean carries only the stubs of these; every line of logic is here) ------------------------------------------------------------------------------------------
export interface DialogPlugin { settings: DialogHistorySettings; saveDialogSoon(): void }
/** The vault's `rename` event for a note: move its history, keep the file's own creation time with it, save (debounced) only when something changed. */
export function dialogRenamed(plugin: DialogPlugin, f: { path: string; stat?: { ctime?: number } }, oldPath: string): void { if (moveDialogHistory(plugin.settings, oldPath, f.path, f.stat?.ctime)) plugin.saveDialogSoon(); }
/** The vault's `delete` event for a note: drop its history. */
export function dialogDeleted(plugin: DialogPlugin, f: { path: string }): void { if (dropDialogHistory(plugin.settings, f.path)) plugin.saveDialogSoon(); }
/** The creation time of the note at `path` (a folder has no stat; a missing note, an unreadable stat: undefined). */
export function noteCtimeOf(app: { vault: { getAbstractFileByPath(p: string): unknown } }, path: string): number | undefined { const c = (app.vault.getAbstractFileByPath(path) as { stat?: { ctime?: unknown } } | null)?.stat?.ctime; return typeof c === 'number' && Number.isFinite(c) ? c : undefined; }
/** The store's check: is the list kept for `path` the one of the note that is there now? False only when BOTH times are known and differ (no time asked, or none stored by an older data.json: the list is shown). */
export function dialogFresh(settings: DialogHistorySettings, path: string, ctime?: number): boolean { const t = record(settings.dialogCtime)?.[path]; return !(typeof ctime === 'number' && typeof t === 'number' && t !== ctime); }
/** The store wrote a list for `path` while the note's creation time was `ctime`: keep it beside the list (nothing is made when the time is unknown: the settings keep their old shape). */
export function dialogStamp(settings: DialogHistorySettings, path: string, ctime?: number): void { if (typeof ctime === 'number') ((record(settings.dialogCtime) ?? (settings.dialogCtime = {})) as Record<string, unknown>)[path] = ctime; }
/** After the store capped its notes: a time never outlives its list. */
export function dialogPrune(settings: DialogHistorySettings): void { const t = record(settings.dialogCtime), h = record(settings.dialogHistory); if (t !== null) for (const k of Object.keys(t)) if (h === null || !own(h, k)) delete t[k]; }
