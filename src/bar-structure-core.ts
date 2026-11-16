// 2026-11-16-1000 - the STRUCTURE steps of a transform phrase: Keep, Delete, Copy and Move bars (what the Score's selection menu writes). Pure, no `obsidian`, no engine: they run in TypeScript on the list of bars the source made, BEFORE the
// engine sees the density ops (thin out, double up), so a phrase that only keeps, deletes, copies or moves bars never leaves the plugin. The words are ONE table (`STRUCTURE_WORDS`) so the driver can change a verb in one row.
//
//   "Keep bars 3 to 5 and bar 8."                  the result is only those bars, in their order
//   "Delete bars 3 to 5 and bar 8."                those bars go; the rest close up
//   "Copy bars 3 to 5."                            each range is played again right after itself
//   "Move bars 3 to 5 one bar left." / "... right."  each range swaps places with the one bar next to it
//
// Every range is of the bars as they are BEFORE the step; the ranges are ascending and apart (validatePhrase says so). Steps that change which bars there are come before steps that change what is in them.
import type { BarRun, StructureOp, TransformOp } from './phrase-core.ts';

export const isStructureOp = (o: TransformOp): o is StructureOp => o.op === 'keep' || o.op === 'delete' || o.op === 'copy' || o.op === 'move';
/** "bar 4" / "bars 3 to 5" (the same words phrase-words-core.ts `rangeWords` says: this file stays a leaf, phrase-words-core.ts imports IT). */
const rangeWords = (first: number, last: number): string => (first === last ? `bar ${first}` : `bars ${first} to ${last}`);

/** How each step is said. `keep`/`delete`/`copy` end at the ranges; `move` adds `one bar left` / `one bar right`. */
export const STRUCTURE_WORDS: Record<StructureOp['op'], { verb: string; example: string }> = {
  keep: { verb: 'keep', example: 'Keep bars 3 to 5 and bar 8.' },
  delete: { verb: 'delete', example: 'Delete bars 3 to 5 and bar 8.' },
  copy: { verb: 'copy', example: 'Copy bars 3 to 5.' },
  move: { verb: 'move', example: 'Move bars 3 to 5 one bar left.' },
};
export const MOVE_WORDS = { '-1': 'one bar left', '1': 'one bar right' } as const;

/** "bars 3 to 5 and bar 8" / "bar 2, bars 4 to 5 and bar 9": the ranges in words, joined the way a person lists them. */
export function runsWords(runs: readonly BarRun[]): string {
  const parts = runs.map(([a, b]) => rangeWords(a, b));
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** One step in lower case, no full stop: "keep bars 3 to 5" (the notes' own wording for a step: the caller capitalises it and adds the full stop). */
export function structureWords(o: StructureOp): string {
  return `${STRUCTURE_WORDS[o.op].verb} ${runsWords(o.runs)}${o.op === 'move' ? ` ${MOVE_WORDS[String(o.by) as '-1' | '1']}` : ''}`;
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

export type StructureResult<T> = { ok: true; items: T[] } | { ok: false; message: string };

/** Run one step on `items` (the bars, in order). A range past the end, a delete that would leave nothing and a move off either end are refusals in one sentence naming the bar. Never changes `items`. */
export function applyStructure<T>(items: readonly T[], op: StructureOp): StructureResult<T> {
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
export function applyStructureOps<T>(items: readonly T[], ops: readonly StructureOp[]): StructureResult<T> {
  let cur: T[] = [...items];
  for (let i = 0; i < ops.length; i++) {
    const r = applyStructure(cur, ops[i]);
    if (r.ok === false) return { ok: false, message: `ops[${i}]: ${r.message}` };
    cur = r.items;
  }
  return { ok: true, items: cur };
}

/** The step as plain Python on the list `bars` (the transform note's Python facet: no engine function, so it runs anywhere the note's Python does). Ranges are 1-based inclusive, as in the sentence; it does the same as `applyStructure`. */
export function structurePython(o: StructureOp): string[] {
  const runs = JSON.stringify(o.runs);
  if (o.op === 'keep') return [`  bars = [bars[i - 1] for a, b in ${runs} for i in range(a, b + 1)]`];
  if (o.op === 'delete') return [`  bars = [x for i, x in enumerate(bars, 1) if not any(a <= i <= b for a, b in ${runs})]`];
  if (o.op === 'copy') return [`  bars = [y for i, x in enumerate(bars, 1) for y in [x] + [z for a, b in ${runs} if b == i for z in bars[a - 1:b]]]`];
  const left = o.by === -1;
  return [
    `  for a, b in ${left ? runs : `${runs}[::-1]`}:`,
    ...(left
      ? ['    x = bars.pop(a - 2)', '    bars.insert(b - 1, x)']
      : ['    x = bars.pop(b)', '    bars.insert(a - 1, x)']),
  ];
}
