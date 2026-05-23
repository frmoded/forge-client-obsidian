// Setup script — populate assets/ with Pyodide WASM + wheels from
// upstream sources. Run ONCE before `npm run build`.
//
// Why this is a separate script (not auto-run on build): vendoring
// ~14 MB of binary content into the plugin repo's git history is
// the wrong default. We keep binaries OUT of source control (.gitignored)
// and fetch them on demand into the local working copy. Release builds
// for BRAT distribution include the populated assets/ in the release
// zip; that's where vendoring lives.
//
// Inputs (all from local paths — no network on first run after the
// initial Pyodide download):
//   1. Pyodide WASM/JS/stdlib — installed via `npm install pyodide`
//      in this repo, copied from node_modules/pyodide/.
//   2. numpy + pyyaml + micropip wheels — same source. (Pyodide caches
//      these in node_modules/pyodide/*.whl after the first loadPackage.)
//      If they're not cached yet (fresh clone), this script warms
//      Pyodide once to pull them.
//
// Engine + vault content under assets/engine/ and assets/vaults/ are
// plugin-owned text content; they're committed normally. This script
// only handles the binary asset population.
//
// Usage: npm run setup-assets

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const PYODIDE_NPM = path.join(ROOT, "node_modules", "pyodide");

// 1. Ensure node_modules/pyodide exists.
if (!fs.existsSync(PYODIDE_NPM)) {
  console.log("Installing pyodide via npm…");
  execSync("npm install pyodide", { cwd: ROOT, stdio: "inherit" });
}

// 2. Pyodide core (wasm + js + stdlib).
fs.mkdirSync(path.join(ASSETS, "pyodide"), { recursive: true });
const CORE = [
  "pyodide.asm.wasm",
  "pyodide.asm.js",
  "pyodide.mjs",
  "python_stdlib.zip",
  "pyodide-lock.json",
  "package.json",
];
let coreBytes = 0;
for (const f of CORE) {
  const src = path.join(PYODIDE_NPM, f);
  if (!fs.existsSync(src)) {
    console.error(`Missing Pyodide core file: ${f}`);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(ASSETS, "pyodide", f));
  coreBytes += fs.statSync(src).size;
}
console.log(`Pyodide core: ${CORE.length} files, ${(coreBytes / 1024 / 1024).toFixed(2)} MB`);

// 3. Stock wheels (numpy + pyyaml + micropip). Pyodide caches these
//    on first loadPackage call. If they're not present yet, warm by
//    running a tiny Pyodide session.
//
//    Important: Pyodide's loadPackage resolves wheel URLs relative
//    to the indexURL (i.e., assets/pyodide/). Wheels MUST live in
//    that same directory, alongside pyodide-lock.json — not in a
//    sibling `wheels/` dir. This matches Pyodide's official "full"
//    distribution layout where pyodide.asm.* + python_stdlib.zip +
//    every wheel live together.
const WHEELS_NEEDED = ["numpy", "pyyaml", "micropip"];

function findWheel(name) {
  const all = fs.readdirSync(PYODIDE_NPM);
  return all.find((f) => f.startsWith(name + "-") && f.endsWith(".whl"));
}

const missing = WHEELS_NEEDED.filter((n) => !findWheel(n));
if (missing.length) {
  console.log(`Warming Pyodide to fetch wheels: ${missing.join(", ")}`);
  // Run a small Node script that loads Pyodide + loadPackage to
  // populate the cache.
  const warm = path.join(ROOT, "scripts", "_warm-wheels.mjs");
  fs.writeFileSync(warm, `
import { loadPyodide } from "pyodide";
const py = await loadPyodide();
await py.loadPackage(${JSON.stringify(missing)});
`);
  try {
    execSync(`node ${warm}`, { cwd: ROOT, stdio: "inherit" });
  } finally {
    fs.unlinkSync(warm);
  }
}

let wheelBytes = 0;
for (const name of WHEELS_NEEDED) {
  const wheel = findWheel(name);
  if (!wheel) {
    console.error(`Wheel still missing after warm: ${name}`);
    process.exit(1);
  }
  const src = path.join(PYODIDE_NPM, wheel);
  fs.copyFileSync(src, path.join(ASSETS, "pyodide", wheel));
  wheelBytes += fs.statSync(src).size;
}
console.log(`Wheels: ${WHEELS_NEEDED.length} files copied into assets/pyodide/, ${(wheelBytes / 1024 / 1024).toFixed(2)} MB`);

// 4. Regenerate manifest (engine + vaults already committed; we just
//    need the combined manifest fresh).
execSync("node scripts/build-manifest.mjs", { cwd: ROOT, stdio: "inherit" });

console.log("\nDone. Next: npm run build");
