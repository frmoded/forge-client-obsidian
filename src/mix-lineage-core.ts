// score_first M8 (drain 2026-10-23-0230) — navigation through a mix: "where did each hit come from?"
//
// A mix is ONE bar made by the engine's `mix_rhythm(a, b, weight, threshold, ghost)` from two parent bars. Two levels of answer, both derived — never read off the engraving (P4, P6):
//   * the BAR: made by this phrase, from bar a (weight %) and bar b (1 - weight %), each a link to its note;
//   * each HIT: from bar a only, from bar b only or from both, with its velocity; a ghost hit says why it is only a ghost.
// The per-hit answer is computed from the two parent bars' data with the engine's own rule (v = weight * pA + (1 - weight) * pB; a hit is placed at v >= threshold, a ghost at v >= threshold / 2),
// and then CROSS-CHECKED against the bar the engine really returned: a hit the rule predicts and the engine did not return (or the reverse) is a refusal naming it, so the copy of the rule here can
// never silently drift from forge/music/lib.py (a real-engine test sweeps weights, thresholds and ghost on real and synthetic bars). The velocity shown is the engine's own, never recomputed.
//
// Ids: the bar's <measure> gets the M6 bar id (annotatePhraseXml, one bar) and every engraved hit the M3 (channel, step) id (annotateRhythmXml, verified against the mixed bar's data). The generic
// inspector then works on both: a click on a notehead selects the hit (the nearest mapped ancestor), a click on the staff the bar. Pure: no Obsidian, no engine, no DOM.
import { PHRASE_BAR_SCOPE, annotatePhraseXml, phraseBarId, phraseNoteId, phraseSourceNoteId, type PhraseBarInfo } from './phrase-lineage-core.ts';
import { annotateRhythmXml, type AnnotatedHit, type Provenance, type ProvenanceMap, type ProvenanceResult, type RhythmDataLike } from './provenance-core.ts';
import type { LineageEntry } from './artifact-inspector-core.ts';

export const MIX_BAR_ROLE = 'mix-bar';
export const MIX_HIT_ROLE = 'mix-hit';
/** The one bar's id (the M6 bar id of bar 1) and the scope of the hits' ids. */
export const MIX_BAR_ID = phraseBarId(PHRASE_BAR_SCOPE, 1);
export const MIX_HIT_SCOPE = 'mx';
/** The three kinds' colours (inline-styled on the Score: a theme cannot hide them) and marks (a shape each, so the cue does not depend on telling colours apart). */
export const MIX_COLOURS = { a: '#1b6ec2', b: '#d9730d', both: '#6a3d9a' } as const;
export const MIX_MARKS = { a: '▲', b: '■', both: '●' } as const;

/** The engine's slack when it compares a mixed presence against the threshold (`_RHYTHM_MIX_EPSILON`): 1 - 0.9 is 0.09999999999999998 in floats. */
const EPSILON = 1e-9;
/** The velocity of a plain `true` hit (`_RHYTHM_DEFAULT_VELOCITY`). */
const DEFAULT_VELOCITY = 90;

export interface MixParams { a: string; b: string; weight: number; threshold: number; ghost: boolean }
export type MixHitKind = 'a' | 'b' | 'both' | 'ghost-a' | 'ghost-b';
export interface MixHit { channel: string; step: number; kind: MixHitKind; v: number }
export interface MixHitWithVelocity extends MixHit { velocity: number }

const isHit = (cell: unknown): boolean => cell === true || (typeof cell === 'number' && Number.isInteger(cell) && cell > 0);

/** Every hit of the mixed bar, from the two PARENT bars alone: channels in the engine's union order (a's, then b's new ones), steps ascending. */
export function classifyMixHits(a: RhythmDataLike, b: RhythmDataLike, params: MixParams): MixHit[] {
  const channels = [...Object.keys(a.channels), ...Object.keys(b.channels).filter((c) => !Object.prototype.hasOwnProperty.call(a.channels, c))];
  const out: MixHit[] = [];
  for (const channel of channels) {
    const ra = a.channels[channel] ?? [];
    const rb = b.channels[channel] ?? [];
    for (let step = 0; step < Math.max(ra.length, rb.length); step++) {
      const inA = isHit(ra[step]);
      const inB = isHit(rb[step]);
      const v = (inA ? params.weight : 0) + (inB ? 1 - params.weight : 0);
      if (!(v > 0)) continue;
      const placed = v >= params.threshold - EPSILON;
      const ghost = !placed && params.ghost && v >= params.threshold / 2 - EPSILON;
      if (!placed && !ghost) continue;
      const parent: 'a' | 'b' | 'both' = inA && inB ? 'both' : inA ? 'a' : 'b';
      out.push({ channel, step, kind: ghost ? (parent === 'a' ? 'ghost-a' : 'ghost-b') : parent, v: Math.round(v * 1e9) / 1e9 });
    }
  }
  return out;
}

export type MixHitsResult = { ok: true; hits: MixHitWithVelocity[] } | { ok: false; problems: string[] };

/** The rule's hits, checked against the bar the ENGINE returned; each hit then carries the engine's own velocity (a plain `true` is 90). */
export function mixHitsFromEngine(a: RhythmDataLike, b: RhythmDataLike, params: MixParams, mixed: RhythmDataLike): MixHitsResult {
  const predicted = classifyMixHits(a, b, params);
  const problems: string[] = [];
  const cellOf = (channel: string, step: number): unknown => mixed.channels[channel]?.[step];
  const key = (channel: string, step: number) => `${channel}:${step}`;
  const predictedKeys = new Set(predicted.map((h) => key(h.channel, h.step)));
  const hits: MixHitWithVelocity[] = [];
  for (const h of predicted) {
    const cell = cellOf(h.channel, h.step);
    if (!isHit(cell)) { problems.push(`${h.channel} step ${h.step + 1}: the rule places a hit the engine did not return`); continue; }
    if ((h.kind === 'ghost-a' || h.kind === 'ghost-b') && cell !== 36) { problems.push(`${h.channel} step ${h.step + 1}: the rule says a ghost, the engine wrote ${String(cell)}`); continue; }
    hits.push({ ...h, velocity: cell === true ? DEFAULT_VELOCITY : (cell as number) });
  }
  for (const [channel, row] of Object.entries(mixed.channels)) {
    row.forEach((cell, step) => { if (isHit(cell) && !predictedKeys.has(key(channel, step))) problems.push(`${channel} step ${step + 1}: the engine returned a hit the rule does not predict`); });
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, hits };
}

export function mixPercents(weight: number): { a: number; b: number } {
  return { a: Math.round(weight * 100), b: Math.round((1 - weight) * 100) };
}

export type MixAnnotateResult =
  | { ok: true; multiXml: string; kitXml: string | null; hits: AnnotatedHit[]; bar: PhraseBarInfo; kitProblems: string[] }
  | { ok: false; problems: string[] };

/** The bar's id on its measure and every engraved hit's id on its note, verified against the mixed bar. The Kit view's trouble is reported separately and never blocks the multi-staff view. */
export function annotateMixXml(multiXml: string, kitXml: string | null, mixed: RhythmDataLike): MixAnnotateResult {
  const bars = annotatePhraseXml(multiXml, kitXml, 1);
  if (bars.ok === false) return { ok: false, problems: bars.problems };
  const hits = annotateRhythmXml(bars.multiXml, bars.kitXml, mixed, MIX_HIT_SCOPE);
  if (hits.ok === false) return { ok: false, problems: hits.problems };
  return { ok: true, multiXml: hits.multiXml, kitXml: hits.kitXml, hits: hits.hits, bar: bars.bars[0], kitProblems: [...bars.kitProblems, ...hits.kitProblems] };
}

const isLike = (d: unknown): d is RhythmDataLike => typeof d === 'object' && d !== null && typeof (d as RhythmDataLike).channels === 'object' && (d as RhythmDataLike).channels !== null;

/** The whole step for a mix's Score: the engine's tagged-MusicXML payload — which carries the engine's own `mixed_bar` (the plugin's glue adds it) and, from produceMix, the two parent bars as `forge_mix` —
 *  becomes the payload with ids on its MusicXML plus the provenance map. Never throws; changes nothing it cannot verify, and says why (the inspector shows the reason, never a guess). */
export function annotateMixPayload(phraseNote: string, params: MixParams, payload: Record<string, unknown>): ProvenanceResult {
  const none = (problem: string): ProvenanceResult => ({ payload, map: {}, problems: [problem], kitProblems: [] });
  const parents = payload.forge_mix as { a?: unknown; b?: unknown } | undefined;
  if (!parents || !isLike(parents.a) || !isLike(parents.b)) return none('the two bars of the mix did not reach the Score');
  if (!isLike(payload.mixed_bar)) return none('the engine did not return the mixed bar');
  const multiKey = typeof payload.multi_staff_content === 'string' ? 'multi_staff_content' : typeof payload.content === 'string' ? 'content' : null;
  if (multiKey === null) return none('the Score payload carries no MusicXML');
  try {
    const checked = mixHitsFromEngine(parents.a, parents.b, params, payload.mixed_bar);
    if (checked.ok === false) return none(checked.problems[0]);
    const tied = annotateMixXml(payload[multiKey] as string, typeof payload.kit_content === 'string' ? payload.kit_content : null, payload.mixed_bar);
    if (tied.ok === false) return none(tied.problems[0]);
    const next: Record<string, unknown> = { ...payload, [multiKey]: tied.multiXml };
    if (tied.kitXml !== null) next.kit_content = tied.kitXml;
    return { payload: next, map: mixProvenance(phraseNote, params, tied.hits, checked.hits, tied.bar.tempo), problems: [], kitProblems: tied.kitProblems };
  } catch (e) {
    console.error('annotateMixPayload failed', e);
    return none(`the mix could not be tied to its bars (${(e as Error)?.message ?? e})`);
  }
}

/** element id -> provenance: the bar first (so it is the map's first element), then every engraved hit. A tied tail carries its head's provenance. */
export function mixProvenance(phraseNote: string, params: MixParams, annotated: ReadonlyArray<{ id: string; channel: string; step: number; tiedFrom?: string }>, hits: readonly MixHitWithVelocity[], tempo: number | null): ProvenanceMap {
  const mix = { a: params.a, b: params.b, weight: params.weight, threshold: params.threshold, ghost: params.ghost };
  const map: ProvenanceMap = { [MIX_BAR_ID]: { noteId: phraseNote, role: MIX_BAR_ROLE, params: { ...mix, tempo } } };
  for (const h of annotated) {
    const hit = hits.find((x) => x.channel === h.channel && x.step === h.step);
    if (!hit) continue;
    const p: Record<string, unknown> = { ...mix, channel: h.channel, step: h.step, kind: hit.kind, v: hit.v, velocity: hit.velocity };
    if (h.tiedFrom !== undefined) p.tiedFrom = h.tiedFrom;
    map[h.id] = { noteId: phraseNote, role: MIX_HIT_ROLE, params: p };
  }
  return map;
}

/** The legend line: what the three marks and colours on the pinned Score mean. */
export function mixLegend(p: MixParams): LineageEntry {
  const legend: Array<{ mark: string; colour: string; text: string }> = [
    { mark: MIX_MARKS.a, colour: MIX_COLOURS.a, text: `only ${p.a}` },
    { mark: MIX_MARKS.b, colour: MIX_COLOURS.b, text: `only ${p.b}` },
    { mark: MIX_MARKS.both, colour: MIX_COLOURS.both, text: 'both bars' },
  ];
  if (p.ghost) legend.push({ mark: '△', colour: '#666666', text: 'hollow = a ghost hit' });
  return { kind: 'legend', text: legend.map((l) => `${l.mark} ${l.text}`).join(' · '), legend };
}

function hitLine(p: Record<string, unknown>): string {
  const a = String(p.a), b = String(p.b);
  const kind = String(p.kind) as MixHitKind;
  const tail = p.tiedFrom !== undefined ? ' — tied continuation' : '';
  const threshold = Number(p.threshold).toFixed(2);
  if (kind === 'ghost-a') return `ghost: only ${a} has it (v ${Number(p.v).toFixed(2)}, below threshold ${threshold})${tail}`;
  if (kind === 'ghost-b') return `ghost: only ${b} has it (v ${Number(p.v).toFixed(2)}, below threshold ${threshold})${tail}`;
  const from = kind === 'both' ? 'both bars' : `${kind === 'a' ? a : b} only`;
  return `this hit: from ${from}, velocity ${String(p.velocity)}${tail}`;
}

/** The lineage stack of a pinned element, outermost first: for a hit its own line, then (hit or bar) which note made the mix, which bars it came from, and the legend. The notes are links. */
export function mixLineageOf(prov: Provenance): LineageEntry[] {
  if (prov.role !== MIX_BAR_ROLE && prov.role !== MIX_HIT_ROLE) return [{ kind: 'hit', text: prov.role }, { kind: 'note', text: prov.noteId, noteId: prov.noteId }];
  const p = prov.params;
  const a = String(p.a), b = String(p.b);
  const name = phraseNoteId(prov.noteId).split('/').pop() ?? prov.noteId;
  const pct = mixPercents(Number(p.weight));
  const params: MixParams = { a, b, weight: Number(p.weight), threshold: Number(p.threshold), ghost: p.ghost === true };
  const out: LineageEntry[] = [];
  if (prov.role === MIX_HIT_ROLE) out.push({ kind: 'hit', text: hitLine(p) });
  out.push({ kind: 'note', text: `made by ${name} (mix, ${pct.a} % ${a} / ${pct.b} % ${b}, threshold ${params.threshold.toFixed(2)})`, noteId: prov.noteId, openLabel: `Open ${name}`, covers: 'all' });
  if (a === b) out.push({ kind: 'note', text: `from ${a} (both sides of the mix)`, noteId: phraseSourceNoteId(a), openLabel: `Open ${a}` });
  else {
    out.push({ kind: 'note', text: `from ${a} (${pct.a} %)`, noteId: phraseSourceNoteId(a), openLabel: `Open ${a}` });
    out.push({ kind: 'note', text: `from ${b} (${pct.b} %)`, noteId: phraseSourceNoteId(b), openLabel: `Open ${b}` });
  }
  out.push(mixLegend(params));
  return out;
}
