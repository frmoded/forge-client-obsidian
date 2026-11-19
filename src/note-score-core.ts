// 2026-11-19-0990 - which Score tab shows a note of the three sentence-driven families (phrase, arrangement, composition), and what the Beat Box's gate says about one. Pure: no obsidian import, no DOM.
//
// The incident (driver 2026-11-19): a composition reopened from the file list was a plain note, and the header's "Open as Score" (the BAR's button: it wants the whole body to be exactly one json fence) refused with that sentence. Until now only a phrase
// was routed to its Score (phrase-default-view-core.ts); the arrangement and the composition were left to the "Open ... as Score" palette commands, and the Beat Box's header buttons were offered on every `type: data, content_type: json` note.
import { familyOfPath, type Family } from './note-family-core.ts';
import { PHRASE_VIEW_TYPE } from './phrase-core.ts';
import { ARRANGEMENT_VIEW_TYPE } from './arrangement-core.ts';
import { COMPOSITION_VIEW_TYPE } from './composition-core.ts';

/** The view type of the Score tab of each family. */
export const SCORE_VIEW_TYPE_OF: Readonly<Record<Family, string>> = { phrase: PHRASE_VIEW_TYPE, arrangement: ARRANGEMENT_VIEW_TYPE, composition: COMPOSITION_VIEW_TYPE };
/** Every Score tab of the three families. */
export const SCORE_VIEW_TYPES: readonly string[] = [PHRASE_VIEW_TYPE, ARRANGEMENT_VIEW_TYPE, COMPOSITION_VIEW_TYPE];
/** How a note of each family is called in a sentence to the person. */
export const FAMILY_WORD: Readonly<Record<Family, string>> = { phrase: 'a phrase', arrangement: 'an arrangement', composition: 'a composition' };

/** The Score tab that shows this note, or null when the path is not a phrase, an arrangement or a composition (a README, a bar, a note elsewhere). */
export function scoreViewTypeOf(path: string | null | undefined): string | null {
  const family = typeof path === 'string' ? familyOfPath(path) : null;
  return family === null ? null : SCORE_VIEW_TYPE_OF[family];
}
/** Is this a note whose default view is a Score tab (a phrase, an arrangement or a composition)? */
export const isScoreNotePath = (path: string | null | undefined): boolean => scoreViewTypeOf(path) !== null;

/**
 * What the Beat Box / the bar's Score say when the note is not rhythm data: the gate's own words for a bar (`message`, unchanged), and for a phrase, an arrangement or a composition a sentence that says what the note is and where its Score is
 * (never the bar gate's "exactly one fenced json block": a sentence-driven note has a Description and a Recipe above its cache by design). `lead` is the gate's usual lead ("Score", "Edit rhythm").
 */
export function rhythmRefusalWords(path: string | null | undefined, lead: string, message: string): string {
  const family = typeof path === 'string' ? familyOfPath(path) : null;
  if (family === null) return `${lead}: ${message}`;
  return `This is ${FAMILY_WORD[family]}, not a bar: the Beat Box and the bar Score cannot open it. Use the "Open as Score" button of the note.`;
}
