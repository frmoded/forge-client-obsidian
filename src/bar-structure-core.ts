// 2026-11-16-1000 - the STRUCTURE steps of a transform phrase: Keep, Delete, Copy and Move bars (what the Score's selection menu writes). Pure, no `obsidian`, no engine: they run in TypeScript on the list of bars the source made, BEFORE the
// engine sees the density ops (thin out, double up), so a phrase that only keeps, deletes, copies or moves bars never leaves the plugin. The words are ONE table (`STRUCTURE_WORDS`) so the driver can change a verb in one row.
//
//   "Keep bars 3 to 5 and bar 8."                  the result is only those bars, in their order
//   "Delete bars 3 to 5 and bar 8."                those bars go; the rest close up
//   "Copy bars 3 to 5."                            each range is played again right after itself
//   "Copy bar 6 and put it at the end."            (2026-11-24-1036) the copy goes in a gap instead: after bar N, at the start, at the end; the originals stay
//   "Move bars 3 to 5 one bar left." / "... right."  each range swaps places with the one bar next to it
//   "Move bar 1 after bar 5." / "Move bars 3 to 5 after bar 8." / "Move bar 4 to the start." / "Move bars 3 to 5 to the end."   (2026-11-24-1040) ONE step: the ranges are taken out and put back in the gap (`before bar N` is `after bar N - 1`, `before bar 1` is `to the start`; also `and put it after bar 5`, `at the start`, `at the end`, `between bars 4 and 5`)
//   "Morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3."   (2026-11-19-0996b) 5 NEW bars that change step by step from bar 2 to bar 3, put in a gap; needs the ENGINE (applyStepsAsync)
//   "Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it between bars 2 and 3."           (2026-11-19-0999b) the ONE bar the Mix head makes of bar 2 and bar 3, put in a gap; needs the engine
//   "Extend bar 2 to 4 bars, repeating with fills."                                              (2026-11-19-0999b) bar 2 REPLACED by the 4 bars the Extend head makes of it (with ", and put them at the end" etc. the bar stays and they are inserted); needs the engine
//
// Every range is of the bars as they are BEFORE the step; the ranges are ascending and apart (validatePhrase says so). Steps that change which bars there are come before steps that change what is in them.
import type { BarRun, ExtendBarOp, MixBarsOp, MorphBetweenOp, MorphOrder, RunsOp, StructureOp, TransformOp } from './phrase-core.ts';
import { STYLE_WORDS } from './step-words-core.ts';
import { percentOf, plain } from './number-words-core.ts';

export const isStructureOp = (o: TransformOp): o is StructureOp => o.op === 'keep' || o.op === 'delete' || o.op === 'copy' || o.op === 'move' || o.op === 'morph_between' || o.op === 'mix_bars' || o.op === 'extend_bar';
/** The steps that work on ranges of bars (every structure step but the morph between two bars): synchronous TypeScript, never the engine. */
export const isRunsOp = (o: TransformOp): o is RunsOp => o.op === 'keep' || o.op === 'delete' || o.op === 'copy' || o.op === 'move';
/** "bar 4" / "bars 3 to 5" (the same words phrase-words-core.ts `rangeWords` says: this file stays a leaf, phrase-words-core.ts imports IT). */
const rangeWords = (first: number, last: number): string => (first === last ? `bar ${first}` : `bars ${first} to ${last}`);

/** How each step is said. `keep`/`delete`/`copy` end at the ranges; `move` adds `one bar left` / `one bar right`. */
export const STRUCTURE_WORDS: Record<StructureOp['op'], { verb: string; example: string }> = {
  keep: { verb: 'keep', example: 'Keep bars 3 to 5 and bar 8.' },
  delete: { verb: 'delete', example: 'Delete bars 3 to 5 and bar 8.' },
  copy: { verb: 'copy', example: 'Copy bars 3 to 5.' },
  move: { verb: 'move', example: 'Move bars 3 to 5 one bar left.' },
  morph_between: { verb: 'morph', example: 'Morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3.' },
  mix_bars: { verb: 'mix', example: 'Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it between bars 2 and 3.' },
  extend_bar: { verb: 'extend', example: 'Extend bar 2 to 4 bars, repeating with fills.' },
};
export const MOVE_WORDS = { '-1': 'one bar left', '1': 'one bar right' } as const;

/** "bars 3 to 5 and bar 8" / "bar 2, bars 4 to 5 and bar 9": the ranges in words, joined the way a person lists them. */
export function runsWords(runs: readonly BarRun[]): string {
  const parts = runs.map(([a, b]) => rangeWords(a, b));
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** 2026-11-19-0996b: where a step that makes new bars puts them, in words: "at the start", "at the end", "between bars 2 and 3" (the two bars a Morph-between or a Mix names when they are neighbours and the gap is the one between them), else "after bar 4". */
export function placeWords(o: { after: number | 'end'; a?: number; b?: number }): string {
  if (o.after === 0) return 'at the start';
  if (o.after === 'end') return 'at the end';
  return o.a !== undefined && o.b !== undefined && Math.abs(o.a - o.b) === 1 && o.after === Math.min(o.a, o.b) ? `between bars ${o.after} and ${o.after + 1}` : `after bar ${o.after}`;
}
/** "in musical order" / "in seeded order, seed 17" (a seed is said only with the seeded order). */
const morphOrderWords = (o: { order?: MorphOrder; seed?: number }): string => `in ${(o.order as MorphOrder).replace(/_/g, '-')} order${o.order === 'seeded' ? `, seed ${o.seed}` : ''}`;
const barsWord = (n: number): string => (n === 1 ? 'bar' : 'bars');

/** One step in lower case, no full stop: "keep bars 3 to 5" (the notes' own wording for a step: the caller capitalises it and adds the full stop). */
export function structureWords(o: StructureOp): string {
  if (o.op === 'morph_between') return `morph bars ${o.a} and ${o.b} across ${o.bars} ${barsWord(o.bars)}, ${morphOrderWords(o)}, and put ${o.bars === 1 ? 'it' : 'them'} ${placeWords(o)}`;
  if (o.op === 'mix_bars') {                          // 2026-11-19-0999b: the Mix head's words (the share is a's, the mode, the order and seed of a path, the threshold and the ghost notes of a vote); the place is always said
    const how = o.mode === 'path' ? `as a path, ${morphOrderWords(o)}` : `as a vote${o.threshold !== 0.5 ? `, threshold ${percentOf(o.threshold)} percent` : ''}${o.ghost ? ', with ghost notes' : ''}`;
    return `mix bars ${o.a} and ${o.b}, ${percentOf(o.weight)} percent bar ${o.a}, ${how}, and put it ${placeWords(o)}`;
  }
  if (o.op === 'extend_bar') {                        // 2026-11-19-0999b: the Extend head's words (N bars, the style, the tempo); a place says INSERT, no place says REPLACE
    const tempo = o.tempo_change_pct !== 0 ? `, ${plain(Math.abs(o.tempo_change_pct))} percent ${o.tempo_change_pct < 0 ? 'slower' : 'faster'}` : '';
    return `extend bar ${o.bar} to ${o.bars} ${barsWord(o.bars)}, ${STYLE_WORDS[o.style]}${tempo}${o.after === undefined ? '' : `, and put ${o.bars === 1 ? 'it' : 'them'} ${placeWords({ after: o.after })}`}`;
  }
  if (o.op === 'copy' && o.after !== undefined) return `copy ${runsWords(o.runs)} and put ${o.runs.length === 1 && o.runs[0][0] === o.runs[0][1] ? 'it' : 'them'} ${placeWords({ after: o.after })}`;          // 2026-11-24-1036: the copy goes in a gap (the words Extend writes)
  return `${STRUCTURE_WORDS[o.op].verb} ${runsWords(o.runs)}${o.op === 'move' ? ` ${o.after !== undefined ? placeWords({ after: o.after }).replace(/^at /, 'to ') : MOVE_WORDS[String(o.by) as '-1' | '1']}` : ''}`;          // 2026-11-24-1040: a move to a place says `after bar 5`, `to the start`, `to the end`
}
/** One step as a sentence of the Description: "Keep bars 3 to 5 and bar 8." */
export const structureSentence = (o: StructureOp): string => { const w = structureWords(o); return `${w[0].toUpperCase()}${w.slice(1)}.`; };

/** The runs of a set of bar numbers: ascending, apart. [3, 4, 5, 8] -> [[3, 5], [8, 8]]. Numbers below 1, repeats and non-integers are dropped. */
export function runsOfBars(bars: Iterable<number>): BarRun[] {
  const sorted = [...new Set([...bars].filter((n) => Number.isInteger(n) && n >= 1))].sort((a, b) => a - b);
  const runs: BarRun[] = [];
  for (const n of sorted) {
    const last = runs[runs.length - 1];
    if (last !== undefined && n === last[1] + 1) last[1] = n; else runs.push([n, n]);
  }
  return runs;
}

/** 2026-11-24-1040: why a Move of `runs` to the gap after bar `after` (0 = the start, 'end') cannot be done, in words: the bar of the place is one of the bars moved, or the move goes nowhere (one range that is already there). `n` = how many bars there are, when it is known (the end is only "already there" then). null = a real move. */
export function movePlaceProblem(runs: readonly BarRun[], after: number | 'end', n?: number): string | null {
  const [[a, b]] = runs;
  if (after !== 'end' && runs.some(([x, y]) => after >= x && after <= y)) return `Bar ${after} is part of the bars you are moving.`;
  return runs.length === 1 && (after === a - 1 || (after === 'end' && b === n)) ? `${rangeWords(a, b).replace(/^./, (c) => c.toUpperCase())} ${a === b ? 'is' : 'are'} already ${placeWords({ after })}.` : null;
}

export type StructureResult<T> = { ok: true; items: T[] } | { ok: false; message: string };

/** Run one step on `items` (the bars, in order). A range past the end, a delete that would leave nothing and a move off either end are refusals in one sentence naming the bar. Never changes `items`. */
export function applyStructure<T>(items: readonly T[], op: RunsOp): StructureResult<T> {
  const n = items.length;
  for (const [a, b] of op.runs) {
    if (b > n) return { ok: false, message: `${rangeWords(a, b)} asked for, but there ${n === 1 ? 'is 1 bar' : `are ${n} bars`}.` };
  }
  if (op.op === 'keep') return { ok: true, items: op.runs.flatMap(([a, b]) => items.slice(a - 1, b)) };
  if (op.op === 'delete') {
    const gone = new Set<number>();
    for (const [a, b] of op.runs) for (let i = a; i <= b; i++) gone.add(i);
    const left = items.filter((_, i) => !gone.has(i + 1));
    return left.length === 0 ? { ok: false, message: `deleting ${runsWords(op.runs)} would leave no bars.` } : { ok: true, items: left };
  }
  if (op.after !== undefined) {                                                  // 2026-11-24-1036: the copies of every range, in order, are INSERTED in the gap after bar `after` (0 = at the start, 'end'); the originals stay. 2026-11-24-1040: a MOVE takes the bars out and puts them back there
    if (op.after !== 'end' && op.after > n) return { ok: false, message: `after bar ${op.after} asked for, but there ${n === 1 ? 'is 1 bar' : `are ${n} bars`}.` };
    const at = op.after === 'end' ? n : op.after, put = op.runs.flatMap(([a, b]) => items.slice(a - 1, b));
    if (op.op === 'copy') return { ok: true, items: [...items.slice(0, at), ...put, ...items.slice(at)] };
    const bad = movePlaceProblem(op.runs, op.after, n);
    if (bad !== null) return { ok: false, message: bad };
    const gone = (i: number): boolean => op.runs.some(([a, b]) => i >= a - 1 && i < b), rest = items.filter((_, i) => !gone(i)), k = items.slice(0, at).filter((_, i) => !gone(i)).length;
    return { ok: true, items: [...rest.slice(0, k), ...put, ...rest.slice(k)] };
  }
  if (op.op === 'copy') {
    const out: T[] = [];
    let r = 0;
    for (let i = 1; i <= n; i++) {
      out.push(items[i - 1]);
      if (r < op.runs.length && op.runs[r][1] === i) { out.push(...items.slice(op.runs[r][0] - 1, i)); r++; }
    }
    return { ok: true, items: out };
  }
  const out = [...items];
  const order = op.by === -1 ? op.runs : [...op.runs].reverse();                 // left: ascending, right: descending. (The ranges are apart, so each one swaps with a bar of its own and the order does not change the result; it is kept so the code reads in the order a person would do it.)
  for (const [a, b] of order) {
    const s = a - 1, e = b - 1;                                                  // 0-based, inclusive
    if (op.by === -1) {
      if (s < 1) return { ok: false, message: `${rangeWords(a, b)} cannot move left: ${a === 1 && b === 1 ? 'bar 1 is the first bar' : 'the range starts at bar 1'}.` };
      const x = out[s - 1]; out.splice(s - 1, 1); out.splice(e, 0, x);
    } else {
      if (e > n - 2) return { ok: false, message: `${rangeWords(a, b)} cannot move right: the range ends at the last bar (bar ${n}).` };            // (e > n - 2 with b <= n means b === n)
      const x = out[e + 1]; out.splice(e + 1, 1); out.splice(s, 0, x);
    }
  }
  return { ok: true, items: out };
}

/** Run the steps in order. The first refusal is the answer (with the number of the step). */
export function applyStructureOps<T>(items: readonly T[], ops: readonly RunsOp[]): StructureResult<T> {
  let cur: T[] = [...items];
  for (let i = 0; i < ops.length; i++) {
    const r = applyStructure(cur, ops[i]);
    if (r.ok === false) return { ok: false, message: `ops[${i}]: ${r.message}` };
    cur = r.items;
  }
  return { ok: true, items: cur };
}

/** The engine's part of a step that makes NEW bars (2026-11-19-0999b): what each asks of the caller. Each returns the new bars (a morph: the middle N of N + 2; a mix: the one bar; an extend: the N bars) or a refusal in words; `applyStepsAsync` puts them in their place. */
export interface NewBarsMakers<T> {
  mix(a: T, b: T, op: MixBarsOp): Promise<StructureResult<T>>;
  extend(bar: T, op: ExtendBarOp): Promise<StructureResult<T>>;
}
/**
 * 2026-11-19-0996b: the steps in order, where a Morph-between asks `morph` for its NEW bars (the engine: the caller's). Everything else is `applyStructure`; the first refusal is the answer (with the number of the step). A step that names a bar the bars do not have is refused in the
 * same words as the others ("bar 5 asked for, but there are 3 bars."). 2026-11-19-0999b: a Mix step asks `more.mix` for its ONE bar and an Extend step asks `more.extend` for its N bars; all three are INSERTED in the gap after bar `after` (0 = at the start, 'end'), except an Extend with
 * no `after`, which REPLACES its bar by the new bars. The bars the step names stay exactly as they are (the engine's answer is never laid over them).
 */
export async function applyStepsAsync<T>(items: readonly T[], ops: readonly StructureOp[], morph: (a: T, b: T, op: MorphBetweenOp) => Promise<StructureResult<T>>, more?: NewBarsMakers<T>): Promise<StructureResult<T>> {
  let cur: T[] = [...items];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.op !== 'morph_between' && op.op !== 'mix_bars' && op.op !== 'extend_bar') {
      const r = applyStructure(cur, op);
      if (r.ok === false) return { ok: false, message: `ops[${i}]: ${r.message}` };
      cur = r.items; continue;
    }
    const n = cur.length;
    const have = n === 1 ? 'is 1 bar' : `are ${n} bars`;
    const ends = (op.op === 'extend_bar' ? [op.bar] : [op.a, op.b]).find((x) => x > n);
    if (ends !== undefined) return { ok: false, message: `ops[${i}]: bar ${ends} asked for, but there ${have}.` };
    if (op.after !== undefined && op.after !== 'end' && op.after > n) return { ok: false, message: `ops[${i}]: after bar ${op.after} asked for, but there ${have}.` };
    const made = op.op === 'morph_between' ? await morph(cur[op.a - 1], cur[op.b - 1], op)
      : more === undefined ? { ok: false as const, message: 'the engine was not given for this step.' }
      : op.op === 'mix_bars' ? await more.mix(cur[op.a - 1], cur[op.b - 1], op) : await more.extend(cur[op.bar - 1], op);
    if (made.ok === false) return { ok: false, message: `ops[${i}]: ${made.message}` };
    if (op.op === 'extend_bar' && op.after === undefined) { cur = [...cur.slice(0, op.bar - 1), ...made.items, ...cur.slice(op.bar)]; continue; }
    const at = op.after === 'end' ? n : op.after as number;
    cur = [...cur.slice(0, at), ...made.items, ...cur.slice(at)];
  }
  return { ok: true, items: cur };
}

/** The step as plain Python on the list `bars` (the transform note's Python facet: no engine function, so it runs anywhere the note's Python does). Ranges are 1-based inclusive, as in the sentence; it does the same as `applyStructure`. */
export function structurePython(o: StructureOp): string[] {
  if (o.op === 'morph_between') {                 // the engine's own morph_rhythm between the two bars, N + 2 bars asked, the middle N kept (the ends are part of its count)
    const made = `morph_rhythm(a=bars[${o.a - 1}], b=bars[${o.b - 1}], bars=${o.bars + 2}, order='${o.order}', seed=${o.seed})[1:-1]`;
    return [o.after === 'end' ? `  bars = bars + ${made}` : `  bars[${o.after}:${o.after}] = ${made}`];
  }
  if (o.op === 'mix_bars' || o.op === 'extend_bar') {              // 2026-11-19-0999b: the engine's own mix_rhythm / the Mix path's morph_rhythm / extend_rhythm, then the new bars go in their place (a slice) or at the end
    const pyStr = (x: string): string => `'${x}'`;
    const lines: string[] = [];
    if (o.op === 'mix_bars') {
      const a = `a=bars[${o.a - 1}], b=bars[${o.b - 1}]`;
      if (o.mode === 'path') {
        const millionths = Math.round(Math.min(1, Math.max(0, o.weight)) * 1e6);
        lines.push(`  _d = morph_rhythm_info(${a}, order=${pyStr(o.order as string)}, seed=${o.seed})['d']`, `  _new = [morph_rhythm(${a}, bars=1, order=${pyStr(o.order as string)}, seed=${o.seed}, position=min(_d, max(0, ((1000000 - ${millionths}) * _d + 500000) // 1000000)))]`);
      } else lines.push(`  _new = [mix_rhythm(${a}, weight=${o.weight}, threshold=${o.threshold}, ghost=${o.ghost ? 'True' : 'False'})]`);
    } else {
      lines.push(`  _new = extend_rhythm(data=bars[${o.bar - 1}], bars=${o.bars}, style=${pyStr(o.style)}, tempo_change_pct=${o.tempo_change_pct})`);
      if (o.after === undefined) return [...lines, `  bars[${o.bar - 1}:${o.bar}] = _new`];
    }
    return [...lines, o.after === 'end' ? '  bars = bars + _new' : `  bars[${o.after}:${o.after}] = _new`];
  }
  const runs = JSON.stringify(o.runs);
  if (o.op === 'keep') return [`  bars = [bars[i - 1] for a, b in ${runs} for i in range(a, b + 1)]`];
  if (o.op === 'delete') return [`  bars = [x for i, x in enumerate(bars, 1) if not any(a <= i <= b for a, b in ${runs})]`];
  const at = o.after === 'end' ? 'len(bars)' : o.after, put = `[bars[i - 1] for a, b in ${runs} for i in range(a, b + 1)]`;
  if (o.op === 'copy' && at !== undefined) return [`  bars[${at}:${at}] = ${put}`];          // 2026-11-24-1036: the copies go in the gap (the slice is read first, then assigned)
  if (o.op === 'move' && at !== undefined) return [`  _r = [(i, x) for i, x in enumerate(bars, 1) if not any(a <= i <= b for a, b in ${runs})]`, `  bars = [x for i, x in _r if i <= ${at}] + ${put} + [x for i, x in _r if i > ${at}]`];          // 2026-11-24-1040: a move to a gap takes the ranges out and puts them back there
  if (o.op === 'copy') return [`  bars = [y for i, x in enumerate(bars, 1) for y in [x] + [z for a, b in ${runs} if b == i for z in bars[a - 1:b]]]`];
  const left = o.by === -1;
  return [
    `  for a, b in ${left ? runs : `${runs}[::-1]`}:`,
    ...(left
      ? ['    x = bars.pop(a - 2)', '    bars.insert(b - 1, x)']
      : ['    x = bars.pop(b)', '    bars.insert(a - 1, x)']),
  ];
}
