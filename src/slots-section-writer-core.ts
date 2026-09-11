// Drain 2026-08-24-2350 — the plugin-side slot-cache write path.
// Drain 2026-09-11-1200 (CW 1200) — moved from a body `# Slots`
// heading to a `slots_cache` FRONTMATTER field. Driver, on seeing the
// heading render at the bottom of octopus_fact.md after forging:
// "Why are we seeing the Slots section... write in frontmatter."
// Confirmed movable with no pushback: the section already sat outside
// every facet's hash-relevant text (each extractor stops at the next
// top-level heading), so this move touches no `*_hash` computation.
//
// WHY THIS EXISTS. `forge/core/slot_cache.py` has carried
// `parse_slots_section` / `serialize_slots_section` since v0.2.70 under
// a docstring reading "NOT YET WIRED. Phase 2 will call
// parse_slots_section from the canonical compile path … and
// serialize_slots_section from the plugin-side cache write path."
// Phase 2 never landed. FEEDBACK 2330 found both helpers referenced by
// nothing but their own tests, and this plugin STRIPPING the heading
// (`stripStaleSlots: true`) rather than writing it — so every ▶ of a
// slot-bearing note re-hit the LLM. Drain 2350 was that missing write
// path (body-based); this drain relocates it to frontmatter.
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
// Python's `serialize_slots_section` byte for byte — same per-entry
// line shape (`  "<key>": "<value>"`), same sorted-by-key ordering,
// same backslash/quote escaping, just nested under a `slots_cache:`
// frontmatter key instead of inside a body `# Slots` heading's fenced
// YAML block. A live-extract mirror is not possible (that parser is
// Python, this runs in node), so parity is held by hardcoded
// expectations pinned on both sides — the same discipline `english_hash`
// uses. The engine's parser is the tolerant one: malformed input reads
// as an empty cache, which costs a re-resolve rather than a failed run.
//
// READ-COMPAT, NOT A HARD CUTOVER. At least one note on disk
// (forge-tutorial/09-slots/octopus_fact.md) already has a real body
// `# Slots` section from before this drain. This file's own
// `parseSlotsCache`/`writeSlotsSection` intentionally do NOT read or
// touch that old body section at all — they only read/write
// frontmatter. That is safe, not a gap: the ENGINE's own
// `parse_slots_section` (forge/core/slot_cache.py) merges BOTH sources
// on every read (frontmatter wins on key collision), so an old body
// section keeps serving cache hits for its own keys even while this
// writer only ever adds to frontmatter going forward. The old body
// section is inert legacy content until a future migration sweep
// removes it — dropping a live entry by touching it here would be
// worse than leaving it alone (same reasoning this file's own
// no-pruning note already applies to individual stale keys).

import { findFrontmatterBounds } from './python-cache-writer-core.ts';

const SLOTS_CACHE_KEY_RE = /^slots_cache\s*:\s*$/;
const SLOTS_CACHE_ENTRY_RE = /^\s{2}"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*$/;

function escapeYaml(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function unescapeYaml(s: string): string {
  return s.replace(/\\(["\\])/g, '$1');
}

/** Read the `slots_cache` map out of a note's frontmatter.
 *
 *  Mirrors the engine's `parse_slots_section`'s tolerance: a missing
 *  frontmatter block, a missing `slots_cache` key, or a malformed
 *  nested line all read as `{}` (or skip just that line) rather than
 *  throwing — a hand-mangled cache costs a re-resolve, not a crash.
 *  Exists so the writer can MERGE with what is already there, and so
 *  the tests can assert on meaning rather than on formatting.
 *
 *  Deliberately does NOT fall back to reading an old body `# Slots`
 *  section — see the file header's "READ-COMPAT" note for why that's
 *  the engine's job, not this writer's. */
export function parseSlotsCache(body: string): Record<string, string> {
  const bounds = findFrontmatterBounds(body);
  if (bounds === null) return {};
  const lines = body.split('\n');
  const fmLines = lines.slice(bounds.start + 1, bounds.end);
  const out: Record<string, string> = {};
  let inBlock = false;
  for (const line of fmLines) {
    if (!inBlock) {
      if (SLOTS_CACHE_KEY_RE.test(line)) inBlock = true;
      continue;
    }
    if (!/^\s/.test(line)) {
      // A line with no leading whitespace ends the nested block —
      // either the next top-level frontmatter key or EOF-of-block.
      inBlock = false;
      continue;
    }
    const m = line.match(SLOTS_CACHE_ENTRY_RE);
    if (m) out[unescapeYaml(m[1])] = unescapeYaml(m[2]);
    // Non-matching indented lines (malformed entries) are skipped,
    // not fatal — tolerant per the file-header contract.
  }
  return out;
}

/** Render a slots dict as the LINES of a `slots_cache:` frontmatter
 *  block (the key line plus its nested entries), or `[]` for an empty
 *  dict — callers omit the field entirely rather than write an empty
 *  `slots_cache: {}` on every note that has no cached slots. */
function serializeSlotsCacheLines(slots: Record<string, string>): string[] {
  const keys = Object.keys(slots).sort();
  if (keys.length === 0) return [];
  const lines = ['slots_cache:'];
  for (const key of keys) {
    lines.push(`  "${escapeYaml(key)}": "${escapeYaml(slots[key])}"`);
  }
  return lines;
}

/**
 * Merge `resolutions` into the note's `slots_cache` frontmatter field.
 *
 * MERGE, not replace, and that is load-bearing: `/resolve-slot`
 * returns only the slots that MISSED this round. Entries the engine
 * served from the existing cache are absent from that response, so
 * replacing would delete a live entry every time a multi-slot note
 * resolved a subset. The note would still run — it would just re-hit
 * the LLM forever, which is the exact defect drain 2350 removed and
 * this drain must not reintroduce.
 *
 * A re-resolved key overwrites its old expression, so a cached
 * expression that has gone bad can be repaired by re-resolving. That
 * mirrors the engine's inline-wins-over-persisted rule.
 *
 * No-op (returns `body` unchanged) when there's no frontmatter block
 * at all — same defensive precedent as `replaceOrInsertEnglishHash`:
 * production snippets always have frontmatter, so this only guards
 * against a malformed/empty file, not a real vault note.
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
  const bounds = findFrontmatterBounds(body);
  if (bounds === null) return body;

  const merged = { ...parseSlotsCache(body), ...resolutions };
  const rendered = serializeSlotsCacheLines(merged);

  const lines = body.split('\n');
  const fmLines = lines.slice(bounds.start + 1, bounds.end);

  // Remove any existing slots_cache: block (key line + its nested
  // entries) so a re-write replaces rather than duplicates it.
  const newFmLines: string[] = [];
  let skipping = false;
  for (const line of fmLines) {
    if (!skipping) {
      if (SLOTS_CACHE_KEY_RE.test(line)) {
        skipping = true;
        continue;
      }
      newFmLines.push(line);
      continue;
    }
    if (!/^\s/.test(line)) {
      skipping = false;
      newFmLines.push(line);
    }
    // else: still inside the block being removed — drop the line.
  }
  if (rendered.length > 0) newFmLines.push(...rendered);

  const out = [
    ...lines.slice(0, bounds.start + 1),
    ...newFmLines,
    ...lines.slice(bounds.end),
  ];
  return out.join('\n');
}
