// Drain 2026-10-15-2100 §1 — which facet a note's SOURCE is, when the hash probe cannot say.
//
// `whichLayerIsSource` answers from CONTENT: which facet drifted from its stored hash. A note whose three hashes all match — every
// shipped library note, by construction — has no drifted facet, so the probe answers `synced`. That is a statement about freshness
// ("nothing is out of date"), NOT about which facet the note is derived from. The stored `source_facet` says that, and the two were
// being conflated: the stamper and the facet panel both read `synced` as "Description" (the v11.4.1 convention), so a recipe-source
// note was re-stamped with the Description hash as its lineage root and drawn as "Description — source / Recipe — derived from
// Description" while its own frontmatter said `source_facet: recipe`.
//
// One definition, used by every consumer that needs "the facet this note derives from" (the lineage stamper, the facet panel):
//   - a verdict of description / recipe / python is a DRIFT finding and wins — the stored field is allowed to be behind an edit;
//   - a `synced` verdict defers to the stored source_facet when it names one (description / recipe / python);
//   - `synced` with no usable stored value stays `synced` (consumers keep their v11.4.1 handling: treat it as Description).
//
// PURE: no Obsidian.
import type { SourceLayer } from './facet-hash-core.ts';

const CONCRETE: ReadonlySet<string> = new Set(['description', 'recipe', 'python']);

export function effectiveSourceFacet(verdict: SourceLayer | null, storedSourceFacet: SourceLayer | string | null): SourceLayer | null {
  if (verdict !== 'synced') return verdict;
  return typeof storedSourceFacet === 'string' && CONCRETE.has(storedSourceFacet) ? (storedSourceFacet as SourceLayer) : 'synced';
}
