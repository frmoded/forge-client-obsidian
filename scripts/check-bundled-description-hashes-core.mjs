// Drain 2026-10-12-1700 §2 — pure(ish) core of the shipped-description-hash gate. See check-bundled-description-hashes.test.mjs for the
// whole story. It reuses THE PLUGIN'S OWN functions (src/description-hash-core.ts via src/facet-hash-core.ts, and src/v2-note-core.ts) —
// never a second implementation of the algorithm, which is how "stamped by one thing, checked by another" disagreements start.
import fs from "node:fs";
import path from "node:path";
import { computeFacetHash } from "../src/facet-hash-core.ts";
import { extractDescription, getFrontmatterField } from "../src/v2-note-core.ts";

const HAS_DESCRIPTION_RE = /^# Description\s*$/m;
const FRONTMATTER_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---)/;

/** The hash the plugin computes for this note's Description. */
export async function descriptionHashOf(body) {
  return computeFacetHash(extractDescription(body));
}

/** `{ ok, stored, actual }`, or `{ skipped: true }` when the invariant does not apply (no stored hash, or no `# Description` facet). */
export async function checkNote(body) {
  const stored = getFrontmatterField(body, "description_hash");
  if (typeof stored !== "string" || stored === "" || !HAS_DESCRIPTION_RE.test(body)) return { skipped: true, ok: true };
  const actual = await descriptionHashOf(body);
  return { ok: stored === actual, stored, actual };
}

/** The note with `description_hash` — and every lineage field in the frontmatter that carried the OLD description hash — set to the
 *  hash of the Description as it is now. Everything else is byte-for-byte unchanged (the body is not even read through a parser). */
export async function restampNote(body) {
  const r = await checkNote(body);
  if (r.skipped || r.ok) return body;
  const m = FRONTMATTER_RE.exec(body);
  if (!m) return body;
  const fm = m[2].split("\n").map((line) => {
    const cr = line.endsWith("\r") ? "\r" : "";
    const bare = cr ? line.slice(0, -1) : line;
    const kv = /^([A-Za-z0-9_]+):[ \t]*(\S+)[ \t]*$/.exec(bare);
    if (!kv) return line;
    const [, key, value] = kv;
    const isHashKey = key === "description_hash" || /_derived_from_(description|source)_hash$/.test(key);
    return isHashKey && value === r.stored ? `${key}: ${r.actual}${cr}` : line;
  }).join("\n");
  return body.slice(0, m.index) + m[1] + fm + m[3] + body.slice(m.index + m[0].length);
}

function* walkMarkdown(dir, base = "") {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || /\.bak\./.test(e.name)) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkMarkdown(abs, rel);
    else if (e.isFile() && e.name.endsWith(".md")) yield { rel, abs };
  }
}

/** Check every note under `dir`. `{ checked, stale: [{ path, stored, actual }] }`. */
export async function checkVault(dir) {
  let checked = 0;
  const stale = [];
  for (const { rel, abs } of walkMarkdown(dir)) {
    const r = await checkNote(fs.readFileSync(abs, "utf8"));
    if (r.skipped) continue;
    checked++;
    if (!r.ok) stale.push({ path: rel, stored: r.stored, actual: r.actual });
  }
  return { checked, stale };
}
