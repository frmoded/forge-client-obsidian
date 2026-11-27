// 2026-11-26-1047 (deliberate): notes as OLDER builds left them, for the tests that keep reading them. The Recipe and the Python were sources once (2026-10-31-1140 and 2026-11-02-1155): a note sourced from one of them carries these stamps. No build
// writes them any more (the writers that did, asRecipeSourced and asPythonSourced, are gone with the read-back), so a test that needs such a note makes it here.
import { facetHashSync } from '../facet-sync-hash-core.ts';
import { PYTHON_SOURCE_KEYS, RECIPE_SOURCE_KEY, pythonTextOf } from '../phrase-notes-core.ts';
import { extractRecipeSection } from '../v2-note-core.ts';

const withFront = (text: string, set: ReadonlyArray<readonly [string, string]>): string => {
  const m = /^---(\r?\n)([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return text;
  const left = new Map(set);                                  // a key that is there is rewritten WHERE it stands (as the old writers did), a missing one comes last
  const lines = m[2].split(/\r?\n/).map((l) => { const k = /^([A-Za-z0-9_-]+):/.exec(l)?.[1] ?? ''; const v = left.get(k); if (v === undefined) return l; left.delete(k); return `${k}: ${v}`; });
  return `---${m[1]}${[...lines, ...[...left].map(([k, v]) => `${k}: ${v}`)].join(m[1])}${m[1]}---${text.slice(m[0].length)}`;
};

/** A note an older build left Recipe-sourced: `source_facet: recipe` and the Description stamped as derived from the Recipe. */
export const oldRecipeSourced = (text: string): string => withFront(text, [['source_facet', 'recipe'], [RECIPE_SOURCE_KEY, facetHashSync(extractRecipeSection(text) ?? '')]]);

/** A note an older build left Python-sourced (not custom): `source_facet: python`, the Description and the Recipe stamped as derived from the Python. */
export const oldPythonSourced = (text: string): string => { const h = facetHashSync(pythonTextOf(text) ?? ''); return withFront(text, [['source_facet', 'python'], ['python_hash', h], [PYTHON_SOURCE_KEYS[0], h], [PYTHON_SOURCE_KEYS[1], h]]); };
