// 2026-11-20-1002 (DID YOU MEAN) - the deterministic repairs of a sentence the grammar cannot read, the pure part (no obsidian, no DOM, no model call). When the grammar rejects a typed text and ONE of these repairs makes it readable, the composer shows
// `Did you mean: <sentence>?` with a button and Enter applies the SUGGESTION (never silently). Two repairs, each a small pure function (and the copy said by a bar's link, below):
//   closeLinks   an unclosed link: `Play [[phrase_001]` -> `Play [[phrase_001]]` (one bracket, none and a name cut by the full stop; a name with a space needs its one bracket)
//   typoOfVerb   a one-letter typo of a verb (Damerau distance 1: one letter added, dropped, changed or two neighbours swapped) against the verbs of the grammar's OWN tables (VERBS, the structure words, the bar forms); a UNIQUE match only
// The missing full stop needs no repair of its own (the grammar's splitter adds it): every suggestion is shown WITH its stop. `suggestRepair` offers a candidate ONLY when the caller's reader says the grammar reads it: a guess is never shown.
import { VERBS } from './phrase-grammar-core.ts';
import { STRUCTURE_WORDS, structureSentence } from './bar-structure-core.ts';
import { BAR_FORMS } from './bar-grammar-core.ts';
import { BAR_WORD_VERBS } from './duplicate-sentence-core.ts';
import { BAR_NOTE_ATTR } from './selection-tint-dom.ts';

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

/** 2026-11-24-1040: `Move bar A before bar M.` / `... after bar M.` were mended here into the CHAIN of one-place moves (2026-11-23-1027) and a move that goes nowhere was refused here; the GRAMMAR reads a Move to a place itself now (one sentence, one op), and says those refusals (`Bar 3 is part of the bars you are moving.`, `Bar 5 is already at the end.`): both are gone from this file. */

/** 2026-11-23-1027: the repair that follows a place-word sentence is not the service's answer: the dialog says the service was NOT asked, and why. */
export const notAskedNote = (noService: boolean): string => (noService ? 'The sentence service is not available in this build, so it was not asked.' : 'The sentence service is not set up in this vault, so it was not asked. Add its URL and token in Settings → Forge Actions (Beta).');

/** 2026-11-21-1015 (service first): a PHRASE sentence whose verb the grammar knows but whose place words it cannot read: a Move or Copy of bars with `before bar N` / `after bar N` (one sentence). Such a sentence is asked of the sentence service FIRST when it is set up; the repair above stays the fallback. */
export function placeWordSentence(text: string, family: RepairFamily): boolean {
  return family === 'phrase' && /^\s*(?:move|copy)\s+bars?\s+\d+(?:\s*(?:to|and|,)\s*\d+)*\s+(?:before|after)\s+bars?\s+\d+\s*\.?\s*$/i.test(String(text ?? ''));
}

/** 2026-11-24-1033: the note name each DRAWN bar was made from, in the order of the Score (the phrase tab writes it on each measure: selection-tint-dom `paintBarNotes`); null = the Score does not say (no Score host, no bar, or a bar with no name: a transform's, a mix's, a morph's; or a Score that is behind the list: the stale class): never "none". */
export function drawnBarNames(pane: ParentNode | null | undefined): string[] | null {
  const host = pane?.querySelector('.forge-rhythm-score-host:not(.forge-rhythm-score-host-pending)');          // the Score on screen, not one still being drawn
  if (host === null || host === undefined || host.classList.contains('forge-rhythm-score-host-stale')) return null;          // a Score that is behind the list (a recompute is pending) says nothing: its positions may not be the list's
  const bars = Array.from(host.querySelectorAll('g.measure')), names = bars.map((g) => g.getAttribute(BAR_NOTE_ATTR) ?? '');
  return bars.length === 0 || names.some((n) => n === '') ? null : names;
}

/** 2026-11-24-1033: the answer to a sentence that says a bar by its LINK and asks for a copy of it: `copy` (the one position it holds: the grammar's own `Copy bar K.`), `which` (it holds several: ask, in words, never guess), `absent` (it is not in the phrase). */
/** `message`: what the dialog says (for `copy`, what it would write: said when a waiting line stops the sentence from being added). */
export type DuplicateByLink = { kind: 'copy'; sentence: string; hint?: string; message: string } | { kind: 'which'; message: string } | { kind: 'absent'; message: string };
const LINK_COPY = /^\s*(?:please\b[\s,]*)?(?:duplicate|copy)\s+\[\[([^\[\]|]*)(?:\|[^\[\]]*)?\]\]\s*(?:please\b)?\s*[.!]?\s*$/i;
const and = (n: ReadonlyArray<number | string>): string => (n.length === 1 ? `${n[0]}` : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);
/** `please duplicate [[bar_007]]`, `Copy [[bar_007]].`, `duplicate [[bar_007]] please` (ONE sentence, a link of a bar, no number): which position of the drawn Score (`names`: one note name per bar) holds that bar. null = not this shape, or the Score does not say (`names` null or empty): the sentence goes the way it always went. */
export function duplicateByLink(text: string, names: readonly string[] | null): DuplicateByLink | null {
  const m = LINK_COPY.exec(String(text ?? ''));
  if (m === null) return copyInPlace(String(text ?? ''), names);          // 2026-11-24-1036: a copy that says a PLACE (`Make a copy of [[bar_006]] at the end of the score.`)
  if (names === null || names.length === 0) return null;
  const name = bareName(m[1]);
  if (name === null) return null;
  const at = positionsOf(name, names);
  if (at.length === 0) return { kind: 'absent', message: notInPhrase(name) };          // 2026-11-24-1037: one wording for a link that is not in the phrase, 1033's plain copy and 1036's place sentences alike
  if (at.length === 1) return { kind: 'copy', sentence: `Copy bar ${at[0]}.`, hint: `${name} is bar ${at[0]} of this phrase.`, message: `${name} is bar ${at[0]} of this phrase, so it would write: Copy bar ${at[0]}.` };
  return which(name, at, names.length, (k) => `Copy bar ${k}.`, 'Copy bar N.');
}

/** 2026-11-24-1037: the ONE sentence for a bar link that is not in the phrase (`There is no bar named bar_0012 in this phrase.`). */
const notInPhrase = (name: string): string => `There is no bar named ${name} in this phrase.`;
/** 2026-11-24-1037: positions said as ranges: a run of 3 or more is `a to b`, anything shorter is said position by position (`1 to 3, 5, 6 and 9`). */
function spans(at: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < at.length;) {
    let j = i; while (j + 1 < at.length && at[j + 1] === at[j] + 1) j++;
    if (j - i >= 2) out.push(`${at[i]} to ${at[j]}`); else for (let k = i; k <= j; k++) out.push(`${at[k]}`);
    i = j + 1;
  }
  return and(out);
}
/**
 * The question for a bar the Score holds at several positions (`total`: the bars of the phrase). The plain list, with each answer in the grammar's words, when there are 4 positions or fewer and no run of 3 (2026-11-24-1039: a run of 3 or more consecutive positions is `a to b`
 * at any count, `bars 1 to 3 and 7`). Otherwise `bar_007 is every bar of this phrase (1 to 13)` when it is every bar of a phrase of more than 4, else `bar_005 is bars 1 to 3 and 7 ...` as ranges; then the one pattern (`Say Copy bar N.`). The link is written as it is in the note (`bar_007`, never `Bar 007`).
 */
function which(name: string, at: number[], total: number, say: (k: number) => string, generic: string): DuplicateByLink {
  if (at.length <= 4 && !at.some((v, i) => i >= 2 && at[i - 2] === v - 2 && at[i - 1] === v - 1)) { const list = at.map(say); return { kind: 'which', message: `${name} is bars ${and(at)} of this phrase: which one? Say ${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}` }; }
  const where = at.length === total && total > 4 ? `every bar of this phrase (1 to ${total})` : `bars ${spans(at)} of this phrase`;
  return { kind: 'which', message: `${name} is ${where}: which one? Say ${generic}` };
}
/** The bar name a link says (`bar_007`, `bars/bar_007`, `bar_007.md`); null for a link into another folder or an empty one. */
function bareName(link: string): string | null {
  let name = link.trim().replace(/\.md$/i, '');
  const folder = /^([^/]+)\/(.+)$/.exec(name);
  if (folder !== null) { if (folder[1] !== 'bars') return null; name = folder[2]; }
  return name === '' || name.includes('/') ? null : name;
}
const positionsOf = (name: string, names: readonly string[]): number[] => names.flatMap((n, i) => (n === name ? [i + 1] : []));

// 2026-11-24-1036: a COPY PUT IN A PLACE, in free words. The grammar says `Copy bar 6 and put it at the end.` (the place words of Extend, Mix and Morph); this reads the few free ways a person says it (a small CLOSED list; the service handles the rest) and writes that sentence:
// `make a copy of` / `put a copy of` / `copy` / `duplicate` + a bar (`bar 6`, `bars 3 to 5`, `[[bar_006]]`) + `at the end [of the score]`, `to the end of the score`, `after the last bar`, `at the start [of the score]`, `at the beginning`, `after|before bar N`, `after|before [[a bar]]`,
// `between bars N and M`; an optional `and put it` / `and put them` before the place, `please`, a full stop. A link must be a bar of the drawn Score: one that is not is refused in words, naming it, never guessed (nothing is written, the service is not asked).
const COPY_HEAD = /^\s*(?:please\b[\s,]*)?(?:(?:make|put)\s+a\s+copy\s+of|(copy|duplicate))\s+/i;
const COPY_REF = /^(?:\[\[([^\[\]|]*)(?:\|[^\[\]]*)?\]\]|bars?\s+(\d+)(?:\s*(?:to|-)\s*(\d+))?)/i;
const COPY_FILLER = /^\s*,?\s*(?:and\s+)?(?:(?:put|place)\s+(?:it|them|a\s+copy|the\s+copy)\s+)?/i;
const COPY_END = /^(?:(?:at|to)\s+the\s+end(?:\s+of\s+(?:the\s+)?(?:score|phrase))?|after\s+the\s+last\s+bar)/i, COPY_START = /^(?:at|to)\s+the\s+(?:start|beginning)(?:\s+of\s+(?:the\s+)?(?:score|phrase))?/i;
const COPY_BETWEEN = /^between\s+bars?\s+(\d+)\s+and\s+(?:bars?\s+)?(\d+)/i, COPY_TAIL = /^\s*(?:please\b)?\s*[.!]?\s*$/i, PLACE_HINT = /\b(?:at\s+the\s+(?:end|start|beginning)|to\s+the\s+end|after|before|between|put|place)\b/i;

function copyInPlace(text: string, names: readonly string[] | null): DuplicateByLink | null {
  const head = COPY_HEAD.exec(text), ref = head === null ? null : COPY_REF.exec(text.slice(head[0].length));
  if (head === null || ref === null) return null;
  const known = names !== null && names.length > 0, plain = head[1] !== undefined;
  let rest = text.slice(head[0].length + ref[0].length);
  if (known && PLACE_HINT.test(rest)) for (const l of text.matchAll(/\[\[([^\[\]|]*)(?:\|[^\[\]]*)?\]\]?/g)) { const n = bareName(l[1]); if (n !== null && positionsOf(n, names).length === 0) return { kind: 'absent', message: notInPhrase(n) }; }          // a link the Score does not hold: refused, naming it
  const said: string[] = [];
  const bar = (link: string, as: (k: number) => string): number | DuplicateByLink | null => {          // the one position a link has in the Score, or the question / refusal in words
    const n = bareName(link); if (!known || n === null) return null;
    const at = positionsOf(n, names);
    if (at.length === 0) return { kind: 'absent', message: notInPhrase(n) };
    if (at.length > 1) return which(n, at, names!.length, as, `${as(0).replace(/ \d+/, ' N')}${/\.$/.test(as(0)) ? '' : '.'}`);
    said.push(`${n} is bar ${at[0]}`); return at[0];
  };
  let first: number, last: number;
  if (ref[1] !== undefined) { const k = bar(ref[1], (j) => `Copy bar ${j}.`); if (typeof k !== 'number') return k; first = last = k; }
  else { first = Number(ref[2]); last = ref[3] === undefined ? first : Number(ref[3]); if (first < 1 || last < first) return null; }
  rest = rest.replace(COPY_FILLER, '');
  let after: number | 'end' | undefined;
  const end = COPY_END.exec(rest), start = COPY_START.exec(rest), between = COPY_BETWEEN.exec(rest), rel = /^(after|before)\s+/i.exec(rest);
  if (end !== null) { after = 'end'; rest = rest.slice(end[0].length); }
  else if (start !== null) { after = 0; rest = rest.slice(start[0].length); }
  else if (between !== null) { if (Number(between[2]) !== Number(between[1]) + 1) return null; after = Number(between[1]); rest = rest.slice(between[0].length); }
  else if (rel !== null) {
    const place = COPY_REF.exec(rest.slice(rel[0].length)), before = rel[1].toLowerCase() === 'before';
    if (place === null || place[3] !== undefined) return null;
    const k = place[1] !== undefined ? bar(place[1], (j) => `${before ? 'before' : 'after'} bar ${j}`) : Number(place[2]);
    if (typeof k !== 'number') return k; if (k < 1) return null;
    after = before ? k - 1 : k; rest = rest.slice(rel[0].length + place[0].length);
  }
  if (!COPY_TAIL.test(rest) || (after === undefined && plain)) return null;          // anything else in the sentence is not ours (the service handles the rest); a bare `Copy bar 3.` / `Copy [[bar_007]].` is the grammar's / the first reading's
  const sentence = structureSentence({ op: 'copy', runs: [[first, last]], ...(after !== undefined ? { after } : {}) });
  const hint = said.length === 0 ? undefined : `${said.join(' and ')} of this phrase.`;
  return { kind: 'copy', sentence, ...(hint !== undefined ? { hint } : {}), message: hint === undefined ? `It would write: ${sentence}` : `${hint.slice(0, -1)}, so it would write: ${sentence}` };
}

/** The repaired text, or null when no repair applies: each sentence on its own (its links closed and a typo of its first word mended), every sentence with its full stop.  */
export function repairCandidate(text: string, family: RepairFamily, names?: readonly string[] | null): Repair | null {
  const copy = family === 'phrase' ? duplicateByLink(text, names ?? null) : null;          // 2026-11-24-1033: a copy said by its link is the grammar's `Copy bar K.` for the position the drawn Score gives it
  if (copy !== null) return copy.kind === 'copy' ? { sentence: copy.sentence, ...(copy.hint !== undefined ? { hint: copy.hint } : {}) } : null;
  const sentences = String(text ?? '').trim().split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x !== '');
  if (sentences.length === 0) return null;
  const verbs = verbsOf(family); let changed = false;
  const out = sentences.map((s) => {
    let r = closeLinks(s);
    const w = /^([A-Za-z]+)/.exec(r), fix = w === null ? null : typoOfVerb(w[1], verbs);
    if (fix !== null) r = fix + r.slice(w![1].length);
    if (r !== s) changed = true;
    return /[.!?]$/.test(r) ? r : `${r}.`;
  });
  return changed ? { sentence: out.join(' ') } : null;
}

/** The repair, if there is one AND `reads` says the grammar reads the repaired text; a reader that throws is a no. */
export async function suggestRepair(text: string, family: RepairFamily, reads: (repaired: string) => boolean | Promise<boolean>, known?: (text: string) => string[] | null, names?: readonly string[] | null): Promise<Repair | null> {
  // 2026-11-20-1004: a sentence the person (or the driver) RESOLVED in the review queue is offered first, in its own lines, if the grammar still reads them
  try { const k = known?.(text); if (k !== undefined && k !== null && k.length > 0) { const joined = k.join(' '); if (await reads(joined)) return { sentence: joined, hint: 'You taught this sentence earlier.' }; } } catch { /* a table that cannot answer offers nothing */ }
  const c = repairCandidate(text, family, names);
  if (c === null) return null;
  try { return (await reads(c.sentence)) ? c : null; } catch { return null; }
}

/** The dialog's line: `Did you mean: Delete bar 2?` (the sentence without its closing full stop) and the hint after it. */
export const didYouMeanQuestion = (r: Repair): string => `Did you mean: ${r.sentence.replace(/\.\s*$/, '')}?${r.hint !== undefined ? ` ${r.hint}` : ''}`;

/** The repair, if the grammar reads it, SAID in the dialog by `say` (the question with its button) and handed back as the composer's proposal (the sentence to apply INSTEAD of the typed text, only when the person presses Enter or the button); null = no repair, today's message stays. */
export async function offerRepair(text: string, family: RepairFamily, reads: (repaired: string) => boolean | Promise<boolean>, say: (ev: { type: 'suggestion'; description: string; recipe: ''; via: 'repair'; question: string }) => void, known?: (text: string) => string[] | null, names?: readonly string[] | null): Promise<{ ok: true; proposal: { description: string; via: 'grammar'; instead: string } } | null> {
  const fix = await suggestRepair(text, family, reads, known, names);
  if (fix === null) return null;
  say({ type: 'suggestion', description: fix.sentence, recipe: '', via: 'repair', question: didYouMeanQuestion(fix) });
  return { ok: true, proposal: { description: fix.sentence, via: 'grammar', instead: fix.sentence } };
}
