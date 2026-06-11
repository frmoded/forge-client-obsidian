// v0.2.131 — pure-core: decide whether the running main.js is
// stale relative to the on-disk manifest.json.
//
// Why this exists: BRAT (the cohort install path) sometimes
// updates manifest.json to the new version but FAILS TO REPLACE
// main.js — driver's cohort install hit this exact failure mode
// (manifest.json reported v0.2.127, but main.js was pre-v0.2.108
// per the "Action Shape" string that no longer exists in source).
// Net effect: silent regression. UI shows old code; user has no
// signal that anything is wrong.
//
// Plugin self-check on onload: PLUGIN_VERSION_AT_BUILD is baked
// into main.js via scripts/inline-plugin-version.mjs at build
// time. At runtime, onload reads manifest.json off disk and
// compares. Mismatch → Notice + console.error with clear reinstall
// instructions.
//
// Pure-core captures the structural decision. main.ts handles the
// I/O (manifest.json read + Notice emission).

export type StaleCheckResult =
  | { stale: false }
  | { stale: true; manifestVersion: string; buildVersion: string; noticeMessage: string };

/** Pure decision for the onload stale-main.js check. No side
 *  effects; no Obsidian or filesystem access.
 *
 *  Inputs:
 *  - manifestVersion: the `version` string from the on-disk
 *    manifest.json. Caller already parsed it.
 *  - buildVersion: PLUGIN_VERSION_AT_BUILD from the generated
 *    version-constant.generated.ts module, baked into main.js
 *    at build time.
 *
 *  Returns:
 *  - `{ stale: false }` when they match exactly. The plugin is
 *    healthy; onload proceeds without surfacing anything.
 *  - `{ stale: true, ... }` when they differ. The plugin should
 *    surface the noticeMessage to the user + log via
 *    console.error. The plugin still loads — partial functionality
 *    is better than nothing per v0331 §2.2 "Don't block plugin
 *    from loading".
 *
 *  Empty / undefined inputs are treated as mismatches (defensive
 *  read against malformed manifest.json). */
export function decideStaleMainJsCheck(
  manifestVersion: string | null | undefined,
  buildVersion: string | null | undefined,
): StaleCheckResult {
  const m = (manifestVersion ?? '').trim();
  const b = (buildVersion ?? '').trim();
  if (m.length > 0 && b.length > 0 && m === b) {
    return { stale: false };
  }
  return {
    stale: true,
    manifestVersion: m || '<missing>',
    buildVersion: b || '<missing>',
    noticeMessage:
      `Forge: stale main.js detected. manifest.json claims v${m || '<missing>'} but main.js is v${b || '<missing>'}. `
      + 'Reinstall via BRAT: Settings → BRAT → Re-install "frmoded/forge-client-obsidian". '
      + 'Or toggle the plugin off + on in Settings → Community plugins.',
  };
}
