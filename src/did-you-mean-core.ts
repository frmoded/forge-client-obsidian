// 2026-11-20-1002 (DID YOU MEAN) - the deterministic repairs of a sentence the grammar cannot read, the pure part (no obsidian, no DOM, no model call). When the grammar rejects a typed text and ONE of these repairs makes it readable, the composer shows
// `Did you mean: <sentence>?` with a button and Enter applies the SUGGESTION (never silently). Three repairs, each a small pure function:
//   closeLinks   an unclosed link: `Play [[phrase_001]` -> `Play [[phrase_001]]` (one bracket, none and a name cut by the full stop; a name with a space needs its one bracket)
//   typoOfVerb   a one-letter typo of a verb (Damerau distance 1: one letter added, dropped, changed or two neighbours swapped) against the verbs of the grammar's OWN tables (VERBS, the structure words, the bar forms); a UNIQUE match only
//   moveRepair   `Move bar 4 before bar 2.` -> the CHAIN of one-place moves, `Move bar 4 one bar left. Move bar 3 one bar left.` (2026-11-23-1027: it said only the first sentence before), with the hint that says what it did
// The missing full stop needs no repair of its own (the grammar's splitter adds it): every suggestion is shown WITH its stop. `suggestRepair` offers a candidate ONLY when the caller's reader says the grammar reads it: a guess is never shown.
import { VERBS } from './phrase-grammar-core.ts';
import { STRUCTURE_WORDS } from './bar-structure-core.ts';
import { BAR_FORMS } from './bar-grammar-core.ts';
import { BAR_WORD_VERBS } from './duplicate-sentence-core.ts';

/** 2026-11-19-0997: this core is the LIST MODEL's (music-composer code, reached only through src/list-model-selected.ts); the music edition's list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_DID_YOU_MEAN_CORE = 'forge-list-model-core:did-you-mean-core';

export type RepairFamily = 'phrase' | 'arrangement' | 'composition' | 'bar';
/** `sentence`: the whole repaired text (every sentence with its full stop); `hint`: a plain line after the question. */
export interface Repair { sentence: string; hint?: string }

/** Is `a` one edit from `b`: one letter added, dropped or changed, or two neighbouring letters swapped (Damerau, optimal string alignment)? Equal strings are not. The caller lower-cases. */
export function isOneEdit(a: string, b: string): boolean {
  if (a === b) return false;
  const d = a.length - b.length;
  if (d === 0) {
    const at: number[] = []; for (let i = 0; i < a.length && at.length < 3; i++) if (a[i] !== b[i]) at.push(i);
    return at.length === 1 || (at.length === 2 && at[1] === at[0] + 1 && a[at[0]] === b[at[1]] && a[at[1]] === b[at[0]]);
  }
  if (d !== 1 && d !== -1) return false;
  const [long, short] = d > 0 ? [a, b] : [b, a];
  let i = 0; while (i < short.length && long[i] === short[i]) i++;
  return long.slice(i + 1) === short.slice(i);
}

const firstWord = (s: string): string => (/^[A-Za-z]+/.exec(s)?.[0] ?? '').toLowerCase();
/** The words a sentence of this family may open with, from the grammar's tables (the first word of every VERBS example, the structure steps and their two synonyms; for a bar, the first word of every form it says), sorted. */
export function verbsOf(family: RepairFamily): string[] {
  const words = family === 'bar'
    ? BAR_FORMS.map(firstWord)
    : [...VERBS.map((v) => firstWord(v.example)), ...Object.values(STRUCTURE_WORDS).map((w) => w.verb), ...BAR_WORD_VERBS];
  return [...new Set(words.filter((w) => w !== ''))].sort();
}

/** The verb a one-letter typo means, capitalised; null when the word is already a verb, is not a word, matches no verb or matches more than one (no guess). */
export function typoOfVerb(word: string, verbs: readonly string[]): string | null {
  if (!/^[A-Za-z]+$/.test(word)) return null;
  const w = word.toLowerCase();
  if (verbs.includes(w)) return null;
  const hits = verbs.filter((v) => isOneEdit(w, v));
  return hits.length === 1 ? hits[0][0].toUpperCase() + hits[0].slice(1) : null;
}

/** Close every link that is not closed. A name that has its one bracket ends there; with no bracket the name is the first word (letters, digits, `_`, `/`, `-`, `|`); an empty link is left alone. */
export function closeLinks(sentence: string): string {
  const s = String(sentence ?? ''); let out = '', i = 0;
  while (i < s.length) {
    const open = s.indexOf('[[', i);
    if (open === -1) { out += s.slice(i); break; }
    out += s.slice(i, open + 2); i = open + 2;
    const next = s.indexOf('[[', i), limit = next === -1 ? s.length : next, rest = s.slice(i, limit);
    const two = rest.indexOf(']]');
    if (two !== -1) { out += rest.slice(0, two + 2); i += two + 2; continue; }
    const one = rest.indexOf(']');
    if (one !== -1) { if (rest.slice(0, one).trim() === '') { out += rest; i = limit; continue; } out += `${rest.slice(0, one)}]]`; i += one + 1; continue; }
    const name = /^[A-Za-z0-9_/|-]+/.exec(rest);
    if (name === null) { out += rest; i = limit; continue; }
    out += `${name[0]}]]`; i += name[0].length;
  }
  return out;
}

/** 2026-11-23-1027: `Move bar A before bar M.` / `... after bar M.` in words and numbers: how many places the bar moves and which way (n = 0 or less: it stays where it is, or it is asked to go before or after itself). null = not this shape. */
export function movePlaces(sentence: string): { a: number; m: number; rel: 'before' | 'after'; n: number; dir: 'left' | 'right' } | null {
  const x = /^\s*move\s+bar\s+(\d+)\s+(before|after)\s+bar\s+(\d+)\s*\.?\s*$/i.exec(String(sentence ?? ''));
  if (x === null) return null;
  const a = Number(x[1]), m = Number(x[3]), rel = x[2].toLowerCase() as 'before' | 'after', left = m < a;
  return { a, m, rel, n: rel === 'before' ? (left ? a - m : m - 1 - a) : (left ? a - m - 1 : m - a), dir: left ? 'left' : 'right' };
}

/** `Move bar 4 before bar 2.` / `... after bar 6.`: the bar's way there is some places left or right, and Move takes one bar ONE place at a time, so the way is the CHAIN of one-place moves, each sentence for the bar where the moving bar NOW sits (2026-11-23-1027: the repair says them ALL,
 *  `Move bar 4 one bar left. Move bar 3 one bar left.`, joined as the repair joins sentences, with the hint that says what it did). null = not this shape, or the bar would stay where it is (`placeRefusal` says that in words). */
export function moveRepair(sentence: string): { sentence: string; hint: string } | null {
  const p = movePlaces(sentence);
  if (p === null || !(p.n >= 1)) return null;
  const { a, m, rel, n, dir } = p, step = dir === 'left' ? -1 : 1;
  return {
    sentence: Array.from({ length: n }, (_, i) => `Move bar ${a + step * i} one bar ${dir}.`).join(' '),
    hint: `Bar ${a} ${rel} bar ${m} is ${n} place${n === 1 ? '' : 's'} ${dir}${n === 1 ? '' : n === 2 ? ': both moves are written' : `: all ${n} moves are written`}.`,
  };
}

/** 2026-11-23-1027: a move to the place the bar already is in (`Move bar 2 before bar 3.`) or before or after itself is a plain refusal in words, never a question and never asked of the service; null = it is a move, or not this shape. */
export function placeRefusal(sentence: string): string | null {
  const p = movePlaces(sentence);
  if (p === null || p.n >= 1) return null;
  return p.a === p.m ? `Bar ${p.a} cannot go ${p.rel} itself.` : `Bar ${p.a} is already ${p.rel} bar ${p.m}: nothing to move.`;
}

/** 2026-11-23-1027: the repair that follows a place-word sentence is not the service's answer: the dialog says the service was NOT asked, and why. */
export const notAskedNote = (noService: boolean): string => (noService ? 'The sentence service is not available in this build, so it was not asked.' : 'The sentence service is not set up in this vault, so it was not asked. Add its URL and token in Settings → Forge Actions (Beta).');

/** 2026-11-21-1015 (service first): a PHRASE sentence whose verb the grammar knows but whose place words it cannot read: a Move or Copy of bars with `before bar N` / `after bar N` (one sentence). Such a sentence is asked of the sentence service FIRST when it is set up; the repair above stays the fallback. */
export function placeWordSentence(text: string, family: RepairFamily): boolean {
  return family === 'phrase' && /^\s*(?:move|copy)\s+bars?\s+\d+(?:\s*(?:to|and|,)\s*\d+)*\s+(?:before|after)\s+bars?\s+\d+\s*\.?\s*$/i.test(String(text ?? ''));
}

/** The repaired text, or null when no repair applies: each sentence on its own (a Move with place words; else its links closed and a typo of its first word mended), every sentence with its full stop. The FIRST hint is kept. */
export function repairCandidate(text: string, family: RepairFamily): Repair | null {
  const sentences = String(text ?? '').trim().split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x !== '');
  if (sentences.length === 0) return null;
  const verbs = verbsOf(family); let changed = false, hint: string | undefined;
  const out = sentences.map((s) => {
    const move = family === 'phrase' ? moveRepair(s) : null;
    let r = s;
    if (move !== null) { r = move.sentence; hint ??= move.hint; }
    else {
      r = closeLinks(s);
      const w = /^([A-Za-z]+)/.exec(r), fix = w === null ? null : typoOfVerb(w[1], verbs);
      if (fix !== null) r = fix + r.slice(w![1].length);
    }
    if (r !== s) changed = true;
    return /[.!?]$/.test(r) ? r : `${r}.`;
  });
  return changed ? { sentence: out.join(' '), ...(hint !== undefined ? { hint } : {}) } : null;
}

/** The repair, if there is one AND `reads` says the grammar reads the repaired text; a reader that throws is a no. */
export async function suggestRepair(text: string, family: RepairFamily, reads: (repaired: string) => boolean | Promise<boolean>, known?: (text: string) => string[] | null): Promise<Repair | null> {
  // 2026-11-20-1004: a sentence the person (or the driver) RESOLVED in the review queue is offered first, in its own lines, if the grammar still reads them
  try { const k = known?.(text); if (k !== undefined && k !== null && k.length > 0) { const joined = k.join(' '); if (await reads(joined)) return { sentence: joined, hint: 'You taught this sentence earlier.' }; } } catch { /* a table that cannot answer offers nothing */ }
  const c = repairCandidate(text, family);
  if (c === null) return null;
  try { return (await reads(c.sentence)) ? c : null; } catch { return null; }
}

/** The dialog's line: `Did you mean: Delete bar 2?` (the sentence without its closing full stop) and the hint after it. */
export const didYouMeanQuestion = (r: Repair): string => `Did you mean: ${r.sentence.replace(/\.\s*$/, '')}?${r.hint !== undefined ? ` ${r.hint}` : ''}`;

/** The repair, if the grammar reads it, SAID in the dialog by `say` (the question with its button) and handed back as the composer's proposal (the sentence to apply INSTEAD of the typed text, only when the person presses Enter or the button); null = no repair, today's message stays. */
export async function offerRepair(text: string, family: RepairFamily, reads: (repaired: string) => boolean | Promise<boolean>, say: (ev: { type: 'suggestion'; description: string; recipe: ''; via: 'repair'; question: string }) => void, known?: (text: string) => string[] | null): Promise<{ ok: true; proposal: { description: string; via: 'grammar'; instead: string } } | null> {
  const fix = await suggestRepair(text, family, reads, known);
  if (fix === null) return null;
  say({ type: 'suggestion', description: fix.sentence, recipe: '', via: 'repair', question: didYouMeanQuestion(fix) });
  return { ok: true, proposal: { description: fix.sentence, via: 'grammar', instead: fix.sentence } };
}
