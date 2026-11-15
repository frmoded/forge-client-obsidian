// 2026-11-15-1217 - two switches for the music tabs (phrase, arrangement, composition), both OFF by default: the prompt box and the dialog do the inputting now, and the Score does the pointing.
//   SHOW_LEGACY_CONTROLLERS  the strips that INPUT a value (the phrase strips: Bars / Style / Tempo, the mix, morph and transform strips; the arrangement's row per kit; the notebook of a phrase and of a composition)
//   SHOW_INSPECTOR           the "Where did this bar come from?" box under the Score (its code, its tests and its pin / hover / highlight stay; only its box is not put on the page)
// A tab reads them WHEN IT MOUNTS (a change in the settings takes effect on reopening a tab). Pure: no obsidian import, so a test fixes the source.
export const SHOW_LEGACY_CONTROLLERS = false;
export const SHOW_INSPECTOR = false;
export interface UiFlags { showLegacyControllers: boolean; showInspector: boolean }
export const DEFAULT_UI_FLAGS: UiFlags = { showLegacyControllers: SHOW_LEGACY_CONTROLLERS, showInspector: SHOW_INSPECTOR };

/** The flags a settings object holds: only a real boolean counts, anything else (absent, a string, null) is the default. */
export function readUiFlags(settings: { showLegacyControllers?: unknown; showInspector?: unknown } | null | undefined): UiFlags {
  return {
    showLegacyControllers: typeof settings?.showLegacyControllers === 'boolean' ? settings.showLegacyControllers : DEFAULT_UI_FLAGS.showLegacyControllers,
    showInspector: typeof settings?.showInspector === 'boolean' ? settings.showInspector : DEFAULT_UI_FLAGS.showInspector,
  };
}

let source: () => UiFlags = () => DEFAULT_UI_FLAGS;
/** The plugin registers where the flags come from (its settings); a view asks `uiFlags()` when it mounts. Without a source the defaults (both off) are what a view gets. */
export function registerUiFlagsSource(fn: (() => UiFlags) | null): void { source = fn ?? (() => DEFAULT_UI_FLAGS); }
export function uiFlags(): UiFlags { try { return source(); } catch { return DEFAULT_UI_FLAGS; } }
