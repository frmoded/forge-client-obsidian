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

// ===========================================================================
// Schema v2 — auto-discovery + signature-sourcing + `_chips.md` overrides
// ===========================================================================
// See ~/projects/forge/docs/specs/chips-schema.md for the canonical spec.
// This block is the pure-core implementation; chips.ts wires it to the
// vault adapter for production use.

/** Minimal snippet metadata the v2 chip derivation reads. The full
 *  registry entry has more fields; this is the subset chips-core
 *  needs (per-spec rules: type, basename, frontmatter `chip` flag,
 *  frontmatter `inputs` list for action snippets, snippet id for
 *  label + insertion). */
export interface SnippetMetaForChips {
  id: string;                                  // qualified snippet_id (e.g. "blues/song")
  basename: string;                            // file basename without `.md` (e.g. "song")
  type?: 'action' | 'data' | 'snapshot' | string;
  inputs?: string[];                           // action snippet's declared inputs
  chip?: boolean;                              // per-snippet opt-out (false = exclude)
  parentDir?: string;                          // parent subdir relative to library root (e.g. "blues")
}

/** Schema v2 override entry — replaces specified fields on an
 *  auto-derived chip, preserving unspecified fields. */
export interface ChipOverride {
  target: string;
  label?: string;
  group?: string;
  insertion?: string;
  order?: number;
  hide?: boolean;
}

/** Schema v2 group declaration — controls group order + display label. */
export interface ChipGroup {
  id: string;
  order?: number;
  label?: string;
}

/** Parsed shape of a v2 `_chips.md` body. */
export interface ChipsV2Config {
  schema_version: 2;
  overrides?: ChipOverride[];
  groups?: ChipGroup[];
  hide?: string[];
}

/** Humanize a snippet id for the chip palette's `label` field.
 *  Takes the LAST path segment, replaces `_` with ` `, capitalizes
 *  the first letter. Examples:
 *    - `create_water_particles`      → `Create water particles`
 *    - `forge-music/blues/song`      → `Song`
 *    - `setup`                       → `Setup`
 *  Empty input → empty string (defensive; caller should filter). */
export function humanizeSnippetId(id: string): string {
  const basename = id.split('/').pop() ?? id;
  if (basename === '') return '';
  const words = basename.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Derive the auto-chip for one snippet per the v2 spec rules.
 *  Returns null when the snippet is excluded (S7 underscore prefix,
 *  `chip: false`, snapshot type, or unknown type).
 *
 *  For action snippets: insertion is B7.1-canonical signature-sourced
 *  (`Do [[id]](<a>, <b>).` for inputs `[a, b]`; `Do [[id]]().` for no
 *  inputs).
 *
 *  For data snippets: insertion is `Set <name> to [[id]]().` — the
 *  user replaces `<name>` with a binding name.
 *
 *  Snapshots are always excluded (per S6 they're system-managed). */
export function deriveChip(snippet: SnippetMetaForChips): Chip | null {
  // S7: skip _*.md basenames.
  if (snippet.basename.startsWith('_')) return null;
  // Per-snippet opt-out.
  if (snippet.chip === false) return null;
  // Snapshots never become chips (S6).
  if (snippet.type === 'snapshot') return null;

  const label = humanizeSnippetId(snippet.id);
  const group = snippet.parentDir && snippet.parentDir !== ''
    ? snippet.parentDir
    : '(library)';

  if (snippet.type === 'action') {
    const inputs = snippet.inputs ?? [];
    const argList = inputs.map(n => `<${n}>`).join(', ');
    const insertion = `Do [[${snippet.id}]](${argList}).`;
    return { label, insertion, group };
  }

  if (snippet.type === 'data') {
    const insertion = `Set <name> to [[${snippet.id}]]().`;
    return { label, insertion, group };
  }

  return null;
}

/** Parse the v2 `_chips.md` YAML body into a ChipsV2Config. The body
 *  is already YAML-decoded (caller does the YAML parse via
 *  `parseYaml` from obsidian); this helper just validates shape +
 *  the schema_version check.
 *
 *  Returns ChipsParseError when:
 *    - `schema_version` is missing or != 2 (forward-compat hook;
 *      future v3 will land its own loader).
 *    - The top-level shape isn't an object.
 *
 *  Tolerates missing `overrides` / `groups` / `hide` (each defaults
 *  to []). Drops malformed entries with a console warning (one bad
 *  row doesn't break the whole config). */
export function parseChipsV2Config(
  decoded: unknown,
): ChipsV2Config | ChipsParseError {
  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
    return { error: `chips v2 body must be a YAML object, got ${typeof decoded}` };
  }
  const r = decoded as Record<string, unknown>;
  if (r.schema_version !== 2) {
    return {
      error:
        `chips _chips.md schema_version must be 2, got ${JSON.stringify(r.schema_version)}`,
    };
  }
  const cfg: ChipsV2Config = { schema_version: 2 };
  if (Array.isArray(r.overrides)) {
    const overrides: ChipOverride[] = [];
    for (let i = 0; i < r.overrides.length; i++) {
      const raw = r.overrides[i];
      if (raw === null || typeof raw !== 'object') {
        console.warn(`Forge chips v2: overrides[${i}] is not an object; dropping`);
        continue;
      }
      const o = raw as Record<string, unknown>;
      if (typeof o.target !== 'string' || o.target.length === 0) {
        console.warn(`Forge chips v2: overrides[${i}] missing string target; dropping`);
        continue;
      }
      const ov: ChipOverride = { target: o.target };
      if (typeof o.label === 'string') ov.label = o.label;
      if (typeof o.group === 'string') ov.group = o.group;
      if (typeof o.insertion === 'string') ov.insertion = o.insertion;
      if (typeof o.order === 'number') ov.order = o.order;
      if (typeof o.hide === 'boolean') ov.hide = o.hide;
      overrides.push(ov);
    }
    cfg.overrides = overrides;
  }
  if (Array.isArray(r.groups)) {
    const groups: ChipGroup[] = [];
    for (let i = 0; i < r.groups.length; i++) {
      const raw = r.groups[i];
      if (raw === null || typeof raw !== 'object') {
        console.warn(`Forge chips v2: groups[${i}] is not an object; dropping`);
        continue;
      }
      const g = raw as Record<string, unknown>;
      if (typeof g.id !== 'string' || g.id.length === 0) {
        console.warn(`Forge chips v2: groups[${i}] missing string id; dropping`);
        continue;
      }
      const gr: ChipGroup = { id: g.id };
      if (typeof g.order === 'number') gr.order = g.order;
      if (typeof g.label === 'string') gr.label = g.label;
      groups.push(gr);
    }
    cfg.groups = groups;
  }
  if (Array.isArray(r.hide)) {
    cfg.hide = r.hide.filter((x): x is string => typeof x === 'string');
  }
  return cfg;
}

/** Per-chip with `target` so the merge step can match overrides. */
interface ChipWithTarget extends Chip {
  target: string;
  order?: number;
}

/** Merge auto-derived chips with `_chips.md` v2 curation overrides.
 *  Returns one ChipPaletteGroup per group (sorted per group `order`),
 *  with chips within each group sorted per chip `order` then by
 *  label.
 *
 *  Conflict resolution (per spec):
 *    1. Auto-derived list already honors per-snippet `chip: false`.
 *    2. `overrides[]` replaces specified fields on matching targets.
 *       Override targeting a non-existent (or `chip: false`-excluded)
 *       snippet → warning + drop (no chip materializes).
 *    3. `hide[]` removes matching targets after override application.
 *    4. `groups[]` controls group order + display labels.
 *    5. Within each group: sort by `order` (overrides win over the
 *       auto-default), then alphabetically by label.
 *
 *  Idempotent: re-running with the same inputs yields byte-identical
 *  output. */
export function mergeChipsWithOverrides(
  autoChips: ChipWithTarget[],
  config: ChipsV2Config | null,
): ChipPaletteGroup[] {
  // Index auto-derived by target.
  const byTarget = new Map<string, ChipWithTarget>();
  for (const c of autoChips) byTarget.set(c.target, { ...c });

  // Step 2: apply overrides.
  if (config?.overrides) {
    for (const ov of config.overrides) {
      const existing = byTarget.get(ov.target);
      if (!existing) {
        console.warn(
          `Forge chips v2: override target '${ov.target}' has no auto-derived ` +
          `chip (snippet missing, renamed, or chip:false in frontmatter); dropping override`,
        );
        continue;
      }
      if (ov.label !== undefined) existing.label = ov.label;
      if (ov.group !== undefined) existing.group = ov.group;
      if (ov.insertion !== undefined) existing.insertion = ov.insertion;
      if (ov.order !== undefined) existing.order = ov.order;
      if (ov.hide === true) byTarget.delete(ov.target);
    }
  }
  // Step 3: apply hide[].
  if (config?.hide) {
    for (const t of config.hide) byTarget.delete(t);
  }

  // Step 4: group by group id; preserve declared group order.
  const declaredGroups = config?.groups ?? [];
  const groupOrder = new Map<string, number>();
  const groupLabel = new Map<string, string>();
  declaredGroups.forEach((g, i) => {
    groupOrder.set(g.id, g.order ?? i);
    if (g.label !== undefined) groupLabel.set(g.id, g.label);
  });

  // Bucket chips by group id.
  const buckets = new Map<string, ChipWithTarget[]>();
  for (const c of byTarget.values()) {
    const gid = c.group ?? '(ungrouped)';
    if (!buckets.has(gid)) buckets.set(gid, []);
    buckets.get(gid)!.push(c);
  }

  // Sort within each group: by order field if present, else by label.
  for (const arr of buckets.values()) {
    arr.sort((a, b) => {
      const ao = a.order;
      const bo = b.order;
      if (ao !== undefined && bo !== undefined) return ao - bo;
      if (ao !== undefined) return -1;
      if (bo !== undefined) return 1;
      return a.label.localeCompare(b.label);
    });
  }

  // Output groups: declared order first (in declaration sequence),
  // then any remaining undeclared groups in first-appearance order.
  const result: ChipPaletteGroup[] = [];
  const seen = new Set<string>();
  for (const g of declaredGroups) {
    const arr = buckets.get(g.id);
    if (arr && arr.length > 0) {
      const sourceName = groupLabel.get(g.id) ?? g.id;
      // Strip target + order fields from output Chips (those are
      // merge-state; the view sees the base Chip shape).
      const chips: Chip[] = arr.map(c => {
        const out: Chip = { label: c.label, insertion: c.insertion };
        if (c.group !== undefined) out.group = c.group;
        return out;
      });
      result.push({ sourceName, chips });
      seen.add(g.id);
    }
  }
  // Auto-derived groups not in the declared list — keep in
  // first-appearance order.
  const orderedKeys = Array.from(buckets.keys());
  for (const gid of orderedKeys) {
    if (seen.has(gid)) continue;
    const arr = buckets.get(gid)!;
    if (arr.length === 0) continue;
    const sourceName = groupLabel.get(gid) ?? gid;
    const chips: Chip[] = arr.map(c => {
      const out: Chip = { label: c.label, insertion: c.insertion };
      if (c.group !== undefined) out.group = c.group;
      return out;
    });
    result.push({ sourceName, chips });
  }
  return result;
}

/** Build the auto-derived chip list (with target metadata) from a
 *  snippet inventory. Each entry that passes the derivation rules
 *  yields one ChipWithTarget; rejected entries are silently dropped
 *  (per S7/`chip:false`/snapshot rules in `deriveChip`). */
export function autoDeriveChips(
  snippets: SnippetMetaForChips[],
): ChipWithTarget[] {
  const out: ChipWithTarget[] = [];
  for (const s of snippets) {
    const c = deriveChip(s);
    if (c === null) continue;
    out.push({ ...c, target: s.id });
  }
  return out;
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
