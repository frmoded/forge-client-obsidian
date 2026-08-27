// Drain 2026-08-27-0700 — Gate V. The output/input split is draggable and
// persisted, so the layout math lives here where it can be tested without
// a DOM (same convention as forge-panel-strip-core.ts).
//
// WHY A CLAMP EXISTS AT ALL, and why it is not defensive boilerplate: this
// repo has now been bitten twice by a persisted UI value with no way back.
// `panelStripCollapsed` (drain 0230) could strand a user with a hidden
// strip once its toggle was removed. A stored split is worse — a value at
// 0 or 1 hides one of the two regions *and* the divider that would undo
// it. So the stored value is never trusted: it is clamped on the read
// path, not on the write path, because the dangerous value can also arrive
// from a hand-edited data.json or a version that wrote a different shape.

/** Fraction of the panel's height given to the input strip. Matches the
 *  `max-height: 33%` the CSS used before this drain, so an existing
 *  layout is unchanged until the user drags. */
export const DEFAULT_STRIP_FRACTION = 0.33;

/** Bounds. The minimum keeps the strip's header row reachable (it is the
 *  only thing that still contains the collapse toggle); the maximum keeps
 *  a usable amount of output visible. Neither is a hard UI limit — they
 *  are the band a *stored* value is allowed to occupy. */
export const MIN_STRIP_FRACTION = 0.10;
export const MAX_STRIP_FRACTION = 0.80;

/** Validate and clamp a persisted split.
 *
 *  Accepts anything, because `data.json` is a file a person can edit and
 *  an older build may have written a different shape. Anything that is not
 *  a finite number in range becomes the default rather than an error — a
 *  broken setting must not stop the panel rendering. */
export function clampStripFraction(stored: unknown): number {
  if (typeof stored !== 'number' || !Number.isFinite(stored)) {
    return DEFAULT_STRIP_FRACTION;
  }
  if (stored < MIN_STRIP_FRACTION) return MIN_STRIP_FRACTION;
  if (stored > MAX_STRIP_FRACTION) return MAX_STRIP_FRACTION;
  return stored;
}

/** Fraction implied by a drag, given the pointer and the panel's box.
 *
 *  The strip occupies the space BELOW the divider, so its fraction grows
 *  as the pointer moves up. Returns a clamped value: a drag past either
 *  bound stops rather than inverting the layout. */
export function stripFractionFromDrag(
  pointerY: number,
  panelTop: number,
  panelHeight: number,
): number {
  if (!Number.isFinite(panelHeight) || panelHeight <= 0) {
    return DEFAULT_STRIP_FRACTION;
  }
  const belowPointer = panelTop + panelHeight - pointerY;
  return clampStripFraction(belowPointer / panelHeight);
}

/** CSS `flex-basis` for the strip at a given fraction. */
export function stripFlexBasis(fraction: number): string {
  return `${(clampStripFraction(fraction) * 100).toFixed(2)}%`;
}
