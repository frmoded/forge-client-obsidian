// CW-plugin-input-enum-dropdown-ux (drain 2026-07-31-1120).
//
// Enumerable run-inputs. An action note declares which of its inputs
// have a fixed set of valid values, and the run modal renders a
// dropdown instead of a free-text box:
//
//   inputs: [tonic, quality]
//   input_enums:
//     quality: [major, minor, diminished, augmented]
//
// Why a SIDECAR key rather than enriching `inputs` itself
// -------------------------------------------------------
// `inputs` is typed `string[]` in 13 places across 7 files, including
// server.ts and pyodide-host.ts — the wire protocol and the Pyodide
// inventory round-trip. Changing its element type to an object would
// have to survive /connect serialization and the engine's own reading
// of `inputs`, pulling forge into a drain scoped to the plugin, plus a
// migration for every existing note.
//
// The sidecar also models the thing more honestly. An enum is a
// RENDERING affordance, not part of the snippet's calling convention:
// the Recipe still takes a string and the engine still receives a
// string. Encoding it in `inputs` would push a presentation concern
// through the execution path. A note without `input_enums` behaves
// exactly as before.
//
// Not covered here: server-side validation that a submitted value is a
// member. That genuinely does need the value in the calling convention
// — see the drain FEEDBACK.

/** Normalized `input_enums` frontmatter: input name → allowed values. */
export type InputEnums = Record<string, string[]>;

/**
 * Read `input_enums` out of a note's frontmatter, defensively.
 *
 * Frontmatter is cohort-authored and arrives via Obsidian's YAML
 * parse, so every shape below is reachable in the wild and none of
 * them should throw or produce a broken dropdown:
 *
 * - key absent / null                  → `{}`
 * - not an object (string, list)       → `{}`
 * - value not a list                   → that entry dropped
 * - **empty list**                     → dropped, so the input falls
 *   back to a text box rather than rendering a dropdown with nothing
 *   in it, which would be a dead end with no way to enter a value
 * - non-string members (YAML numbers,
 *   booleans)                          → coerced via String()
 * - duplicate members                  → de-duplicated, order kept
 */
export function parseInputEnums(frontmatter: unknown): InputEnums {
  if (!frontmatter || typeof frontmatter !== 'object') return {};
  const raw = (frontmatter as Record<string, unknown>)['input_enums'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const out: InputEnums = {};
  for (const [name, values] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(values)) continue;
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const v of values) {
      if (v === null || v === undefined) continue;
      const s = String(v);
      if (seen.has(s)) continue;
      seen.add(s);
      cleaned.push(s);
    }
    if (cleaned.length === 0) continue;  // dead-end dropdown; use text
    out[name] = cleaned;
  }
  return out;
}

/**
 * Pick the value a dropdown should open on.
 *
 * The cached value wins when it's still a member. When it isn't — the
 * author edited the enum after a cohort last ran the note — fall back
 * to the first option rather than preserving it. A dropdown showing a
 * value it cannot represent would submit something the enum says is
 * invalid, which is the exact failure this feature exists to prevent.
 */
export function initialEnumValue(
  cached: string | undefined,
  allowed: string[],
): string {
  if (cached !== undefined && allowed.includes(cached)) return cached;
  return allowed[0] ?? '';
}
