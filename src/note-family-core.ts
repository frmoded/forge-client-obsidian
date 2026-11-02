// 2026-10-31-1140 (M16a) - which kind of derived note a path is, and which grammar sentences belong to it. Moved here, unchanged, from description-apply-core.ts so the Description core AND the Recipe core (which the Description core calls) both
// read it without importing each other. A leaf of the three note cores: no `obsidian`.
import { isPhrasePath } from './phrase-core.ts';
import { isArrangementPath } from './arrangement-core.ts';
import { isCompositionPath } from './composition-core.ts';

export type Family = 'phrase' | 'arrangement' | 'composition';

/** Which kind of derived note a path is (and so which writer and which grammar sentences belong to it); null = not one of ours. */
export function familyOfPath(path: string): Family | null {
  if (isPhrasePath(path)) return 'phrase';
  if (isArrangementPath(path)) return 'arrangement';
  if (isCompositionPath(path)) return 'composition';
  return null;
}

export const FAMILY_KINDS: Record<Family, readonly string[]> = { phrase: ['extend', 'mix', 'morph', 'transform'], arrangement: ['arrangement'], composition: ['composition'] };
export const WORD: Record<string, string> = { extend: 'a phrase', mix: 'a phrase', morph: 'a phrase', transform: 'a phrase', arrangement: 'an arrangement', composition: 'a composition' };

/** null = the kind belongs to the family; else the sentence (without a place) saying this note is one kind and `what` ("the sentence", "the Recipe") describes another. */
export function wrongKindSentence(family: Family, kind: string, what: string): string | null {
  if (FAMILY_KINDS[family].includes(kind)) return null;
  return `this note is ${WORD[`${family === 'phrase' ? 'extend' : family}`]}, but ${what} describes ${WORD[kind]}; make a new note for that`;
}
