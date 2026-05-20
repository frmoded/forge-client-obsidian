// Pure, obsidian-free chip helpers. Imported directly by
// chips.test.ts under `node --test`; the obsidian-coupled reader +
// view re-export from here for runtime use.

export interface Chip {
  label: string;
  insertion: string;
}

export interface ChipsParseError {
  error: string;
}

export interface ChipPaletteGroup {
  sourceName: string;
  chips: Chip[];
}

/** Parse a `_chips.md` JSON body. The body is expected to be a JSON
 *  array of objects with at least `label` and `insertion` (strings).
 *  Unknown fields are tolerated and stripped; malformed entries are
 *  dropped silently with a console warning (don't break a whole
 *  palette for one bad row). Returns either the chip list or a typed
 *  error if the body itself is not parseable / not an array. */
export function parseChipsBody(
  body: string,
): { chips: Chip[] } | ChipsParseError {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch (e) {
    return { error: `chips JSON parse failed: ${(e as Error).message}` };
  }
  if (!Array.isArray(json)) {
    return { error: `chips body must be a JSON array, got ${typeof json}` };
  }
  const chips: Chip[] = [];
  for (let i = 0; i < json.length; i++) {
    const raw = json[i];
    if (raw === null || typeof raw !== 'object') {
      console.warn(`Forge chips: entry [${i}] is not an object; dropping`);
      continue;
    }
    const r = raw as Record<string, unknown>;
    if (typeof r.label !== 'string' || r.label.length === 0) {
      console.warn(`Forge chips: entry [${i}] missing string label; dropping`);
      continue;
    }
    if (typeof r.insertion !== 'string' || r.insertion.length === 0) {
      console.warn(
        `Forge chips: entry [${i}] (${r.label}) missing string insertion; dropping`);
      continue;
    }
    chips.push({ label: r.label, insertion: r.insertion });
  }
  return { chips };
}

/** Merge per-source chip lists into the palette's display shape.
 *  Preserves source grouping AND order; does NOT dedupe across
 *  sources (two vaults declaring "set ink mass" each appear as their
 *  own row — the user picks). Empty-chip sources are dropped from
 *  the result so the UI doesn't render empty group headers. */
export function mergeChipSources(
  sources: Array<{ sourceName: string; chips: Chip[] }>,
): ChipPaletteGroup[] {
  return sources
    .filter(s => s.chips.length > 0)
    .map(s => ({ sourceName: s.sourceName, chips: s.chips.slice() }));
}

/** Sentinel for "no `# English` section to insert into" — the caller
 *  surfaces this as a user-visible notice rather than silently
 *  modifying the file. */
export const CHIPS_NO_ENGLISH_SECTION = Symbol('CHIPS_NO_ENGLISH_SECTION');

export type InsertResult =
  | { ok: true; body: string }
  | { ok: false; reason: typeof CHIPS_NO_ENGLISH_SECTION };

/** Append `\n<insertion>` to the END of the `# English` section in a
 *  markdown note body. Finds the last non-blank line inside the
 *  section (fallback: the heading itself if the section is empty),
 *  inserts a new line immediately after it. Section boundary is the
 *  next `#` heading (any level) or `---` separator, else EOF.
 *
 *  Notably: insertion stays INSIDE `# English` even when later
 *  sections (`# Python`, `# Dependencies`) exist — verified by
 *  test. */
export function insertChipText(
  noteBody: string,
  chipInsertion: string,
): InsertResult {
  const lines = noteBody.split('\n');
  const englishStart = lines.findIndex(
    l => /^#{1,6}\s+english\s*$/i.test(l.trim()));
  if (englishStart === -1) {
    return { ok: false, reason: CHIPS_NO_ENGLISH_SECTION };
  }

  let endIdx = lines.length;
  for (let i = englishStart + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('#') || t === '---') { endIdx = i; break; }
  }

  let lastContent = englishStart;
  for (let i = endIdx - 1; i > englishStart; i--) {
    if (lines[i].trim() !== '') { lastContent = i; break; }
  }

  const before = lines.slice(0, lastContent + 1);
  const after = lines.slice(lastContent + 1);
  return { ok: true, body: [...before, chipInsertion, ...after].join('\n') };
}
