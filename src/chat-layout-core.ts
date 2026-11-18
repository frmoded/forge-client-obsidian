// 2026-11-18 (R1, item 3) - how a music tab is laid out, decided from the TAB's own width (not the window's): WIDE (about 900 px and up) = two columns, the dialog and the composer card on the LEFT (about 40 %), the Score and its
// toolbar on the RIGHT (about 60 %), each scrolling on its own; NARROW = the stacked layout (the Score above, the dialog and the card below). Pure (no DOM, no obsidian); chat-panel-dom.ts measures the tab and sets the class.
// This replaces the position switch of 2026-11-13-1214 / 2026-11-17-2001 (bottom | right): the setting `dialogDock` is gone and `withoutDialogDock` drops an old value from the saved data.

export const WIDE_MIN_PX = 900;
export type ChatLayout = 'wide' | 'narrow';
export const CHAT_WIDE_CLASS = 'forge-chat-wide';

/** The layout for a tab this many pixels wide. A tab not measured yet (0, NaN, not a number) is narrow: the stacked layout is the safe one. */
export const layoutFor = (width: unknown): ChatLayout => (typeof width === 'number' && Number.isFinite(width) && width >= WIDE_MIN_PX ? 'wide' : 'narrow');

/** The plugin's saved data without the retired `dialogDock` ('bottom' | 'right') setting. Silent: no notice; the data is only copied, never mutated; every other key is untouched. */
export function withoutDialogDock<T extends Record<string, unknown>>(data: T | null | undefined): { data: T; changed: boolean } {
  if (data === null || data === undefined || typeof data !== 'object' || Array.isArray(data) || !('dialogDock' in data)) return { data: (data ?? {}) as T, changed: false };
  const { dialogDock: _retired, ...rest } = data;
  return { data: rest as unknown as T, changed: true };
}
