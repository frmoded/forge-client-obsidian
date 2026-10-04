// scripts/check-edition-assets.mjs
//
// Music-edition Phase 2 preflight, run first in `npm run build`. A MUSIC build with missing wheels
// compiles fine and then fails only at runtime in Obsidian ("music21 is not yet mounted … manifest has
// 0 wheels" — exactly what the driver hit on the redeployed lean build). This turns that into a build
// error with the command that fixes it. The LEAN edition requires nothing here (it ignores the music
// assets entirely, present or not — see scripts/editions.mjs).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { editionConfig } from "./editions.mjs";
import { loadPins, matchesPin } from "./fetch-music-wheels.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Returns a list of human-readable problems (empty = the edition's assets are complete). */
export function checkEditionAssets(assetsRoot, cfg, pins = loadPins().wheels) {
  if (cfg.edition !== "music") return [];
  const problems = [];
  for (const pin of pins) {
    const p = path.join(assetsRoot, "wheels", pin.file);
    if (!fs.existsSync(p)) { problems.push(`missing wheel ${pin.file} — run \`npm run fetch-music-wheels\``); continue; }
    if (!matchesPin(pin, fs.readFileSync(p))) problems.push(`wheel ${pin.file} does not match its pin — run \`npm run fetch-music-wheels\``);
  }
  for (const v of cfg.vaults) {
    if (!fs.existsSync(path.join(assetsRoot, "vaults", v, "forge.toml"))) {
      problems.push(`bundled vault ${v} missing (assets/vaults/${v}/forge.toml) — run \`FORGE_EDITION=music node scripts/sync-bundled-vault.mjs ${v}\``);
    }
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cfg = editionConfig();
  const problems = checkEditionAssets(path.join(ROOT, "assets"), cfg);
  if (problems.length) {
    console.error(`[check-edition-assets] edition=${cfg.edition}: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`[check-edition-assets] edition=${cfg.edition}: ok`);
}
