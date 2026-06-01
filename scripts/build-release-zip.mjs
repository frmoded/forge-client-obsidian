// Package the plugin into a versioned zip students can download,
// unzip into their vault's .obsidian/plugins/ directory, and enable.
//
// Why: BRAT only ships main.js + manifest.json + styles.css; it
// can't deliver the assets/ subdirectory (Pyodide + engine +
// iframe + vaults) we need at runtime. V1 closed beta uses the
// "Option B" distribution path: a single zip students drag-and-drop.
//
// Prerequisites (the script fails fast with clear errors if missing):
//   1. `npm run build` — produces main.js next to package.json.
//   2. `cd ../forge-moda-client/forge-moda-web && npx vite build`
//      — produces the iframe bundle in assets/iframe/.
//   3. `npm run setup-assets` — populates assets/pyodide/ if not
//      already committed.
//
// Run order for a release:
//   npm run build && npm run release-zip
//
// Output: dist/forge-client-obsidian-v<version>.zip
// (version comes from manifest.json; never bumped here.)
//
// The zip's internal structure puts everything under a top-level
// `forge-client-obsidian/` directory. Students unzip into
// `.obsidian/plugins/` → the result is `.obsidian/plugins/
// forge-client-obsidian/main.js` with sibling files. No manual
// subdirectory shuffling.

import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// archiver v8 exposes named exports (ZipArchive, TarArchive, …)
// rather than the v7 `archiver(format, opts)` factory. Reach via
// createRequire so the import works regardless of whether the
// installed version exposes ESM bindings.
const require = createRequire(import.meta.url);
const { ZipArchive } = require("archiver");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const PLUGIN_DIR_NAME = "forge-client-obsidian";

// Files that MUST exist before we can package a release. Preflight
// fails with a clear message if any are missing — much easier to
// diagnose than discovering a missing asset post-install.
const REQUIRED_FILES = [
  { path: "main.js",                                          hint: "Run `npm run build` first." },
  { path: "manifest.json",                                    hint: "Repo is missing manifest.json — unexpected." },
  { path: "assets/iframe/index.html",                         hint: "Run `cd ../forge-moda-client/forge-moda-web && npx vite build` first." },
  { path: "assets/pyodide/pyodide.asm.wasm",                  hint: "Run `npm run setup-assets` first." },
  { path: "assets/pyodide/python_stdlib.zip",                 hint: "Run `npm run setup-assets` first." },
  { path: "assets/engine/forge/core/executor.py",             hint: "Repo is missing the engine bundle — unexpected." },
  { path: "assets/vaults/forge-moda/forge.toml",              hint: "Repo is missing the forge-moda vault bundle — unexpected." },
  { path: "assets/vaults/forge-music/forge.toml",             hint: "Repo is missing the forge-music vault bundle (v0.2.15) — copy ~/projects/forge-music/{forge.toml,form.md,twelve_bar_blues_progression.md} into assets/vaults/forge-music/." },
  { path: "assets/vaults/forge-music/form.md",                hint: "forge-music bundle missing form.md — see hint above." },
  // v0.2.27: vendored music21 + minimum deps so the music domain
  // actually works in Pyodide (closed-beta has no network). Pin
  // versions in the hint so a fresh setup can re-vendor the same
  // wheel files; see src/music21-bundle.test.ts for the verification.
  { path: "assets/wheels/music21-8.3.0-py3-none-any.whl",     hint: "music21 wheel missing — re-vendor: pip download --no-deps -d assets/wheels music21==8.3.0 chardet jsonpickle more-itertools webcolors joblib requests urllib3 certifi idna; charset-normalizer needs --platform any --python-version 313 --only-binary :all: for the pure-Python wheel." },
  { path: "assets/engine/forge/music/lib.py",                 hint: "forge.music.lib missing from engine bundle — copy from ~/projects/forge/forge/music/{__init__.py,lib.py} into assets/engine/forge/music/." },
];

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function main() {
  console.log("=== forge-client-obsidian release zip ===\n");

  // 1. Read version from manifest.json.
  const manifestPath = path.join(ROOT, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const version = manifest.version;
  if (!version) {
    console.error("manifest.json has no `version` field. Cannot name the release.");
    process.exit(1);
  }
  console.log(`Plugin version: ${version}`);

  // 2. Preflight: verify all required files exist. Fail fast with
  //    the right hint per missing file.
  console.log("\nPreflight:");
  let missing = false;
  for (const { path: rel, hint } of REQUIRED_FILES) {
    const abs = path.join(ROOT, rel);
    if (await exists(abs)) {
      console.log(`  ✓ ${rel}`);
    } else {
      console.error(`  ✗ ${rel} — ${hint}`);
      missing = true;
    }
  }
  if (missing) {
    console.error("\nMissing required files. Run the suggested commands above and retry.");
    process.exit(1);
  }

  // 3. Ensure dist/ exists. Clean any prior zip for this version
  //    so the run is reproducible (no leftover archiver state).
  await fs.mkdir(DIST, { recursive: true });
  const zipName = `${PLUGIN_DIR_NAME}-v${version}.zip`;
  const zipPath = path.join(DIST, zipName);
  if (await exists(zipPath)) {
    await fs.unlink(zipPath);
  }

  // 4. Bundle into zip. Top-level directory inside the zip is
  //    `forge-client-obsidian/` so the unzip-into-plugins flow
  //    produces the right structure automatically.
  console.log(`\nBuilding ${zipName}…`);
  const tStart = performance.now();
  const output = createWriteStream(zipPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  const finalized = new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
    archive.on("warning", (err) => {
      if (err.code === "ENOENT") console.warn(`  warning: ${err.message}`);
      else reject(err);
    });
  });

  archive.pipe(output);

  // Top-level plugin files. styles.css is optional — only include
  // if the repo has one. Other repos in this ecosystem don't.
  archive.file(path.join(ROOT, "main.js"),       { name: `${PLUGIN_DIR_NAME}/main.js` });
  archive.file(path.join(ROOT, "manifest.json"), { name: `${PLUGIN_DIR_NAME}/manifest.json` });
  if (await exists(path.join(ROOT, "styles.css"))) {
    archive.file(path.join(ROOT, "styles.css"),  { name: `${PLUGIN_DIR_NAME}/styles.css` });
  }
  // All assets — Pyodide + engine + iframe + vaults. Raw file copy
  // (binary contents pass through unchanged at zlib level 9, which
  // doesn't shrink already-zipped wheels but doesn't hurt either).
  archive.directory(path.join(ROOT, "assets"), `${PLUGIN_DIR_NAME}/assets`);

  await archive.finalize();
  await finalized;

  const elapsedMs = performance.now() - tStart;

  // 5. Report size + SHA-256.
  const buf = await fs.readFile(zipPath);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const sizeMB = (buf.length / 1024 / 1024).toFixed(2);

  console.log(`\n=== Release zip ready ===`);
  console.log(`  path:    ${zipPath}`);
  console.log(`  size:    ${sizeMB} MB`);
  console.log(`  SHA-256: ${sha}`);
  console.log(`  build:   ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log(`\nNext step: upload ${zipName} to a new GitHub Release at`);
  console.log(`  https://github.com/frmoded/${PLUGIN_DIR_NAME}/releases/new`);
  console.log(`Then update INSTALL.md's download link if the URL pattern changed.`);
}

main().catch((e) => {
  console.error("\nRELEASE-ZIP FAILED:", e);
  process.exit(1);
});
