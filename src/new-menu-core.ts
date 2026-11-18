// 2026-11-16-1102 - a "+ New" button in the header of the music tabs (the phrase, the bar, the arrangement and the composition tab): the same four actions as the ribbon's buttons (New phrase, New arrangement, New composition, New bar) with the same icons,
// for the driver who does not see the ribbon's (the ribbon has no scrolling: an icon below its box is cut off). It runs the plugin's own commands by id, like the ribbon, and says why when one is not offered. Pure: no obsidian (the views and the menu are injected).
import { addQuietAction } from './sr-label-core.ts';
import { MUSIC_RIBBON, type RibbonDeps, type RibbonItem } from './music-ribbon-core.ts';
import { PHRASE_VIEW_TYPE } from './phrase-core.ts';
import { RHYTHM_EDIT_VIEW_TYPE } from './rhythm-edit-core.ts';
import { RHYTHM_SCORE_VIEW_TYPE } from './rhythm-mode-core.ts';
import { ARRANGEMENT_VIEW_TYPE } from './arrangement-core.ts';
import { COMPOSITION_VIEW_TYPE } from './composition-core.ts';

export const NEW_MENU_TITLE = 'New';
export const NEW_MENU_ICON = 'plus';
/** The tabs that get the button (view type ids). */
export const NEW_MENU_VIEW_TYPES: readonly string[] = [PHRASE_VIEW_TYPE, RHYTHM_EDIT_VIEW_TYPE, RHYTHM_SCORE_VIEW_TYPE, ARRANGEMENT_VIEW_TYPE, COMPOSITION_VIEW_TYPE];

export const newMenuItems = (): readonly RibbonItem[] => MUSIC_RIBBON;
/** An entry of the menu was chosen: run its command; when it is not offered, say why (the ribbon's words). */
export function runNewMenuItem(item: RibbonItem, deps: Pick<RibbonDeps, 'pluginId' | 'runCommand' | 'notify'>): void {
  if (!deps.runCommand(`${deps.pluginId}:${item.commandId}`)) deps.notify(item.unavailable);
}

export interface NewMenuView { addAction(icon: string, title: string, callback: (evt: MouseEvent) => void): HTMLElement }
export interface NewMenuDeps<V extends NewMenuView> {
  /** The vault is a music vault, asked live on every sync. */
  isMusicVault(): boolean;
  /** The button was pressed in `view`: open the menu at the pointer. */
  show(view: V, evt: MouseEvent): void;
}
/** Give every tab the button, ONCE (Obsidian reuses a view when a tab navigates; a second call adds nothing). Returns how many got it now. A tab that cannot take an action is skipped. */
export function createNewMenuSync<V extends NewMenuView>(deps: NewMenuDeps<V>): { sync(views: Iterable<V>): number } {
  const have = new WeakSet<object>();
  return {
    sync(views) {
      if (!deps.isMusicVault()) return 0;
      let n = 0;
      for (const view of views) {
        if (have.has(view) || typeof view.addAction !== 'function') continue;                      // a tab that has no header actions is not an error
        try { addQuietAction(view, NEW_MENU_ICON, NEW_MENU_TITLE, (evt) => { deps.show(view, evt); }); have.add(view); n++; }
        catch (e) { console.error('createNewMenuSync: a tab could not take the "+ New" button', e); }
      }
      return n;
    },
  };
}
