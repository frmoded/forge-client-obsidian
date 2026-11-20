// 2026-11-20-1000 - the shared rig of the tests of THE INSPECTOR THROUGH THE STEP LINES: a stand-in engine that gives every bar a tempo that tells it apart (so the bars the REAL producePhraseNote lays out can be read back), the stand-in MusicXML the
// engine's payload carries (one <measure> per bar, two parts, the tempo in <sound>), the list model's canonical note for a list of sentences, and an INDEPENDENT model of what each step does to the bars (written out longhand, never by calling
// bar-structure-core: it is what the trace of the code under test is checked against).
import { barsOfPayload, noteContentFor, producePhraseNote, type PhraseScoreDeps, type StructureOp } from '../phrase-core.ts';
import * as L from '../sentence-list-core.ts';
import { writeListNote } from '../sentence-list-note-core.ts';
import { planNewBar } from '../score-first-core.ts';
import { PHRASE_VAULT, PLAYGROUND_PHRASES } from './phrase-list-fixtures.ts';

export type Bar = Record<string, unknown> & { tempo_bpm: number };
export type Call = { kind: string; data: any; params: any; title: string };

const BAR = JSON.parse(/```json\n([\s\S]*?)\n```/.exec((planNewBar({ existingBasenames: [], exists: () => false }) as { content: string }).content)![1]) as Record<string, unknown>;

/** Stand-in MusicXML for these bars: two parts (a multi-staff Score), one measure per bar, the bar's tempo in <sound tempo>. */
export function standInXml(bars: readonly Bar[]): string {
  const part = (p: number): string => `<part id="P${p}">${bars.map((b, i) => `<measure number="${i + 1}"><attributes><divisions>4</divisions></attributes><direction><sound tempo="${b.tempo_bpm}"/></direction><note><rest/><duration>16</duration></note></measure>`).join('')}</part>`;
  return `<score-partwise>${part(1)}${part(2)}</score-partwise>`;
}

/** The stub ENGINE: the shapes of extend_rhythm / mix_rhythm / morph_rhythm / the take. Bars are told apart by their tempo: the head's extend 100 + i, a mixed bar 300 (and, like the real engine, it comes back as `mixed_bar` only), an Extend STEP's bars 700 + i,
 *  a morph's middle 500 + i. Every answer carries stand-in MusicXML with one measure per bar. */
export function stubCompute(calls: Call[] = []) {
  return async (data: any, params: any, title = 't'): Promise<unknown> => {
    calls.push({ kind: params.kind, data, params, title });
    const wrap = (bars: Bar[], extra: Record<string, unknown>) => { const xml = standInXml(bars); return { type: 'musicxml', content: xml, multi_staff_content: xml, kit_content: xml, ...extra }; };
    if (params.kind === 'mix') {
      if (data.a.steps !== data.b.steps) throw new Error(`Traceback ...\nValueError: mix_rhythm: a and b must agree on steps, but a has ${data.a.steps} and b has ${data.b.steps}`);
      const mixed = { ...data.a, tempo_bpm: 300 };
      return wrap([mixed], { mixed_bar: mixed });
    }
    let bars: Bar[];
    if (params.kind === 'extend') {
      if (data.steps !== 16) throw new Error(`Traceback ...\nValueError: extend_rhythm: every style needs a 16-step grid (steps == 16, group_size == 4, i.e. 4/4 in sixteenths); got steps=${data.steps}, group_size=${data.group_size}`);
      bars = Array.from({ length: params.bars }, (_, i) => ({ ...data, tempo_bpm: (params.source === 'bar_a' ? 700 : 100) + i }));
    } else if (params.kind === 'morph') bars = Array.from({ length: params.bars }, (_, i) => (i === 0 ? { ...data.a } : i === params.bars - 1 ? { ...data.b } : { ...data.a, tempo_bpm: 500 + i }));
    else bars = [...data.bars];
    for (const [n, forked] of Object.entries(params.override_bars ?? {})) bars[Number(n) - 1] = forked as Bar;
    return wrap(bars, { bars_data: bars });
  };
}

export function rigDeps(calls: Call[] = []): PhraseScoreDeps {
  const files = (p: string): string | undefined => {
    const bm = /^bars\/(bar_\d+)\.md$/.exec(p); if (bm) return `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ ...BAR, tempo_bpm: 100 })}\n\`\`\`\n`;
    const pm = /^phrases\/(phrase_\d+)\.md$/.exec(p); if (pm) return PLAYGROUND_PHRASES[pm[1]];
    return undefined;
  };
  return { readNote: async (p: string) => { const t = files(p); if (t === undefined) throw new Error('File not found'); return t; }, compute: stubCompute(calls) as never };
}

const BASE = noteContentFor('phrase_020', { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 });
/** The note the list model writes for these canonical sentences (the replay of the list, as the composer does). */
export function noteFor(list: string[]): string {
  const rp = L.replayGrammar(list, 'phrase', { vault: PHRASE_VAULT });
  if (rp.stop !== null) throw new Error(`${list.join(' | ')}: ${rp.stop.message}`);
  const w = writeListNote(BASE, 'phrase_020', 'phrase', { params: rp.params, list: rp.list });
  if (w.ok === false) throw new Error(w.message);
  return w.text;
}

/** What the Score of the note would be: the payload (with the stand-in MusicXML), or the refusal in words. */
export async function drawNote(note: string, calls: Call[] = []): Promise<{ payload: Record<string, unknown>; bars: Bar[] } | { refusal: string }> {
  const out = await producePhraseNote(rigDeps(calls), note, 'phrase_020');
  if (out.kind !== 'score') return { refusal: out.message };
  return { payload: out.payload as Record<string, unknown>, bars: barsOfPayload(out.payload as Record<string, unknown>) as unknown as Bar[] };
}

// ---- the INDEPENDENT model ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export interface ModelBar {
  /** The head's bar this bar IS (1-based), or null for a bar a step made. */
  head: number | null;
  /** The step (1-based) that made it, the positions of its source bars as they were BEFORE that step, and the head bars those come from. */
  made: { step: number; from: number[]; heads: number[] } | null;
  /** The steps that copied it / moved it. */
  copies: number[];
  moves: number[];
}

/** What the steps do to the bars, bar by bar, written out longhand. */
export function modelSteps(headCount: number, ops: readonly StructureOp[]): ModelBar[] {
  let cur: ModelBar[] = Array.from({ length: headCount }, (_, i) => ({ head: i + 1, made: null, copies: [], moves: [] }));
  const clone = (b: ModelBar): ModelBar => ({ head: b.head, made: b.made === null ? null : { ...b.made, from: [...b.made.from], heads: [...b.made.heads] }, copies: [...b.copies], moves: [...b.moves] });
  const headsOf = (b: ModelBar): number[] => (b.head !== null ? [b.head] : b.made!.heads);
  ops.forEach((op, idx) => {
    const step = idx + 1;
    if (op.op === 'keep') {
      const out: ModelBar[] = [];
      for (const [a, b] of op.runs) for (let i = a; i <= b; i++) out.push(cur[i - 1]);
      cur = out;
    } else if (op.op === 'delete') {
      cur = cur.filter((_, i) => !op.runs.some(([a, b]) => i + 1 >= a && i + 1 <= b));
    } else if (op.op === 'copy') {
      const out: ModelBar[] = [];
      cur.forEach((b, i) => {
        out.push(b);
        for (const [x, y] of op.runs) if (y === i + 1) for (let j = x; j <= y; j++) { const c = clone(cur[j - 1]); c.copies.push(step); out.push(c); }
      });
      cur = out;
    } else if (op.op === 'move') {
      let arr = cur.map(clone);
      for (const [a, b] of op.by === -1 ? op.runs : [...op.runs].reverse()) {
        const s = a - 1, e = b - 1;
        if (op.by === -1) { const n = arr[s - 1]; const run = arr.slice(s, e + 1); [n, ...run].forEach((x) => x.moves.push(step)); arr = [...arr.slice(0, s - 1), ...run, n, ...arr.slice(e + 1)]; }
        else { const n = arr[e + 1]; const run = arr.slice(s, e + 1); [n, ...run].forEach((x) => x.moves.push(step)); arr = [...arr.slice(0, s), n, ...run, ...arr.slice(e + 2)]; }
      }
      cur = arr;
    } else {
      const from = op.op === 'extend_bar' ? [op.bar] : [op.a, op.b];
      const heads = [...new Set(from.flatMap((p) => headsOf(cur[p - 1])))].sort((x, y) => x - y);
      const count = op.op === 'mix_bars' ? 1 : op.bars;
      const made: ModelBar[] = Array.from({ length: count }, () => ({ head: null, made: { step, from: [...from], heads: [...heads] }, copies: [], moves: [] }));
      if (op.op === 'extend_bar' && op.after === undefined) cur = [...cur.slice(0, op.bar - 1), ...made, ...cur.slice(op.bar)];
      else { const at = op.after === 'end' ? cur.length : (op.after as number); cur = [...cur.slice(0, at), ...made, ...cur.slice(at)]; }
    }
  });
  return cur;
}

/** The step sentences of every kind (valid after an Extend head of 6 bars; some are refused after other steps, which the callers count). One per kind plus the variants that place or move differently. */
export const STEP_POOL: Array<{ kind: string; typed: string }> = [
  { kind: 'keep', typed: 'Keep bars 1 to 4.' },
  { kind: 'delete', typed: 'Delete bar 2.' },
  { kind: 'copy', typed: 'Copy bars 2 to 3.' },
  { kind: 'move', typed: 'Move bar 3 one bar left.' },
  { kind: 'move', typed: 'Move bar 2 one bar right.' },
  { kind: 'morph', typed: 'Morph bars 1 and 2 across 2 bars.' },
  { kind: 'mix', typed: 'Mix bars 1 and 2.' },
  { kind: 'mix', typed: 'Mix bars 3 and 1.' },                 // the bars said the other way round: the sources of the new bar are named in bar order
  { kind: 'extendReplace', typed: 'Extend bar 1 to 2 bars.' },
  { kind: 'extendInsert', typed: 'Extend bar 2 to 2 bars and put them at the end.' },
];
