// scripts/sync-bundled-vault.mjs
//
// v0.2.76: idempotent sync of a sibling vault source repo
// (~/projects/<name>/) into the plugin's bundled-vault assets
// (assets/vaults/<name>/). Mirrors the sync-engine-bundle.mjs pattern
// for the engine source.
//
// Usage:
//   node scripts/sync-bundled-vault.mjs <vault-name>
//   node scripts/sync-bundled-vault.mjs forge-moda
//   node scripts/sync-bundled-vault.mjs forge-music
//   node scripts/sync-bundled-vault.mjs forge-tutorial
//
// Or all-at-once via the npm script:
//   npm run sync-bundled-vaults
//
// Steps:
//   1. Resolve source path: <repo>/../<vault-name>/. Fail loudly if
//      missing.
//   2. For every in-scope source file, copy to the matching bundle
//      path (creating intermediate dirs). Idempotent — repeat runs
//      are no-ops on a clean tree.
//   3. For every in-scope bundle file NOT in source, delete from
//      bundle (cleans up orphans from earlier divergent layouts).
//   4. Log every action; print a final summary.
//
// In-scope filter: everything EXCEPT version-control noise
// (.git/, .DS_Store, etc.) and editor scratch (node_modules/,
// .obsidian/). The bundle ships exactly the snippet files +
// forge.toml + README + _meta/.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Recognised vault names — must match KNOWN_BUNDLED_LIBRARIES in
// src/welcome.ts + src/chips.ts. Sync attempts on unknown vault names
// fail with a clear error rather than silently mirroring arbitrary
// sibling dirs.
const KNOWN_VAULTS = new Set(["forge-moda", "forge-music", "forge-tutorial"]);

// Directory + file names that must NEVER be mirrored into the bundle.
// These are local-development artefacts (VCS, editor state, runtime
// caches) that don't belong in the shipped plugin.
const EXCLUDED_NAMES = new Set([
  ".git",
  ".github",
  ".gitignore",
  ".DS_Store",
  "node_modules",
  ".obsidian",
  ".forge",
  "__pycache__",
  ".pytest_cache",
  "dist",
  "build",
]);

function isExcludedName(name) {
  if (EXCLUDED_NAMES.has(name)) return true;
  if (name.endsWith(".pyc")) return true;
  return false;
}

function walk(dir, base = "") {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (isExcludedName(entry.name)) continue;
    const rel = base ? path.join(base, entry.name) : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(abs, rel));
    } else {
      // Normalize to forward slashes for consistent rel-path keys.
      out.push(rel.split(path.sep).join("/"));
    }
  }
  return out;
}

function mkdirP(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function syncOne(vaultName) {
  const BUNDLE = path.resolve(ROOT, "assets", "vaults", vaultName);
  const SOURCE = path.resolve(ROOT, "..", vaultName);

  console.log(`\n=== sync-bundled-vault: ${vaultName} ===`);
  console.log(`  source: ${SOURCE}`);
  console.log(`  bundle: ${BUNDLE}`);

  if (!fs.existsSync(SOURCE)) {
    console.error(`\nSource not found: ${SOURCE}`);
    console.error(`Is the ${vaultName} source repo cloned as a sibling? Expected:`);
    console.error(`  <forge-client-obsidian>/../${vaultName}/`);
    process.exit(1);
  }

  const sourceFiles = walk(SOURCE);
  const bundleFiles = walk(BUNDLE);
  const sourceSet = new Set(sourceFiles);
  const bundleSet = new Set(bundleFiles);

  let added = 0;
  let updated = 0;
  let skipped = 0;
  let deleted = 0;

  // Copy source → bundle.
  for (const rel of sourceFiles.sort()) {
    const srcPath = path.join(SOURCE, rel.split("/").join(path.sep));
    const dstPath = path.join(BUNDLE, rel.split("/").join(path.sep));
    const srcBuf = fs.readFileSync(srcPath);
    let needWrite = true;
    if (bundleSet.has(rel)) {
      const dstBuf = fs.readFileSync(dstPath);
      if (srcBuf.equals(dstBuf)) {
        needWrite = false;
        skipped += 1;
      }
    }
    if (needWrite) {
      mkdirP(dstPath);
      fs.writeFileSync(dstPath, srcBuf);
      if (bundleSet.has(rel)) {
        console.log(`  [update] ${vaultName}/${rel}`);
        updated += 1;
      } else {
        console.log(`  [copy]   ${vaultName}/${rel}`);
        added += 1;
      }
    }
  }

  // Delete orphans (bundle has files source doesn't).
  for (const rel of bundleFiles.sort()) {
    if (!sourceSet.has(rel)) {
      const dstPath = path.join(BUNDLE, rel.split("/").join(path.sep));
      fs.unlinkSync(dstPath);
      console.log(`  [delete] ${vaultName}/${rel}`);
      deleted += 1;
    }
  }

  // Best-effort: prune empty bundle subdirs left after deletes. Walks
  // up the bundle tree depth-first, removing any directory with no
  // entries. Idempotent.
  function pruneEmptyDirs(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        pruneEmptyDirs(path.join(dir, entry.name));
      }
    }
    if (dir !== BUNDLE && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
    }
  }
  pruneEmptyDirs(BUNDLE);

  console.log(
    `  Result: ${added} added, ${updated} updated, ${skipped} unchanged, ${deleted} deleted.`,
  );
}

function main() {
  const args = process.argv.slice(2);

  let targets;
  if (args.length === 0 || args[0] === "--all") {
    targets = [...KNOWN_VAULTS];
  } else {
    targets = [];
    for (const a of args) {
      if (!KNOWN_VAULTS.has(a)) {
        console.error(`Unknown vault: ${a}`);
        console.error(`Known vaults: ${[...KNOWN_VAULTS].join(", ")}`);
        process.exit(1);
      }
      targets.push(a);
    }
  }

  for (const v of targets) syncOne(v);
  console.log(`\nDone. Synced ${targets.length} bundled vault(s).`);
}

main();
