// 2026-10-29-0920 item 2 - ONE definition of "what state is this note's source layer in", used by BOTH the status bar and the facet headings (stale-facet-view-plugin), so the two can never disagree again (CCQA regression step 5(ii): the bar said "synced"
// while the Python heading said "out of date"). It runs the same functions the plugin always ran, in the order the headings ran them: whichLayerIsSource, then the note's stored source_facet (`synced` is a freshness verdict, not a source), then
// computeFacetStates over the CURRENT body hashes. On top of that it applies the freshness rule: a Python facet that is still the default stub certifies nothing and counts as stale. Pure: no Obsidian, no CodeMirror.
import { computeFacetHash, getSourceFacet, whichLayerIsSource, type SourceLayer } from './facet-hash-core.ts';
import { effectiveSourceFacet } from './effective-source-core.ts';
import { ALL_FACETS, FacetState, computeFacetStates, type FacetName } from './facet-state-core.ts';
import { extractDescription, extractPythonSection, extractRecipeSection, getFrontmatterField, isV2Shape } from './v2-note-core.ts';
import { DEFAULT_PYTHON_STUB } from './v11-3-backfill-core.ts';

export interface SourceLayerStatus {
  isV2: boolean;
  /** whichLayerIsSource's verdict; null = not a V2 note or the probe failed. */
  canonical: SourceLayer | null;
  /** The source the headings draw from: the stored source_facet when the verdict is `synced`. */
  effective: SourceLayer | null;
  /** The hexa-state of each facet, exactly as the headings draw it (empty for a non-V2 note). */
  states: Record<FacetName, string> | null;
  /** The facets that are out of date or still a stub, in the order of the note. A note is only "synced" when this is empty. */
  staleFacets: FacetName[];
}

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
const STUB = squash(DEFAULT_PYTHON_STUB);

export async function sourceLayerStatusOf(body: string): Promise<SourceLayerStatus> {
  if (!isV2Shape(body)) return { isV2: false, canonical: null, effective: null, states: null, staleFacets: [] };
  const read = (b: string, k: string): string | null => { const v = getFrontmatterField(b, k); return typeof v === 'string' ? v : null; };
  let canonical: SourceLayer | null;
  try {
    canonical = await whichLayerIsSource(body, { extractDescription, extractRecipeSection, extractPythonSection, getFrontmatterField: read });
  } catch (e) {
    console.error('sourceLayerStatusOf: whichLayerIsSource failed', e);
    return { isV2: true, canonical: null, effective: null, states: null, staleFacets: [] };
  }
  const pythonText = extractPythonSection(body) ?? '';
  const currentBodyHashes = {
    description: await computeFacetHash(extractDescription(body)),
    recipe: await computeFacetHash(extractRecipeSection(body) ?? ''),
    python: await computeFacetHash(pythonText),
  };
  const effective = effectiveSourceFacet(canonical, getSourceFacet(body, read)) ?? canonical;
  const states = computeFacetStates(effective as SourceLayer, { getFrontmatterField: (k: string) => read(body, k) }, currentBodyHashes);
  const staleFacets = ALL_FACETS.filter((f) => states[f] === FacetState.DerivedFromDescriptionOutOfDate || states[f] === FacetState.DerivedFromRecipeOutOfDate || (f === 'python' && squash(pythonText) === STUB));
  return { isV2: true, canonical, effective, states, staleFacets };
}
