// v0.2.77 — pure-core predicate for the editor-toolbar Forge button
// visibility gate. Pre-v0.2.77 the button appeared on every markdown
// file in the vault, including non-snippet notes (e.g. chapter
// lesson notes like forge-tutorial/01-hello/Hello.md). Clicking it
// errored with no helpful feedback.
//
// Decision: show the Forge button only when the file's frontmatter
// declares `type: action` or `type: data` (the two snippet types
// Forge can actually run). Plain notes (no type) → no button.
// Snapshots (`type: snapshot`) → no button (system-managed; users
// don't author them, and Forge-clicking them is meaningless).
//
// Same predicate is also applied to the edges panel toggle — edges
// are inherently per-snippet, so the button is moot on a plain note.
//
// The New Snippet button stays unconditional — it's a vault-level
// action that's useful from any note (lets you bootstrap a snippet
// while reading a lesson).

/** Minimal frontmatter shape this predicate consults. Accepts the
 *  underlying record-of-unknowns shape that Obsidian's metadataCache
 *  produces; we only care about `type`. */
export interface ForgeButtonGateFrontmatter {
  type?: unknown;
}

/** True if the Forge button should appear in the editor toolbar for
 *  a file with the given frontmatter. False for:
 *  - undefined / null fm (no frontmatter — plain note).
 *  - fm without a `type` field.
 *  - fm with `type` of any non-snippet value (including 'snapshot').
 *  True only for `type: 'action'` or `type: 'data'`.
 *
 *  Symmetric: the same predicate gates the edges panel toggle. */
export function forgeButtonShouldShow(
  fm: ForgeButtonGateFrontmatter | undefined | null,
): boolean {
  if (!fm) return false;
  const t = fm.type;
  return t === 'action' || t === 'data';
}
