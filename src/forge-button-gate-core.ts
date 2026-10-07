// v0.2.77 — pure-core predicate for the editor-toolbar Forge button
// visibility gate. Pre-v0.2.77 the button appeared on every markdown
// file in the vault, including non-snippet notes (e.g. chapter
// lesson notes like forge-tutorial/01-hello/Hello.md). Clicking it
// errored with no helpful feedback.
//
// Decision: show the Forge button only when the file's frontmatter
// declares `type: action` (Phase 5c, 2026-10-07: `type: data` removed —
// see forgeButtonShouldShow). Plain notes (no type) → no button.
// Snapshots (`type: snapshot`) → no button (system-managed; users
// don't author them, and Forge-clicking them is meaningless).
//
// The edges panel toggle has its own predicate (edgesToggleShouldShow,
// action|data) — edges are inherently per-snippet, so the button is moot
// on a plain note, but a data note can have incoming edges.
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

/** True if the Forge (hammer) button should appear in the editor toolbar for a file with the given frontmatter. False for:
 *  - undefined / null fm (no frontmatter — plain note).
 *  - fm without a `type` field.
 *  - fm with `type` of any non-action value (including 'snapshot' and 'data').
 *  True only for `type: 'action'`.
 *
 *  Beat-as-data Phase 5c (drain 2026-10-07-0100): `type: data` was removed. The hammer derives facets (Recipe -> Python); a data note has
 *  none, so the engine's resolve_action_code returns None for every data note and the plugin falls back to the LLM (/generate) or a
 *  misleading "needs a token" notice. A data note's value is shown by the panel's data preview (file-open) and the panel is opened with
 *  the "Open Forge panel" command; nothing is lost. */
export function forgeButtonShouldShow(
  fm: ForgeButtonGateFrontmatter | undefined | null,
): boolean {
  if (!fm) return false;
  return fm.type === 'action';
}

/** True if the edges-panel toggle should appear: `type: action` or `type: data` (the pre-Phase-5c shared predicate, kept for the edges
 *  toggle only). The edges panel lists Outgoing AND Incoming call edges, and a data note is exactly what other notes call. */
export function edgesToggleShouldShow(
  fm: ForgeButtonGateFrontmatter | undefined | null,
): boolean {
  if (!fm) return false;
  const t = fm.type;
  return t === 'action' || t === 'data';
}
