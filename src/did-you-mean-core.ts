// 2026-11-20-1002 (DID YOU MEAN) - the deterministic repairs of a sentence the grammar cannot read, the pure part (no obsidian, no DOM, no model call). When the grammar rejects a typed text and ONE of these repairs makes it readable, the composer shows
// `Did you mean: <sentence>?` with a button and Enter applies the SUGGESTION (never silently). Three repairs, each a small pure function:
//   closeLinks   an unclosed link: `Play [[phrase_001]` -> `Play [[phrase_001]]` (one bracket, none and a name cut by the full stop; a name with a space needs its one bracket)
//   typoOfVerb   a one-letter typo of a verb (Damerau distance 1: one letter added, dropped, changed or two neighbours swapped) against the verbs of the grammar's OWN tables (VERBS, the structure words, the bar forms); a UNIQUE match only
//   moveRepair   `Move bar 4 before bar 2.` -> `Move bar 4 one bar left.` with the hint that Move takes one bar one place at a time (say it twice)
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

/** `Move bar 4 before bar 2.` / `... after bar 6.`: the bar's way there is some places left or right, and Move takes one bar ONE place at a time: the sentence for one place, and the hint that says how many times. null = not this shape, or the bar would stay where it is. */
export function moveRepair(sentence: string): { sentence: string; hint: string } | null {
  const m = /^\s*move\s+bar\s+(\d+)\s+(before|after)\s+bar\s+(\d+)\s*\.?\s*$/i.exec(String(sentence ?? ''));
  if (m === null) return null;
  const a = Number(m[1]), b = Number(m[3]), rel = m[2].toLowerCase();
  const left = b < a, n = rel === 'before' ? (left ? a - b : b - 1 - a) : (left ? a - b - 1 : b - a);
  if (!(n >= 1)) return null;
  const dir = left ? 'left' : 'right', one = 'Move takes one bar one place at a time.';
  return {
    sentence: `Move bar ${a} one bar ${dir}.`,
    hint: n === 1 ? one : `${one} Bar ${a} ${rel} bar ${b} is ${n} places ${dir}: say it ${n === 2 ? 'twice' : `${n} times`} (the ${n === 2 ? 'second' : 'next'} time for bar ${left ? a - 1 : a + 1}).`,
  };
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
