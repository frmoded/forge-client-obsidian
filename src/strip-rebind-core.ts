// Drain 2026-08-25-0100 §1 — when the Inputs strip may rebind.
//
// THE INCIDENT. Clicking the Forge panel's Run button greyed the whole
// strip. Clicking Run moves focus INTO the panel leaf, so
// `active-leaf-change` fires with `leaf.view` = the panel itself.
// `refreshForgePanelStrip` had no file to bind to (the event's leaf is
// not a MarkdownView, and the workspace re-query is null once the
// active leaf is a side panel), so the strip bound to nothing and fell
// to its `stale` state: dimmed, disabled, and captioned "The open note
// is not an action note" — about a note that IS one.
//
// Measured, not assumed: the FIRST run still dispatched (it was
// submitted before the re-render), but the strip then refused a SECOND
// run until the user clicked back into the note. So this was never
// visual-only. Drain 2370's widening of the dimming from body to
// title+body is why it now reads as "the ENTIRE run section".
//
// THE RULE. A leaf change onto something that is not a markdown leaf
// is not a note switch — it is the user looking at a tool. The strip
// keeps whatever it was bound to.
//
// WHAT THIS DELIBERATELY DOES NOT CHANGE: a markdown leaf holding a
// note that is not an action note still greys. That is CCQA check-2
// behaviour and it is correct — the user really did navigate away to
// something the strip cannot run. The distinction is the LEAF's type,
// never the note's.

/** What the caller knows about the event that prompted a refresh. */
export interface StripRebindEvent {
  /** An `active-leaf-change` handed us a leaf. */
  leafGiven: boolean;
  /** That leaf's view is a MarkdownView. Meaningless when `leafGiven`
   *  is false. */
  leafIsMarkdown: boolean;
  /** A `file-open` handed us a concrete file. */
  fileGiven: boolean;
}

/**
 * Should the strip re-derive what it is bound to?
 *
 * `false` only for the one case that caused the bug: a leaf change
 * that landed somewhere that is not a markdown leaf. Everything else
 * rebinds, including both no-event calls — the initial wire-up has
 * neither leaf nor file and must still paint, or the strip would never
 * appear when the panel is opened on an already-open note.
 *
 * A concrete file outranks the leaf's type: if a caller ever hands us
 * both, the file is the better evidence.
 */
export function shouldRebindStrip(ev: StripRebindEvent): boolean {
  if (ev.fileGiven) return true;
  if (!ev.leafGiven) return true;
  return ev.leafIsMarkdown;
}
