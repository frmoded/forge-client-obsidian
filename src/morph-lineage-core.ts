// score_first M7c Phase B (drain 2026-10-24-1230) — navigation through a morph: "which bar of the path is this, which single-hit change made it, where did each hit come from?"
//
// A morph is `bars` bars along an ordered path of single-hit edits from bar a to bar b (`morph_rhythm`, forge/music/lib.py). Two levels of answer, both DERIVED from what the ENGINE returned — never read off the engraving
// and never from a second copy of the engine's rules (P4, P6):
//   * the BAR: its place in the path (state k of d: the first k edits applied), the change that made it from the previous bar, the tempo the engine gave it, and the two bars it lies between, each a link;
//   * each HIT: from both bars, from bar a only (removed in bar K) or from bar b only (added in bar K), K being the first drawn bar whose state includes that change.
// How a bar's state is found: the engine hands back the bars it drew (`bars_data`) and the edits in the order it applied them (`morph_info`). Bar i is state k when applying the first k edits to bar a's hits gives exactly
// bar i's hits (the edits touch distinct cells, so at most one k fits). A bar that fits no k is a refusal naming it: the plugin never guesses, and it cannot drift from the engine because it copies no rule from it
// (the number of changes between two bars is the one rule mirrored elsewhere, pinned to the engine by a real-engine sweep). A FORKED bar (the person edited it in its own note) is exempt: it is what the fork says.
//
// Ids: every `<measure>` of the first part gets the M6 bar id (annotatePhraseXml) and every engraved hit of every generated bar the M3 (channel, step) id with the bar in its scope (`mo3_kick_2`), verified against the bar's data.
// Pure: no Obsidian, no engine, no DOM.
import { annotatePhraseXml, phraseBarId, phraseNoteId, phraseSourceNoteId, PHRASE_BAR_SCOPE, type PhraseBarInfo } from './phrase-lineage-core.ts';
import { CANONICAL_CHANNELS, hitId, hitSteps, insertIds, scanParts, stepDivisions, type AnnotatedHit, type Provenance, type ProvenanceMap, type ProvenanceResult, type RhythmDataLike, type XmlNote } from './provenance-core.ts';
import type { LineageEntry } from './artifact-inspector-core.ts';
import { MIX_COLOURS, MIX_MARKS } from './mix-lineage-core.ts';
import { morphOrderWords, type MorphPhrase } from './phrase-core.ts';

export const MORPH_BAR_ROLE = 'morph-bar';
export const MORPH_HIT_ROLE = 'morph-hit';
export const MORPH_HIT_SCOPE = 'mo';
/** The scope of bar n's hit ids: `mo3` -> `mo3_kick_2`, so no two bars' hits share an id. */
export const morphHitScope = (bar: number): string => `${MORPH_HIT_SCOPE}${bar}`;
/** The colours and marks are the mix's (blue triangle: only bar a, orange square: only bar b, purple circle: both). */
export const MORPH_COLOURS = MIX_COLOURS;
export const MORPH_MARKS = MIX_MARKS;

export interface MorphEdit { kind: 'add' | 'remove'; channel: string; step: number }
export type MorphHitKind = 'a' | 'b' | 'both';

const isHit = (cell: unknown): boolean => cell === true || (typeof cell === 'number' && Number.isInteger(cell) && cell > 0);
const cellKey = (channel: string, step: number): string => `${channel}:${step}`;
function hitSet(d: RhythmDataLike): Set<string> {
  const out = new Set<string>();
  for (const [channel, row] of Object.entries(d.channels)) row.forEach((cell, step) => { if (isHit(cell)) out.add(cellKey(channel, step)); });
  return out;
}

/** The step of the path a drawn bar is at: the k for which bar a with its first k edits applied has exactly this bar's hits, or null when no k fits (the engine's bar is not on the path). */
export function morphStateOf(a: RhythmDataLike, edits: readonly MorphEdit[], bar: RhythmDataLike): number | null {
  const want = hitSet(bar);
  const cur = hitSet(a);
  const same = (): boolean => cur.size === want.size && [...cur].every((k) => want.has(k));
  if (same()) return 0;
  for (let k = 0; k < edits.length; k++) {
    const key = cellKey(edits[k].channel, edits[k].step);
    if (edits[k].kind === 'add') cur.add(key); else cur.delete(key);
    if (same()) return k + 1;
  }
  return null;
}

/** One change in plain words. Steps are numbered from 1, as the Beat Box and the bar inspector number them. */
export function describeEdit(e: MorphEdit): string {
  return `${e.kind === 'add' ? 'added' : 'removed'} ${e.channel} at step ${e.step + 1}`;
}

export interface BarEditInput { bar: number; bars: number; a: string; b: string; state: number; previousState: number; d: number; edits: readonly MorphEdit[] }

/** The change that made this bar from the previous one, in words. The first bar says it is bar a, the last says it is bar b; a bar that repeats the previous state says nothing changed. */
export function barEditLine(i: BarEditInput): string {
  if (i.bars === 1) {
    if (i.state === 0) return `unchanged: this is ${i.a}`;
    if (i.state === i.d) return `this is ${i.b}`;
    return `after ${i.state} of ${i.d} changes, the last: ${describeEdit(i.edits[i.state - 1])}`;
  }
  if (i.bar === 1) return `unchanged: this is ${i.a}`;
  const made = i.edits.slice(i.previousState, i.state).map(describeEdit);
  const change = made.length > 0 ? made.join('; ') : 'no change from the previous bar';
  return i.bar === i.bars ? `${change}; this is ${i.b}` : change;
}

export type MorphAnnotateResult =
  | { ok: true; multiXml: string; kitXml: string | null; hits: Array<AnnotatedHit & { bar: number }>; bars: PhraseBarInfo[]; kitProblems: string[] }
  | { ok: false; problems: string[] };

/** The bar ids on the measures (both views) and a hit id on every engraved hit of every bar not in `skip` (multi-staff view), verified against each bar's data. The Kit view carries the bar ids only. */
export function annotateMorphXml(multiXml: string, kitXml: string | null, bars: readonly RhythmDataLike[], skip: ReadonlySet<number> = new Set()): MorphAnnotateResult {
  const tagged = annotatePhraseXml(multiXml, kitXml, bars.length);
  if (tagged.ok === false) return { ok: false, problems: tagged.problems };
  const multi = scanParts(tagged.multiXml);
  if (!multi) return { ok: false, problems: ['the multi-staff MusicXML could not be scanned'] };
  const channels = new Set<string>();
  for (const b of bars) for (const c of Object.keys(b.channels)) channels.add(c);
  const unknown = [...channels].filter((c) => !(CANONICAL_CHANNELS as readonly string[]).includes(c));
  if (unknown.length > 0) return { ok: false, problems: [`channel(s) the provenance map does not know: ${unknown.join(', ')}`] };
  const present = CANONICAL_CHANNELS.filter((c) => channels.has(c));
  const problems: string[] = [];
  if (multi.length !== present.length) problems.push(`the Score has ${multi.length} part(s) but the bars have ${present.length} channel(s)`);
  const short = multi.find((p) => p.measures !== bars.length);
  if (short) problems.push(`the Score has ${short.measures} bar(s) but the morph has ${bars.length}`);
  if (problems.length > 0) return { ok: false, problems };
  const hits: Array<AnnotatedHit & { bar: number }> = [];
  const ids = new Map<XmlNote, string>();
  for (const [b, data] of bars.entries()) {
    if (skip.has(b + 1)) continue;                                        // a forked bar is what its note says: the bar pins, its hits are not tied
    for (const [i, channel] of present.entries()) {
      const part = multi[i];
      const div = stepDivisions(data, part.divisions);
      if (div === null) return { ok: false, problems: [`the time signature "${data.time_signature}" is not N/D`] };
      const found = part.notes.filter((n) => n.measure === b && !n.rest);
      const steps = found.filter((n) => !n.tieStop).map((n) => n.onset / div);
      const expected = hitSteps(data.channels[channel] ?? []);
      if (steps.length !== expected.length || steps.some((s, k) => s !== expected[k])) {
        problems.push(`bar ${b + 1}, ${channel}: the Score's hits [${steps.join(',')}] are not the bar's [${expected.join(',')}]`);
        continue;
      }
      let h = -1, tails = 0, headId = '';
      for (const n of found) {
        if (!n.tieStop) {
          h++; tails = 0; headId = hitId(morphHitScope(b + 1), channel, expected[h]);
          ids.set(n, headId);
          hits.push({ id: headId, channel, step: expected[h], bar: b + 1 });
        } else {
          const id = `${headId}_t${++tails}`;
          ids.set(n, id);
          hits.push({ id, channel, step: expected[h], tiedFrom: headId, bar: b + 1 });
        }
      }
    }
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, multiXml: insertIds(tagged.multiXml, multi.flatMap((p) => p.notes), ids), kitXml: tagged.kitXml, hits, bars: tagged.bars, kitProblems: [...tagged.kitProblems, ...(kitXml !== null ? ['the hits of a morph are not tied in the Kit view'] : [])] };
}

const isLike = (d: unknown): d is RhythmDataLike => typeof d === 'object' && d !== null && typeof (d as RhythmDataLike).channels === 'object' && (d as RhythmDataLike).channels !== null;
const isEdit = (e: unknown): e is MorphEdit => typeof e === 'object' && e !== null && ((e as MorphEdit).kind === 'add' || (e as MorphEdit).kind === 'remove') && typeof (e as MorphEdit).channel === 'string' && Number.isInteger((e as MorphEdit).step);

/** The whole step for a morph's Score: the engine's tagged-MusicXML payload — which carries the engine's own `morph_info` and `bars_data` (the plugin's glue adds them) and, from produceMorph, the two parent bars as
 *  `forge_morph` — becomes the payload with ids on its MusicXML plus the provenance map. Never throws; changes nothing it cannot verify, and says why (the inspector shows the reason, never a guess). */
export function annotateMorphPayload(phraseNote: string, params: MorphPhrase, payload: Record<string, unknown>): ProvenanceResult {
  const none = (problem: string): ProvenanceResult => ({ payload, map: {}, problems: [problem], kitProblems: [] });
  const parents = payload.forge_morph as { a?: unknown; b?: unknown } | undefined;
  if (!parents || !isLike(parents.a) || !isLike(parents.b)) return none('the two bars of the morph did not reach the Score');
  const info = payload.morph_info as { d?: unknown; edits?: unknown; bars?: unknown } | undefined;
  if (!info || !Number.isInteger(info.d) || !Array.isArray(info.edits) || !info.edits.every(isEdit)) return none('the engine did not return the changes of the morph');
  const edits = info.edits as MorphEdit[];
  if (edits.length !== info.d) return none(`the engine says ${String(info.d)} changes but lists ${edits.length}`);
  const drawn = payload.bars_data;
  if (!Array.isArray(drawn) || !drawn.every(isLike)) return none('the engine did not return the bars it drew');
  if (drawn.length !== params.bars || info.bars !== params.bars) return none(`the morph asks for ${params.bars} bar(s) but the engine drew ${drawn.length}`);
  // the bars the morph drew before any fork was laid in (only present when a bar is forked): every slot of the path, a forked one included, has a state
  const generated = payload.morph_generated === undefined ? drawn : payload.morph_generated;
  if (!Array.isArray(generated) || generated.length !== drawn.length || !generated.every(isLike)) return none('the engine did not return the bars the morph drew before its forks');
  const multiKey = typeof payload.multi_staff_content === 'string' ? 'multi_staff_content' : typeof payload.content === 'string' ? 'content' : null;
  if (multiKey === null) return none('the Score payload carries no MusicXML');
  try {
    const forks = new Set(Object.keys(params.overrides ?? {}).map(Number));
    const states: Array<number | null> = [];          // null = a forked slot (it is what its note says)
    const slots: number[] = [];                       // the step of the path of every slot, a forked one included (carried over from the slot before when the engine gave no way to tell)
    for (const [i, bar] of (generated as RhythmDataLike[]).entries()) {
      const k = morphStateOf(parents.a, edits, bar);
      if (forks.has(i + 1)) { states.push(null); slots.push(k ?? slots[i - 1] ?? 0); continue; }
      if (k === null) return none(`bar ${i + 1} is not a step of the path from ${params.a} to ${params.b} (the engine drew a different bar)`);
      states.push(k); slots.push(k);
    }
    if (slots.some((s, i) => i > 0 && s < slots[i - 1])) return none('the bars the engine drew are not in the order of the path');
    const tied = annotateMorphXml(payload[multiKey] as string, typeof payload.kit_content === 'string' ? payload.kit_content : null, drawn as RhythmDataLike[], forks);
    if (tied.ok === false) return none(tied.problems[0]);
    const next: Record<string, unknown> = { ...payload, [multiKey]: tied.multiXml };
    if (tied.kitXml !== null) next.kit_content = tied.kitXml;
    return { payload: next, map: morphProvenance(phraseNote, params, parents.a, parents.b, drawn as RhythmDataLike[], edits, states, slots, tied.bars, tied.hits), problems: [], kitProblems: tied.kitProblems };
  } catch (e) {
    console.error('annotateMorphPayload failed', e);
    return none(`the morph could not be tied to its bars (${(e as Error)?.message ?? e})`);
  }
}

/** element id -> provenance: every bar first (so bar 1 is the map's first element), then every engraved hit of every generated bar. A tied tail carries its head's provenance. */
export function morphProvenance(phraseNote: string, params: MorphPhrase, a: RhythmDataLike, b: RhythmDataLike, drawn: readonly RhythmDataLike[], edits: readonly MorphEdit[], states: ReadonlyArray<number | null>,
  slots: readonly number[], barInfos: readonly PhraseBarInfo[], annotated: ReadonlyArray<AnnotatedHit & { bar: number }>): ProvenanceMap {
  const d = edits.length;
  const changeOf = new Map(edits.map((e, j) => [cellKey(e.channel, e.step), j + 1]));
  const firstBarWith = (change: number): number | null => { const i = states.findIndex((s) => s !== null && s >= change); return i < 0 ? null : i + 1; };
  const inA = hitSet(a), inB = hitSet(b);
  const map: ProvenanceMap = {};
  const barParams: Record<number, Record<string, unknown>> = {};
  for (const info of barInfos) {
    const i = info.index;
    const state = states[i - 1];
    const fork = params.overrides?.[String(i)];
    const base: Record<string, unknown> = { bar: i, bars: params.bars, tempo: info.tempo, a: params.a, b: params.b, order: params.order, seed: params.seed, d };
    if (fork !== undefined || state === null) base.fork = fork;
    else {
      base.state = state;
      base.edit = barEditLine({ bar: i, bars: params.bars, a: params.a, b: params.b, state, previousState: i > 1 ? slots[i - 2] : 0, d, edits });
    }
    barParams[i] = base;
    map[info.id] = { noteId: phraseNote, role: MORPH_BAR_ROLE, params: base };
  }
  for (const h of annotated) {
    const state = states[h.bar - 1];
    if (state === null) continue;
    const key = cellKey(h.channel, h.step);
    const cell = drawn[h.bar - 1].channels[h.channel]?.[h.step];
    const kind: MorphHitKind = inA.has(key) && inB.has(key) ? 'both' : inA.has(key) ? 'a' : 'b';
    const change = changeOf.get(key) ?? null;
    const p: Record<string, unknown> = { ...barParams[h.bar], channel: h.channel, step: h.step, kind, velocity: cell === true ? 90 : cell, change, changedIn: change === null ? null : firstBarWith(change) };
    if (h.tiedFrom !== undefined) p.tiedFrom = h.tiedFrom;
    map[h.id] = { noteId: phraseNote, role: MORPH_HIT_ROLE, params: p };
  }
  return map;
}

/** The legend line: what the three marks and colours on the pinned bar mean in a morph (not changed yet / already changed / never changes). */
export function morphLegend(a: string, b: string): LineageEntry {
  const legend: Array<{ mark: string; colour: string; text: string }> = [
    { mark: MORPH_MARKS.a, colour: MORPH_COLOURS.a, text: `only ${a} (not changed yet)` },
    { mark: MORPH_MARKS.b, colour: MORPH_COLOURS.b, text: `only ${b} (already changed)` },
    { mark: MORPH_MARKS.both, colour: MORPH_COLOURS.both, text: 'both bars' },
    // 2026-10-26-1100: the named changes count grid positions from 1 and the Beat Box shows no numbers, so the legend (which every stack carries) says so once
    { mark: '#', colour: '#666666', text: 'steps count from 1: step 1 is the first position of the bar' },
  ];
  return { kind: 'legend', text: legend.map((l) => `${l.mark} ${l.text}`).join(' · '), legend };
}

function hitLine(p: Record<string, unknown>): string {
  const a = String(p.a), b = String(p.b);
  const kind = String(p.kind) as MorphHitKind;
  const tail = p.tiedFrom !== undefined ? ' — tied continuation' : '';
  if (kind === 'both') return `this hit: from both bars${tail}`;
  const when = typeof p.changedIn === 'number' ? p.changedIn : null;
  const n = typeof p.change === 'number' ? p.change : null;
  if (kind === 'a') return `this hit: from ${a} only (${when !== null ? `removed in bar ${when}` : `removed by change ${n ?? '?'} of ${String(p.d)}, after this bar`})${tail}`;
  return `this hit: from ${b} only (${when !== null ? `added in bar ${when}` : `added by change ${n ?? '?'} of ${String(p.d)}`})${tail}`;
}

/** The lineage stack of a pinned element, outermost first: for a hit its own line, then (hit or bar) the bar's place in the path, who made it, the bars it lies between (links), the tempo, the change that made it,
 *  the legend and the fork actions. A forked bar says it is forked and offers to revert. */
export function morphLineageOf(prov: Provenance): LineageEntry[] {
  if (prov.role !== MORPH_BAR_ROLE && prov.role !== MORPH_HIT_ROLE) return [{ kind: 'hit', text: prov.role }, { kind: 'note', text: prov.noteId, noteId: prov.noteId }];
  const p = prov.params;
  const a = String(p.a), b = String(p.b);
  const name = phraseNoteId(prov.noteId).split('/').pop() ?? prov.noteId;
  const made = `morph ${a} -> ${b}, ${morphOrderWords({ order: p.order as MorphPhrase['order'], seed: Number(p.seed) })}`;
  const bar = Number(p.bar);
  const out: LineageEntry[] = [];
  if (prov.role === MORPH_HIT_ROLE) out.push({ kind: 'hit', text: hitLine(p) });
  out.push({ kind: 'bar', text: `bar ${String(p.bar)} of ${String(p.bars)}`, covers: 'self' });
  if (typeof p.fork === 'string') {
    const forkName = p.fork.split('/').pop() ?? p.fork;
    out.push({ kind: 'note', text: `forked: edited in ${forkName} (was made by ${name}, ${made})`, noteId: p.fork, openLabel: `Open ${forkName}` });
    if (typeof p.tempo === 'number') out.push({ kind: 'tempo', text: `tempo ${p.tempo} (the fork's own)`, covers: 'self' });
    out.push({ kind: 'action', text: 'Revert to generated', action: { id: 'revert', barNumber: bar } });
    return out;
  }
  out.push({ kind: 'note', text: `made by ${name} (${made})`, noteId: prov.noteId, openLabel: `Open ${name}`, covers: 'all' });
  out.push({ kind: 'bar', text: `step ${String(p.state)} of ${String(p.d)} single-hit changes applied`, covers: 'self' });
  if (a === b) out.push({ kind: 'note', text: `from ${a} (both ends of the morph)`, noteId: phraseSourceNoteId(a), openLabel: `Open ${a}` });
  else {
    out.push({ kind: 'note', text: `from ${a}`, noteId: phraseSourceNoteId(a), openLabel: `Open ${a}` });
    out.push({ kind: 'note', text: `from ${b}`, noteId: phraseSourceNoteId(b), openLabel: `Open ${b}` });
  }
  if (typeof p.tempo === 'number') out.push({ kind: 'tempo', text: `tempo ${p.tempo}`, covers: 'self' });
  if (typeof p.edit === 'string') out.push({ kind: 'bar', text: p.edit, covers: 'self' });
  out.push(morphLegend(a, b));
  out.push({ kind: 'action', text: 'Edit this bar', action: { id: 'fork', barNumber: bar } });
  return out;
}

/** The evidence line of the Inspector: how many bars and hits it tied, or why it could not map the Score (the same reason the Inspector shows). */
export function morphTraceInspector(problems: readonly string[], map: ProvenanceMap): string {
  if (problems.length > 0) return `[forge-morph] inspector could not map the Score: ${problems[0]}`;
  const bars = Object.values(map).filter((p) => p.role === MORPH_BAR_ROLE).length;
  const hits = Object.values(map).filter((p) => p.role === MORPH_HIT_ROLE).length;
  return `[forge-morph] inspector mapped ${bars} bar${bars === 1 ? '' : 's'} and ${hits} hit${hits === 1 ? '' : 's'}`;
}

export { phraseBarId, PHRASE_BAR_SCOPE };
