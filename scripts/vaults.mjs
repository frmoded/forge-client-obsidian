// scripts/vaults.mjs
//
// CW-release-prep-improvements (drain 2026-07-29-2300) Change 3.
//
// JS accessor for scripts/vaults.txt — the canonical bundled-vault
// list. Mirrors the scripts/exclusions.mjs precedent from drain 1610:
// one place to change, so a new vault is a one-line edit rather than
// an edit-three-files-and-hope ritual.
//
// Why a .txt plus this thin accessor rather than putting the array in
// this module directly: release-prep.sh is bash and cannot import an
// .mjs. Plain text is the lowest common denominator both consumers
// parse trivially; this module keeps the .mjs side from duplicating
// the parse.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Parse vaults.txt: one name per line, `#` comments + blanks ignored. */
function readVaults() {
  const file = path.join(__dirname, "vaults.txt");
  const raw = fs.readFileSync(file, "utf8");
  const names = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    names.push(trimmed);
  }
  if (names.length === 0) {
    throw new Error(`${file} lists no vaults — expected at least one.`);
  }
  return names;
}

/** Canonical bundled-vault names, in vaults.txt order. */
export const BUNDLED_VAULTS = readVaults();

/** Same list as a Set, for allowlist checks. */
export const KNOWN_VAULTS = new Set(BUNDLED_VAULTS);
