// 2026-11-23-1023 (Part A) - the Forge button, ALWAYS there on a phrase, an arrangement and a composition (music edition), in the note's text view and in each Score tab: "apply the Description now". 1018 showed the button only while an edit was
// pending, and the driver (on comp_001, nothing pending) saw none. The controller's `forge(path)` does the work (description-apply.ts); this core is the button: which notes get it, and the runner the plugin hands in once the controller exists.
// Lean never has it (`listModel.script.on` is false there: a hand edit is applied at once and there is no Forge to press).
import { isScoreNotePath } from './note-score-core.ts';
import { listModel } from './list-model-selected.ts';
import { addQuietAction, type ActionHost } from './sr-label-core.ts';

export const FORGE_ICON = 'hammer';
export const FORGE_TITLE = 'Forge';

let runner: ((path: string) => void) | null = null;
/** score-first.ts hands in the controller's forge once it exists (and takes it back, `null`, when the plugin unloads). */
export function setForgeRunner(fn: ((path: string) => void) | null): void { runner = fn; }
/** Which note gets the button: a phrase, an arrangement or a composition, in the music edition. */
export const wantsForge = (path: string | null | undefined): boolean => listModel.script.on && isScoreNotePath(path);
/** The click: the note this view shows NOW (a view is reused when its tab navigates). */
export const clickForge = (path: string | null | undefined): void => { if (path && wantsForge(path)) runner?.(path); };
/** A Score view puts the button on its header (where "Open as Forge note" and "Restore to last commit" are). */
export function addForgeAction(view: ActionHost & { file?: { path: string } | null }): void {
  if (listModel.script.on) addQuietAction(view, FORGE_ICON, FORGE_TITLE, () => { clickForge(view.file?.path); });
}
