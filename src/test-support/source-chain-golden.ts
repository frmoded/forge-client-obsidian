// 2026-10-30-1050 (M15b) - what the goldens of a phrase or arrangement note need to say about the source chain WITHOUT asking the code under test: the six frontmatter stamps, hashed here with node:crypto over a normalization
// written out again (trailing blanks off every line, the blank lines around the facet off), so a golden fails if the writer's hash and the Forge hash ever disagree. The sentences and steps in a golden are spelled out by the test.
import { createHash } from 'node:crypto';

export const facetSha = (text: string): string => createHash('sha256').update(text.split('\n').map((l) => l.replace(/[\s﻿\xA0]+$/, '')).join('\n').replace(/^\n+|\n+$/g, '')).digest('hex');

/** The six stamp lines of a note whose `# Description` is `sentence`, `# Recipe` is the steps one per line and `# Python` is the code, in the order the writer puts them. */
export function chainStampLines(sentence: string, recipeSteps: string[], python: string): string[] {
  const d = facetSha(sentence), r = facetSha(recipeSteps.join('\n')), p = facetSha(python);
  return ['source_facet: description', `description_hash: ${d}`, `recipe_hash: ${r}`, `python_hash: ${p}`, `recipe_derived_from_description_hash: ${d}`, `python_derived_from_recipe_hash: ${r}`];
}
