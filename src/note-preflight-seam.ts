// 2026-10-31-1135 - the leaf of the pre-write check (no imports, so phrase-core, arrangement and composition flows can all hold it without a cycle): the TYPE of the check and the ONE seam the plugin installs at load.
// note-preflight-core.ts builds the real check out of the producers and the engine.

/** The path the note is about to be written at and its text. `null` = nothing to refuse; a string = ONE plain sentence saying why this note cannot be made (and the caller writes nothing). */
export type NotePreflight = (path: string, content: string) => Promise<string | null>;

let installed: NotePreflight | null = null;
/** The plugin installs the engine-backed check once, at load (the Obsidian glue knows the vault and the engine); a flow with no port of its own asks this. `null` = none (the pure tests; a surface without an engine). */
export const installNotePreflight = (fn: NotePreflight | null): void => { installed = fn; };
export const installedNotePreflight = (): NotePreflight | null => installed;
