// 2026-11-15-1217 - two switches for the music tabs (phrase, arrangement, composition), both OFF by default (a third, SHOW_SOURCE_CHIPS, 2026-11-15-2101): the prompt box and the dialog do the inputting now, and the Score does the pointing.
//   SHOW_LEGACY_CONTROLLERS  the strips that INPUT a value (the phrase strips: Bars / Style / Tempo, the mix, morph and transform strips; the arrangement's row per kit; the notebook of a phrase and of a composition)
//   SHOW_INSPECTOR           the "Where did this bar come from?" box under the Score (its code, its tests and its pin / hover / highlight stay; only its box is not put on the page)
//   SHOW_BAR_NUMBERS         (default ON, the others are off) the bar number above the top staff at the start of every bar of the Score; read when a Score is engraved
//   SHOW_SOURCE_CHIPS        the chips row under the Score that says where the note came from (the notes behind what is drawn: a phrase's bars and sources, an arrangement's kits and phrases, a composition's sections); the code, the hover and the click stay, only the row is not put on the page
// A tab reads them WHEN IT MOUNTS (a change in the settings takes effect on reopening a tab). Pure: no obsidian import, so a test fixes the source.
export const SHOW_LEGACY_CONTROLLERS = false;
export const SHOW_INSPECTOR = false;
export const SHOW_SOURCE_CHIPS = false;
export const COMPOSER_AUTO_APPLY = true;                 // 2026-11-20-1002 (deliberate): MUSIC_COMPOSER_AUTO_APPLY is ON (was OFF since 2026-11-17-2001): ONE Enter applies a sentence the grammar reads completely
export const PREVIEW_BEFORE_APPLYING = !COMPOSER_AUTO_APPLY;   // 2026-11-20-1002: the setting `Preview before applying` (default off) is the switch's inverse: ON restores the two Enters
export const SHOW_BAR_NUMBERS = true;                    // 2026-11-16-0902: the one switch that is ON by default: a bar number at the start of every bar of the Score
export const FORGE_DESCRIPTION_AT_ONCE = false;           // 2026-11-23-1018 (deliberate): a hand edit of a phrase, arrangement or composition Description WAITS for the Forge button; the setting `Forge Description edits at once` ON restores the automatic replay
export interface UiFlags { showLegacyControllers: boolean; showInspector: boolean; showSourceChips: boolean; showBarNumbers: boolean; previewBeforeApplying: boolean; forgeDescriptionAtOnce: boolean }
export const DEFAULT_UI_FLAGS: UiFlags = { showLegacyControllers: SHOW_LEGACY_CONTROLLERS, showInspector: SHOW_INSPECTOR, showSourceChips: SHOW_SOURCE_CHIPS, showBarNumbers: SHOW_BAR_NUMBERS, previewBeforeApplying: PREVIEW_BEFORE_APPLYING, forgeDescriptionAtOnce: FORGE_DESCRIPTION_AT_ONCE };

/** The flags a settings object holds: only a real boolean counts, anything else (absent, a string, null) is the default. */
export function readUiFlags(settings: { showLegacyControllers?: unknown; showInspector?: unknown; showSourceChips?: unknown; showBarNumbers?: unknown; previewBeforeApplying?: unknown; forgeDescriptionAtOnce?: unknown } | null | undefined): UiFlags {
  return {
    showLegacyControllers: typeof settings?.showLegacyControllers === 'boolean' ? settings.showLegacyControllers : DEFAULT_UI_FLAGS.showLegacyControllers,
    showInspector: typeof settings?.showInspector === 'boolean' ? settings.showInspector : DEFAULT_UI_FLAGS.showInspector,
    showSourceChips: typeof settings?.showSourceChips === 'boolean' ? settings.showSourceChips : DEFAULT_UI_FLAGS.showSourceChips,
    showBarNumbers: typeof settings?.showBarNumbers === 'boolean' ? settings.showBarNumbers : DEFAULT_UI_FLAGS.showBarNumbers,
    previewBeforeApplying: typeof settings?.previewBeforeApplying === 'boolean' ? settings.previewBeforeApplying : DEFAULT_UI_FLAGS.previewBeforeApplying,
    forgeDescriptionAtOnce: typeof settings?.forgeDescriptionAtOnce === 'boolean' ? settings.forgeDescriptionAtOnce : DEFAULT_UI_FLAGS.forgeDescriptionAtOnce,
  };
}
/** 2026-11-20-1002: what the composer asks at every Enter: does a sentence the grammar reads apply at once? (The setting `Preview before applying` ON says no.) */
export const composerAutoApplyOf = (flags: UiFlags): boolean => !flags.previewBeforeApplying;

let source: () => UiFlags = () => DEFAULT_UI_FLAGS;
/** The plugin registers where the flags come from (its settings); a view asks `uiFlags()` when it mounts. Without a source the defaults (both off) are what a view gets. */
export function registerUiFlagsSource(fn: (() => UiFlags) | null): void { source = fn ?? (() => DEFAULT_UI_FLAGS); }
export function uiFlags(): UiFlags { try { return source(); } catch { return DEFAULT_UI_FLAGS; } }
