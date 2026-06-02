// scripts/sync-engine-bundle.mjs
//
// Idempotent sync of the forge engine source (~/projects/forge/forge/)
// into the plugin's bundled engine (assets/engine/forge/). Replaces
// the recurring manual `cp -r ~/projects/forge/forge/{core,moda,music,
// __init__.py} ~/projects/forge-client-obsidian/assets/engine/forge/`
// cycle that has been load-bearing across recent drains (v0.2.17,
// v0.2.26, v0.2.27, v0.2.28, v0.2.29 all hit it).
//
// Scope filter mirrors src/engine-bundle-drift-core.ts's `isInScope`.
//
// Usage:
//   npm run sync-engine-bundle
//
// Steps:
//   1. Resolve source path: <repo>/../forge/forge/. Fail loudly if
//      missing.
//   2. For every in-scope source file, copy to the matching bundle
//      path (creating intermediate dirs). Idempotent — repeat runs
//      are no-ops on a clean tree.
//   3. For every in-scope bundle file NOT in source, delete from
//      bundle (cleans up orphans from earlier divergent layouts).
//   4. Log every action; print a final summary.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BUNDLE = path.resolve(ROOT, "assets", "engine", "forge");
const SOURCE = path.resolve(ROOT, "..", "forge", "forge");

const EXCLUDED_TOP_LEVEL_DIRS = new Set([
  "api", "installer", "sdk", "builtins", "__pycache__", "tests",
]);
const EXCLUDED_TOP_LEVEL_FILES = new Set(["config.py"]);

function isInScope(relPath) {
  if (!relPath.endsWith(".py")) return false;
  const parts = relPath.split(path.sep);
  const top = parts[0];
  if (parts.length === 1) {
    if (EXCLUDED_TOP_LEVEL_FILES.has(top)) return false;
    return top === "__init__.py";
  }
  if (EXCLUDED_TOP_LEVEL_DIRS.has(top)) return false;
  if (parts.includes("__pycache__")) return false;
  return true;
}

function walk(dir, base = "") {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
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

function main() {
  console.log("=== sync-engine-bundle ===\n");

  if (!fs.existsSync(SOURCE)) {
    console.error(`Source not found: ${SOURCE}`);
    console.error("Is the forge engine repo cloned at a sibling? Expected:");
    console.error("  <forge-client-obsidian>/../forge/forge/");
    process.exit(1);
  }
  console.log(`Source: ${SOURCE}`);
  console.log(`Bundle: ${BUNDLE}\n`);

  const sourceFiles = walk(SOURCE).filter(isInScope).sort();
  const bundleFiles = walk(BUNDLE).filter(isInScope).sort();

  const sourceSet = new Set(sourceFiles);
  const bundleSet = new Set(bundleFiles);

  let copied = 0;
  let unchanged = 0;
  let deleted = 0;

  // 1. Copy/refresh every source file into bundle.
  for (const rel of sourceFiles) {
    const srcAbs = path.join(SOURCE, rel);
    const bunAbs = path.join(BUNDLE, rel);
    const srcBytes = fs.readFileSync(srcAbs);
    if (fs.existsSync(bunAbs)) {
      const bunBytes = fs.readFileSync(bunAbs);
      if (srcBytes.equals(bunBytes)) {
        unchanged += 1;
        continue;
      }
    }
    mkdirP(bunAbs);
    fs.writeFileSync(bunAbs, srcBytes);
    console.log(`[copy]   forge/${rel}`);
    copied += 1;
  }

  // 2. Delete orphans in the bundle.
  for (const rel of bundleFiles) {
    if (sourceSet.has(rel)) continue;
    const bunAbs = path.join(BUNDLE, rel);
    fs.unlinkSync(bunAbs);
    console.log(`[delete] forge/${rel}  (orphan; not in source)`);
    deleted += 1;
  }

  console.log(
    `\nSynced ${copied} new/changed, kept ${unchanged} already-current, ` +
    `deleted ${deleted} orphan${deleted === 1 ? "" : "s"}.`,
  );
}

main();
