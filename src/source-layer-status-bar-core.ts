// v0.2.205 — Pure-core for the source-layer status bar entry
// (Phase 2.5 §2.3). The status bar shows cohort the current source
// facet at a glance: "Recipe source" / "Python source" /
// "Description source" / empty (synced or non-V2).
//
// v0.2.286 (drain 2026-07-09-1600) — renamed from
// canonical-layer-status-bar-core alongside the S9 field rename.
//
// Separated from main.ts so the label rendering logic can be
// `node --test`'d without an App / WorkspaceLeaf fixture.

import type { SourceLayer } from './source-aware-forge-click-core.ts';

/** Compute the status-bar label for a given source layer + V2-shape
 *  state. Returns empty string only for non-V2 notes — the caller
 *  should clear the status-bar text in that case.
 *
 *  - source=null + isV2=false → '' (non-V2 file open; nothing to say)
 *  - source='synced'           → 'Forge: synced'    (drain 2510 — was '' pre-drain, but
 *                                                    the empty label made the status bar
 *                                                    invisible for synced notes and the
 *                                                    click handler dead. Rendering a
 *                                                    minimal label keeps the item visible +
 *                                                    click-reachable so cohort can hover
 *                                                    for the tooltip or click for the
 *                                                    verbose showSourceLayer report.)
 *  - source='description'      → 'Forge: Description source'
 *  - source='recipe'           → 'Forge: Recipe source'
 *  - source='python'           → 'Forge: Python source'
 *  - source=null + isV2=true   → 'probe failed' (defensive; reveals hash-helper bugs)
 */
export function sourceLayerStatusLabel(
  isV2: boolean,
  source: SourceLayer | null,
): string {
  if (!isV2) return '';
  if (source === null) return 'Forge: probe failed';
  if (source === 'synced') return 'Forge: synced';
  if (source === 'description') return 'Forge: Description source';
  if (source === 'recipe') return 'Forge: Recipe source';
  if (source === 'python') return 'Forge: Python source';
  // Exhaustive in the type system; defensive narrow for runtime.
  return '';
}

/** Tooltip text for hover. More verbose than the inline label;
 *  describes what the layer means for the next Forge-click.
 *
 *  Mirrors Phase 2 §3.1's source-aware Forge-click branches so
 *  cohort hovering the status bar learns what to expect WITHOUT
 *  clicking Forge first. */
export function sourceLayerStatusTooltip(
  source: SourceLayer | null,
): string {
  if (source === null) {
    return (
      'Forge source-layer probe failed. The 3-layer hash state '
      + 'machine couldn\'t determine which facet was last hand-edited. '
      + 'Forge-click will fall through to the standard transpile path.'
    );
  }
  if (source === 'synced') {
    return (
      'All three facets (Description / Recipe / Python) match their '
      + 'stored hashes — no hand-edits since the last /generate or '
      + 'Forge-click. Forge-click will re-transpile cleanly.'
    );
  }
  if (source === 'description') {
    return (
      'Description was hand-edited since the last /generate. Forge-'
      + 'click will auto-run the full pipeline: regenerate Recipe + '
      + 'Python from Description, then execute.'
    );
  }
  if (source === 'recipe') {
    return (
      'Recipe was hand-edited since the last Forge-click. The Python '
      + 'facet is stale. Forge-click will re-transpile your edited '
      + 'Recipe → fresh Python (the standard V2 flow).'
    );
  }
  if (source === 'python') {
    return (
      'Python facet was hand-edited since the last Forge-click. '
      + 'Forge-click will run your edited Python AS-IS — no transpile, '
      + 'no overwrite (Path Y / engineer mode for V2).'
    );
  }
  return '';
}

/** v0.2.286 back-compat aliases — the exported names were
 *  `canonicalLayerStatusLabel` / `canonicalLayerStatusTooltip` before
 *  the S9 field rename. External callers can continue to import the old
 *  names for one release cycle. TODO: delete in v0.2.290. */
export const canonicalLayerStatusLabel = sourceLayerStatusLabel;
export const canonicalLayerStatusTooltip = sourceLayerStatusTooltip;
