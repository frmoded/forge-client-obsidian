// Generate assets/manifest.json — a flat list of every file under
// assets/ that the plugin's pyodide-host.ts needs to fetch+mount at
// runtime. Run as part of the plugin's build pipeline. The manifest
// is also bundled into assets/, so the JS loader can read it on
// startup without hard-coding the file list.
//
// Path convention: relative to assets/, forward slashes only. The
// loader prefixes with the plugin asset URL on the user's machine.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(__dirname, "..", "assets");
const OUT = path.join(ASSETS, "manifest.json");

function walk(dir, base = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(abs, rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

if (!fs.existsSync(ASSETS)) {
  console.error(`assets/ not found at ${ASSETS}`);
  process.exit(1);
}

// Exclude the manifest itself (would otherwise self-reference).
const files = walk(ASSETS).filter((f) => f !== "manifest.json").sort();

// Categorize files for the loader's convenience. The loader fetches
// pyodide/* via the Pyodide bootstrap (indexURL), wheels/* via
// micropip, and engine/* + vaults/* via direct FS writes.
const manifest = {
  pyodide: files.filter((f) => f.startsWith("pyodide/")),
  wheels: files.filter((f) => f.startsWith("wheels/")),
  engine: files.filter((f) => f.startsWith("engine/")),
  vaults: files.filter((f) => f.startsWith("vaults/")),
};

fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote ${OUT}`);
console.log(`  pyodide: ${manifest.pyodide.length} files`);
console.log(`  wheels:  ${manifest.wheels.length} files`);
console.log(`  engine:  ${manifest.engine.length} files`);
console.log(`  vaults:  ${manifest.vaults.length} files`);
