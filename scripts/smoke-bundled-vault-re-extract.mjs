// scripts/smoke-bundled-vault-re-extract.mjs
//
// Clean-vault smoke for the v0.2.39 auto-re-extract-on-drift path.
// Drives the production decision helper (compareBundledVaultVersion)
// through a real Node filesystem under a tmpdir mimicking the
// plugin-install + vault layout, then asserts:
//
//   - First boot extracts the bundled vault into the empty vault dir.
//   - Bumping the bundled forge.toml version + re-running triggers
//     a backup (forge-music.bak.<old-version>) and re-extract.
//   - Running again with no version change is a no-op (no extra
//     backups created).
//
// Runs as a hard release-gate per the prompt's instructions: if this
// script exits non-zero, the release is NOT cut.
//
// Usage:
//   node scripts/smoke-bundled-vault-re-extract.mjs

import { mkdir, readFile, writeFile, cp, rename, rm, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  compareBundledVaultVersion,
  parseForgeTomlVersion,
} from "../src/bundled-vault-version-core.ts";

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ${GREEN}✓${RESET} ${label}`);
    passed += 1;
  } else {
    console.log(`  ${RED}✗${RESET} ${label}`);
    failed += 1;
  }
}

/** Minimal fs-backed adapter — captures only what the bundled-vault
 *  extraction flow touches. Mirrors Obsidian's DataAdapter shape
 *  enough for the production code path to compile against. */
function makeFsAdapter(root) {
  const resolve = (p) => path.join(root, p);
  return {
    async exists(p) {
      return existsSync(resolve(p));
    },
    async read(p) {
      return readFile(resolve(p), "utf8");
    },
    async write(p, body) {
      await mkdir(path.dirname(resolve(p)), { recursive: true });
      return writeFile(resolve(p), body, "utf8");
    },
    async mkdir(p) {
      return mkdir(resolve(p), { recursive: true });
    },
    async rename(oldPath, newPath) {
      return rename(resolve(oldPath), resolve(newPath));
    },
    async rmdir(p, recursive = false) {
      return rm(resolve(p), { recursive, force: true });
    },
    async listChildren(p) {
      return readdir(resolve(p));
    },
  };
}

/** Reproduces the welcome.ts:ensureBundledVault flow against an fs
 *  adapter. Same decision logic, same backup-then-extract semantics. */
async function ensureBundledVault(adapter, sourceDir, targetDir, label) {
  if (!(await adapter.exists(sourceDir))) {
    console.log(`${DIM}    [skip] bundled ${label} missing${RESET}`);
    return { action: "skip-no-source" };
  }
  const bundledTomlPath = `${sourceDir}/forge.toml`;
  const extractedTomlPath = `${targetDir}/forge.toml`;
  const bundledBody = (await adapter.exists(bundledTomlPath))
    ? await adapter.read(bundledTomlPath)
    : null;
  const extractedBody =
    (await adapter.exists(targetDir)) && (await adapter.exists(extractedTomlPath))
      ? await adapter.read(extractedTomlPath)
      : null;
  const status = compareBundledVaultVersion(bundledBody, extractedBody);

  if (status.kind === "no-bundled") return { action: "skip-no-bundled" };
  if (status.kind === "unparseable") return { action: "skip-unparseable", reason: status.reason };
  if (status.kind === "match") return { action: "skip-match", version: status.version };

  if (status.kind === "drift") {
    // renameWithBackup
    let backupName = `${targetDir}.bak.${status.extracted}`;
    let counter = 1;
    while (await adapter.exists(backupName)) {
      counter += 1;
      backupName = `${targetDir}.bak.${status.extracted}.${counter}`;
    }
    try {
      await adapter.rename(targetDir, backupName);
    } catch (e) {
      // Copy-then-delete fallback. fs.cp recursive does the job.
      await cp(path.join(adapter.__root ?? "", targetDir), path.join(adapter.__root ?? "", backupName), { recursive: true });
      await adapter.rmdir(targetDir, true);
    }
  }

  // Copy bundled into target. Use fs.cp for recursive — the
  // production path uses copyDirRecursive but the result is the
  // same for a flat directory of files.
  await mkdir(path.join(adapter.__root, targetDir), { recursive: true });
  await cp(
    path.join(adapter.__root, sourceDir),
    path.join(adapter.__root, targetDir),
    { recursive: true },
  );
  return { action: status.kind === "drift" ? "re-extract" : "first-extract" };
}

async function main() {
  console.log("=== smoke: bundled vault auto-re-extract on drift ===\n");

  // Build the sandbox tree.
  const tmp = await mkdir(path.join(os.tmpdir(), "forge-smoke-"), {
    recursive: true,
  }).then(() => {
    // os.mkdtemp would give us a unique dir, but mkdir+rand is fine for
    // a smoke script where collisions are vanishingly improbable.
    const dir = path.join(os.tmpdir(), `forge-smoke-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    return mkdir(dir, { recursive: true }).then(() => dir);
  });

  console.log(`Sandbox: ${tmp}\n`);

  const adapter = makeFsAdapter(tmp);
  adapter.__root = tmp;

  const pluginAssets = ".obsidian/plugins/forge-client-obsidian/assets/vaults/forge-music";
  const targetDir = "forge-music";

  // Seed: bundled forge-music with version 0.3.8 + a content file.
  await adapter.mkdir(pluginAssets);
  await adapter.write(`${pluginAssets}/forge.toml`, [
    'name = "forge-music"',
    'version = "0.3.8"',
    'description = "test bundle"',
    'domains = ["music"]',
    '',
  ].join("\n"));
  await adapter.write(`${pluginAssets}/sample.md`, "# sample\n\nseed content v0.3.8\n");

  // --- CYCLE 1: first install ---
  console.log("Cycle 1: first install (empty vault)");
  const r1 = await ensureBundledVault(adapter, pluginAssets, targetDir, "forge-music");
  assert(r1.action === "first-extract", `action === 'first-extract' (got '${r1.action}')`);
  assert(await adapter.exists(targetDir), `${targetDir}/ exists after extract`);
  assert(
    await adapter.exists(`${targetDir}/forge.toml`),
    `${targetDir}/forge.toml exists after extract`,
  );
  const v1 = parseForgeTomlVersion(await adapter.read(`${targetDir}/forge.toml`));
  assert(v1 === "0.3.8", `extracted version === '0.3.8' (got '${v1}')`);
  const sample1 = await adapter.read(`${targetDir}/sample.md`);
  assert(
    sample1.includes("seed content v0.3.8"),
    `sample.md content carried through extract`,
  );

  // --- CYCLE 2: same version, no-op ---
  console.log("\nCycle 2: same version (expect skip-match, no backup)");
  const r2 = await ensureBundledVault(adapter, pluginAssets, targetDir, "forge-music");
  assert(r2.action === "skip-match", `action === 'skip-match' (got '${r2.action}')`);
  assert(
    !(await adapter.exists(`${targetDir}.bak.0.3.8`)),
    `no backup created when versions match`,
  );

  // --- CYCLE 3: bump bundled, expect backup + re-extract ---
  console.log("\nCycle 3: bump bundled → 0.3.9 (expect backup + re-extract)");
  await adapter.write(`${pluginAssets}/forge.toml`, [
    'name = "forge-music"',
    'version = "0.3.9"',
    'description = "test bundle"',
    'domains = ["music"]',
    '',
  ].join("\n"));
  await adapter.write(`${pluginAssets}/sample.md`, "# sample\n\nseed content v0.3.9 (NEW)\n");

  const r3 = await ensureBundledVault(adapter, pluginAssets, targetDir, "forge-music");
  assert(r3.action === "re-extract", `action === 're-extract' (got '${r3.action}')`);
  assert(
    await adapter.exists(`${targetDir}.bak.0.3.8`),
    `backup forge-music.bak.0.3.8/ exists`,
  );
  const backup3Toml = await adapter.read(`${targetDir}.bak.0.3.8/forge.toml`);
  assert(
    parseForgeTomlVersion(backup3Toml) === "0.3.8",
    `backup contains the old 0.3.8 forge.toml`,
  );
  const v3 = parseForgeTomlVersion(await adapter.read(`${targetDir}/forge.toml`));
  assert(v3 === "0.3.9", `extracted version now '0.3.9' (got '${v3}')`);
  const sample3 = await adapter.read(`${targetDir}/sample.md`);
  assert(
    sample3.includes("seed content v0.3.9 (NEW)"),
    `sample.md content now reflects new bundle`,
  );

  // --- CYCLE 4: bump again, second backup with collision-avoiding suffix? ---
  // First trigger another drift back to 0.3.8 to test the collision path
  // (forge-music.bak.0.3.9 will collide on the second 0.3.9→X drift if
  // we ever bump back). For now, bump to 0.3.10.
  console.log("\nCycle 4: bump bundled → 0.3.10 (expect second backup)");
  await adapter.write(`${pluginAssets}/forge.toml`, [
    'name = "forge-music"',
    'version = "0.3.10"',
    'description = "test bundle"',
    'domains = ["music"]',
    '',
  ].join("\n"));
  const r4 = await ensureBundledVault(adapter, pluginAssets, targetDir, "forge-music");
  assert(r4.action === "re-extract", `action === 're-extract' (got '${r4.action}')`);
  assert(
    await adapter.exists(`${targetDir}.bak.0.3.9`),
    `second backup forge-music.bak.0.3.9/ exists`,
  );
  assert(
    await adapter.exists(`${targetDir}.bak.0.3.8`),
    `original backup forge-music.bak.0.3.8/ still preserved (not clobbered)`,
  );

  // --- CYCLE 5: collision suffix (rare in practice, but covers the loop) ---
  console.log("\nCycle 5: simulate collision (manual .bak.0.3.10 pre-exists, then drift)");
  // Pre-create the would-be backup name to force the collision suffix path.
  await adapter.mkdir(`${targetDir}.bak.0.3.10`);
  await adapter.write(`${targetDir}.bak.0.3.10/marker.txt`, "pre-existing backup");
  // Bump bundle one more time.
  await adapter.write(`${pluginAssets}/forge.toml`, [
    'name = "forge-music"',
    'version = "0.3.11"',
    'description = "test bundle"',
    'domains = ["music"]',
    '',
  ].join("\n"));
  const r5 = await ensureBundledVault(adapter, pluginAssets, targetDir, "forge-music");
  assert(r5.action === "re-extract", `action === 're-extract' (got '${r5.action}')`);
  assert(
    await adapter.exists(`${targetDir}.bak.0.3.10.2`),
    `collision-suffixed backup forge-music.bak.0.3.10.2/ exists`,
  );
  const marker = await adapter.read(`${targetDir}.bak.0.3.10/marker.txt`);
  assert(
    marker === "pre-existing backup",
    `pre-existing forge-music.bak.0.3.10 marker preserved (not overwritten)`,
  );

  // Clean up sandbox.
  await rm(tmp, { recursive: true, force: true });

  console.log(`\n=== smoke result: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("smoke crashed:", e);
  process.exit(1);
});
