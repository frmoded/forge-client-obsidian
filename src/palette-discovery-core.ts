// v0.2.258 drain 2026-07-03-1300 — palette discovery from action-note
// scan + hardcoded language primitives. Replaces the `_chips.md`-
// schema loader (chips-core.ts + chips-walk-up-core.ts + synthetic-
// chips-core.ts + chips-md-migration-core.ts, all retired this drain).
//
// Data source model:
//   1. Language primitives — hardcoded here. `print`, `Let`, `Return`,
//      `If`, `Otherwise`, `For each`. Group: "Language". Order:
//      declared here (definition order).
//   2. Action + data snippets — discovered from vault snippet-inventory
//      (main.ts's buildSnippetInventory). Each qualifying snippet
//      produces one chip via `deriveChip`. Group: alphabetical below
//      the language primitives.
//   3. Library-note custom insertion — read from library-note
//      frontmatter `chip_insertion:` field (option a per driver Choice
//      3 confirmation). Falls back to auto-derived insertion when
//      absent.
//
// Ordering per driver Choice 5: language primitives at top; auto-
// discovered chips interleaved alphabetically below.
//
// Deduplication per driver Choice 4 (A4 shadowing): when a library
// note and a vault note share a name, the library-note chip wins.
// Caller passes the inventory in resolution order (libraries first);
// this core drops later duplicates.

import { deriveChip, type Chip, type ChipPaletteGroup, type SnippetMetaForChips } from './chips-core.ts';

export type { Chip, ChipPaletteGroup, SnippetMetaForChips };

/** The 6 language primitives available in every vault. These are
 *  grammar constructs (not notes) so they live in plugin source.
 *  Pre-v0.2.258 the same 6 were declared in tutorial's
 *  `_meta/_chips.md` as `synthetic_chips`; that file is retired this
 *  drain. */
export const LANGUAGE_PRIMITIVES: Chip[] = [
  { label: 'print', insertion: 'Call [[print]] with text="<message>".', insertionV2: 'Call [[print]] with text="<message>".' },
  { label: 'Let', insertion: 'Let <name> = <value>.', insertionV2: 'Let <name> = <value>.' },
  { label: 'Return', insertion: 'Return <value>.', insertionV2: 'Return <value>.' },
  { label: 'If', insertion: 'If <condition>:\n    <body>', insertionV2: 'If <condition>:\n    <body>' },
  { label: 'Otherwise', insertion: 'Otherwise:\n    <body>', insertionV2: 'Otherwise:\n    <body>' },
  { label: 'For each', insertion: 'For each <item> in <collection>:\n    <body>', insertionV2: 'For each <item> in <collection>:\n    <body>' },
];

/** The group name for language primitives in the rendered palette. */
export const LANGUAGE_GROUP_NAME = 'Language';

/** The group name for auto-discovered notes in the rendered palette. */
export const NOTES_GROUP_NAME = 'Notes';

/** Metadata for a snippet that MAY carry custom chip insertion. Extends
 *  `SnippetMetaForChips` (from chips-core.ts) with the optional
 *  `chip_insertion` frontmatter field library notes use to override
 *  auto-derived shape.
 *
 *  Vault notes never carry `chip_insertion` per driver Choice 5
 *  (§2.5): plain-wikilink insertion for cohort notes; rich shapes are
 *  a library-note prerogative. */
export interface SnippetMetaForPalette extends SnippetMetaForChips {
  chip_insertion?: string;
}

/** Compute the palette given a snippet inventory.
 *
 *  Returns two groups:
 *   - `Language`: hardcoded primitives (6 chips, declared order).
 *   - `Notes`: auto-discovered chips, alphabetical by label.
 *
 *  Deduplication (driver Choice 4, A4 shadowing): when two snippets
 *  share a basename, the FIRST one wins. Caller passes libraries
 *  before vault notes; libraries thus win over vault-shadow attempts.
 *
 *  Snippets excluded per S6/S7 rules (underscore prefix, snapshots,
 *  `chip: false`) are dropped inside `deriveChip`. */
export function computePalette(
  snippets: SnippetMetaForPalette[],
): ChipPaletteGroup[] {
  const seenBasenames = new Set<string>();
  const notesChips: Chip[] = [];
  for (const snippet of snippets) {
    if (seenBasenames.has(snippet.basename)) continue;
    const baseChip = deriveChip(snippet);
    if (baseChip === null) continue;
    seenBasenames.add(snippet.basename);
    // v0.2.258 — library notes' `chip_insertion` frontmatter override
    // (per driver Choice 3). When present, use as-is for both V1 and
    // V2 insertion shapes (cohort-facing simplification). When absent,
    // keep auto-derived shapes from deriveChip.
    if (snippet.chip_insertion !== undefined && snippet.chip_insertion !== '') {
      notesChips.push({
        ...baseChip,
        insertion: snippet.chip_insertion,
        insertionV2: snippet.chip_insertion,
      });
    } else {
      notesChips.push(baseChip);
    }
  }
  // Alphabetical by label per driver Choice 5.
  notesChips.sort((a, b) => a.label.localeCompare(b.label));

  return [
    {
      sourceName: LANGUAGE_GROUP_NAME,
      chips: [...LANGUAGE_PRIMITIVES],
    },
    {
      sourceName: NOTES_GROUP_NAME,
      chips: notesChips,
    },
  ];
}
