// v0.2.233 — pure-core helper for the drain 2026-07-02-1630 welcome.md
// refresh-on-V1-detect feature. Classifies a Welcome.md / welcome.md /
// greet.md body by shape so the refresh logic can decide whether to
// preserve cohort customization or replace with the current V2 bundle.
//
// Existing cohort users have `.forge-sentinel` from their first install,
// which means `runFirstRunCheck`'s welcome extraction early-exits and
// they never see the v0.2.230 V2 refresh. Same problem will recur on
// every future welcome refresh. This classifier + the corresponding
// refresh helper in welcome.ts close the gap by detecting outdated
// shapes (V1 or Obsidian default) and triggering a one-time replace.

/** Possible shapes for a welcome-flavored note:
 *  - 'v1': legacy `# English` shape (pre-v0.2.230). Refresh.
 *  - 'obsidian-default': Obsidian's own boilerplate that never got
 *    replaced (Forge welcome.md extraction was skipped because
 *    Obsidian's `Welcome.md` already existed). Refresh.
 *  - 'v2': current `# Description` shape. No-op.
 *  - 'custom': cohort hand-authored — no V1 markers AND no Obsidian
 *    boilerplate AND no V2 markers. Don't touch. */
export type WelcomeShape = 'v1' | 'obsidian-default' | 'v2' | 'custom';

/** Obsidian's own boilerplate welcome.md uses this exact phrase. If
 *  cohort never had Forge's welcome.md extracted (because Obsidian's
 *  was already present), this is the snippet that survives. */
const OBSIDIAN_DEFAULT_MARKER = 'This is your new *vault*';

/** V2 marker — the V2-shape welcome.md emits `# Description` as one
 *  of its body headings (per the bundled asset refreshed in v0.2.230). */
const V2_MARKER = /^# Description$/m;

/** V1 marker — the V1-shape welcome.md emits `# English` as its body
 *  heading (the shape that existed before v0.2.230). */
const V1_MARKER = /^# English$/m;

/** Classify a welcome-flavored note's body by shape. Pure; deterministic;
 *  no I/O. Caller is responsible for reading the file + acting on the
 *  classification.
 *
 *  Precedence:
 *  1. If V1 markers present AND V2 markers absent → 'v1'.
 *  2. Else if Obsidian boilerplate marker present → 'obsidian-default'.
 *  3. Else if V2 markers present → 'v2'.
 *  4. Else → 'custom'.
 *
 *  Why this precedence: a file that has BOTH `# English` and
 *  `# Description` is in transition (mid-edit, partial refresh) — we
 *  treat that as V2 to avoid clobbering cohort's in-progress migration.
 *  A file with the Obsidian default phrase BUT also V1/V2 markers is
 *  classified by the headings (V1/V2 wins), since the cohort obviously
 *  edited beyond Obsidian's boilerplate.
 *
 *  An empty / whitespace-only body classifies as 'custom' (no markers
 *  match) — we leave it alone since cohort may have intentionally
 *  emptied the file. */
export function classifyWelcomeShape(content: string): WelcomeShape {
  const hasV1 = V1_MARKER.test(content);
  const hasV2 = V2_MARKER.test(content);
  if (hasV1 && !hasV2) return 'v1';
  if (hasV2) return 'v2';
  if (content.includes(OBSIDIAN_DEFAULT_MARKER)) return 'obsidian-default';
  return 'custom';
}

/** True iff the shape warrants a refresh (V1 or Obsidian default). */
export function shouldRefreshWelcome(shape: WelcomeShape): boolean {
  return shape === 'v1' || shape === 'obsidian-default';
}
