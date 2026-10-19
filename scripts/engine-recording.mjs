// Drain 2026-10-19-1530 — the RECORDED engine output the open-time-writes gate models Run with, and the guard that keeps it honest.
//
// The fixture (test/fixtures/engine-transpile/shipped-notes.json) is written by scripts/record-engine-transpile.py from the REAL engine
// (`resolve_action_code(snippet, force=True)`, what a hammer click / Run write-back receives). It is only worth trusting while two things hold:
//   1. it was recorded against the engine this plugin BUNDLES — `engine_bundle_digest` (below) must equal the digest of assets/engine/forge now;
//   2. each recorded note still has the Recipe it had when recorded — Python is a function of the Recipe.
// `recordingProblems` checks both and its messages carry the command that re-records.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isInScope } from "../src/engine-bundle-drift-core.ts";
import { extractRecipeSection } from "../src/v2-note-core.ts";

export const RERECORD_HINT =
  "re-record with scripts/record-engine-transpile.py (run it with the forge engine's virtualenv python), then commit test/fixtures/engine-transpile/shipped-notes.json";

function* walk(dir, base = "") {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) yield* walk(path.join(dir, e.name), rel);
    else if (e.isFile()) yield rel;
  }
}

/** sha256 over every in-scope engine file (the same predicate the sync script and the drift check use): sorted `<path>\0<sha256(bytes)>` lines. */
export function engineBundleDigest(engineDir) {
  const lines = [...walk(engineDir)].filter(isInScope).sort().map((rel) => {
    const h = crypto.createHash("sha256").update(fs.readFileSync(path.join(engineDir, rel))).digest("hex");
    return `${rel}\0${h}`;
  });
  return crypto.createHash("sha256").update(lines.join("\n")).digest("hex");
}

export function loadRecording(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const norm = (s) => (s ?? "").trim();

/** The engine's recorded Python for `rel` (`<vault>/<path without .md>`), or null when there is none OR the note's Recipe is not the one that was
 *  recorded — a recording of a different Recipe proves nothing about this note. */
export function recordedPythonFor(recording, rel, noteBody) {
  const r = recording?.notes?.[rel];
  if (!r || typeof r.python !== "string") return null;
  if (norm(extractRecipeSection(noteBody)) !== norm(r.recipe)) return null;
  return r.python;
}

/** Why this recording cannot be trusted right now (empty array = it can). `engineDir`: the bundled engine; `vaultsDir`: assets/vaults. */
export function recordingProblems(recording, { engineDir = null, vaultsDir = null } = {}) {
  const problems = [];
  if (engineDir) {
    const now = engineBundleDigest(engineDir);
    if (recording.engine_bundle_digest !== now) {
      problems.push(
        `the recorded engine output is stale: it was recorded against engine bundle ${String(recording.engine_bundle_digest).slice(0, 12)}… but the bundled engine is now ${now.slice(0, 12)}… — ${RERECORD_HINT}`,
      );
    }
  }
  if (vaultsDir) {
    for (const [rel, r] of Object.entries(recording.notes ?? {})) {
      const file = path.join(vaultsDir, `${rel}.md`);
      if (!fs.existsSync(file)) continue;
      if (norm(extractRecipeSection(fs.readFileSync(file, "utf8"))) !== norm(r.recipe)) {
        problems.push(`${rel}: its Recipe changed since the engine output was recorded — ${RERECORD_HINT}`);
      }
    }
  }
  return problems;
}
