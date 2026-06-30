// v0.2.217 — Pure-core for reading the freshest content of an active
// markdown view.
//
// Driver smoke against v0.2.215: edit Recipe → Forge-click → output
// shows OLD message; second click shows NEW message. Root cause: the
// pre-flight disk→MEMFS sync + canonical-layer probe both called
// `vault.read(view.file)` which reads from DISK. When the user edits
// the editor and clicks Forge within ~1 second, Obsidian's autosave
// hasn't fired yet → disk still has the pre-edit content. The engine
// reads stale Recipe from MEMFS, transpiles + runs stale Python,
// output is wrong. On the second click, autosave has caught up;
// disk + MEMFS finally have the fresh Recipe.
//
// Fix: read from the EDITOR BUFFER instead of from disk. The buffer
// reflects the user's just-typed keystrokes immediately, no autosave
// delay. Falls back to vault.read when the view doesn't have an editor
// (e.g., custom ItemView subclasses like the engine-chip view).

/** Minimal view shape we need — duck-typed against Obsidian's
 *  MarkdownView. Decoupled so the pure-core is testable without an
 *  Obsidian runtime. */
export interface ViewWithMaybeEditor {
  editor?: { getValue(): string } | null;
  file?: { path: string } | null;
}

/** Minimal vault shape — for the disk fallback. */
export interface VaultReader {
  read(file: { path: string }): Promise<string>;
}

/** Return the freshest content for the active view. Editor buffer
 *  wins when present (live, no autosave delay); falls back to disk
 *  read when editor is absent or empty.
 *
 *  - editor present + non-empty → editor buffer
 *  - editor present + empty string → editor buffer (empty IS the
 *    user's intent; don't fall through to disk)
 *  - editor missing (null/undefined) → vault.read(file)
 *  - editor missing AND file missing → throws
 *
 *  Per cc-prompt-queue HARD RULE (v0.2.18 / v0.2.102 lineage): the
 *  active editor's value is the canonical source of truth for what
 *  the user wants Forge to run. Disk content lags by up to autosave-
 *  interval seconds; the v0.2.102 pre-flight read disk to fight a
 *  related stale-MEMFS race but missed this layer.
 */
export async function readActiveNoteFresh(
  view: ViewWithMaybeEditor,
  vault: VaultReader,
): Promise<string> {
  if (view.editor && typeof view.editor.getValue === 'function') {
    return view.editor.getValue();
  }
  if (!view.file) {
    throw new Error(
      'readActiveNoteFresh: view has neither editor nor file — '
      + 'cannot determine source for fresh content.',
    );
  }
  return await vault.read(view.file);
}
