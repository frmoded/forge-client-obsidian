// Copy assets/ verbatim alongside the plugin's built main.js.
//
// Pyodide WASM, Python stdlib zip, numpy/pyyaml wheels, and the
// curated engine + vault content must NOT pass through esbuild —
// they're binary or content-typed assets that the JS bundler would
// either corrupt or refuse. We do a raw file copy after esbuild
// finishes.
//
// In dev (`npm run dev`), main.js is built in the repo root; assets/
// already sits next to it, so this script is essentially a no-op
// verification. In a release build for BRAT / community-directory
// distribution, the convention is to ship a zip containing main.js,
// manifest.json, styles.css (if any), and any plugin-relative
// directories — assets/ is included naturally.
//
// This script's job is to:
//   1. Ensure assets/manifest.json is fresh (regenerate from current files).
//   2. Print a summary (sizes per subdir, total) so the build log
//      shows the install footprint.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { editionConfig, listEditionAssets } from "./editions.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");

// 1. Regenerate manifest.
console.log("Refreshing assets/manifest.json…");
execSync("node scripts/build-manifest.mjs", { cwd: ROOT, stdio: "inherit" });

// 2. Verify assets/ exists.
if (!fs.existsSync(ASSETS)) {
  console.error(`assets/ not found at ${ASSETS}`);
  console.error("Phase 1 plugin requires bundled Pyodide + engine + vaults.");
  process.exit(1);
}

// 3. Size summary.
function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += dirSize(abs);
    } else {
      total += fs.statSync(abs).size;
    }
  }
  return total;
}

// Music-edition Phase 2: the footprint reports THIS EDITION's assets only. A lean build on a machine
// that holds fetched music wheels must not print (or imply it ships) 22 MB of wheels.
const cfg = editionConfig();
const perDir = new Map();
for (const rel of listEditionAssets(ASSETS, cfg)) {
  const top = rel.split("/")[0];
  perDir.set(top, (perDir.get(top) ?? 0) + fs.statSync(path.join(ASSETS, rel)).size);
}
const subdirs = [...perDir.keys()].filter((d) => fs.statSync(path.join(ASSETS, d)).isDirectory()).sort();

console.log(`\nPlugin asset footprint (edition=${cfg.edition}):`);
let total = 0;
for (const sub of subdirs) {
  const sz = perDir.get(sub);
  total += sz;
  console.log(`  ${sub.padEnd(10)} ${(sz / 1024 / 1024).toFixed(2).padStart(7)} MB`);
}
console.log(`  ${"total".padEnd(10)} ${(total / 1024 / 1024).toFixed(2).padStart(7)} MB`);
