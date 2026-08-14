// scripts/version-stamp-check.mjs
//
// Drain 2026-08-14-0300 — release preflight: the version stamp baked into
// main.js must match manifest.json's "version".
//
// Trigger: v0.2.357 shipped a main.js stamped 0.2.356. The release-recovery
// sequence bumped manifest.json but never ran `npm run build`, so main.js was
// never regenerated. Nothing in the pipeline noticed, and the mismatched zip
// was published. The plugin's own onload self-check DID notice at runtime —
// and crashed while trying to say so (see main.ts's staleness check).
//
// WHY THIS READS main.js AND NOT src/version-constant.generated.ts
//
// The drain suggested the generated .ts, which is where
// inline-plugin-version.mjs writes the constant. Reading main.js instead is
// strictly more correct, for three reasons found while verifying:
//
//   1. main.js is what actually ships in the zip. The .ts is an intermediate
//      that esbuild consumes; asserting on it asserts on an input, not the
//      artifact.
//   2. src/version-constant.generated.ts is GITIGNORED (.gitignore:23), so on
//      a fresh clone it may not exist at all — a check reading it would be
//      skipped or error for reasons unrelated to correctness.
//   3. The exact failure mode being guarded leaves main.js stale. Running
//      inline-plugin-version.mjs alone refreshes the .ts WITHOUT rebuilding
//      main.js, so a .ts-based check can report fresh while the shipped
//      artifact is stale — i.e. it would pass in precisely the case it exists
//      to catch.

// Tolerant of esbuild re-quoting/re-spacing the constant when it bundles.
// A brittle pattern here would silently degrade into a no-op, which is the
// same failure class as having no check.
const STAMP_RE = /PLUGIN_VERSION_AT_BUILD\s*=\s*["']([^"']+)["']/;

/**
 * Pure comparison — no filesystem access, so it is directly testable.
 *
 * @param {{manifestVersion: string|undefined, mainJsSource: string}} input
 * @returns {{ok: boolean, stampedVersion: string|null, message: string}}
 */
export function checkVersionStamp({ manifestVersion, mainJsSource }) {
  if (typeof manifestVersion !== 'string' || manifestVersion.length === 0) {
    return {
      ok: false,
      stampedVersion: null,
      message:
        "manifest.json has no usable 'version' field, so the main.js version "
        + 'stamp cannot be verified. Fix manifest.json before building a zip.',
    };
  }

  const m = STAMP_RE.exec(mainJsSource ?? '');
  if (!m) {
    // Deliberately a failure, not a pass. "No stamp found" must never read
    // as "no mismatch found".
    return {
      ok: false,
      stampedVersion: null,
      message:
        'could not find a PLUGIN_VERSION_AT_BUILD version stamp in main.js. '
        + "Either main.js predates the stamping step or it was not built from "
        + "this source tree. Run 'npm run build' to regenerate main.js, then retry.",
    };
  }

  const stampedVersion = m[1];
  if (stampedVersion === manifestVersion) {
    return { ok: true, stampedVersion, message: '' };
  }

  return {
    ok: false,
    stampedVersion,
    message:
      `main.js version stamp (${stampedVersion}) does not match manifest.json `
      + `version (${manifestVersion}). Run 'npm run build' to regenerate `
      + 'main.js, then retry.',
  };
}
