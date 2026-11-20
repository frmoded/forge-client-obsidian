// 2026-11-19-0992 - DUPLICATE A BAR FROM THE COMPOSER: the sentence and the gesture, the pure part (no obsidian, no DOM).
//
//   Duplicate [[bar_007]].      a canonical ACTION sentence. It is read LOCALLY (this file; no model call) and it is NOT a recipe line: a phrase's Description is a list of recipe lines, and an action never enters it. It makes a copy of a note
//                               (a bar, and, when it is trivial, a phrase, an arrangement or a composition) under the next free name; it changes no note that exists. The effect is duplicate-note-core.ts.
//   the gesture                 in a phrase tab, when the composer's text (trimmed, any case) is exactly "Duplicate" or ends with the word, the NEXT click on a bar of the Score does not pin it: the bar's note name is appended
//                               (` [[bar_007]].`). `armsDuplicate` is the question, `withDuplicateLink` the text the click makes. After that the text ends with a link, so the next click pins again.

/** The names of the notes of a vault, by kind (what a link may mean). The grammar's vault has this shape and more. */
export interface DuplicateVault { bars: readonly string[]; phrases: readonly string[]; arrangements?: readonly string[]; compositions?: readonly string[] }
export type DuplicateFamily = 'bar' | 'phrase' | 'arrangement' | 'composition';
/** What a link resolved to: the family, the note's name, its lineage id (`bars/bar_007`) and its path (`bars/bar_007.md`). */
export interface ResolvedDuplicate { ok: true; family: DuplicateFamily; name: string; id: string; path: string }
export type ActionRead =
  | { kind: 'none' }
  | { kind: 'duplicate'; target: string }
  | { kind: 'refused'; message: string };

const FOLDER: Record<DuplicateFamily, string> = { bar: 'bars', phrase: 'phrases', arrangement: 'arrangements', composition: 'compositions' };
const FAMILIES: readonly DuplicateFamily[] = ['bar', 'phrase', 'arrangement', 'composition'];
const NOUN: Record<DuplicateFamily, string> = { bar: 'bar', phrase: 'phrase', arrangement: 'arrangement', composition: 'composition' };

/** Is the NEXT click on a bar of the Score a copy click? The text, trimmed and in any case, is exactly "Duplicate" or ends with the word "Duplicate" (a word of its own: "Duplicates" and "unduplicate" do not). */
export const armsDuplicate = (text: string): boolean => /(^|\s)duplicate$/i.test(String(text ?? '').trim());

/** The text after a copy click: the text with its trailing white space cut, then " [[name]]." (the bar's note name). */
export const withDuplicateLink = (text: string, name: string): string => `${String(text ?? '').trimEnd()} [[${name}]].`;

/** 2026-11-19-0992a (R1): what a click on a bar inserts into a composer that has ANY other text: the bar's link, ` [[bar_007]]` (no full stop). `before` is the text before the caret: one leading space unless there is nothing before the caret, or what is there already ends in white space or an opening bracket. */
export const linkInsertion = (before: string, name: string): string => `${before === '' || /[\s(\[{]$/.test(before) ? '' : ' '}[[${name}]]`;

/** 2026-11-19-0996b (BAR WORDS INSIDE A PHRASE): the words that make a click on a bar insert its POSITION instead of its note's link: the FIRST word of the composer's text (any case, whole word) is one of these. */
export const BAR_WORD_VERBS = ['duplicate', 'copy', 'move', 'delete', 'remove', 'keep', 'morph', 'mix', 'extend'] as const;
export function barWordVerb(text: string): (typeof BAR_WORD_VERBS)[number] | null {
  const m = /^\s*([A-Za-z]+)(?![A-Za-z0-9_])/.exec(String(text ?? ''));
  const word = m === null ? '' : m[1].toLowerCase();
  return (BAR_WORD_VERBS as readonly string[]).includes(word) ? word as (typeof BAR_WORD_VERBS)[number] : null;
}
/** The bar's number in the Score now, from the provenance params of the element that was clicked (the lineage builders write `bar`, 1-based, as the selection menu reads it); a MIX is one bar and has none: bar 1; null = cannot tell. */
export function barNumberOf(params: Record<string, unknown> | null | undefined, isMix: boolean): number | null {
  const n = params?.bar;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 ? n : isMix ? 1 : null;
}
/** What a click on bar `bar` of the Score inserts at the caret after `before` (the text before it): `bar 3` (with one leading space unless there is nothing before, or white space or an opening bracket), `and bar 5` after a bar reference ("bar 3", "bars 3 to 5", "bar 3 and bar 5", "bars 2, 4"), a new `bar 5` after anything else (a direction, "and", a comma). */
export function barInsertion(before: string, bar: number): string {
  const text = String(before ?? '');
  const core = text.trimEnd();
  const lead = text === '' || /[\s(\[{]$/.test(text) ? '' : ' ';
  const afterRef = !/(?:\band|,)$/i.test(core) && /(?:\bbars?\s+\d+|\bto\s+\d+|,\s*\d+|\band\s+\d+)$/i.test(core);
  return `${lead}${afterRef ? 'and ' : ''}bar ${bar}`;
}

const WHAT = 'Duplicate what? Click a bar on the Score, or write its link, for example: Duplicate [[bar_007]].';
const ALONE = 'Duplicate is not a step of the list, so it has to be on its own: empty the box, then write Duplicate [[bar_007]]. by itself.';
const ONE_AT_A_TIME = 'Duplicate takes one note at a time: write Duplicate [[bar_007]]. for one link.';
const NEEDS_LINK = 'Duplicate needs a link to the note: write it like Duplicate [[bar_007]]. (or click a bar on the Score).';

/**
 * What a typed text says, for the composer of a PHRASE: "none" = not an action sentence (the list grammar's, and the sentence service's when it cannot read it, exactly as before); a Duplicate sentence, or one that cannot be done, in plain words.
 * The word "Duplicate" opening any sentence of the text makes it an action text: with anything else in the text it is refused (never handed to the list grammar or the service, which would not know it).
 */
export function readActionText(text: string): ActionRead {
  const t = String(text ?? '').trim();
  const sentences = t.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x !== '');
  const isAction = (x: string): boolean => /^duplicate(?![A-Za-z0-9_])/i.test(x) && !/^duplicate\s+bars?(?![A-Za-z0-9_])/i.test(x);       // 2026-11-19-0996b: "Duplicate bar 3." has a number and is a sentence of the LIST (the copy step), never a link
  if (!/(^|[.!?]\s+|\n)duplicate(?![A-Za-z0-9_])/i.test(t) || !sentences.some(isAction)) return { kind: 'none' };
  const links = [...t.matchAll(/\[\[([^\]]*)\]\]/g)];
  if (sentences.length > 1) {
    const actions = sentences.filter(isAction).length;
    return { kind: 'refused', message: actions > 1 ? ONE_AT_A_TIME : ALONE };
  }
  const one = /^duplicate(?![A-Za-z0-9_])\s*(.*?)\s*\.?$/is.exec(t);
  if (one === null) return { kind: 'none' };
  const rest = one[1];
  if (rest === '') return { kind: 'refused', message: WHAT };
  if (links.length > 1) return { kind: 'refused', message: ONE_AT_A_TIME };
  const m = /^\[\[([^\]]*)\]\]$/.exec(rest);
  if (m === null) return { kind: 'refused', message: NEEDS_LINK };
  const target = m[1].split('|')[0].trim();
  return target === '' ? { kind: 'refused', message: WHAT } : { kind: 'duplicate', target };
}

const names = (v: DuplicateVault, f: DuplicateFamily): readonly string[] => (f === 'bar' ? v.bars : f === 'phrase' ? v.phrases : f === 'arrangement' ? (v.arrangements ?? []) : (v.compositions ?? []));
const NOT_FOUND = (t: string): string => `There is no note called [[${t}]] in this vault, so there is nothing to duplicate.`;

/** Which note a link means: `bar_007` (looked up among the bars, phrases, arrangements and compositions of the vault) or `bars/bar_007` (the folder says which). Unknown, and a name two kinds of note share, are refused in plain words. */
export function resolveDuplicateTarget(target: string, vault: DuplicateVault): ResolvedDuplicate | { ok: false; message: string } {
  const t = String(target ?? '').trim().replace(/\.md$/i, '');
  const made = (family: DuplicateFamily, name: string): ResolvedDuplicate => ({ ok: true, family, name, id: `${FOLDER[family]}/${name}`, path: `${FOLDER[family]}/${name}.md` });
  const slash = t.indexOf('/');
  if (slash > 0) {
    const family = FAMILIES.find((f) => FOLDER[f] === t.slice(0, slash));
    const name = t.slice(slash + 1);
    return family !== undefined && names(vault, family).includes(name) ? made(family, name) : { ok: false, message: NOT_FOUND(t) };
  }
  const hits = FAMILIES.filter((f) => names(vault, f).includes(t));
  if (hits.length === 0) return { ok: false, message: NOT_FOUND(t) };
  if (hits.length > 1) return { ok: false, message: `More than one note is called [[${t}]] (${hits.map((f) => `a ${NOUN[f]}`).join(' and ')}): write it with its folder, for example [[${FOLDER[hits[0]]}/${t}]].` };
  return made(hits[0], t);
}

/** The preview's words: `Copy [[bar_007]] to a new bar.` */
export const duplicatePreviewLine = (r: { family: DuplicateFamily; name: string }): string => `Copy [[${r.name}]] to a new ${NOUN[r.family]}.`;

/** The family of a lineage id (`bars/bar_007`, `phrases/x`...), the name after the folder; null = not one of the four (a kit, a note that is not music, a fork id nobody can read). */
export function idParts(id: string | null | undefined): { family: DuplicateFamily; name: string } | null {
  if (typeof id !== 'string') return null;
  const m = /^([^/]+)\/([^/]+)$/.exec(id.trim());
  if (m === null) return null;
  const family = FAMILIES.find((f) => FOLDER[f] === m[1]);
  return family === undefined ? null : { family, name: m[2].replace(/\.md$/i, '') };
}
