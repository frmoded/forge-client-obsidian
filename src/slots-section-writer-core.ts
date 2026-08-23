// Drain 2026-08-24-2350 — the plugin-side slot-cache write path.
//
// WHY THIS EXISTS. `forge/core/slot_cache.py` has carried
// `parse_slots_section` / `serialize_slots_section` since v0.2.70 under
// a docstring reading "NOT YET WIRED. Phase 2 will call
// parse_slots_section from the canonical compile path … and
// serialize_slots_section from the plugin-side cache write path."
// Phase 2 never landed. FEEDBACK 2330 found both helpers referenced by
// nothing but their own tests, and this plugin STRIPPING the heading
// (`stripStaleSlots: true`) rather than writing it — so every ▶ of a
// slot-bearing note re-hit the LLM. This is that missing write path.
//
// WHAT IS STORED IS AN EXPRESSION, NEVER A VALUE. The cached string is
// `__import__('random').random()`, which the transpiler splices into
// the generated Python and which re-executes on every run. Two runs of
// one entry differ, and must. That is what makes this cache compatible
// with the driver's standing rule — cache translations, never
// execution results.
//
// FORMAT PARITY. The engine's `parse_slots_section` reads what this
// writes, across a language boundary, so the shape here mirrors
// Python's `serialize_slots_section` byte for byte. A live-extract
// mirror is not possible (that parser is Python, this runs in node), so
// parity is held by hardcoded expectations pinned on both sides — the
// same discipline `english_hash` uses. The engine's parser is the
// tolerant one: malformed input reads as an empty cache, which costs a
// re-resolve rather than a failed run.

/** Where the heading goes: appended at the end of the body.
 *
 *  Deliberate. `# Slots` is machine-written derived content, and the
 *  facet extractors each stop at the next top-level heading — so a
 *  section that sits after all of them cannot shift any facet's text,
 *  and therefore cannot make a synced note read as hand-edited on its
 *  next lineage check. `slots-section-writer-core.test.ts` pins that
 *  as a hash comparison, not just a string one. */
const SLOTS_HEADING = /^#\s+slots\s*$/i;
const NEXT_HEADING = /^#\s+\S/;
const YAML_FENCE_OPEN = /^\s*```ya?ml\s*$/i;
const YAML_FENCE_CLOSE = /^\s*```\s*$/;

/** Read the `# Slots` map out of a note body.
 *
 *  Mirrors the engine's `parse_slots_section`, including its
 *  tolerance: a missing, empty, or malformed heading returns `{}`.
 *  Exists so the writer can MERGE with what is already there, and so
 *  the tests can assert on meaning rather than on formatting. */
export function parseSlotsSection(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  let state: 'scanning' | 'section' | 'fence' = 'scanning';
  for (const line of body.split('\n')) {
    if (state === 'scanning') {
      if (SLOTS_HEADING.test(line.trim())) state = 'section';
      continue;
    }
    if (NEXT_HEADING.test(line)) break;
    if (state === 'section' && YAML_FENCE_OPEN.test(line)) {
      state = 'fence';
      continue;
    }
    if (state === 'fence' && YAML_FENCE_CLOSE.test(line)) break;
    // Only the one shape this writer emits is read back:
    //   `  "<key>": "<value>"`
    // Anything else is ignored rather than guessed at — a partial read
    // of a hand-mangled cache is worse than a cold one, because it
    // would silently drop half the entries on the next merge.
    const m = line.match(/^\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*$/);
    if (m) out[unescapeYaml(m[1])] = unescapeYaml(m[2]);
  }
  return out;
}

function escapeYaml(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function unescapeYaml(s: string): string {
  return s.replace(/\\(["\\])/g, '$1');
}

/** Render the heading exactly as Python's `serialize_slots_section`
 *  does. Empty map renders as the empty string — callers omit the
 *  heading entirely rather than leave an empty one on every note that
 *  has no slots. */
function serializeSlotsSection(slots: Record<string, string>): string {
  const keys = Object.keys(slots).sort();
  if (keys.length === 0) return '';
  const lines = ['# Slots', '', '```yaml', 'slots:'];
  for (const key of keys) {
    lines.push(`  "${escapeYaml(key)}": "${escapeYaml(slots[key])}"`);
  }
  lines.push('```');
  return lines.join('\n') + '\n';
}

/** Remove an existing `# Slots` heading and its block. */
function removeSlotsSection(body: string): string {
  const out: string[] = [];
  let state: 'scanning' | 'section' = 'scanning';
  for (const line of body.split('\n')) {
    if (state === 'scanning') {
      if (SLOTS_HEADING.test(line.trim())) {
        state = 'section';
        while (out.length > 0 && out[out.length - 1].trim() === '') out.pop();
        continue;
      }
      out.push(line);
      continue;
    }
    if (NEXT_HEADING.test(line)) {
      state = 'scanning';
      out.push(line);
    }
  }
  return out.join('\n');
}

/**
 * Merge `resolutions` into the note's `# Slots` cache.
 *
 * MERGE, not replace, and that is load-bearing: `/resolve-slot`
 * returns only the slots that MISSED this round. Entries the engine
 * served from the existing cache are absent from that response, so
 * replacing would delete a live entry every time a multi-slot note
 * resolved a subset. The note would still run — it would just re-hit
 * the LLM forever, which is the exact defect this drain removes.
 *
 * A re-resolved key overwrites its old expression, so a cached
 * expression that has gone bad can be repaired by re-resolving. That
 * mirrors the engine's inline-wins-over-persisted rule.
 *
 * KNOWN LIMIT — no pruning. When slot prose is edited, its old key
 * becomes unreachable and stays in the file. It is inert (a key that
 * matches nothing is never read) and slot prose changes rarely, so the
 * growth is bounded in practice. Pruning would require knowing which
 * keys the transpile actually consumed, which the engine does not
 * report today; adding that is a bigger change than this drain, and
 * dropping a live entry is worse than keeping a dead one.
 */
export function writeSlotsSection(
  body: string,
  resolutions: Record<string, string>,
): string {
  const merged = { ...parseSlotsSection(body), ...resolutions };
  const rendered = serializeSlotsSection(merged);
  if (rendered === '') return body;

  const stripped = removeSlotsSection(body);
  const trimmed = stripped.replace(/\n+$/, '');
  return `${trimmed}\n\n${rendered}`;
}
