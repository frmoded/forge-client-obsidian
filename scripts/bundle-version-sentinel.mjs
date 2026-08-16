// scripts/bundle-version-sentinel.mjs
//
// Drain 2026-08-16-1400 — `assets/.bundle-version` as a real build output.
//
// The sentinel records which plugin version produced the inlined assets
// sitting in a plugin directory. `restore-inlined-assets.ts` compares it
// against the compiled-in `BUNDLED_ASSETS_VERSION` and force-restores every
// inlined file when they differ.
//
// It used to be written ONLY by the plugin at runtime, yet it is tracked
// and ships inside the release zip — so its value in the zip depended on
// whoever last ran a plugin against this checkout. v0.2.358 shipped it
// stale (0.2.356) and every installer paid an unnecessary restore of ~137
// files on first launch; v0.2.359 only got it right because a verification
// grep failed and the drain stopped to look.
//
// The runtime write STAYS. It is not redundant: a BRAT-style install
// carries no `assets/` at all, so the plugin restoring the inlined files
// is the only thing that can create the sentinel there. Removing it would
// mean the sentinel never exists in those vaults, every launch mismatches,
// and every launch re-restores — the opposite of the fix. The build write
// is complementary: it makes the ZIP ship a correct value so a zip install
// can skip a restore it doesn't need.

import fs from "node:fs";
import path from "node:path";

/** Matches SENTINEL_FILE in src/restore-inlined-assets.ts. */
export const SENTINEL_FILENAME = ".bundle-version";

/**
 * Write `version` to `<assetsDir>/.bundle-version` and return the path.
 *
 * No trailing newline — byte-identical to the runtime write
 * (`adapter.write(sentinelPath, BUNDLED_ASSETS_VERSION)`), so a local
 * plugin run rewriting the file produces no diff. The comparison itself is
 * `.trim()`-ed, so this is about noise rather than correctness; noise is
 * what let the file drift unnoticed in the first place.
 *
 * Throws on an empty version. A blank sentinel could never equal
 * `BUNDLED_ASSETS_VERSION`, so it would make every launch re-restore every
 * inlined file, forever — a silent, permanent slowdown. Failing the build
 * is strictly better.
 */
export function writeBundleVersionSentinel(assetsDir, version) {
  if (typeof version !== "string" || version.trim() === "") {
    throw new Error(
      `bundle-version sentinel: refusing to write an empty version `
      + `(got ${JSON.stringify(version)}). A blank sentinel never matches `
      + `BUNDLED_ASSETS_VERSION, so every launch would re-restore every `
      + `inlined asset.`,
    );
  }
  fs.mkdirSync(assetsDir, { recursive: true });
  const target = path.join(assetsDir, SENTINEL_FILENAME);
  fs.writeFileSync(target, version);
  return target;
}
