// v0.2.205 — Pure-core for the canonical-layer status bar entry
// (Phase 2.5 §2.3). The status bar shows cohort the current canonical
// layer at a glance: "Recipe canonical" / "Python canonical" /
// "Description canonical" / empty (synced or non-V2).
//
// Separated from main.ts so the label rendering logic can be
// `node --test`'d without an App / WorkspaceLeaf fixture.

import type { CanonicalLayer } from './canonical-aware-forge-click-core';

/** Compute the status-bar label for a given canonical layer + V2-shape
 *  state. Returns empty string when there's nothing meaningful to
 *  surface (synced V2 note, or non-V2 note) — the caller should clear
 *  the status-bar text in that case.
 *
 *  - canonical=null + isV2=false → '' (non-V2 file open; nothing to say)
 *  - canonical='synced'           → '' (V2 synced; suppress to reduce noise)
 *  - canonical='description'      → 'Description canonical'
 *  - canonical='recipe'           → 'Recipe canonical'
 *  - canonical='python'           → 'Python canonical'
 *  - canonical=null + isV2=true   → 'probe failed' (defensive; reveals hash-helper bugs)
 */
export function canonicalLayerStatusLabel(
  isV2: boolean,
  canonical: CanonicalLayer | null,
): string {
  if (!isV2) return '';
  if (canonical === null) return 'Forge: probe failed';
  if (canonical === 'synced') return '';
  if (canonical === 'description') return 'Forge: Description canonical';
  if (canonical === 'recipe') return 'Forge: Recipe canonical';
  if (canonical === 'python') return 'Forge: Python canonical';
  // Exhaustive in the type system; defensive narrow for runtime.
  return '';
}

/** Tooltip text for hover. More verbose than the inline label;
 *  describes what the layer means for the next Forge-click.
 *
 *  Mirrors Phase 2 §3.1's canonical-aware Forge-click branches so
 *  cohort hovering the status bar learns what to expect WITHOUT
 *  clicking Forge first. */
export function canonicalLayerStatusTooltip(
  canonical: CanonicalLayer | null,
): string {
  if (canonical === null) {
    return (
      'Forge canonical-layer probe failed. The 3-layer hash state '
      + 'machine couldn\'t determine which facet was last hand-edited. '
      + 'Forge-click will fall through to the standard transpile path.'
    );
  }
  if (canonical === 'synced') {
    return (
      'All three facets (Description / Recipe / Python) match their '
      + 'stored hashes — no hand-edits since the last /generate or '
      + 'Forge-click. Forge-click will re-transpile cleanly.'
    );
  }
  if (canonical === 'description') {
    return (
      'Description was hand-edited since the last /generate. The '
      + 'Recipe is stale. Forge-click will abort and ask you to run '
      + '"Forge: Generate Recipe from Description" first.'
    );
  }
  if (canonical === 'recipe') {
    return (
      'Recipe was hand-edited since the last Forge-click. The Python '
      + 'facet is stale. Forge-click will re-transpile your edited '
      + 'Recipe → fresh Python (the standard V2 flow).'
    );
  }
  if (canonical === 'python') {
    return (
      'Python facet was hand-edited since the last Forge-click. '
      + 'Forge-click will run your edited Python AS-IS — no transpile, '
      + 'no overwrite (Path Y / engineer mode for V2).'
    );
  }
  return '';
}
