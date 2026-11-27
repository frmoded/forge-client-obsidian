// The Forge button's replay (2026-11-23-1023): "apply the Description now" (music-composer code, behind the list-model seam; lean never carries it). 2026-11-26-1047: the Recipe read-back that lived here (the stale strip, the rewrite, the ask-once question) is gone:
// the Description is the only source, the Recipe and the Python are made from it. Nothing here calls a model.
import { parseList, replayGrammar } from './sentence-list-core.ts';
import { writeListNote } from './sentence-list-note-core.ts';
import { extractDescription } from './v2-note-core.ts';
import type { Family } from './note-family-core.ts';
import type { GrammarVault } from './phrase-grammar-core.ts';

/** 2026-11-19-0997: this core is the LIST MODEL's (reached only through src/list-model-selected.ts); list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_SCRIPT_EDIT_CORE = 'forge-list-model-core:script-edit-core';

/** 2026-11-23-1023 (the Forge button, always there): "apply the Description now" on a note with nothing pending: the list replayed through the grammar and the whole note written from it (the same replay and writer as every list write: the Recipe, the Python and the json are made
 *  again). `same` = the note comes out byte for byte as it is (then nothing is written). Or why not (an empty Description, no readable line, a refusing writer). */
export function forgeText(text: string, name: string, family: Family, vault: GrammarVault): { ok: true; text: string; same: boolean } | { ok: false; message: string } {
  const parsed = parseList(extractDescription(text), family, vault);
  if (parsed.list.length === 0) return { ok: false, message: 'There is nothing to forge: the Description is empty.' };
  const rp = replayGrammar(parsed.list, family, { vault });
  if (rp.params === null) return { ok: false, message: 'No line of the Description can be read.' };
  const w = writeListNote(text, name, family, rp);
  return w.ok === false ? { ok: false, message: w.message } : { ok: true, text: w.text, same: w.text === text };
}

