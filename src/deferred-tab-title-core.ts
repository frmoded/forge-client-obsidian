// 2026-11-03-1155-8 (D1, CCQA smoke 12): after "Reload app without saving" a restored tab that has not been opened yet is a DEFERRED leaf: its view is not built, so Obsidian titles it with the view type
// (`forge-phrase`). The note it will show is in the leaf's saved view state; this names the tab from it without loading the view (loading every restored Score would render every one of them at start-up).
// Pure: no `obsidian`, no DOM.
import { ARRANGEMENT_VIEW_TYPE } from './arrangement-core.ts';
import { COMPOSITION_VIEW_TYPE } from './composition-core.ts';
import { PHRASE_VIEW_TYPE } from './phrase-core.ts';

const OURS: readonly string[] = [PHRASE_VIEW_TYPE, ARRANGEMENT_VIEW_TYPE, COMPOSITION_VIEW_TYPE];

/** The tab title for a not-yet-loaded leaf of one of our note views: the note's name from its saved state (`null` = not ours, or no file in the state). */
export function deferredTabName(viewType: string, state: unknown): string | null {
  if (!OURS.includes(viewType)) return null;
  const file = (state as { file?: unknown } | null | undefined)?.file;
  if (typeof file !== 'string' || file === '') return null;
  return file.replace(/^.*\//, '').replace(/\.md$/, '');
}
