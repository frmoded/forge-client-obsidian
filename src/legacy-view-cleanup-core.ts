// Retire-the-library-note-palette drain (2026-10-07-0200) — workspace layouts saved before the palette was removed still hold a
// `forge-chips` pane. The view type is no longer registered, so Obsidian would restore it as an empty ghost pane. Sweep such leaves once,
// at layout-ready. Pure core over a minimal workspace interface so the migration is unit-tested.

/** View types the plugin once registered and no longer does. */
export const LEGACY_VIEW_TYPES = ['forge-chips'] as const;

export interface LegacyWorkspace {
  getLeavesOfType(type: string): unknown[];
  detachLeavesOfType(type: string): void;
}

/** Detach every leaf of a retired view type. Returns how many leaves were swept. Never throws (a failed sweep must not break plugin load). */
export function detachLegacyViewLeaves(ws: LegacyWorkspace): number {
  let swept = 0;
  for (const type of LEGACY_VIEW_TYPES) {
    try {
      const n = ws.getLeavesOfType(type).length;
      if (n > 0) {
        ws.detachLeavesOfType(type);
        swept += n;
      }
    } catch (e) {
      console.warn(`[forge] legacy view sweep for ${type} failed:`, e);
    }
  }
  return swept;
}
