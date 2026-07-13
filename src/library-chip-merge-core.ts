// Drain 2330 — surface library-note chips in the palette.
//
// Before this drain, the chip palette rendered only vault-note chips
// discovered by walking vault `.md` files (loadPaletteForActiveVault
// in chips.ts). Library-note chips — defined in
// `forge/<domain>/lib.py` and indexed at plugin load via
// parseEngineLib — were Cmd-clickable inside a Recipe wikilink but
// completely absent from the palette. New users evaluating Forge
// couldn't browse to discover `walking_bass_line`, `piano_voicing`,
// `form`, etc.
//
// This pure-core merges the library-note-catalog into the palette
// output as one group per domain ("Music library", "Moda library"),
// appended AFTER the vault groups so user-authored notes retain
// visual priority.
//
// Left-click semantics reuse the existing chip-click handler: the
// synthesized `insertion` is a `Call [[name]] with ...` wikilink, so
// the click handler writes it into the active Recipe unchanged.
// Right-click semantics (chips-view.ts's "Go to <ref>" menu) reuse
// the existing library-note wikilink path.

import type { Chip, ChipPaletteGroup } from './chips-core.ts';
import {
  synthesizeRecipeSignature,
  type LibraryNote,
} from './library-note-catalog-core.ts';

/** Human-facing group name for a domain's library chips. Title-cased
 *  domain + " library" (e.g. `music` → `Music library`). */
export function libraryGroupName(domain: string): string {
  if (domain.length === 0) return 'Library';
  return `${domain[0].toUpperCase()}${domain.slice(1).toLowerCase()} library`;
}

/** Merge library-note chips into an existing palette shape.
 *
 *  Semantics:
 *   - Vault groups pass through unchanged (order preserved, contents
 *     verbatim). User-authored content wins visual priority.
 *   - Empty library map → return `vaultGroups` unchanged (no
 *     empty-group noise).
 *   - Per-domain library group appended AFTER vault groups. Domains
 *     enumerated alphabetically for deterministic order.
 *   - Within a group, chips are alphabetical by `label` (the library
 *     note name).
 *   - Duplicate-name policy: when a library note shares a basename
 *     with an existing vault chip (across ALL vault groups), the vault
 *     chip wins — the library entry is dropped to prevent palette-
 *     level double-entries. Matches the constitution "user-authored
 *     shadow wins" rule (S12 A4 shadowing).
 *   - Insertion string: reuses `synthesizeRecipeSignature`, which
 *     produces `[[name]].` for zero-arg chips and
 *     `Call [[name]] with arg1=<arg1>, ...` for input-bearing chips.
 *     Same shape used elsewhere in the plugin for Recipe wikilinks.
 */
export function mergeLibraryChipsIntoPalette(
  vaultGroups: ChipPaletteGroup[],
  libraryNotesByDomain: Record<string, LibraryNote[]>,
): ChipPaletteGroup[] {
  const domainKeys = Object.keys(libraryNotesByDomain).sort();
  // Fast path — no library chips, no changes.
  if (domainKeys.every(k => (libraryNotesByDomain[k] ?? []).length === 0)) {
    return vaultGroups;
  }

  const vaultLabels = new Set<string>();
  for (const g of vaultGroups) {
    for (const c of g.chips) vaultLabels.add(c.label);
  }

  const out: ChipPaletteGroup[] = [...vaultGroups];
  for (const domain of domainKeys) {
    const notes = libraryNotesByDomain[domain] ?? [];
    if (notes.length === 0) continue;
    const chips: Chip[] = [];
    // Alphabetical + shadow-drop.
    const sortedNotes = [...notes].sort((a, b) => a.name.localeCompare(b.name));
    for (const note of sortedNotes) {
      if (vaultLabels.has(note.name)) continue;
      const insertion = synthesizeRecipeSignature(note);
      chips.push({
        label: note.name,
        insertion,
        insertionV2: insertion,
      });
    }
    if (chips.length === 0) continue;
    out.push({
      sourceName: libraryGroupName(domain),
      chips,
    });
  }
  return out;
}
