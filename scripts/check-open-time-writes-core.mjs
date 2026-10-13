// Drain 2026-10-13-2100 §2/§5 — what the plugin would WRITE into a shipped note when it is merely opened, and when Run follows.
//
// It reuses THE PLUGIN'S OWN decision functions — never a second copy of any rule:
//   open:  src/v11-3-backfill-core.ts  `backfillV113Shape`  (the file-open backfill: inserts a stub `# Python`, stamps missing hashes,
//                                                           repairs/voids lineage, seeds source_facet)
//          src/open-seed-core.ts       `planOpenSeed`       (the layout-ready sweep: source_facet + v11.6 parent hashes)
//   run:   src/python-write-back-core.ts `applyPythonWriteBack` (the write that follows a Cmd-P Run / Forge click: `# Python`,
//                                                           python_hash, lineage, english_hash heal)
//
// What this cannot see (it has no engine): whether the engine's transpile of the Recipe equals the shipped `# Python`. The run check
// therefore asks the weaker, still useful question "given the note's OWN Python, would the writer change anything?" — which already
// catches a missing `# Python`, a stale python_hash, wrong lineage, and the empty-SHA english_hash remnant. The suite
// (shipped-note-read-only.test.ts) closes the remaining gap for the notes the gate requires, by running the real engine.
import fs from "node:fs";
import path from "node:path";
import { backfillV113Shape } from "../src/v11-3-backfill-core.ts";
import { planOpenSeed } from "../src/open-seed-core.ts";
import { applyPythonWriteBack } from "../src/python-write-back-core.ts";
import { computeFacetHash, whichLayerIsSource } from "../src/facet-hash-core.ts";
import {
  extractDescription, extractPythonSection, extractRecipeSection, getFrontmatterField, isV2Shape,
  removeFrontmatterField, replacePythonSection, setFrontmatterField,
} from "../src/v2-note-core.ts";

const asString = (b, k) => { const v = getFrontmatterField(b, k); return typeof v === "string" ? v : null; };

const backfillHelpers = {
  extractDescription, extractRecipeSection, extractPythonSection,
  getFrontmatterField: asString,
  setFrontmatterField,
  removeFrontmatterField,
  replacePythonSection,
  computeFacetHash,
};

/** `{ applies, open: string[], run: string[] }` — each entry names one write. `applies` is false for anything the plugin's own
 *  open-time writers skip (not `type: action`, or not V2 shape): such a note is never rewritten by them. */
export async function auditNote(body, { backfill = (b) => backfillV113Shape(b, backfillHelpers) } = {}) {
  if (asString(body, "type") !== "action" || !isV2Shape(body)) return { applies: false, open: [], run: [] };

  const open = [];
  // 1. the file-open backfill (main.ts maybeBackfillV113Shape). `backfill` is injectable ONLY so a test can isolate step 2: today the
  //    backfill's decisions are a superset of the sweep's, so step 2 is otherwise unreachable from the outside.
  const bf = await backfill(body);
  let afterOpen = body;
  if (bf.changed) {
    afterOpen = bf.newBody;
    const a = bf.actions;
    if (a.pythonSection) open.push("inserts a stub # Python");
    if (a.hashes.length) open.push(`stamps ${a.hashes.join(", ")}`);
    if (a.derivedFromFields.length) open.push(`stamps ${a.derivedFromFields.join(", ")}`);
    if (a.canonicalHashRepairs.length) open.push(`repairs ${a.canonicalHashRepairs.join(", ")}`);
    if (a.derivedFromParentSeeded.length) open.push(`seeds ${a.derivedFromParentSeeded.join(", ")}`);
    if (a.canonicalFacetSeeded) open.push(`seeds source_facet: ${a.canonicalFacetSeeded}`);
    if (a.stubSyncRepairs.length) open.push("re-seeds source_facet (stub-sync repair)");
    if (a.stubReplacedClaims.length) open.push(`voids ${a.stubReplacedClaims.join(", ")}`);
    if (open.length === 0) open.push("rewrites the body");
  }
  // 2. the layout-ready sweep reads the POST-backfill body (main.ts awaits the backfill first)
  const seed = await planOpenSeed(afterOpen, { ...backfillHelpers, getFrontmatterField: getFrontmatterField });
  if (seed.write) {
    if (seed.setSourceFacet !== null) open.push(`sets source_facet: ${seed.setSourceFacet}`);
    if (seed.seedRecipeParent !== null) open.push("seeds recipe_derived_from_description_hash");
    if (seed.seedPythonParent !== null) open.push("seeds python_derived_from_recipe_hash");
    if (seed.setSourceFacet === null && seed.seedRecipeParent === null && seed.seedPythonParent === null) {
      open.push("drops the legacy canonical_facet name");
    }
  }

  // 3. the write that follows Run (writeSourcePythonBack), given the note's own Python
  const run = [];
  const python = extractPythonSection(afterOpen);
  if (extractPythonSection(body) === null) {
    // the open backfill puts a stub there first; Run then replaces the stub with the engine's transpile
    run.push("adds a # Python section (none shipped)");
  } else if (python !== null) {
    const written = applyPythonWriteBack(afterOpen, {
      python,
      pythonHash: await computeFacetHash(python),
      englishHash: null, // V2 notes carry no `# English` facet, so englishHashForStamp(…) is null: the writer writes none (and heals the remnant)
      sourceLayer: await whichLayerIsSource(afterOpen, {
        extractDescription, extractRecipeSection, extractPythonSection, getFrontmatterField: asString,
      }),
      resolvedSlots: null,
    });
    if (written !== afterOpen) run.push("rewrites # Python / python_hash / lineage / english_hash");
  }
  return { applies: true, open, run };
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && e.name.endsWith(".md")) yield p;
  }
}

/** Every `.md` under `dir` that would be written on open or Run: `[{ path (relative, posix), open, run }]`, sorted. */
export async function auditVault(dir) {
  const out = [];
  let applicable = 0;
  for (const abs of walk(dir)) {
    const rel = path.relative(dir, abs).split(path.sep).join("/");
    const r = await auditNote(fs.readFileSync(abs, "utf8"));
    if (!r.applies) continue;
    applicable++;
    if (r.open.length || r.run.length) out.push({ path: rel, open: r.open, run: r.run });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return { applicable, writing: out };
}

/** Parse `scripts/open-time-readonly.txt`: one `<vault>/<path>.md` per line, `#` comments and blanks ignored. */
export function parseRequiredList(text) {
  return text.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean);
}
