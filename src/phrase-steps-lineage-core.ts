// 2026-11-20-1000 - THE INSPECTOR THROUGH THE STEP LINES. A phrase with a head (Extend, Mix, Morph or Take) and step lines after it (Keep, Delete, Copy, Move, Morph-between, Mix, Extend) has a Score whose bars are no longer the head's: the builders of
// phrase-lineage-core.ts / morph-lineage-core.ts / mix-lineage-core.ts know only the head's bars, so the Inspector said "This score could not be mapped to its note (the Score has 7 bars but the phrase asks for 4)" and a click on a bar did nothing.
// This core maps the Score THROUGH the steps. Pure: no Obsidian, no DOM, no engine.
//
//   traceSteps(headBars, ops)   the ORIGIN of every bar of the final Score: the head's bar it IS (a bar a Keep, a Delete or a Copy ahead of it only moved to another number, a Copy's copy, a Move's moved bar), or the step that MADE it (Morph-between, Mix, Extend)
//                               with the positions of its source bars as they were before that step and the head bars those come from. Keep, Delete, Copy and Move are run by bar-structure-core's own `applyStructure` (on positions), so the trace cannot drift
//                               from the steps; the three steps that ask the engine for new bars put them where applyStepsAsync puts them (the engine gives exactly the asked number of bars or the step is refused).
//   annotateWithSteps(...)      the ids on the Score (the traced count is what the Score must have) and the map: one entry per bar, PHRASE_BAR_ROLE, `bar` = the bar's POSITION in the Score (what a click inserts: `Delete bar 3`), `source` the note of its head bar (what
//                               pinnedNoteFor reads, unchanged), and `steps`, what the Inspector says.
//   stepLineageOf(prov)         the stack of a pinned bar, in plain words: a carried bar says which note made it ("from bar_005") and, only when something happened to it, "was bar 4 before the steps", "copied by step 2: Copy bars 2 to 3.", "moved by step 3: ...";
//                               a bar a step made says "made by step 2: Mix bars 2 and 3, ..." and "from bars 2 and 3 as they were before step 2", then the notes those come from. A deleted bar is not in the Score, so it is in no map.
// A phrase with NO structure step is not this core's (null): its builders are what they were (P3). Behind the list-model seam (src/list-model-selected.ts): the lean edition has no Score and does not carry it.
import type { Provenance, ProvenanceMap, ProvenanceResult } from './provenance-core.ts';
import type { LineageEntry } from './artifact-inspector-core.ts';
import { annotatePhraseXml, describeTempoChange, PHRASE_BAR_ROLE } from './phrase-lineage-core.ts';
import { applyStructure, isRunsOp, isStructureOp, structureSentence } from './bar-structure-core.ts';
import { morphOrderWords, type PhraseParams, type StructureOp } from './phrase-core.ts';

/** 2026-11-20-1000: this core is the LIST MODEL's (music-composer code, reached only through src/list-model-selected.ts); the music edition's list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_PHRASE_STEPS_LINEAGE_CORE = 'forge-list-model-core:phrase-steps-lineage-core';

/** Where a bar of the final Score came from. `head` = the head's bar it IS (1-based), else null (a step made it: `made`). `via` = the Copy and Move steps that carried it, in the order they ran. */
export interface StepOrigin {
  head: number | null;
  made: { step: number; from: number[]; heads: number[] } | null;
  via: Array<{ step: number; how: 'copy' | 'move' }>;
}

const own = (o: StepOrigin): StepOrigin => ({ head: o.head, made: o.made === null ? null : { step: o.made.step, from: [...o.made.from], heads: [...o.made.heads] }, via: o.via.map((v) => ({ ...v })) });

/** The origin of every bar of the Score after `ops` (steps numbered from 1), starting from `headBars` bars of the head. Throws (with the step's own words) for a step that names a bar the bars do not have: a Score that was drawn never does. */
export function traceSteps(headBars: number, ops: readonly StructureOp[]): StepOrigin[] {
  let cur: StepOrigin[] = Array.from({ length: headBars }, (_, i) => ({ head: i + 1, made: null, via: [] }));
  const headsOf = (o: StepOrigin): number[] => (o.head !== null ? [o.head] : o.made!.heads);
  ops.forEach((op, k) => {
    const step = k + 1;
    if (isRunsOp(op)) {
      const r = applyStructure(cur.map((_, i) => i), op);                // the positions (0-based) the step leaves, in order: the same code the step runs on the bars
      if (r.ok === false) throw new Error(`step ${step}: ${r.message}`);
      const seen = new Set<number>();
      const moved = new Set<number>();
      const placed = op.op === 'copy' && op.after !== undefined ? new Set(Array.from({ length: r.items.length - cur.length }, (_, i) => (op.after === 'end' ? cur.length : op.after as number) + i)) : null;          // 2026-11-24-1036: a copy put in a gap: the bars of THAT block are the copies (the originals keep their places, wherever the gap is)
      if (op.op === 'move') for (const [a, b] of op.runs) { for (let i = a - 1; i < b; i++) moved.add(i); moved.add(op.by === -1 ? a - 2 : b); }          // a Move swaps each run with the ONE bar next to it: both are moved
      cur = r.items.map((at, k) => {
        const copy = placed !== null ? placed.has(k) : seen.has(at); seen.add(at);                          // a position seen again is a COPY (the original comes first); with a place the block of copies says it
        if (!copy && !moved.has(at)) return cur[at];
        const o = own(cur[at]); o.via.push({ step, how: copy ? 'copy' : 'move' });
        return o;
      });
      return;
    }
    const n = cur.length;
    const from = op.op === 'extend_bar' ? [op.bar] : [op.a, op.b];
    const bad = from.find((p) => p > n);
    if (bad !== undefined) throw new Error(`step ${step}: bar ${bad} asked for, but there ${n === 1 ? 'is 1 bar' : `are ${n} bars`}.`);
    const heads = [...new Set(from.flatMap((p) => headsOf(cur[p - 1])))].sort((x, y) => x - y);
    const made: StepOrigin[] = Array.from({ length: op.op === 'mix_bars' ? 1 : op.bars }, () => ({ head: null, made: { step, from: [...from], heads: [...heads] }, via: [] }));
    if (op.op === 'extend_bar' && op.after === undefined) { cur = [...cur.slice(0, op.bar - 1), ...made, ...cur.slice(op.bar)]; return; }       // an Extend with no place REPLACES its bar
    const at = op.after === 'end' ? n : (op.after as number);
    cur = [...cur.slice(0, at), ...made, ...cur.slice(at)];
  });
  return cur;
}

/** The steps of a phrase that change WHICH bars there are, in order (a take's density steps keep every bar: they are not here). */
const structureOpsOf = (p: PhraseParams): StructureOp[] => (p.kind === 'transform' ? p.ops.filter(isStructureOp) : (p.ops ?? []));

/** The notes a bar of the HEAD comes from, the one the notes pane follows first: an Extend's source bar; a Take's phrase; a Morph's bar a up to its middle bar ((bars + 1) / 2), else bar b (the rule of pinnedNoteFor); a Mix's two bars, the heavier first. Lineage ids (`bars/bar_005`). */
function headNotes(p: PhraseParams, h: number): string[] {
  if (p.kind === 'transform') return [p.source];
  if (p.kind === 'extend') return [`bars/${p.source}`];
  if (p.kind === 'morph') return [`bars/${h <= (p.bars + 1) / 2 ? p.a : p.b}`];
  return (p.weight >= 0.5 ? [p.a, p.b] : [p.b, p.a]).map((x) => `bars/${x}`);
}

/** What made the head's bars, in the words of the head's own stack ("extend, no tempo change, style repeat_with_fills"). */
function madeByWords(p: PhraseParams): string {
  if (p.kind === 'transform') return `a transform of ${p.source.split('/').pop()}`;
  if (p.kind === 'extend') return `extend, ${describeTempoChange(p.tempo_change_pct)}, style ${p.style}`;
  if (p.kind === 'morph') return `morph ${p.a} -> ${p.b}, ${morphOrderWords({ order: p.order, seed: p.seed })}`;
  return `mix of ${p.a} and ${p.b}, as a ${p.mode === 'path' ? 'path' : 'vote'}`;
}

/** What the Inspector needs of a bar of a phrase with steps (the `steps` param of its provenance). */
export interface StepBar {
  head: number | null;
  via: Array<{ step: number; how: 'copy' | 'move'; sentence: string }>;
  made: { step: number; sentence: string; from: number[] } | null;
  /** The notes the bar comes from (lineage ids), the one the notes pane follows first. */
  notes: string[];
  madeBy: string;
  /** "Edit this bar" / "Revert to generated" are offered as an extend's and a morph's are (the fork keys are the bar's position in the Score; editThisBar takes a bar up to the head's own count). */
  canFork: boolean;
  canRevert: boolean;
}

export function stepProvenance(phraseNote: string, params: PhraseParams, ops: readonly StructureOp[], trace: readonly StepOrigin[], bars: ReadonlyArray<{ id: string; index: number; tempo: number | null }>): ProvenanceMap {
  const map: ProvenanceMap = {};
  const madeBy = madeByWords(params);
  const forks = 'overrides' in params ? params.overrides : undefined;
  for (const b of bars) {
    const o = trace[b.index - 1];
    const notes = o.made === null ? headNotes(params, o.head!) : [...new Set(o.made.heads.flatMap((h) => headNotes(params, h)))];
    const fork = forks?.[String(b.index)];
    const transform = params.kind === 'transform';
    const forkable = params.kind === 'extend' || params.kind === 'morph';
    const steps: StepBar = {
      head: o.head,
      via: o.via.map((v) => ({ ...v, sentence: structureSentence(ops[v.step - 1]) })),
      made: o.made === null ? null : { step: o.made.step, sentence: structureSentence(ops[o.made.step - 1]), from: o.made.from },
      notes, madeBy, canFork: forkable && fork === undefined && b.index <= (params as { bars: number }).bars, canRevert: forkable,
    };
    map[b.id] = {
      noteId: phraseNote, role: PHRASE_BAR_ROLE,
      params: { bar: b.index, bars: trace.length, tempo: b.tempo, source: transform ? notes[0] : notes[0].slice('bars/'.length), ...(transform ? { transform: true } : {}), ...(fork !== undefined ? { fork } : {}), steps },
    };
  }
  return map;
}

/**
 * The Score of a phrase with step lines, tied: the ids on the MusicXML (both views) and one map entry per bar. `null` = not this core's (no structure step, or the payload carries no head count: the old builders answer). The head's bar count rides on the payload
 * (`forge_steps`, put there by producePhraseNote only for a phrase that has steps). A Score whose measures are not the traced count is refused in the words of annotatePhraseXml, never guessed around. Never throws.
 */
export function annotateWithSteps(phraseNote: string, params: PhraseParams, payload: Record<string, unknown>): ProvenanceResult | null {
  const ops = structureOpsOf(params);
  if (ops.length === 0) return null;
  const info = payload.forge_steps as { head?: unknown } | undefined;
  if (!info || typeof info.head !== 'number' || !Number.isInteger(info.head) || info.head < 1) return null;
  const none = (problem: string): ProvenanceResult => ({ payload, map: {}, problems: [problem], kitProblems: [] });
  const key = typeof payload.multi_staff_content === 'string' ? 'multi_staff_content' : typeof payload.content === 'string' ? 'content' : null;
  if (key === null) return none('the Score payload carries no MusicXML');
  try {
    const trace = traceSteps(info.head, ops);
    const tagged = annotatePhraseXml(payload[key] as string, typeof payload.kit_content === 'string' ? payload.kit_content : null, trace.length);
    if (tagged.ok === false) return none(tagged.problems[0]);
    const next: Record<string, unknown> = { ...payload, [key]: tagged.multiXml };
    if (tagged.kitXml !== null) next.kit_content = tagged.kitXml;
    return { payload: next, map: stepProvenance(phraseNote, params, ops, trace, tagged.bars), problems: [], kitProblems: tagged.kitProblems };
  } catch (e) {
    console.error('annotateWithSteps failed', e);
    return none(`the bars could not be tied through the steps (${(e as Error)?.message ?? e})`);
  }
}

const base = (id: string): string => id.split('/').pop() ?? id;
const barsWords = (positions: readonly number[]): string => (positions.length === 1 ? `bar ${positions[0]}` : `bars ${positions.slice(0, -1).join(', ')} and ${positions[positions.length - 1]}`);

/** The lineage stack of a pinned bar of a phrase with steps, outermost first (see the header). Plain words; the step lines are the muted `step` kind. */
export function stepLineageOf(prov: Provenance): LineageEntry[] {
  const p = prov.params;
  const s = p.steps as StepBar;
  const name = prov.noteId.split('/').pop() ?? prov.noteId;
  const out: LineageEntry[] = [{ kind: 'bar', text: `bar ${String(p.bar)} of ${String(p.bars)}`, covers: 'self' }];
  const tempo = (suffix = ''): void => { if (typeof p.tempo === 'number') out.push({ kind: 'tempo', text: `tempo ${p.tempo}${suffix}`, covers: 'self' }); };
  if (typeof p.fork === 'string') {                                        // an edited bar (the forks number the bars AFTER the steps): what it says is its own note
    const forkName = p.fork.split('/').pop() ?? p.fork;
    out.push({ kind: 'note', text: `forked: edited in ${forkName} (was made by ${name}, ${s.madeBy})`, noteId: p.fork, openLabel: `Open ${forkName}` });
    tempo(" (the fork's own)");
    if (s.canRevert) out.push({ kind: 'action', text: 'Revert to generated', action: { id: 'revert', barNumber: Number(p.bar) } });
    return out;
  }
  const notes = (): void => { for (const id of s.notes) out.push({ kind: 'note', text: `from ${base(id)}`, noteId: id, openLabel: `Open ${base(id)}`, covers: 'all' }); };
  if (s.made !== null) {
    const m = s.made;
    out.push({ kind: 'step', text: `made by step ${m.step}: ${m.sentence}`, covers: 'self' });
    out.push({ kind: 'step', text: `from ${barsWords(m.from)} as ${m.from.length === 1 ? 'it was' : 'they were'} before step ${m.step}`, covers: 'self' });
    notes();
  } else {
    out.push({ kind: 'note', text: `made by ${name} (${s.madeBy})`, noteId: prov.noteId, openLabel: `Open ${name}`, covers: 'all' });
    notes();
    if (s.head !== p.bar) out.push({ kind: 'step', text: `was bar ${String(s.head)} before the steps`, covers: 'self' });
    for (const v of s.via) out.push({ kind: 'step', text: `${v.how === 'copy' ? 'copied' : 'moved'} by step ${v.step}: ${v.sentence}`, covers: 'self' });
  }
  tempo();
  if (s.canFork) out.push({ kind: 'action', text: 'Edit this bar', action: { id: 'fork', barNumber: Number(p.bar) } });
  return out;
}
