// Drain 2026-10-20-1100 §2 — re-derive a shipped library note from the REAL engine, then stamp it the way the plugin would.
//
// "Re-derive" = replace the note's stored `# Python` with what the engine transpiles from its Recipe (the Python a hammer click / Run write-back
// receives, recorded by scripts/record-engine-transpile.py), then run the restamp tool's fixed point so every hash and lineage line is exactly what the
// plugin would stamp. The result is a note the open-time-writes gate calls read-only: opening it and pressing Run write nothing.
//
// The standing rule is the point of this file: NEVER stamp lineage over a stub or hand-written Python. So it takes the Python ONLY from a recording of the
// engine for THIS Recipe (never from the note's own Python, which is what the restamp tool uses and why it must not be pointed at these notes), refuses
// an engine "transpile" that is the stub, and refuses a note whose source is its Python (source_facet: python — a hand edit that is the point of it).
import { recordedPythonFor, RERECORD_HINT } from "./engine-recording.mjs";
import { restampNote } from "./restamp-library-notes-core.mjs";
import { applyPythonWriteBack } from "../src/python-write-back-core.ts";
import { computeFacetHash, whichLayerIsSource } from "../src/facet-hash-core.ts";
import { DEFAULT_PYTHON_STUB } from "../src/v11-3-backfill-core.ts";
import { extractDescription, extractPythonSection, extractRecipeSection, getFrontmatterField, isV2Shape } from "../src/v2-note-core.ts";

const asString = (b, k) => { const v = getFrontmatterField(b, k); return typeof v === "string" ? v : null; };
const norm = (s) => (s ?? "").trim();

/** `{ ok: true, changed, next }` or `{ ok: false, reason }`. `rel` = `<vault name>/<path inside the vault without .md>`, the key the recording uses. */
export async function rederiveNote(body, { rel, recording }) {
  if (asString(body, "type") !== "action" || !isV2Shape(body)) {
    return { ok: false, reason: "not a V2 `type: action` note — the plugin's writers skip it, so there is nothing to derive" };
  }
  if (asString(body, "source_facet") === "python") {
    return { ok: false, reason: "its source_facet is python: the Python is the source, and re-deriving it from the Recipe would destroy the hand edit that is the point of the note" };
  }
  const entry = recording?.notes?.[rel];
  if (!entry || typeof entry.python !== "string") {
    return { ok: false, reason: `no recorded engine Python for ${rel} — ${RERECORD_HINT}` };
  }
  const python = recordedPythonFor(recording, rel, body);
  if (python === null) {
    return { ok: false, reason: `the recorded engine Python for ${rel} is for a different Recipe than this note has — Python is a function of the Recipe; ${RERECORD_HINT}` };
  }
  if (norm(python) === norm(DEFAULT_PYTHON_STUB)) {
    return { ok: false, reason: "the engine's transpile of this Recipe is the stub (`return None`) — a stub is never the source of a lineage claim" };
  }
  const written = applyPythonWriteBack(body, {
    python,
    pythonHash: await computeFacetHash(python),
    englishHash: null, // V2 notes carry no `# English` facet: the writer writes none (and heals an empty-SHA remnant)
    sourceLayer: await whichLayerIsSource(body, {
      extractDescription, extractRecipeSection, extractPythonSection, getFrontmatterField: asString,
    }),
    resolvedSlots: null,
  });
  const settled = await restampNote(written);
  return { ok: true, changed: settled.next !== body, next: settled.next };
}
