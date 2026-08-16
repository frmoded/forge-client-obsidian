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

// CW-plugin-shared-exclusion-module (drain 2026-07-29-1610): shared
// exclusion policy lives in scripts/exclusions.mjs so a new
// underscore-prefix or excluded name is a one-file edit. Prior shape
// duplicated the list here + in build-release-zip.mjs; the 2026-07-28
// arc showed the two copies drifting is a real risk.
import { isExcludedName } from "./exclusions.mjs";
import { snapshotVaultHead } from "./vault-head-snapshot.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Recognised vault names — sync attempts on unknown vault names fail
// with a clear error rather than silently mirroring arbitrary sibling
// dirs.
//
// CW-release-prep-improvements (drain 2026-07-29-2300) Change 3: the
// list now lives in scripts/vaults.txt, shared with release-prep.sh +
// build-release-zip.mjs. Still must be kept in sync BY HAND with
// KNOWN_BUNDLED_LIBRARIES in src/welcome.ts + src/chips.ts — those are
// bundled into main.js and run inside Obsidian, where vaults.txt does
// not exist.
import { KNOWN_VAULTS } from "./vaults.mjs";

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
  const VAULT = path.resolve(ROOT, "..", vaultName);

  console.log(`\n=== sync-bundled-vault: ${vaultName} ===`);
  console.log(`  source: ${VAULT} (at HEAD)`);
  console.log(`  bundle: ${BUNDLE}`);

  if (!fs.existsSync(VAULT)) {
    console.error(`\nSource not found: ${VAULT}`);
    console.error(`Is the ${vaultName} source repo cloned as a sibling? Expected:`);
    console.error(`  <forge-client-obsidian>/../${vaultName}/`);
    process.exit(1);
  }

  // Drain 2026-08-16-1100 — mirror the source vault's HEAD, not its
  // working tree, so the bundle can only ever contain committed content.
  // The drift gate in build-release-zip.mjs reads through the same module;
  // if these two ever disagreed on the baseline, the gate would pass while
  // the sync copied uncommitted files, which is the hole this closes.
  let snapshot;
  try {
    snapshot = snapshotVaultHead(VAULT);
  } catch (e) {
    console.error(`\nCannot sync ${vaultName}: ${e.message}`);
    process.exit(1);
  }
  const SOURCE = snapshot.root;

  try {
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

  // Drain 2026-08-03-1330. The counters were investigated and found
  // correct — each source file increments exactly one of added /
  // updated / skipped, and each orphan increments deleted. This
  // assertion pins that, so a future refactor that double-counts or
  // misses a path fails here instead of quietly printing a wrong
  // summary.
  const accounted = added + updated + skipped;
  if (accounted !== sourceFiles.length) {
    throw new Error(
      `sync-bundled-vault counter invariant violated for ${vaultName}: ` +
      `${added} added + ${updated} updated + ${skipped} unchanged = ` +
      `${accounted}, but ${sourceFiles.length} source files were processed.`,
    );
  }

  console.log(
    `  Result: ${added} added, ${updated} updated, ${skipped} unchanged, ${deleted} deleted.`,
  );
  // The summary is PER-RUN. `git status` is cumulative since the last
  // commit, so a second run legitimately reports all-unchanged while
  // the tree still shows the first run's uncommitted output. That
  // mismatch is what drain 1330 was filed about; the note is here so
  // the next reader doesn't re-diagnose it as a miscount.
  if (added + updated + deleted === 0) {
    console.log(
      `  (no changes this run — any uncommitted bundle files predate it)`,
    );
  }
  } finally {
    snapshot.dispose();
  }
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
