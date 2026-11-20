// 2026-11-19-0999b - the words of the Extend head's STYLES and of an ORDER, in a leaf with no import but types: the Extend and Mix STEPS of a phrase (bar-structure-core.ts) say them in the head's own words, and phrase-describe-core.ts (which imports bar-structure-core.ts) says
// them in the heads: ONE definition each, re-exported by phrase-describe-core.ts so every importer is unchanged.
import type { MorphOrder, PhraseStyle } from './phrase-core.ts';

/** How a style is said. Keyed by `PHRASE_STYLES` (phrase-core.ts): a style that is added there and not here does not compile. */
export const STYLE_WORDS: Record<PhraseStyle, string> = { repeat_with_fills: 'repeating with fills', building: 'building up', ghost_notes: 'adding ghost notes' };
/** How an order is said: its engine name with the underscore a hyphen, then "order" (the notes' own words: `morphOrderWords` in phrase-core.ts says the same). */
export const orderWords = (order: MorphOrder): string => `${order.replace(/_/g, '-')} order`;
