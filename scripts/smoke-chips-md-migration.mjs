// scripts/smoke-chips-md-migration.mjs
//
// Clean-vault smoke for the v0.2.52 one-shot `_meta/_chips.md` v1→v2
// upgrade. Drives the production decision helpers (classifyChipsMd +
// chooseBackupName) through a real Node filesystem under a tmpdir
// mimicking the plugin-install + vault layout, then asserts:
//
//   - First boot with v1 _chips.md migrates: backup created, file
//     overwritten with v2 body, schema_version: 2 present.
//   - Second boot (file now v2) is a no-op: no extra backup, no
//     overwrite.
//   - Boot with no extracted _chips.md is a silent no-op (forge-music
//     case: library not extracted).
//   - Boot with bundled _chips.md missing + extracted v1 file warns
//     + skips without losing data.
//   - Collision-suffix backup naming works when `_chips.md.bak.v1`
//     already exists.
//
// Runs as a hard release-gate per cc-prompt-queue protocol: if this
// script exits non-zero, the release is NOT cut.
//
// Usage:
//   node scripts/smoke-chips-md-migration.mjs

import { mkdir, readFile, writeFile, rename, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  classifyChipsMd,
  chooseBackupName,
  DEFAULT_BACKUP_NAME,
} from "../src/chips-md-migration-core.ts";

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

/** Minimal fs-backed adapter — captures only what migrateChipsMdToV2
 *  touches. Mirrors Obsidian's DataAdapter shape enough for the
 *  decision logic to operate. */
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
    async remove(p) {
      return rm(resolve(p), { force: true });
    },
    async list(p) {
      const entries = await readdir(resolve(p), { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile())
        .map((e) => `${p}/${e.name}`);
      const folders = entries
        .filter((e) => e.isDirectory())
        .map((e) => `${p}/${e.name}`);
      return { files, folders };
    },
  };
}

/** Reproduces welcome.ts:migrateChipsMdToV2 against an fs adapter.
 *  Same decision logic, same backup + overwrite semantics. Returns
 *  a tag describing what happened so assertions can pin down the
 *  exact branch taken. */
async function migrateChipsMdToV2(adapter, libraryDirName) {
  const extractedPath = `${libraryDirName}/_meta/_chips.md`;
  const bundledPath =
    `.obsidian/plugins/forge-client-obsidian/assets/vaults/${libraryDirName}/_meta/_chips.md`;
  const metaDir = `${libraryDirName}/_meta`;

  if (!(await adapter.exists(extractedPath))) return { action: "no-op-absent" };
  const extractedBody = await adapter.read(extractedPath);
  const status = classifyChipsMd(extractedBody);

  if (status.kind === "v2") return { action: "no-op-already-v2" };
  if (status.kind === "absent") return { action: "no-op-absent" };
  if (status.kind === "unparseable") return { action: "skip-unparseable" };

  if (!(await adapter.exists(bundledPath))) return { action: "skip-no-bundled" };

  const listing = await adapter.list(metaDir);
  const existingNames = new Set(
    listing.files.map((p) => p.slice(metaDir.length + 1)),
  );
  const backupName = chooseBackupName(existingNames);
  const backupPath = `${metaDir}/${backupName}`;

  try {
    await adapter.rename(extractedPath, backupPath);
  } catch (e) {
    const v1Body = await adapter.read(extractedPath);
    await adapter.write(backupPath, v1Body);
    await adapter.remove(extractedPath);
  }
  const bundledBody = await adapter.read(bundledPath);
  await adapter.write(extractedPath, bundledBody);
  return { action: "migrated", backupName };
}

const V1_BODY = [
  "---",
  "type: data",
  "content_type: yaml",
  "read_only: true",
  'description: "v1 chip palette"',
  "---",
  "",
  "# Body",
  "",
  "```yaml",
  "chips:",
  '  - label: "Create water particles"',
  '    insertion: "Call [[create_water_particles]]."',
  "    group: Setup",
  "```",
].join("\n");

const V2_BODY = [
  "---",
  "type: data",
  "content_type: yaml",
  "read_only: true",
  "schema_version: 2",
  'description: "v2 chip palette"',
  "---",
  "",
  "# Body",
  "",
  "```yaml",
  "schema_version: 2",
  "overrides:",
  "  - target: create_water_particles",
  "    group: Setup",
  "```",
].join("\n");

async function main() {
  console.log("=== smoke: chips-md v1→v2 one-shot migration ===\n");

  const tmp = path.join(
    os.tmpdir(),
    `forge-smoke-chips-md-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
  );
  await mkdir(tmp, { recursive: true });
  console.log(`Sandbox: ${tmp}\n`);

  const adapter = makeFsAdapter(tmp);

  const pluginAssets =
    ".obsidian/plugins/forge-client-obsidian/assets/vaults/forge-moda";
  const libDir = "forge-moda";

  // Seed: bundled v2 _chips.md.
  await adapter.write(`${pluginAssets}/_meta/_chips.md`, V2_BODY);

  // ----- CYCLE 1: v1 extracted, expect migration -----
  console.log("Cycle 1: v1 extracted → expect migration");
  await adapter.write(`${libDir}/_meta/_chips.md`, V1_BODY);

  const r1 = await migrateChipsMdToV2(adapter, libDir);
  assert(r1.action === "migrated", `action === 'migrated' (got '${r1.action}')`);
  assert(
    r1.backupName === DEFAULT_BACKUP_NAME,
    `backup name === '${DEFAULT_BACKUP_NAME}' (got '${r1.backupName}')`,
  );
  assert(
    await adapter.exists(`${libDir}/_meta/${DEFAULT_BACKUP_NAME}`),
    `${libDir}/_meta/${DEFAULT_BACKUP_NAME} exists`,
  );
  const backupBody1 = await adapter.read(`${libDir}/_meta/${DEFAULT_BACKUP_NAME}`);
  assert(
    backupBody1 === V1_BODY,
    `backup contains the v1 body verbatim`,
  );
  const newBody1 = await adapter.read(`${libDir}/_meta/_chips.md`);
  assert(
    newBody1.includes("schema_version: 2"),
    `migrated _chips.md contains schema_version: 2`,
  );

  // ----- CYCLE 2: re-run, expect no-op -----
  console.log("\nCycle 2: re-run after migration → expect no-op-already-v2");
  const r2 = await migrateChipsMdToV2(adapter, libDir);
  assert(
    r2.action === "no-op-already-v2",
    `action === 'no-op-already-v2' (got '${r2.action}')`,
  );
  // Backup name unchanged — no second backup written.
  const listingAfter = await adapter.list(`${libDir}/_meta`);
  const fileNames = listingAfter.files
    .map((p) => p.slice(`${libDir}/_meta/`.length))
    .filter((n) => n.startsWith("_chips.md.bak"));
  assert(
    fileNames.length === 1 && fileNames[0] === DEFAULT_BACKUP_NAME,
    `exactly one backup remains (${DEFAULT_BACKUP_NAME}); got [${fileNames.join(", ")}]`,
  );

  // ----- CYCLE 3: collision suffix -----
  console.log("\nCycle 3: pre-existing backup → collision suffix");
  // Re-create a v1 file (e.g. user reverted manually). The existing
  // backup name will collide on this run.
  await adapter.write(`${libDir}/_meta/_chips.md`, V1_BODY);
  const r3 = await migrateChipsMdToV2(adapter, libDir);
  assert(r3.action === "migrated", `action === 'migrated' (got '${r3.action}')`);
  assert(
    r3.backupName === `${DEFAULT_BACKUP_NAME}.2`,
    `collision-suffix backup name === '${DEFAULT_BACKUP_NAME}.2' (got '${r3.backupName}')`,
  );
  assert(
    await adapter.exists(`${libDir}/_meta/${DEFAULT_BACKUP_NAME}`),
    `original .v1 backup preserved (not clobbered)`,
  );
  assert(
    await adapter.exists(`${libDir}/_meta/${DEFAULT_BACKUP_NAME}.2`),
    `new .v1.2 backup exists`,
  );

  // ----- CYCLE 4: absent extracted file (forge-music case) -----
  console.log("\nCycle 4: no extracted _chips.md → silent no-op");
  // forge-music has no _chips.md in either bundle or vault; the
  // migration short-circuits immediately.
  const r4 = await migrateChipsMdToV2(adapter, "forge-music");
  assert(
    r4.action === "no-op-absent",
    `action === 'no-op-absent' for unextracted library (got '${r4.action}')`,
  );

  // ----- CYCLE 5: bundled missing + v1 extracted -----
  console.log("\nCycle 5: v1 extracted but bundled missing → skip-no-bundled");
  // Wipe the bundled forge-moda _chips.md to simulate a dev-mode
  // install where assets aren't populated yet.
  await adapter.remove(`${pluginAssets}/_meta/_chips.md`);
  // Re-create a v1 extracted file (the cycle-3 migration replaced
  // the previous one with v2). Use cycle-3's r3.backupName.2 path
  // to confirm we don't accidentally migrate when bundled missing.
  await adapter.write(`${libDir}/_meta/_chips.md`, V1_BODY);
  const r5 = await migrateChipsMdToV2(adapter, libDir);
  assert(
    r5.action === "skip-no-bundled",
    `action === 'skip-no-bundled' when bundled file missing (got '${r5.action}')`,
  );
  const v1StillThere = await adapter.read(`${libDir}/_meta/_chips.md`);
  assert(
    v1StillThere === V1_BODY,
    `extracted v1 file unchanged when bundled missing (no data loss)`,
  );

  // ----- CYCLE 6: unparseable extracted body -----
  console.log("\nCycle 6: unparseable extracted → skip-unparseable");
  // Restore the bundle so the gate isn't no-bundled.
  await adapter.write(`${pluginAssets}/_meta/_chips.md`, V2_BODY);
  // Replace extracted with garbage (no frontmatter delimiters).
  await adapter.write(`${libDir}/_meta/_chips.md`, "this is not a chips file");
  const r6 = await migrateChipsMdToV2(adapter, libDir);
  assert(
    r6.action === "skip-unparseable",
    `action === 'skip-unparseable' for garbage body (got '${r6.action}')`,
  );
  const garbageStill = await adapter.read(`${libDir}/_meta/_chips.md`);
  assert(
    garbageStill === "this is not a chips file",
    `garbage file unchanged (no clobbering)`,
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
