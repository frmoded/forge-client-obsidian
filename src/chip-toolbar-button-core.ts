// Pure-core decision: should the chip-palette toolbar button appear
// in the editor's right-side action bar for the active markdown view?
//
// v0.2.46 — user-reported gap: the dedicated chip palette icon "used
// to exist and now feels missing." Investigation found the existing
// editor-toolbar puzzle button at main.ts:752-757 was gated on
// `chipPalette.length > 0`. In a vault with no chips loaded (the
// surfacing case), the button never appeared — the same discoverability
// trap that c3848d9 fixed for the action-menu entry. This helper drops
// the chipPalette gate and substitutes a file-type gate: the button
// shows on action snippets always (chips view's empty-state messaging
// handles the no-chips-yet discovery), hides on data/snapshot/non-
// snippet markdown (chip insertion is meaningful in action-snippet
// authoring only).
//
// Pure-core extraction No. 15. Same `node --test` convention as the
// fourteen prior extractions.

/** Context the toolbar-button decision needs. */
export interface ChipToolbarButtonContext {
  /** The frontmatter `type` field of the active markdown file, or
   *  undefined if the file has no frontmatter / no type field. */
  fileType: string | undefined;
  /** Number of chips currently loaded for the active vault. Currently
   *  IGNORED by the decision — chip emptiness is discovered via the
   *  chips view's empty-state messaging, not by button suppression.
   *  Kept on the signature for forward-compat: a future refinement
   *  could use it (e.g., suppress on action snippets with empty
   *  palette AND a special "_chips.md is intentionally missing"
   *  marker file). */
  chipsCount: number;
}

/** Decide whether to add the chip-palette toolbar button to the
 *  editor's right-side action bar.
 *
 *  Returns true iff the active file is an `action` snippet. Data
 *  snippets are typed-value declarations that don't compute (no
 *  outbound `context.compute()` calls), so chip-inserted snippet
 *  references don't apply. Snapshot snippets are auto-generated;
 *  no authoring context. Non-snippet markdown views (plain notes)
 *  pay the visual-presence cost the original e4ed813 retirement
 *  rationale called out; honor that.
 *
 *  v0.2.46 explicitly diverges from the URGENT prompt's §1.1 case 4
 *  ("no chips for vault → false"). That case IS the discoverability
 *  trap the user reported. Closing it follows the c3848d9 precedent
 *  for the action-menu entry. */
export function shouldShowChipsToolbarButton(
  ctx: ChipToolbarButtonContext,
): boolean {
  return ctx.fileType === 'action';
}
