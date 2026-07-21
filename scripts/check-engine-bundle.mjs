// scripts/check-engine-bundle.mjs
//
// CW-1235-bundle-sync-retroactive (drain 2026-07-20-1730) Phase 3.
//
// Standalone drift check for the engine bundle. Mirrors the byte-
// compare logic in scripts/build-release-zip.mjs's
// `assertNoEngineBundleDrift` (which runs inside the release
// pre-flight); this wrapper exposes the same check as a first-class
// npm script so drift can be verified ad-hoc without a full release
// build.
//
// Exit codes:
//   0 — no drift; source and bundle are byte-equal on every in-scope
//       .py file.
//   1 — drift detected; each drifted path listed with its status
//       (missing-in-bundle, orphaned-in-bundle, content-mismatch).
//       Suggested fix: `npm run sync-engine-bundle`.
//
// Scope filter mirrors scripts/sync-engine-bundle.mjs's `isInScope`
// exactly (which mirrors src/engine-bundle-drift-core.ts's `isInScope`
// — the three copies are kept aligned by convention; the tests in
// src/engine-bundle-drift.test.ts verify the helper-side).

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.resolve(ROOT, "..", "forge", "forge");
const BUNDLE = path.resolve(ROOT, "assets", "engine", "forge");

const EXCLUDED_TOP_LEVEL_DIRS = new Set([
  "api", "installer", "sdk", "builtins", "__pycache__", "tests",
]);
const EXCLUDED_TOP_LEVEL_FILES = new Set(["config.py"]);

function isInScope(relPath) {
  if (!relPath.endsWith(".py")) return false;
  const parts = relPath.split("/");
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
  if (!fsSync.existsSync(dir)) return out;
  for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? path.join(base, entry.name) : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, rel));
    else out.push(rel.split(path.sep).join("/"));
  }
  return out;
}

async function main() {
  console.log("=== check-engine-bundle ===\n");

  if (!fsSync.existsSync(SOURCE)) {
    console.log(
      `Source not found: ${SOURCE}\n` +
      `Skipping check (no sibling forge repo — this is fine for CI-only builds).`,
    );
    process.exit(0);
  }
  console.log(`Source: ${SOURCE}`);
  console.log(`Bundle: ${BUNDLE}\n`);

  const sourceFiles = new Set(walk(SOURCE).filter(isInScope));
  const bundleFiles = new Set(walk(BUNDLE).filter(isInScope));
  const drift = [];

  for (const rel of [...sourceFiles].sort()) {
    if (!bundleFiles.has(rel)) {
      drift.push({ relPath: rel, status: "missing-in-bundle" });
      continue;
    }
    const a = await fs.readFile(path.join(SOURCE, rel));
    const b = await fs.readFile(path.join(BUNDLE, rel));
    if (!a.equals(b)) drift.push({ relPath: rel, status: "content-mismatch" });
  }
  for (const rel of [...bundleFiles].sort()) {
    if (!sourceFiles.has(rel)) {
      drift.push({ relPath: rel, status: "orphaned-in-bundle" });
    }
  }
  drift.sort((a, b) => a.relPath.localeCompare(b.relPath));

  if (drift.length === 0) {
    console.log(
      `Engine-bundle drift check: clean ` +
      `(${sourceFiles.size} in-scope .py files match).`,
    );
    process.exit(0);
  }

  console.error("ENGINE-BUNDLE DRIFT DETECTED:");
  for (const { relPath, status } of drift) {
    console.error(`  ✗ forge/${relPath}  [${status}]`);
  }
  console.error("\nRun 'npm run sync-engine-bundle' to resolve.");
  process.exit(1);
}

main().catch((err) => {
  console.error("check-engine-bundle failed:", err);
  process.exit(2);
});
