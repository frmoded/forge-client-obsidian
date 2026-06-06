// Pure-core helper for v3.2 synthetic chips — chips declared directly
// in `_chips.md` with no backing snippet file. The motivating use case
// is forge-doc's tutorial: chapter 1 needs a `print` chip that inserts
// `Do [[print]]("<message>").` even though there's no `print.md`
// snippet (print is an E-- builtin / Python builtin per v0.2.59 B7.2).
//
// This helper:
//   - Parses the `synthetic_chips[]` list from a v3 `_chips.md` body
//     (the caller hands in the already-decoded YAML object).
//   - Validates entries; drops malformed ones with a console warning.
//   - Merges per-level synthetic chip lists per v3.1 walk-up semantics:
//     same-`label` higher-specificity (closer to active file) wins.
//
// Pure-core extraction No. 25. No `obsidian` import; runs cleanly
// under `node --test`.
//
// Companion to `chips-core.ts` (which handles the v2/v3 _chips.md
// parse) + `chips-walk-up-core.ts` (which decides which `_chips.md`
// paths to consult).

/** A single synthetic chip per the v3.2 schema. `target` is
 *  intentionally absent (synthetic chips have no backing snippet
 *  file), distinguishing them from auto-derived `ChipWithTarget`
 *  entries at merge time. */
export interface SyntheticChip {
  label: string;
  insertion: string;
  /** Group ID for palette rendering. Defaults to "Synthetic" when the
   *  source `_chips.md` entry omits the field. */
  group: string;
  /** Sort order within the group. `undefined` means "use declaration
   *  order"; the v3 spec lets curators mix declaration-order entries
   *  with explicit-order entries cleanly. */
  order?: number;
}

/** Default group label assigned to a synthetic chip when the source
 *  entry doesn't declare one. Matches the v3.2 spec default. */
export const DEFAULT_SYNTHETIC_GROUP = 'Synthetic';

/** Decode `synthetic_chips[]` from a YAML-already-decoded `_chips.md`
 *  body. Returns the validated chip list. Malformed entries are dropped
 *  with a console warning; one bad row doesn't fail the whole file.
 *
 *  Tolerates missing `synthetic_chips` key (returns `[]`).
 *  Tolerates non-array `synthetic_chips` (returns `[]` + warning).
 *
 *  Per the spec:
 *    - `label` (required, string): non-empty.
 *    - `insertion` (required, string): non-empty. Multi-line via
 *      YAML `|` is fine — the decoded string already has \n in it.
 *    - `group` (optional, string): defaults to `DEFAULT_SYNTHETIC_GROUP`.
 *    - `order` (optional, number): if present, must be a number; non-
 *      numbers drop the field (entry kept, falls back to declaration
 *      order).
 *
 *  Idempotent + side-effect-free apart from console warnings on
 *  malformed entries. */
export function parseSyntheticChips(
  decoded: unknown,
): SyntheticChip[] {
  if (decoded === null || typeof decoded !== 'object') return [];
  const r = decoded as Record<string, unknown>;
  const rawList = r.synthetic_chips;
  if (rawList === undefined) return [];
  if (!Array.isArray(rawList)) {
    console.warn(
      `Forge chips v3: synthetic_chips must be a list, got ${typeof rawList}; ignoring`,
    );
    return [];
  }
  const out: SyntheticChip[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const raw = rawList[i];
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      console.warn(
        `Forge chips v3: synthetic_chips[${i}] is not an object; dropping`,
      );
      continue;
    }
    const e = raw as Record<string, unknown>;
    if (typeof e.label !== 'string' || e.label.length === 0) {
      console.warn(
        `Forge chips v3: synthetic_chips[${i}] missing string label; dropping`,
      );
      continue;
    }
    if (typeof e.insertion !== 'string' || e.insertion.length === 0) {
      console.warn(
        `Forge chips v3: synthetic_chips[${i}] (${e.label}) missing string insertion; dropping`,
      );
      continue;
    }
    const group =
      typeof e.group === 'string' && e.group.length > 0
        ? e.group
        : DEFAULT_SYNTHETIC_GROUP;
    const chip: SyntheticChip = {
      label: e.label,
      insertion: e.insertion,
      group,
    };
    if (typeof e.order === 'number' && Number.isFinite(e.order)) {
      chip.order = e.order;
    }
    out.push(chip);
  }
  return out;
}

/** Merge synthetic chips across walk-up levels per the v3.1 rule:
 *  "same-`label` higher-specificity wins."
 *
 *  Caller passes the per-level lists in walk-up order — most-specific
 *  (closest to active file) FIRST. For each entry, add to the result
 *  only if its `label` hasn't been claimed by a more-specific level.
 *  `label` is the de-duplication key per the spec.
 *
 *  Idempotent: re-running with the same inputs yields equal output.
 *
 *  Returns chips in walk-up encounter order (specific → general), then
 *  by declaration order within each level. Caller decides the final
 *  sort (typically by group + `order` + label at palette render time). */
export function mergeSyntheticChipsHigherWins(
  perLevelLists: SyntheticChip[][],
): SyntheticChip[] {
  const out: SyntheticChip[] = [];
  const claimedLabels = new Set<string>();
  for (const level of perLevelLists) {
    for (const chip of level) {
      if (claimedLabels.has(chip.label)) continue;
      claimedLabels.add(chip.label);
      out.push(chip);
    }
  }
  return out;
}

/** Apply the v3 `hide[]` list to a synthetic-chip array. `hide[]`
 *  entries are matched against synthetic chip `label`s (per the spec).
 *  Returns a new array; input unchanged. */
export function applyHideToSyntheticChips(
  chips: SyntheticChip[],
  hide: string[] | undefined,
): SyntheticChip[] {
  if (!hide || hide.length === 0) return chips.slice();
  const hidden = new Set(hide);
  return chips.filter(c => !hidden.has(c.label));
}
