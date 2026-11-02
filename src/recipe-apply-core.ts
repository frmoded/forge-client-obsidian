// 2026-10-31-1140 (M16a, design 4.14) - "Update from Recipe": the pure core of what a hand-edited RECIPE means. A phrase, arrangement or composition note is written by the controls (and by Update from Description): its Recipe is derived text, with a hash.
// When the PERSON edits the Recipe, the hash no longer matches and the Recipe is the source: it parses (apply it: the Description, Python, json cache and stamps are made again from it), or it does not (write nothing, say where). Which of the two
// facets a person changed is decided together with the Description's own state (description-apply-core.ts `descriptionState`, which calls this): both changed is a refusal naming both. No `obsidian` import.
import { parseFrontmatter } from './rhythm-edit-core.ts';
import { extractPhraseJsonBlock, recipeEditedByHand } from './phrase-notes-core.ts';
import { extractRecipeSection } from './v2-note-core.ts';
import { parseRecipe } from './recipe-grammar-core.ts';
import { wrongKindSentence, type Family } from './note-family-core.ts';
import type { GrammarError, GrammarParams, GrammarVault } from './phrase-grammar-core.ts';

/** The Python is derived from the Recipe and the Recipe from the params: a hand edit of the Python alone is said, not applied. */
export const PYTHON_DERIVED = 'Python is derived; edit the Description or the Recipe.';
/** The one sentence when a person changed BOTH facets since the note was written: the bar offers the two buttons. */
export const BOTH_EDITED = 'Description and Recipe were both edited; keep one: Update from Description / Update from Recipe.';

export type RecipeEdit =
  | { kind: 'none' }
  | { kind: 'rejected'; recipe: string; error: GrammarError; message: string }
  | { kind: 'apply'; recipe: string; params: GrammarParams };

/** `Recipe, line 3, column 1: I do not know the step 'Sprinkle'. ...` - one sentence: the reader's own words, a grammar "Expected ..." with a lower-case start (an "I do not know" keeps its capital). */
export function recipeRejectionMessage(error: GrammarError): string {
  const m = error.message.length > 0 ? (/^Expected\b/.test(error.message) ? error.message[0].toLowerCase() + error.message.slice(1) : error.message) : 'it could not be read';
  return `Recipe, line ${error.line}, column ${error.column}: ${m}`;
}

/** What the Recipe of this note says right now, when a person edited it by hand (the stamp no longer matches): `none` when it was not. Pure; `vault` is what the names are checked against. */
export function recipeEdit(text: string, family: Family, vault: GrammarVault): RecipeEdit {
  if (!parseFrontmatter(text) || extractPhraseJsonBlock(text).ok === false) return { kind: 'none' };           // not a data note of ours: nothing to say
  if (!recipeEditedByHand(text)) return { kind: 'none' };
  const recipe = extractRecipeSection(text) ?? '';
  const res = parseRecipe(recipe, vault);
  if (res.ok === false) return { kind: 'rejected', recipe, error: res.error, message: recipeRejectionMessage(res.error) };
  const wrong = wrongKindSentence(family, res.params.kind, 'the Recipe');
  if (wrong !== null) { const error = { message: wrong, line: 1, column: 1 }; return { kind: 'rejected', recipe, error, message: recipeRejectionMessage(error) }; }
  return { kind: 'apply', recipe, params: res.params };
}

export const recipeAppliedLine = (name: string, change: string): string => `[forge-recipe] applied ${name} (${change})`;
export const recipeRejectedLine = (name: string, e: GrammarError): string => `[forge-recipe] rejected ${name}: line ${e.line} column ${e.column} ${e.message}`;
export const recipeRevertedLine = (name: string): string => `[forge-recipe] reverted ${name} to the json cache`;
export const bothEditedLine = (name: string): string => `[forge-recipe] refused ${name}: ${BOTH_EDITED}`;
