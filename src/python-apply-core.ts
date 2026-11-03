// 2026-11-02-1155 (score_first M16b, design 4.14) - "Update from Python": the pure core of what a hand-edited PYTHON means. Of the three facets of a phrase, arrangement or composition note each may be the one a person edited by hand (the
// stamps say which); the note is written by the controls, the Python is then derived text with a hash. A Python that is one of the KNOWN SHAPES maps back (`parsePython`): the params it says are applied and every other part is made again from
// them, as for a Description or a Recipe. Anything else is a CUSTOM note: its Python is the note. Which facet a person changed is decided together with the other two (description-apply-core.ts `descriptionState`, which calls this): two or three
// changed is a refusal naming them. No `obsidian` import.
import { descriptionEditedByHand, isCustomNote, pythonEditedByHand, pythonTextOf, recipeEditedByHand } from './phrase-notes-core.ts';
import { parsePython } from './python-grammar-core.ts';
import { BOTH_EDITED } from './recipe-apply-core.ts';
import type { GrammarParams } from './phrase-grammar-core.ts';

export type Facet = 'description' | 'recipe' | 'python';
export const FACET_NAMES: Record<Facet, string> = { description: 'Description', recipe: 'Recipe', python: 'Python' };

/** The facets a person changed by hand since the note was written, in the order of the chain. A CUSTOM note's Description and Recipe are free text (their own freshness, as any Forge note's): only its Python counts. */
export function editedFacetsOf(text: string): Facet[] {
  const custom = isCustomNote(text);
  const out: Facet[] = [];
  if (!custom && descriptionEditedByHand(text)) out.push('description');
  if (!custom && recipeEditedByHand(text)) out.push('recipe');
  if (pythonEditedByHand(text)) out.push('python');
  return out;
}

/** The one sentence when a person changed two or three facets since the note was written: the bar offers one button for each. Two of Description and Recipe say it as they always did. */
export function bothEditedMessage(facets: readonly Facet[]): string {
  if (facets.length === 2 && facets[0] === 'description' && facets[1] === 'recipe') return BOTH_EDITED;
  const names = facets.map((f) => FACET_NAMES[f]);
  const said = facets.length === 2 ? `${names[0]} and ${names[1]} were both edited` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} were all edited`;
  return `${said}; keep one: ${names.map((n) => `Update from ${n}`).join(' / ')}.`;
}

export type PythonEdit =
  | { kind: 'none' }
  | { kind: 'apply'; python: string; params: GrammarParams }
  | { kind: 'custom'; python: string };

/** What the Python of this note says right now, when a person edited it by hand (its stamp no longer matches): `none` when it was not. `hint` is the params the json cache holds now. Pure. */
export function pythonEdit(text: string, hint: GrammarParams | null): PythonEdit {
  if (!pythonEditedByHand(text)) return { kind: 'none' };
  const python = pythonTextOf(text) ?? '';
  const res = parsePython(python, hint);
  return res.ok ? { kind: 'apply', python, params: res.params } : { kind: 'custom', python };
}

export const pythonAppliedLine = (name: string, change: string): string => `[forge-python] applied ${name} (${change})`;
export const pythonCustomLine = (name: string): string => `[forge-python] ${name} is now a custom note (its Python is not a shape the grammar knows)`;
export const pythonRevertedLine = (name: string): string => `[forge-python] reverted ${name} to the grammar's Python (from the json cache)`;
export const bothEditedLineOf = (name: string, facets: readonly Facet[]): string => `[forge-python] refused ${name}: ${bothEditedMessage(facets)}`;
