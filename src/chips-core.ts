// Pure, obsidian-free chip helpers. Imported directly by
// chips.test.ts under `node --test`; the obsidian-coupled reader +
// view re-export from here for runtime use.
//
// v0.2.272 drain 1320 — round-2 dead-code deletion: retired the
// `_chips.md` schema surface (parseChipsV2Config, mergeChipsWithOverrides,
// autoDeriveChips, mergeChipsConfigsWalkUp), types ChipsV2Config /
// ChipOverride / ChipGroup, constant CHIPS_RELATIVE_PATHS, and helper
// chipSourcesFor. All were dead post-v0.2.259 palette auto-discovery
// (drain 1300); 1310 partial-shipped and this drain closes the sweep.

export interface Chip {
  label: string;
  /** The V1 (`# English`) insertion form. `Do [[name]](args).` for
   *  action snippets; `Set <name> to [[id]]().` for data snippets. */
  insertion: string;
  /** v0.2.203 — V2 (`# Recipe`) insertion form. Optional for back-
   *  compat with chip configs that don't pre-compute it.
   *  - Zero-input action → `[[name]].` (shorthand-call statement).
   *  - Input-bearing action → `Let <name> = Call [[name]] with
   *    arg1=<arg1>, ....`.
   *  - Data → `Let <name> = [[id]].`.
   *  Consumers (chip click handler) pick based on the target note's
   *  V2-shape + cursor section. When `insertionV2` is undefined, the
   *  caller falls back to `insertion`. */
  insertionV2?: string;
  // Optional secondary grouping within a source vault.
  group?: string;
  // Optional list of snippet IDs the chip references. Tolerated by
  // the parser, preserved on the Chip object, but unused by the
  // view — reserved for future graph-view linking.
  refs?: string[];
}

export interface ChipsParseError {
  error: string;
}

export interface ChipPaletteGroup {
  sourceName: string;
  chips: Chip[];
}

/** Snapshot of vault state the chip loader needs to compute palette
 *  contents. `libraryDirNames` are the full subdir names with their
 *  `forge-` prefix (e.g. `['forge-moda', 'forge-music']`) — literal
 *  directory names, not stripped domain ids. */
export interface ChipsManifest {
  vaultName: string;
  libraryDirNames: string[];
  /** Optional: vault-relative path of the active file at the moment
   *  the chip palette computes. Used by walk-up scope narrowing. */
  activeFilePath?: string | null;
}

/** Validate an already-decoded chips list and return the typed
 *  `Chip[]`. Accepts either a bare array or an object with a `chips:`
 *  key wrapping the array. Per-entry: `label` and `insertion` are
 *  required strings; `group` and `refs` are preserved when present;
 *  everything else is tolerated and stripped. Malformed entries are
 *  dropped silently with a console warning. */
export function validateChipsList(
  decoded: unknown,
): { chips: Chip[] } | ChipsParseError {
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
    if (typeof r.insertionV2 === 'string' && r.insertionV2.length > 0) {
      chip.insertionV2 = r.insertionV2;
    }
    chips.push(chip);
  }
  return { chips };
}

/** Convenience: parse a JSON-string body into a chip list. */
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
 *  sources. Empty-chip sources are dropped so the UI doesn't render
 *  empty group headers. */
export function mergeChipSources(
  sources: Array<{ sourceName: string; chips: Chip[] }>,
): ChipPaletteGroup[] {
  return sources
    .filter(s => s.chips.length > 0)
    .map(s => ({ sourceName: s.sourceName, chips: s.chips.slice() }));
}

/** Minimal snippet metadata the chip derivation reads. */
export interface SnippetMetaForChips {
  id: string;                                  // qualified snippet_id (e.g. "blues/song")
  basename: string;                            // file basename without `.md`
  type?: 'action' | 'data' | 'snapshot' | string;
  inputs?: string[];                           // action snippet's declared inputs
  chip?: boolean;                              // per-snippet opt-out (false = exclude)
  parentDir?: string;                          // parent subdir relative to library root
  /** v0.2.77 — canonical snippets emit keyword-form insertions. */
  facet_form?: 'canonical' | string;
}

/** Humanize a snippet id for the chip palette's `label` field.
 *  Takes the LAST path segment, replaces `_` with ` `, capitalizes
 *  the first letter. */
export function humanizeSnippetId(id: string): string {
  const basename = id.split('/').pop() ?? id;
  if (basename === '') return '';
  const words = basename.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** v0.2.203 — V2 (`# Recipe`) insertion form for an action snippet.
 *  Emits the canonical V2 statement shape:
 *  - 0 inputs    → `[[id]].`            (shorthand-call statement)
 *  - 1+ inputs   → `Let <result> = Call [[id]] with k1=<k1>, ....`
 */
export function deriveV2InsertionForAction(
  snippet: SnippetMetaForChips,
): string {
  const inputs = snippet.inputs ?? [];
  if (inputs.length === 0) {
    return `[[${snippet.id}]].`;
  }
  const kwargs = inputs.map(n => `${n}=<${n}>`).join(', ');
  return `Let <result> = Call [[${snippet.id}]] with ${kwargs}.`;
}

/** Derive the auto-chip for one snippet. Returns null when excluded
 *  (S7 underscore prefix, `chip: false`, snapshot type, or unknown). */
export function deriveChip(snippet: SnippetMetaForChips): Chip | null {
  if (snippet.basename.startsWith('_')) return null;
  if (snippet.chip === false) return null;
  if (snippet.type === 'snapshot') return null;

  const label = humanizeSnippetId(snippet.id);
  const group = snippet.parentDir && snippet.parentDir !== ''
    ? snippet.parentDir
    : '(library)';

  if (snippet.type === 'action') {
    const inputs = snippet.inputs ?? [];
    const isCanonical = snippet.facet_form === 'canonical';
    const argList = (isCanonical && inputs.length > 0)
      ? inputs.map(n => `${n}=<${n}>`).join(', ')
      : inputs.map(n => `<${n}>`).join(', ');
    const insertion = `Do [[${snippet.id}]](${argList}).`;
    const insertionV2 = deriveV2InsertionForAction(snippet);
    return { label, insertion, insertionV2, group };
  }

  if (snippet.type === 'data') {
    const insertion = `Set <name> to [[${snippet.id}]]().`;
    const insertionV2 = `Let <name> = [[${snippet.id}]].`;
    return { label, insertion, insertionV2, group };
  }

  return null;
}

/** Display group name for vault-root snippets in the chip palette. */
export const PERSONAL_GROUP_NAME = 'Personal';

/** Pure-core: filter vault-file references down to "personal" chips.
 *  Top-level only (no `/` in path); S7 (`_*.md` excluded); files inside
 *  library subdirs excluded (auto-discovered by their library's walk). */
export function discoverTopLevelSnippets<T extends { path: string }>(
  allFiles: T[],
  libraryDirs: Set<string>,
): T[] {
  void libraryDirs;
  return allFiles.filter(f => {
    if (f.path.includes('/')) return false;
    if (f.path.startsWith('_')) return false;
    return true;
  });
}

/** Pure-core: render decision for the chip palette's per-source
 *  sub-group header. Render the h5 ONLY when the sub-group label
 *  carries information beyond the source name. */
export function shouldRenderSubgroupHeader(
  subgroupLabel: string | null,
  sourceName: string,
): boolean {
  if (!subgroupLabel) return false;
  if (subgroupLabel === sourceName) return false;
  return true;
}

/** Sentinel for "no `# English` section to insert into" — the caller
 *  surfaces this as a user-visible notice. */
export const CHIPS_NO_ENGLISH_SECTION = Symbol('CHIPS_NO_ENGLISH_SECTION');

export type InsertResult =
  | { ok: true; body: string }
  | { ok: false; reason: typeof CHIPS_NO_ENGLISH_SECTION };

/** Append `\n<insertion>` to the END of the `# English` section in a
 *  markdown note body. Legacy end-of-English append used as fallback
 *  when the cursor is unavailable. */
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

/** v0.2.137 — apply the editor's current selection to a chip body
 *  so the chip uses the selection as input. Placeholder replacement
 *  when `<...>` present; no-op passthrough otherwise. */
export function applySelectionToChip(
  chipBody: string,
  selection: string | null | undefined,
): string {
  if (!selection || selection.length === 0) return chipBody;
  if (chipBody.length === 0) return chipBody;
  const placeholderRe = /<([^<>]+)>/;
  if (!placeholderRe.test(chipBody)) return chipBody;
  return chipBody.replace(placeholderRe, selection);
}

/** v0.2.135 — pure helper: prefix lines 2..N of a multi-line chip
 *  body with the cursor-line's leading whitespace so each line of
 *  the inserted body shares the cursor's indent. */
export function applyIndentToChipBody(
  chipBody: string,
  leadingWhitespace: string,
): string {
  if (leadingWhitespace.length === 0) return chipBody;
  const parts = chipBody.split('\n');
  if (parts.length <= 1) return chipBody;
  return parts
    .map((line, i) => {
      if (i === 0) return line;
      if (line === '') return '';
      return leadingWhitespace + line;
    })
    .join('\n');
}

/** v0.2.135 — extract the leading whitespace (spaces or tabs) of a line. */
export function extractLeadingWhitespace(
  line: string | null | undefined,
): string {
  if (!line) return '';
  const m = line.match(/^[\t ]*/);
  return m ? m[0] : '';
}

/** v0.2.142 — cursor-anywhere chip insertion. When cursorLine is
 *  in-range for the doc, insert AT the cursor with indent matching,
 *  regardless of section boundaries. */
export function insertChipTextAtLine(
  noteBody: string,
  chipInsertion: string,
  cursorLine: number,
): InsertResult {
  const lines = noteBody.split('\n');
  if (cursorLine < 0 || cursorLine >= lines.length) {
    return insertChipText(noteBody, chipInsertion);
  }
  const cursorLineContent = lines[cursorLine] ?? '';
  const leadingWs = extractLeadingWhitespace(cursorLineContent);
  const indentedChip = applyIndentToChipBody(chipInsertion, leadingWs);
  if (cursorLineContent.trim() === '') {
    const before = lines.slice(0, cursorLine);
    const after = lines.slice(cursorLine + 1);
    return { ok: true, body: [...before, indentedChip, ...after].join('\n') };
  }
  const before = lines.slice(0, cursorLine + 1);
  const after = lines.slice(cursorLine + 1);
  return { ok: true, body: [...before, indentedChip, ...after].join('\n') };
}
