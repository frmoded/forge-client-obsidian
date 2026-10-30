// score_first M13 / design 4.12 phase C (drain 2026-10-26-1270, DEMO profile) — the structure strip above the Score. Pure: chips naming the notes behind what is drawn (lineage order), the bars each note contributed to, the
// chips of a bar's tab (the phrases that use it). The "which note made bar n" rule is the SAME rule a pin sends the notes pane by (linked-panes-core.ts pinnedNoteFor): structure-strip-core.test.ts cross-checks them for every
// kind, so the two cannot drift apart. Runtime imports from phrase-core.ts are types only.
import type { PhraseParams } from './phrase-core.ts';
import type { ArrangementParams } from './arrangement-core.ts';
import { phraseBarId, PHRASE_BAR_SCOPE } from './phrase-lineage-core.ts';
import { transformOpShort } from './phrase-words-core.ts';

export interface Chip {
  /** What the chip says (without the brackets of `stripText`). */
  text: string;
  /** The note it opens (a lineage id: `bars/bar_007`, `phrases/phrase_004`). */
  noteId: string;
  /** `source` (2026-10-27-1030): the PHRASE a transform changes (a bar chip names a bar note; this names a phrase note). */
  kind: 'bar' | 'phrase' | 'fork' | 'source' | 'kit';
}

const baseName = (noteId: string): string => noteId.split('/').pop() ?? noteId;
const forks = (p: PhraseParams): Array<{ bar: number; note: string }> => {
  const o = p.kind === 'extend' || p.kind === 'morph' || p.kind === 'transform' ? p.overrides : undefined;
  return Object.keys(o ?? {}).sort((x, y) => Number(x) - Number(y)).map((k) => ({ bar: Number(k), note: baseName(o![k]) }));
};

/** How many bars the Score of this phrase has: an extend's or a morph's Bars; a mix is one bar; a transform keeps the count of its source, which the params do not hold, so the caller passes what the Score on screen has
 *  (`known`); without it, the last bar any op names. */
export function barCount(p: PhraseParams, known?: number): number {
  if (p.kind === 'mix') return 1;
  if (p.kind === 'transform') return known ?? Math.max(...p.ops.map((o) => o.last));
  return p.bars;
}

/** The bar note that made bar `bar` of this phrase (a name like `bar_007`): its fork note if forked; an extend: the source; a morph: a at or before the middle bar ((bars + 1) / 2), else b; a mix (one bar): a when the weight is at least half. */
export function barParent(p: PhraseParams, bar: number): string | null {
  if (p.kind === 'extend' || p.kind === 'morph' || p.kind === 'transform') {
    const fork = p.overrides?.[String(bar)];
    if (fork) return baseName(fork);
  }
  if (p.kind === 'transform') return baseName(p.source);
  if (p.kind === 'extend') return p.source;
  if (p.kind === 'morph') return bar <= (p.bars + 1) / 2 ? p.a : p.b;
  return p.weight >= 0.5 ? p.a : p.b;
}

/** The bars (1-based) a note contributed to: for the phrase's own name every bar; for a bar note the bars `barParent` gives it; a note that took no part: none. */
export function barsContributedBy(p: PhraseParams, noteName: string, phraseName?: string, known?: number): number[] {
  const n = barCount(p, known);
  const all = Array.from({ length: n }, (_, i) => i + 1);
  if (phraseName !== undefined && noteName === phraseName) return all;
  // 2026-10-29-0900 (g): a mix's one bar is made from BOTH parents, a by its weight and b by what is left; a bar the mix uses at all lights (weight 0 = only b, 1 = only a). barParent stays the single heavier parent (what "made from" names).
  if (p.kind === 'mix') return (noteName === p.a && p.weight > 0) || (noteName === p.b && p.weight < 1) ? all : [];
  return all.filter((bar) => barParent(p, bar) === noteName);
}

/** The element ids of those bars in the drawn Score (bar n of any phrase kind is `ph_bar_n`). */
export function litBarIds(bars: readonly number[]): string[] {
  return bars.map((n) => phraseBarId(PHRASE_BAR_SCOPE, n));
}

/** The chips of a phrase tab, left to right in lineage order. */
export function chipsFor(name: string, p: PhraseParams): Chip[] {
  const bar = (b: string): Chip => ({ text: b, noteId: `bars/${b}`, kind: 'bar' });
  const phrase = (what: string): Chip => ({ text: `${name} ${what}`, noteId: `phrases/${name}`, kind: 'phrase' });
  let chips: Chip[];
  if (p.kind === 'extend') chips = [bar(p.source), phrase(`extend ${p.bars} bars`)];
  else if (p.kind === 'transform') chips = [{ text: baseName(p.source), noteId: p.source, kind: 'source' }, phrase(`transform, ${p.ops.length === 1 ? transformOpShort(p.ops[0]) : `${p.ops.length} ops`}`)];
  else if (p.kind === 'morph') chips = [bar(p.a), phrase(`morph, ${p.bars} bars`), ...(p.b === p.a ? [] : [bar(p.b)])];
  else chips = [bar(p.a), ...(p.b === p.a ? [] : [bar(p.b)]), phrase(`mix, ${p.mode === 'path' ? 'path' : 'vote'}`)];
  return [...chips, ...forks(p).map((f): Chip => ({ text: `${f.note} fork of bar ${f.bar}`, noteId: `bars/${f.note}`, kind: 'fork' }))];
}

/**
 * 2026-10-29-0830: the chips of an ARRANGEMENT tab, left to right in the order of its Recipe: each track's phrase, then its kit, every note once (one phrase on two kits is one phrase chip). A flat row: nothing flows from one
 * chip to the next, so the strip draws no arrows (stripTokens).
 */
export function arrangementChips(p: ArrangementParams): Chip[] {
  const seen = new Set<string>();
  const chips: Chip[] = [];
  const add = (c: Chip): void => { if (!seen.has(c.noteId)) { seen.add(c.noteId); chips.push(c); } };
  for (const t of p.tracks) {
    add({ text: t.phrase, noteId: `phrases/${t.phrase}`, kind: 'phrase' });
    add({ text: `${t.kit} kit`, noteId: `kits/${t.kit}`, kind: 'kit' });
  }
  return chips;
}

export type StripToken = Chip | '->' | 'used by:';

/**
 * The strip as tokens, left to right: the sources, an arrow, the phrase chip, an arrow and the bar it ends on (a morph's b), then the fork chips; a bar tab's chips (all phrases) follow `used by:`. The DOM draws these tokens
 * and `stripText` prints them, so what is on screen is what the tests pin.
 */
export function stripTokens(chips: readonly Chip[]): StripToken[] {
  if (chips.length === 0) return [];
  if (chips.some((c) => c.kind === 'kit')) return [...chips];                    // an arrangement's strip: a flat row
  if (chips.every((c) => c.kind === 'phrase')) return ['used by:', ...chips];
  const at = chips.findIndex((c) => c.kind === 'phrase');
  const rest = chips.slice(at + 1);
  const ends = rest.filter((c) => c.kind === 'bar'), forkChips = rest.filter((c) => c.kind === 'fork');
  return [...chips.slice(0, at), '->', chips[at], ...(ends.length ? ['->' as const, ...ends] : []), ...forkChips];
}

/** The text of a strip: `[bar_007] -> [phrase_004 morph, 17 bars] -> [bar_008] [bar_009 fork of bar 9]`; a bar tab's: `used by: [phrase_001] [phrase_003]`. */
export function stripText(chips: readonly Chip[]): string {
  return stripTokens(chips).map((t) => (typeof t === 'string' ? t : `[${t.text}]`)).join(' ');
}

/** The chips of a bar's tab: the phrases of the vault that read this bar, from the vault's resolved links (`metadataCache.resolvedLinks`: source path -> target path -> count), in name order. */
export function usedByChips(barName: string, resolved: Record<string, Record<string, number>>): Chip[] {
  const target = `bars/${barName}.md`;
  return Object.keys(resolved)
    .filter((src) => /^phrases\/phrase_\d+\.md$/.test(src) && (resolved[src][target] ?? 0) > 0)
    .sort()
    .map((src): Chip => { const name = baseName(src).replace(/\.md$/, ''); return { text: name, noteId: `phrases/${name}`, kind: 'phrase' }; });
}

/** The evidence line when the notes pane went to `path` and the Score lit `bars`. */
export function litEvidence(path: string, bars: readonly number[]): string {
  return `[forge-strip] note pane -> ${path} lights bars ${bars.length === 0 ? 'none' : bars.join(', ')}`;
}
