// scripts/check-installable-build.mjs
//
// 2026-10-26-1700 (DEMO blocker): the driver's install recipe copies the repo-root main.js / manifest.json / styles.css / assets/ into a vault. A plain `npm run build` (or anything that builds the LEAN
// edition into the root) leaves a LEAN main.js there, and the recipe then installed it into the MUSIC vault: "Rhythm Box widget was not found", only forge-moda / forge-tutorial searched.
// This is the one check that says which edition the root artifacts are: the first line of main.js (written by scripts/build-main.mjs) and the bundled vault folders next to it.
//
//   node scripts/check-installable-build.mjs [--edition music|lean] [--root <dir>]     (default: music, the repo root; exit 1 + the command that fixes it)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { editionConfig } from "./editions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The edition stamped on the first line of a main.js text, or null. */
export function stampedEdition(mainJsText) {
  const m = /^\/\* forge-edition: (lean|music) \*\//.exec(mainJsText.slice(0, 200));
  return m ? m[1] : null;
}

/** Problems with the root artifacts for `edition` (empty = installable). Pure over (main.js text, the vault folder names present in assets/vaults). */
export function installableProblems({ mainJsText, vaultDirs }, edition = "music") {
  const problems = [];
  const stamped = stampedEdition(mainJsText ?? "");
  const fix = edition === "music" ? "npm run build:music" : "npm run build";
  if (stamped === null) problems.push(`main.js has no edition stamp (built before 2026-10-26-1700, or not built): rebuild with \`${fix}\``);
  else if (stamped !== edition) problems.push(`main.js is the ${stamped.toUpperCase()} edition, not ${edition.toUpperCase()}: rebuild with \`${fix}\``);
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
  const problems = installableProblems(readRoot(arg("--root") ?? ROOT), edition);
  if (problems.length) {
    for (const p of problems) console.error(`check-installable-build: ${p}`);
    process.exit(1);
  }
  console.log(`check-installable-build: ok (main.js and assets/vaults are the ${edition} edition)`);
}
