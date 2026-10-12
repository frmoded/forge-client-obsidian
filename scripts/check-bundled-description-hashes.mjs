#!/usr/bin/env node
// Drain 2026-10-12-1700 §2 — fail when a shipped note's stored `description_hash` is not the hash of its own Description (by the
// plugin's algorithm). A stale hash makes a freshly extracted note read "Description source / out of date" and sends the first hammer
// click to the LLM, which then rewrites the library note.
//
//   node scripts/check-bundled-description-hashes.mjs                  check assets/vaults/*  (what the plugin ships)
//   node scripts/check-bundled-description-hashes.mjs <dir> [<dir>…]   check specific vault directories
//   node scripts/check-bundled-description-hashes.mjs --fix <dir>…     re-stamp stale notes in place (run it on the SOURCE vault repos,
//                                                                       then commit them there and re-sync — not on assets/)
//
// Exit codes: 0 clean (or fixed), 1 stale notes found, 2 usage / missing directory.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkVault, restampNote } from "./check-bundled-description-hashes-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const fix = args.includes("--fix");
let dirs = args.filter((a) => !a.startsWith("--"));
if (dirs.length === 0) {
  const vaults = path.join(ROOT, "assets", "vaults");
  dirs = fs.existsSync(vaults)
    ? fs.readdirSync(vaults, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => path.join(vaults, d.name))
    : [];
}
for (const d of dirs) {
  if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) {
    console.error(`check-bundled-description-hashes: not a directory: ${d}`);
    process.exit(2);
  }
}

let totalChecked = 0;
let totalStale = 0;
for (const dir of dirs) {
  const { checked, stale } = await checkVault(dir);
  totalChecked += checked;
  if (stale.length === 0) continue;
  if (fix) {
    for (const s of stale) {
      const p = path.join(dir, s.path);
      fs.writeFileSync(p, await restampNote(fs.readFileSync(p, "utf8")));
      console.log(`re-stamped ${path.basename(dir)}/${s.path}  ${s.stored.slice(0, 8)} -> ${s.actual.slice(0, 8)}`);
    }
  } else {
    totalStale += stale.length;
    for (const s of stale) {
      console.error(`  STALE ${path.basename(dir)}/${s.path}  stored=${s.stored.slice(0, 12)}… actual=${s.actual.slice(0, 12)}…`);
    }
  }
}

if (totalStale > 0) {
  console.error(
    `\ncheck-bundled-description-hashes: ${totalStale} shipped note(s) carry a description_hash that is not the hash of their own Description.\n`
    + `A freshly extracted note would read "Description source / out of date" and its first click would call the LLM.\n`
    + `If the SOURCE vault repos already carry the re-stamp (git log shows it), just re-run the bundle sync:\n`
    + `  FORGE_EDITION=music node scripts/sync-bundled-vault.mjs <vaults…>\n`
    + `Otherwise fix at the source: in each vault repo run  node scripts/check-bundled-description-hashes.mjs --fix <vault-dir>,\n`
    + `bump that vault's forge.toml version, commit, then re-run the bundle sync.`,
  );
  process.exit(1);
}
console.log(`check-bundled-description-hashes: ok (${totalChecked} note(s) with a hash + Description, ${dirs.length} vault dir(s))`);
