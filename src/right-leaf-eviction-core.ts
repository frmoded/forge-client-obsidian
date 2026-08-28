// Drain 2026-08-28-0910 §3/§4 — the right-sidebar leaf-eviction bug.
//
// THE BUG (R5, R6). `openChipsView`, `getOutputView`, and the "Open 3D
// View" command each check for an EXISTING leaf of their OWN view type
// (`getLeavesOfType(X)[0]`) and, finding none, call
// `this.app.workspace.getRightLeaf(false)` unconditionally. Obsidian's
// `getRightLeaf(false)` returns the right sidebar's existing leaf (or
// creates the FIRST one if the sidebar is empty) with no regard to what
// view that leaf currently holds. `setViewState` then REPLACES that
// leaf's content in place.
//
// So: Forge panel open, right sidebar has exactly one leaf, holding it.
// Click chips → `openChipsView` finds no forge-chips leaf → calls
// `getRightLeaf(false)` → gets the SAME leaf → overwrites it with the
// chips view. The Forge panel is not closed by any explicit code path;
// it is evicted by leaf reuse. This is deterministic given Obsidian's
// documented split-vs-reuse contract (obsidian.d.ts:7002,
// `getRightLeaf(split: boolean)`) — confirmed by reading the three call
// sites and the API signature, not by live reproduction (this session
// has no tool that drives the Obsidian desktop app).
//
// THE FIX. Before reusing the candidate leaf, check whether it already
// holds a DIFFERENT Forge-family view. If so, split instead
// (`getRightLeaf(true)`) rather than evict. Reuse is still correct —
// and still exactly matches pre-fix behaviour — when the leaf is empty,
// already holds the type being opened, or holds something outside the
// Forge family (an unrelated Obsidian pane); this fix's whole job is
// narrowing eviction to the one case the driver did not ask for:
// Forge panel evicting Forge panel.

/** The Forge plugin's own right-sidebar-capable view types. Kept here
 *  (not imported from the view modules) so this pure-core has no
 *  `obsidian` import and runs under `node --test`. */
export const FORGE_RIGHT_SIDEBAR_VIEW_TYPES = [
  'forge-output', 'forge-chips', 'forge-three',
  // Drain 2026-08-28-0910 — not named in the prompt's three call
  // sites, but found via a full sweep of getRightLeaf(false) call
  // sites and confirmed to be the identical bug shape (see FEEDBACK).
  // The prompt's own §3 reasoning generalizes: 'if it has the same
  // bug, that's the same fix in three places, not one' — extended
  // here to four.
  'forge-edges-view',
] as const;

export type RightLeafPlacement = 'reuse' | 'split';

/** Should opening `wantType` reuse the leaf `getRightLeaf(false)` would
 *  return, or force a new split leaf instead?
 *
 *  `currentViewType` is what that candidate leaf currently holds, or
 *  `null` when the right sidebar has no leaf at all yet (nothing to
 *  evict — `getRightLeaf(false)` creates the first one). */
export function decideRightLeafPlacement(
  currentViewType: string | null,
  wantType: string,
  knownForgeViewTypes: readonly string[] = FORGE_RIGHT_SIDEBAR_VIEW_TYPES,
): RightLeafPlacement {
  if (currentViewType === null) return 'reuse';
  if (currentViewType === wantType) return 'reuse';
  if (knownForgeViewTypes.includes(currentViewType)) return 'split';
  // An unrelated pane (file explorer, search, a community plugin's
  // panel, …). Unchanged from pre-fix behaviour — this fix's scope is
  // Forge-vs-Forge eviction only, not a general "never evict anything"
  // policy nobody asked for.
  return 'reuse';
}
