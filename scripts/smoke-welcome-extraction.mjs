// scripts/smoke-welcome-extraction.mjs
//
// Clean-vault smoke for the v0.2.56 welcome.md + greet.md first-
// install extraction (per the 2026-06-05-1145 prompt's §Tests).
// Drives the production decision helper (ensureWelcomeFiles in
// src/welcome-files-core.ts) through a real Node filesystem under
// a tmpdir, then asserts:
//
//   Cycle 1: fresh vault → both files extracted; both visible at
//            vault root with bundled content.
//   Cycle 2: re-run → no-op (skip-existing); writes unchanged.
//   Cycle 3: user deleted welcome.md but kept greet.md → re-run is
//            still skip-existing (don't restore welcome — partial
//            deletion is intentional state).
//   Cycle 4: user deleted BOTH files → re-run extracts again (the
//            user signaled "I want it back").
//
// Runs as a release-gate per the prompt's auto-verifiable section.
//
// Usage:
//   node scripts/smoke-welcome-extraction.mjs

import { mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  ensureWelcomeFiles,
  WELCOME_VAULT_PATH,
  GREET_VAULT_PATH,
} from "../src/welcome-files-core.ts";

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

/** Minimal fs-backed adapter — captures only what ensureWelcomeFiles
 *  touches (exists, read, write). Matches the WelcomeFilesAdapter
 *  narrow interface; the same shape app.vault.adapter satisfies at
 *  Obsidian runtime. */
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
  };
}

async function main() {
  console.log("=== smoke: welcome.md + greet.md first-install extraction ===\n");

  // Build the sandbox tree.
  const tmp = path.join(
    os.tmpdir(),
    `forge-smoke-welcome-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
  );
  await mkdir(tmp, { recursive: true });
  console.log(`Sandbox: ${tmp}\n`);

  const adapter = makeFsAdapter(tmp);

  const PATHS = {
    welcomeBundle: ".obsidian/plugins/forge-client-obsidian/assets/welcome/welcome.md",
    greetBundle: ".obsidian/plugins/forge-client-obsidian/assets/welcome/greet.md",
  };

  // Seed the bundled assets (mimicking the post-install plugin layout).
  const WELCOME_BODY = "# bundled welcome\nbody line\n";
  const GREET_BODY = "# bundled greet\nbody line\n";
  await adapter.write(PATHS.welcomeBundle, WELCOME_BODY);
  await adapter.write(PATHS.greetBundle, GREET_BODY);

  // --- CYCLE 1: fresh vault → both files extracted ---
  console.log("Cycle 1: fresh vault → expect both files extracted");
  const r1 = await ensureWelcomeFiles(adapter, PATHS);
  assert(r1.kind === "extracted", `action === 'extracted' (got '${r1.kind}')`);
  assert(await adapter.exists(WELCOME_VAULT_PATH), `${WELCOME_VAULT_PATH} written`);
  assert(await adapter.exists(GREET_VAULT_PATH), `${GREET_VAULT_PATH} written`);
  const w1 = await adapter.read(WELCOME_VAULT_PATH);
  const g1 = await adapter.read(GREET_VAULT_PATH);
  assert(w1 === WELCOME_BODY, `welcome content matches bundle`);
  assert(g1 === GREET_BODY, `greet content matches bundle`);

  // --- CYCLE 2: re-run → no-op ---
  console.log("\nCycle 2: re-run after extraction → expect skip-existing, no rewrite");
  const stat1 = await stat(path.join(tmp, WELCOME_VAULT_PATH));
  const r2 = await ensureWelcomeFiles(adapter, PATHS);
  assert(r2.kind === "skip-existing", `action === 'skip-existing' (got '${r2.kind}')`);
  const stat2 = await stat(path.join(tmp, WELCOME_VAULT_PATH));
  assert(stat1.mtimeMs === stat2.mtimeMs,
    `welcome.md mtime unchanged (no rewrite on idempotent re-run)`);

  // --- CYCLE 3: user deleted welcome but kept greet → still skip ---
  console.log("\nCycle 3: user deleted welcome.md but kept greet.md → expect skip-existing");
  await rm(path.join(tmp, WELCOME_VAULT_PATH));
  const r3 = await ensureWelcomeFiles(adapter, PATHS);
  assert(r3.kind === "skip-existing", `action === 'skip-existing' (got '${r3.kind}')`);
  assert(!(await adapter.exists(WELCOME_VAULT_PATH)),
    `welcome.md NOT restored — partial-deletion intent respected`);
  assert(await adapter.exists(GREET_VAULT_PATH), `greet.md still present`);

  // --- CYCLE 4: user deleted both → extract again ---
  console.log("\nCycle 4: user deleted BOTH files → expect re-extraction");
  await rm(path.join(tmp, GREET_VAULT_PATH));
  const r4 = await ensureWelcomeFiles(adapter, PATHS);
  assert(r4.kind === "extracted", `action === 'extracted' (got '${r4.kind}')`);
  assert(await adapter.exists(WELCOME_VAULT_PATH), `welcome.md re-written`);
  assert(await adapter.exists(GREET_VAULT_PATH), `greet.md re-written`);

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
