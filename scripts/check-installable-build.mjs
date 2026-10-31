// scripts/check-installable-build.mjs
//
// 2026-10-26-1700 (DEMO blocker): the driver's install recipe copies the repo-root main.js / manifest.json / styles.css / assets/ into a vault. A plain `npm run build` (or anything that builds the LEAN
// edition into the root) leaves a LEAN main.js there, and the recipe then installed it into the MUSIC vault: "Rhythm Box widget was not found", only forge-moda / forge-tutorial searched.
// This is the one check that says which edition the root artifacts are: the first line of main.js (written by scripts/build-main.mjs) and the bundled vault folders next to it.
//
//   node scripts/check-installable-build.mjs [--edition music|lean] [--root <dir>] [--allow-dirty]     (default: music, the repo root; exit 1 + the command that fixes it; --allow-dirty = the person asked for the working tree)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { editionConfig } from "./editions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STAMP = /^\/\* forge-edition: (lean|music)(?:; sha: ([0-9a-f]{7,40}); tree: (clean|dirty))? \*\//;

/** The edition stamped on the first line of a main.js text, or null. */
export function stampedEdition(mainJsText) {
  const m = STAMP.exec(mainJsText.slice(0, 200));
  return m ? m[1] : null;
}

/** 2026-10-31-1115: the commit a main.js was built from and whether that tree was clean, from the same first line ({sha, tree}); null for an old-format stamp or none. */
export function stampedBuild(mainJsText) {
  const m = STAMP.exec(mainJsText.slice(0, 200));
  return m && m[2] ? { sha: m[2], tree: m[3] } : null;
}

/** Problems with the root artifacts for `edition` (empty = installable). Pure over (main.js text, the vault folder names present in assets/vaults). */
export function installableProblems({ mainJsText, vaultDirs }, edition = "music", { allowDirty = false } = {}) {
  const problems = [];
  const stamped = stampedEdition(mainJsText ?? "");
  const fix = edition === "music" ? "npm run build:music" : "npm run build";
  if (stamped === null) problems.push(`main.js has no edition stamp (built before 2026-10-26-1700, or not built): rebuild with \`${fix}\``);
  else if (stamped !== edition) problems.push(`main.js is the ${stamped.toUpperCase()} edition, not ${edition.toUpperCase()}: rebuild with \`${fix}\``);
  const build = stampedBuild(mainJsText ?? "");
  if (build && build.tree === "dirty" && !allowDirty) problems.push(`main.js was built from a DIRTY working tree (on top of ${build.sha}): install from a clean commit (bash scripts/install-local.sh builds one by default), or pass --worktree to install the working tree on purpose`);
  const want = editionConfig(edition).vaults;
  for (const v of want) if (!vaultDirs.includes(v)) problems.push(`assets/vaults/${v} is missing for the ${edition} edition: rebuild with \`${fix}\``);
  return problems;
}

export function readRoot(root = ROOT) {
  const main = path.join(root, "main.js");
  const vaultsDir = path.join(root, "assets", "vaults");
  return {
    mainJsText: fs.existsSync(main) ? fs.readFileSync(main, "utf8").slice(0, 400) : "",
    vaultDirs: fs.existsSync(vaultsDir) ? fs.readdirSync(vaultsDir) : [],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
  const edition = arg("--edition") ?? "music";
  const problems = installableProblems(readRoot(arg("--root") ?? ROOT), edition, { allowDirty: process.argv.includes("--allow-dirty") });
  if (problems.length) {
    for (const p of problems) console.error(`check-installable-build: ${p}`);
    process.exit(1);
  }
  console.log(`check-installable-build: ok (main.js and assets/vaults are the ${edition} edition)`);
}
