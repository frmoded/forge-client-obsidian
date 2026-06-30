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
  { path: "assets/vaults/forge-music/forge.toml",             hint: "Repo is missing the forge-music vault bundle — re-sync ~/projects/forge-music/ into assets/vaults/forge-music/." },
  // v0.8.0 — `blues/` renamed to `slow_burn/` (drain 2026-07-02-1800).
  // Progression data note now lives at slow_burn/twelve_bar_blues_progression.md.
  { path: "assets/vaults/forge-music/slow_burn/twelve_bar_blues_progression.md", hint: "forge-music bundle missing slow_burn/twelve_bar_blues_progression.md — re-sync the slow_burn subdir." },
  // v0.2.76: Tier 1 tutorial bundle. Source at ~/projects/forge-tutorial/.
  { path: "assets/vaults/forge-tutorial/forge.toml",          hint: "forge-tutorial bundle missing — run `node scripts/sync-bundled-vault.mjs forge-tutorial`." },
  { path: "assets/vaults/forge-tutorial/README.md",           hint: "forge-tutorial bundle missing README — re-sync." },
  { path: "assets/vaults/forge-tutorial/01-hello/Hello.md",   hint: "forge-tutorial bundle missing 01-hello/Hello.md — re-sync." },
  { path: "assets/vaults/forge-tutorial/09-slots/Slots.md",   hint: "forge-tutorial bundle missing 09-slots/Slots.md (final chapter) — re-sync." },
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

// In-scope predicate for the engine-bundle drift check. Mirrors
// src/engine-bundle-drift-core.ts's `isInScope`. Both files own the
// same rule; if you change one, change the other. (Tests in
// src/engine-bundle-drift.test.ts verify the helper-side; the
// hand-mirror here is unavoidable because the preflight runs in a
// pure-node CJS-via-mjs context that can't import .ts.)
const ENGINE_EXCLUDED_TOP_LEVEL_DIRS = new Set([
  "api", "installer", "sdk", "builtins", "__pycache__", "tests",
]);
const ENGINE_EXCLUDED_TOP_LEVEL_FILES = new Set(["config.py"]);

function engineIsInScope(relPath) {
  if (!relPath.endsWith(".py")) return false;
  const parts = relPath.split(path.sep);
  const top = parts[0];
  if (parts.length === 1) {
    if (ENGINE_EXCLUDED_TOP_LEVEL_FILES.has(top)) return false;
    return top === "__init__.py";
  }
  if (ENGINE_EXCLUDED_TOP_LEVEL_DIRS.has(top)) return false;
  if (parts.includes("__pycache__")) return false;
  return true;
}

function engineWalk(dir, base = "") {
  const fsSync = require("node:fs");
  const out = [];
  if (!fsSync.existsSync(dir)) return out;
  for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? path.join(base, entry.name) : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...engineWalk(abs, rel));
    else out.push(rel.split(path.sep).join("/"));
  }
  return out;
}

// v0.2.76 — known bundled vaults that ship under assets/vaults/.
// MUST match sync-bundled-vault.mjs's KNOWN_VAULTS and welcome.ts +
// chips.ts's KNOWN_BUNDLED_LIBRARIES. Drift detection iterates this
// list; each vault is checked against ../<name>/.
const BUNDLED_VAULTS = ["forge-moda", "forge-music", "forge-tutorial"];

// In-scope filter for bundled-vault drift checks — mirrors
// sync-bundled-vault.mjs's EXCLUDED_NAMES.
const VAULT_EXCLUDED_NAMES = new Set([
  ".git", ".github", ".gitignore", ".DS_Store",
  "node_modules", ".obsidian", ".forge",
  "__pycache__", ".pytest_cache",
  "dist", "build",
]);

// v0.2.147 — driver spike-file exclusion. Mirrors sync-bundled-vault's
// isExcludedName. `_spike*.md` (any extension) and `_P*.md` are
// local-only scratch for cohort smoke validation; they live in source
// vault repos but don't ship to cohort users via the bundle. The drift
// check + sync both honor the exclusion so the v0.2.144 bundled-vault
// bump preflight doesn't false-positive on them either.
function isSpikeName(name) {
  if (name.startsWith("_spike")) return true;
  // v0.2.164 — also `_v2_spike*` for the V2 spike note convention.
  if (name.startsWith("_v2_spike")) return true;
  if (/^_P[^/]*\.md$/i.test(name)) return true;
  return false;
}

function vaultIsInScope(relPath) {
  const parts = relPath.split("/");
  for (const p of parts) {
    if (VAULT_EXCLUDED_NAMES.has(p)) return false;
    if (isSpikeName(p)) return false;
  }
  if (relPath.endsWith(".pyc")) return false;
  return true;
}

function vaultWalk(dir, base = "") {
  const fsSync = require("node:fs");
  const out = [];
  if (!fsSync.existsSync(dir)) return out;
  for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
    if (VAULT_EXCLUDED_NAMES.has(entry.name)) continue;
    if (isSpikeName(entry.name)) continue;
    const rel = base ? path.join(base, entry.name) : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...vaultWalk(abs, rel));
    else out.push(rel.split(path.sep).join("/"));
  }
  return out;
}

async function assertNoBundledVaultDrift() {
  let anyDrift = false;
  for (const vaultName of BUNDLED_VAULTS) {
    const sourceRoot = path.resolve(ROOT, "..", vaultName);
    const bundleRoot = path.resolve(ROOT, "assets", "vaults", vaultName);

    // Informational skip if source isn't a sibling (e.g. CI build with
    // only the plugin checked out).
    if (!(await exists(sourceRoot))) {
      console.log(
        `\nBundled-vault drift check (${vaultName}): skipped (no sibling repo).`);
      continue;
    }

    const sourceFiles = new Set(vaultWalk(sourceRoot).filter(vaultIsInScope));
    const bundleFiles = new Set(vaultWalk(bundleRoot).filter(vaultIsInScope));
    const drift = [];
    for (const rel of [...sourceFiles].sort()) {
      if (!bundleFiles.has(rel)) {
        drift.push({ relPath: rel, status: "missing-in-bundle" });
        continue;
      }
      const a = await fs.readFile(path.join(sourceRoot, rel));
      const b = await fs.readFile(path.join(bundleRoot, rel));
      if (!a.equals(b)) drift.push({ relPath: rel, status: "content-mismatch" });
    }
    for (const rel of [...bundleFiles].sort()) {
      if (!sourceFiles.has(rel)) drift.push({ relPath: rel, status: "orphaned-in-bundle" });
    }
    drift.sort((a, b) => a.relPath.localeCompare(b.relPath));

    if (drift.length === 0) {
      console.log(`\nBundled-vault drift check (${vaultName}): clean.`);
      continue;
    }

    anyDrift = true;
    console.error(`\nBUNDLED-VAULT DRIFT DETECTED (${vaultName}):`);
    for (const { relPath, status } of drift) {
      console.error(`  ✗ ${vaultName}/${relPath}  [${status}]`);
    }
    console.error(
      `\nRun 'node scripts/sync-bundled-vault.mjs ${vaultName}' to resolve.`);
  }
  if (anyDrift) process.exit(1);
}

async function assertNoEngineBundleDrift() {
  const sourceRoot = path.resolve(ROOT, "..", "forge", "forge");
  const bundleRoot = path.resolve(ROOT, "assets", "engine", "forge");

  // The drift check is informational if the source repo isn't on
  // disk (e.g. CI build that only has the plugin clone). Don't gate
  // the release on a missing sibling — just log and proceed.
  if (!(await exists(sourceRoot))) {
    console.log("\nEngine-bundle drift check: skipped (no sibling forge repo).");
    return;
  }

  const sourceFiles = new Set(engineWalk(sourceRoot).filter(engineIsInScope));
  const bundleFiles = new Set(engineWalk(bundleRoot).filter(engineIsInScope));
  const drift = [];
  for (const rel of [...sourceFiles].sort()) {
    if (!bundleFiles.has(rel)) {
      drift.push({ relPath: rel, status: "missing-in-bundle" });
      continue;
    }
    const a = await fs.readFile(path.join(sourceRoot, rel));
    const b = await fs.readFile(path.join(bundleRoot, rel));
    if (!a.equals(b)) drift.push({ relPath: rel, status: "content-mismatch" });
  }
  for (const rel of [...bundleFiles].sort()) {
    if (!sourceFiles.has(rel)) drift.push({ relPath: rel, status: "orphaned-in-bundle" });
  }
  drift.sort((a, b) => a.relPath.localeCompare(b.relPath));

  if (drift.length === 0) {
    console.log("\nEngine-bundle drift check: clean.");
    return;
  }

  console.error("\nENGINE-BUNDLE DRIFT DETECTED:");
  for (const { relPath, status } of drift) {
    console.error(`  ✗ forge/${relPath}  [${status}]`);
  }
  console.error("\nRun 'npm run sync-engine-bundle' to resolve.");
  process.exit(1);
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

  // 2b. Engine-bundle drift preflight. The plugin's bundled engine
  //     under assets/engine/forge/ must be byte-equal to the source
  //     of truth in ../forge/forge/ (excluding api/, installer/, sdk/,
  //     builtins/, config.py, __pycache__/, tests/). Drift would mean
  //     the user gets a different engine than the test suite verified.
  //     `npm run sync-engine-bundle` resolves drift; rerun release-zip.
  //
  //     The drift helper lives in src/engine-bundle-drift-core.ts and
  //     is exercised by src/engine-bundle-drift.test.ts. We invoke it
  //     here via a filesystem-backed adapter that matches the
  //     in-scope predicate.
  await assertNoEngineBundleDrift();

  // 2c. Bundled-vault drift preflight (v0.2.76). Same rationale as the
  //     engine-bundle check but for assets/vaults/<name>/ — the bundled
  //     forge-moda, forge-music, and forge-tutorial directories must
  //     match their sibling source repos. Drift = shipping different
  //     content than the source authors maintain. Resolved by
  //     `node scripts/sync-bundled-vault.mjs <name>` per vault, or
  //     `--all` to sync everything at once.
  await assertNoBundledVaultDrift();

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
