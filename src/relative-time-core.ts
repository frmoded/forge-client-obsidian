// 2026-11-18 (R1, item 4) - the small muted "minutes ago" under each line of a music tab's dialog (chat-panel-dom.ts). Pure (no DOM, no obsidian, no clock of its own: the caller says what "now" is), so the boundaries are
// pinned by relative-time-core.test.ts. The words are the ones a chat uses: "just now", "1 minute ago", "7 minutes ago", "2 hours ago", "yesterday", "3 days ago".

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
/** How often the open tab recounts its labels (ONE timer per tab, never one per entry). */
export const TICK_MS = 30_000;

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

/**
 * The age of `at` seen from `now`, in words. Whole units, rounded DOWN (59 s is still "just now", 119 s is still "1 minute ago"). A timestamp in the future (a clock that moved back, a restored log from another machine)
 * clamps to "just now". `''` (nothing to show) for a timestamp that is not a real time: an old entry that never had one (0, a negative number, NaN, not a number).
 */
export function relativeTime(at: number, now: number): string {
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0 || typeof now !== 'number' || !Number.isFinite(now)) return '';
  const age = Math.max(0, now - at);
  if (age < MINUTE_MS) return 'just now';
  if (age < HOUR_MS) return plural(Math.floor(age / MINUTE_MS), 'minute');
  if (age < DAY_MS) return plural(Math.floor(age / HOUR_MS), 'hour');
  const days = Math.floor(age / DAY_MS);
  if (days === 1) return 'yesterday';
  if (days < 30) return plural(days, 'day');
  if (days < 365) return plural(Math.floor(days / 30), 'month');
  return plural(Math.floor(days / 365), 'year');
}
