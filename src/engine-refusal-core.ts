// 2026-10-31-1135 (CCQA smoke 10, B5 and B5x) - an engine ValueError reaches the person as ONE plain sentence, never as a Python traceback. Pyodide hands a Python ValueError over as the whole traceback, whose last line is
// `ValueError: <the engine's own line>`; the engine's lines that a person can act on (a bar on another grid for extend, two sections of another meter) become a sentence that names the NOTES, the rest is that last line.

/** The last line of an error message with its exception name taken off: the engine's own words. */
function lastLine(message: string): string {
  const lines = message.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  const last = lines.length > 0 ? lines[lines.length - 1] : '';
  return last.replace(/^(?:[A-Za-z_][A-Za-z0-9_.]*Error|Exception): /, '');
}

/** `extend_rhythm: every style needs a 16-step grid (...); got steps=12, group_size=3` -> "bar_009 has 12 steps; extend needs a 16-step bar.". `null` = not that refusal. */
export function extendGridSentence(message: string, source: string): string | null {
  const m = /extend_rhythm: every style needs a 16-step grid[^;]*; got steps=(\d+), group_size=(\d+)/.exec(lastLine(message));
  return m ? `${source} has ${m[1]} steps; extend needs a 16-step bar.` : null;
}

/** A section of the composition as the PERSON counts it (a line of the composition; a repeat is a pass of it), and the note it plays. */
export interface SectionName { section: number; source: string }
const RULE = 'all sections of a composition must share the same meter and steps';

/**
 * `compose_sections: section 3 bar 1 has time_signature '3/4' but section 1 has '4/4'; ...` -> "phrase_013 (section 2) is 3/4 but phrase_001 (section 1) is 4/4; all sections of a composition must share the same meter and steps.".
 * The engine counts the sections it was handed (a repeat is a section there), so `names[i]` is the i-th section the ENGINE got, with the number the person sees. `null` = not a mismatch refusal.
 */
export function composeMismatchSentence(message: string, names: readonly SectionName[]): string | null {
  const m = /compose_sections(?:_lineage)?: section (\d+) bar \d+ has (time_signature|steps|group_size) '?([^' ;]+)'? but section (\d+)(?: bar \d+)? has '?([^' ;]+)'?;/.exec(lastLine(message));
  if (!m) return null;
  const at = (n: string): { label: string } => {
    const s = names[Number(n) - 1];
    return { label: s ? `${s.source.split('/').pop()} (section ${s.section})` : `section ${n}` };
  };
  const [a, b] = [at(m[1]), at(m[4])];
  const key = m[2];
  if (key === 'time_signature') return `${a.label} is ${m[3]} but ${b.label} is ${m[5]}; ${RULE}.`;
  if (key === 'steps') return `${a.label} has ${m[3]} steps but ${b.label} has ${m[5]} steps; ${RULE}.`;
  return `${a.label} has a group size of ${m[3]} but ${b.label} has ${m[5]}; ${RULE}.`;
}

/** Whatever the engine threw, as one plain line: no traceback, no stack frames, no exception name. The known refusals have their own sentences (above); `ctx.source` names the bar an extend was asked of. */
export function plainEngineSentence(message: string, ctx: { source?: string; sections?: readonly SectionName[] } = {}): string {
  if (ctx.source !== undefined) { const e = extendGridSentence(message, ctx.source); if (e !== null) return e; }
  if (ctx.sections !== undefined) { const c = composeMismatchSentence(message, ctx.sections); if (c !== null) return c; }
  const line = lastLine(message);
  return line === '' ? 'the engine refused this note.' : line;
}
