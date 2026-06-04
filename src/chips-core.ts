// Pure, obsidian-free chip helpers. Imported directly by
// chips.test.ts under `node --test`; the obsidian-coupled reader +
// view re-export from here for runtime use.

export interface Chip {
  label: string;
  insertion: string;
  // Optional secondary grouping within a source vault. The view
  // renders one sub-header per distinct `group` value, in
  // first-appearance order. Chips with no `group` field cluster
  // under an unlabeled sub-section. v2 forge-moda uses this to
  // partition the 16-chip palette into Setup / Click / Go /
  // Particle actions / Temperature.
  group?: string;
  // Optional list of snippet IDs the chip references. Tolerated by
  // the parser, preserved on the Chip object, but unused by the
  // view in v2 — reserved for future graph-view linking. Other
  // unknown fields are tolerated and stripped.
  refs?: string[];
}

export interface ChipsParseError {
  error: string;
}

export interface ChipPaletteGroup {
  sourceName: string;
  chips: Chip[];
}

// v3+ convention: chip data lives at `_meta/_chips.md` (alongside
// README and other infrastructure files). v2 shipped at the bare
// `_chips.md`. We probe both, preferring the new path.
export const CHIPS_RELATIVE_PATHS = ['_meta/_chips.md', '_chips.md'];

export interface ChipSource {
  paths: string[];
  sourceName: string;
}

/** Snapshot of vault state the chip loader needs to compute which
 *  chip-source files to read.
 *
 *  v0.2.47 — the previous field `domains: string[] | null` (active
 *  declared domains from forge.toml) was the wrong driver. forge-moda
 *  is unconditionally extracted into the vault regardless of declared
 *  domains, so users with `domains = ["music"]` had moda content on
 *  disk but moda chips invisible. The right driver is the on-disk
 *  set of installed library subdirs (via main.ts:libraryDirNames),
 *  which gives a true picture of what content is available to
 *  compose with.
 *
 *  `libraryDirNames` entries are the full subdir names with their
 *  `forge-` prefix (e.g. `['forge-moda', 'forge-music']`) — they're
 *  the literal directory names, not stripped domain ids. */
export interface ChipsManifest {
  vaultName: string;
  libraryDirNames: string[];
}

/** Produce the list of chip-source files to probe for the given
 *  vault state. Always includes the vault-root paths first (so a
 *  user-authored vault-root `_chips.md` takes precedence over
 *  library chips with the same group/label per `mergeChipSources`'s
 *  declaration-order rule). Then one entry per installed library
 *  subdir.
 *
 *  v0.2.47 — signature changed from `(vaultName, domains: string[] |
 *  null)` to `(vaultName, libraryDirNames: string[])`. See
 *  ChipsManifest docstring for rationale. */
export function chipSourcesFor(
  vaultName: string,
  libraryDirNames: string[],
): ChipSource[] {
  const out: ChipSource[] = [
    { paths: CHIPS_RELATIVE_PATHS.slice(), sourceName: vaultName },
  ];
  for (const libDir of libraryDirNames) {
    out.push({
      paths: CHIPS_RELATIVE_PATHS.map(p => `${libDir}/${p}`),
      sourceName: libDir,
    });
  }
  return out;
}

/** Validate an already-decoded chips list and return the typed
 *  `Chip[]`. Accepts either a bare array (`[{label, insertion, ...},
 *  ...]`) or an object with a `chips:` key wrapping the array (the
 *  shape forge-moda's `_chips.md` uses in YAML). Per-entry: `label`
 *  and `insertion` are required strings; `group` and `refs` are
 *  preserved when present and well-typed; everything else is
 *  tolerated and stripped (forward-compat). Malformed entries are
 *  dropped silently with a console warning — one bad row doesn't
 *  break the whole palette.
 *
 *  Pure (no obsidian / no I/O), so the chips test suite exercises
 *  it directly. The Obsidian-coupled reader in chips.ts decodes the
 *  format (JSON or YAML) and hands the result here. */
export function validateChipsList(
  decoded: unknown,
): { chips: Chip[] } | ChipsParseError {
  // Unwrap the `{chips: [...]}` wrapper if present. This is the
  // shape the v2 spec uses for YAML readability; a bare array is
  // also accepted (back-compat with the v1 single-chip JSON shape).
  let list: unknown = decoded;
  if (
    list !== null && typeof list === 'object' && !Array.isArray(list) &&
    Array.isArray((list as Record<string, unknown>).chips)
  ) {
    list = (list as Record<string, unknown>).chips;
  }
  if (!Array.isArray(list)) {
    return {
      error:
        `chips body must be a list or { chips: [...] }, got ${typeof decoded}`,
    };
  }

  const chips: Chip[] = [];
  for (let i = 0; i < list.length; i++) {
    const raw = list[i];
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
    const chip: Chip = { label: r.label, insertion: r.insertion };
    if (typeof r.group === 'string' && r.group.length > 0) {
      chip.group = r.group;
    }
    if (Array.isArray(r.refs)) {
      const refs = r.refs.filter((x): x is string => typeof x === 'string');
      if (refs.length > 0) chip.refs = refs;
    }
    chips.push(chip);
  }
  return { chips };
}

/** Convenience: parse a JSON-string body into a chip list. Same
 *  validation as validateChipsList; just runs JSON.parse first.
 *  Used by the test suite + by chips.ts when a `_chips.md` declares
 *  `content_type: json`. */
export function parseChipsBody(
  body: string,
): { chips: Chip[] } | ChipsParseError {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch (e) {
    return { error: `chips JSON parse failed: ${(e as Error).message}` };
  }
  return validateChipsList(json);
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
