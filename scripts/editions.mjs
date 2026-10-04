// scripts/editions.mjs
//
// Music-edition project, Phase 2. THE one place that decides which assets and which bundled vaults
// belong to which edition. Phase 1 made code selection edition-aware (src/music-edition*.ts); this
// makes ASSET selection edition-aware, with one rule above all others:
//
//   Edition membership is decided by edition, NEVER by what happens to be on disk.
//
// A developer who has fetched the music wheels (assets/wheels/) or synced the music vaults
// (assets/vaults/music-*) must still get a byte-identical LEAN build. Before this module, three
// scripts enumerated assets by directory walk (build-manifest.mjs, inline-bundled-assets.mjs, the
// release zip) and would have shipped whatever was present.
//
//   FORGE_EDITION=lean   (default)  forge-moda + forge-tutorial; Pyodide only; no wheels.
//   FORGE_EDITION=music             + music-theory + music-core; the 11 music21-chain wheels.
//
// Vault lists live in plain text (scripts/vaults.txt = lean, scripts/vaults.music.txt = music) because
// release-prep.sh is bash and cannot import an .mjs; this module is the .mjs accessor.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const EDITIONS = ["lean", "music"];

export function resolveEdition(value) {
  const edition = value === undefined || value === "" ? "lean" : value;
  if (!EDITIONS.includes(edition)) {
    throw new Error(
      `FORGE_EDITION must be one of ${EDITIONS.join(" | ")} (default lean); got ${JSON.stringify(value)}`,
    );
  }
  return edition;
}

export const VAULT_FILES = { lean: "vaults.txt", music: "vaults.music.txt" };

/** Parse a vault list file: one name per line, `#` comments + blanks ignored. */
export function readVaultFile(file) {
  const names = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (t === "" || t.startsWith("#")) continue;
    names.push(t);
  }
  if (names.length === 0) throw new Error(`${file} lists no vaults — expected at least one.`);
  return names;
}

export function vaultsFor(edition) {
  return readVaultFile(path.join(here, VAULT_FILES[resolveEdition(edition)]));
}

/** Every vault any edition can bundle (the sync script accepts these regardless of edition). */
export const ALL_VAULTS = [...new Set(EDITIONS.flatMap((e) => vaultsFor(e)))];

/** The directories whose files a BRAT install hydrates from release assets. */
export const MUSIC_HYDRATABLE_DIRS = ["wheels", "pyodide"];
export const LEAN_HYDRATABLE_DIRS = ["pyodide"];

export function editionConfig(value = process.env.FORGE_EDITION) {
  const edition = resolveEdition(value);
  return {
    edition,
    vaults: vaultsFor(edition),
    wheels: edition === "music",
    hydratableDirs: edition === "music" ? MUSIC_HYDRATABLE_DIRS : LEAN_HYDRATABLE_DIRS,
  };
}

/** Does `rel` (relative to assets/, forward slashes) belong to this edition's build? */
export function assetInEdition(rel, cfg) {
  const parts = rel.split("/");
  if (parts[0] === "wheels") return cfg.wheels;
  if (parts[0] === "vaults" && parts.length > 1) return cfg.vaults.includes(parts[1]);
  return true;
}

/** Walk `assetsRoot`; return sorted relative paths of the files that belong to `cfg`'s edition. */
export function listEditionAssets(assetsRoot, cfg) {
  const out = [];
  (function walk(dir, base) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else if (entry.isFile() && assetInEdition(rel, cfg)) out.push(rel);
    }
  })(assetsRoot, "");
  return out.sort();
}
