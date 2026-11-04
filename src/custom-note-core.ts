// 2026-11-02-1155 (score_first M16b, design 4.14) - a CUSTOM note: its Python is the note (python-apply-core.ts decides when a note becomes one). Its Score is drawn by RUNNING that Python (the host's `runCustom`, in Pyodide, with a time limit that
// kills the run), the result is checked as a list of bars and drawn by the same engine glue as every phrase; the other notes it calls by name (`phrase_003()`, `arr_001()`) resolve through the engine's own vault-note call path (exec_python's shims).
// This file is the pure part: which notes a Python calls, the chain guard (a custom note that calls itself, directly or through the notes it calls, is refused: depth at most 6), the one-sentence errors, and the score production with its ports.
// No `obsidian`, no engine.
import type { ScoreOutcome } from './rhythm-score-core.ts';
import { pythonTextOf, isCustomNote } from './phrase-notes-core.ts';

/** The seconds a custom Python may run before it is stopped. */
export const CUSTOM_RUN_LIMIT_S = 10;
/** How many notes deep a custom note's calls may nest (itself counts as the first). */
export const CUSTOM_CHAIN_DEPTH = 6;

/** The names a Python calls as notes: `name()` and `globals()['name']()`, once each, in the order they first appear (comments and strings are not looked at). */
export function callsInPython(python: string): string[] {
  const code = python.split('\n').map((l) => l.replace(/#.*$/, '')).join('\n');
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (n: string): void => { if (!seen.has(n)) { seen.add(n); found.push(n); } };
  for (const m of code.matchAll(/globals\(\)\s*\[\s*(['"])([A-Za-z0-9_-]+)\1\s*\]\s*\(\s*\)|(?<![\w.'"])([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)/g)) add(m[2] ?? m[3]);
  return found;
}

/** 2026-11-03-1160 (d): what kind of note of the plugin's own a called name is - a bar, a phrase or an arrangement - or null (a kit, an engine chip, a composition: not one the chips or the `links:` property name). One scan for the strip's chips and the note's `links:`. */
export const noteKindOfName = (n: string): 'bar' | 'phrase' | 'arrangement' | null => (/^bar_\d+$/.test(n) ? 'bar' : /^phrase_\d+$/.test(n) ? 'phrase' : /^arr_\d+$/.test(n) ? 'arrangement' : null);

/** The notes a custom note's Python calls, by name, once each in the order they first appear, the note itself left out: what its `links:` property holds (the chips of the strip read the same calls, and the Recipe's own links besides). */
export const customCallNotes = (name: string, python: string): string[] => callsInPython(python).filter((n) => n !== name && noteKindOfName(n) !== null);

/** The notes of the vault a name can be: a phrase, an arrangement or a composition (a bar has no Python to follow). */
export const notePathsFor = (name: string): string[] => [`phrases/${name}.md`, `arrangements/${name}.md`, `compositions/${name}.md`];

/**
 * The chain guard: follows the calls of a custom note through the notes it calls (a note's Python is read from its text), and says so when it comes back to a note already on the way (itself included) or goes deeper than `CUSTOM_CHAIN_DEPTH`.
 * `null` = the chain is fine. `read` is the text of a note by path (rejects when it is not there: then it is not a note).
 */
export async function customChainGuard(name: string, python: string, read: (path: string) => Promise<string>, depth = CUSTOM_CHAIN_DEPTH): Promise<string | null> {
  const visit = async (note: string, py: string, way: string[]): Promise<string | null> => {
    for (const callee of callsInPython(py)) {
      if (way.includes(callee)) return `Custom Python: ${[...way, callee].join(' calls ')}, which is a loop (a note may not call itself, directly or through the notes it calls).`;
      let text: string | null = null;
      for (const p of notePathsFor(callee)) { try { text = await read(p); break; } catch { /* not that folder */ } }
      if (text === null) continue;                                       // a bar, a kit, an engine chip: nothing to follow
      const inner = pythonTextOf(text);
      if (inner === null) continue;
      if (way.length + 1 >= depth) return `Custom Python: ${[...way, callee].join(' calls ')} nests more than ${depth} notes deep (the limit is ${depth}).`;
      const found = await visit(callee, inner, [...way, callee]);
      if (found !== null) return found;
    }
    return null;
  };
  return visit(name, python, [name]);
}

export type CustomRun =
  | { ok: true; bars: unknown }
  | { ok: false; timedOut: boolean; error: string; line: number };

/** The one sentence for a run that did not give bars: the line of the Python it stopped at when it is known, or the limit that killed it. */
export function customRunSentence(run: Extract<CustomRun, { ok: false }>, limitS: number = CUSTOM_RUN_LIMIT_S): string {
  if (run.timedOut) return `Custom Python: stopped after ${limitS} seconds (the time limit); it may loop forever. The last good Score is kept.`;
  const first = (run.error.split('\n').map((l) => l.trim()).filter((l) => l !== '')[0] ?? 'it could not be run').replace(/\s+/g, ' ');
  return `Custom Python${run.line > 0 ? `, line ${run.line}` : ''}: ${first}. The last good Score is kept.`;
}

/** What the Python must return: a list of bars (each one a mapping), not empty. A plain sentence; the engine's own checks (the grid, the rows) come with the draw. */
export function barsShapeSentence(bars: unknown): string | null {
  if (!Array.isArray(bars)) return `Custom Python: it must return a list of bars, but it returned ${bars === null ? 'nothing' : typeof bars === 'object' ? 'a mapping' : `a ${typeof bars}`}. The last good Score is kept.`;
  if (bars.length === 0) return 'Custom Python: it returned a list with no bars. The last good Score is kept.';
  const at = bars.findIndex((b) => b === null || typeof b !== 'object' || Array.isArray(b));
  return at < 0 ? null : `Custom Python: bar ${at + 1} of the list is not a bar (a bar is a mapping with its channels and steps). The last good Score is kept.`;
}

/**
 * The engine's refusal of a list of bars, as one plain sentence: its last line, without the Python exception name or the engine function names in front (`rhythm_bars_to_stream: bar 1: rhythm_data_to_stream: channel 'kick' must be ...`), and
 * with the bar counted from 1 as the person counts them (the engine's message names the bar INDEX, from 0; only a message that comes from `rhythm_bars_to_stream` is renumbered).
 */
export function plainBarError(message: string): string {
  let line = message.split('\n').map((l) => l.trim()).filter((l) => l !== '').pop() ?? 'it could not be drawn';
  line = line.replace(/^(?:\w*Error|ValueError):\s*/, '');
  const fromBars = /^rhythm_bars_to_stream:\s*/.test(line);
  if (fromBars) line = line.replace(/^rhythm_bars_to_stream:\s*bar (\d+):/, (_m, n: string) => `bar ${Number(n) + 1}:`);
  line = line.replace(/\b[a-z]+(?:_[a-z]+)+:\s*/g, '');                      // the engine functions that said it (rhythm_data_to_stream: ...)
  return line.replace(/(?:\s*\.)?\s*$/, '');
}

export interface CustomDeps {
  readNote(path: string): Promise<string>;
  /** Run this Python (the note's own text) in the engine, with the limit; never throws for the person's mistakes (they come back as `ok: false`). Absent = this surface cannot run a custom note. */
  runCustom?(python: string, name: string, limitS: number): Promise<CustomRun>;
  /** The engine glue every Score is drawn with (`computePhraseScore`): the bars and `{ kind: 'custom' }` give the tagged MusicXML payload; throws with the engine's own message when a bar is wrong. */
  compute(data: unknown, params: unknown, title: string): Promise<unknown>;
}

/** An outcome that keeps the Score that is on screen (dimmed) and says why: every failure of a custom run. */
const kept = (message: string): ScoreOutcome => ({ kind: 'error', message, keep: true });

/** The Score of a custom note, or why not (the last good Score stays on screen, dimmed). `text` is the note's text. */
export async function produceCustomScore(deps: CustomDeps, text: string, name: string, title: string): Promise<ScoreOutcome> {
  if (!isCustomNote(text)) return { kind: 'error', message: 'Score: this note is not a custom note.' };
  if (!deps.runCustom) return kept('Custom Python: this window cannot run it.');
  const python = pythonTextOf(text);
  if (python === null || python.trim() === '') return kept('Custom Python: the note has no Python to run.');
  const loop = await customChainGuard(name, python, deps.readNote);
  if (loop !== null) return kept(loop);
  let run: CustomRun;
  try { run = await deps.runCustom(python, name, CUSTOM_RUN_LIMIT_S); } catch (e) { return kept(`Custom Python: the engine could not run it (${(e as Error)?.message ?? e}). The last good Score is kept.`); }
  if (run.ok === false) return kept(customRunSentence(run));
  const shape = barsShapeSentence(run.bars);
  if (shape !== null) return kept(shape);
  try {
    const payload = await deps.compute({ bars: run.bars }, { kind: 'custom' }, title);
    return payload !== null && typeof payload === 'object' ? { kind: 'score', payload: payload as Extract<ScoreOutcome, { kind: 'score' }>['payload'] } : kept('Custom Python: the engine returned no score. The last good Score is kept.');
  } catch (e) {
    return kept(`Custom Python: ${plainBarError((e as Error)?.message ?? String(e))}. The last good Score is kept.`);
  }
}
