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

// 2026-11-18 (0935) - the draggable divider between the dialog (left) and the Score (right): the ratio of the LEFT column to the tab's width. The limits are in pixels (the dialog never under 280 px, the Score never under 320 px), so the
// allowed ratio depends on the tab width; a stored ratio is clamped for DISPLAY only (it is never rewritten by a narrow tab, so widening restores it). Pure.
export const DEFAULT_RATIO = 0.4;
export const LEFT_MIN_PX = 280;
export const RIGHT_MIN_PX = 320;
export const RATIO_STEP = 0.02;
const STORED_MIN = 0.1, STORED_MAX = 0.9;
const measured = (w: unknown): w is number => typeof w === 'number' && Number.isFinite(w) && w > 0;

/** A stored ratio: a finite number from 0.1 to 0.9, anything else is the default. */
export const sanitizeRatio = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= STORED_MIN && v <= STORED_MAX ? v : DEFAULT_RATIO);
/** The ratios this tab width allows. Under 600 px (never in the two-column layout) there is one: the two minimums share the room 280 : 320. */
export function ratioRange(tabWidth: number): { min: number; max: number } {
  const min = LEFT_MIN_PX / tabWidth, max = 1 - RIGHT_MIN_PX / tabWidth;
  return min <= max ? { min, max } : { min: LEFT_MIN_PX / (LEFT_MIN_PX + RIGHT_MIN_PX), max: LEFT_MIN_PX / (LEFT_MIN_PX + RIGHT_MIN_PX) };
}
/** The ratio shown in a tab of this width. A tab not measured yet keeps the ratio as it is. */
export function clampRatio(ratio: number, tabWidth: number): number {
  if (!measured(tabWidth)) return ratio;
  const { min, max } = ratioRange(tabWidth); return Math.min(max, Math.max(min, ratio));
}
/** The ratio of a drag that started at `startRatio` and moved the pointer `dx` px. */
export const ratioFromDrag = (startRatio: number, dx: number, tabWidth: number): number => (measured(tabWidth) ? clampRatio(startRatio + dx / tabWidth, tabWidth) : startRatio);
/** One arrow key: 2 points left (-1) or right (+1), from where the divider is SHOWN. */
export const stepRatio = (ratio: number, dir: -1 | 1, tabWidth: number): number => clampRatio(Math.round((clampRatio(ratio, tabWidth) + dir * RATIO_STEP) * 1000) / 1000, tabWidth);
export const resetRatio = (): number => DEFAULT_RATIO;
