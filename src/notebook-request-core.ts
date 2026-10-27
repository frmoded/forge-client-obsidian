// 2026-10-27-0720 (M14 slice 2, design 4.13) - the notebook's typed request, its pure core: no `obsidian` import (the service and the vault are ports of notebook-core.ts). The person selects bars (chips), types what should happen ("make this
// half as busy, keep the downbeat") and presses Run: this file turns the sentence plus the SELECTION into the POST /plan payload (forge-transpile 0.2.41+, `selection`), and the service's answer into the transform ops Run would have made from the op
// picker. The bars and the row are ALWAYS the selection's own: the service never chooses them, and an answer that carries first/last/row is read without them. The plugin re-validates every op with its own validatePhrase (the second boundary,
// as the sentence dialog does). A sentence the two ops cannot express is refused in one sentence the service wrote; an old service (no `selection` support) is told apart by its /health version, never guessed from its answer.
import { validatePhrase, type TransformOp, type TransformPhrase } from './phrase-core.ts';
import { SENTENCE_MAX, planRefusalText, planTransportRefusal, type PlanSelection } from './sentence-plan-core.ts';

/** The forge-transpile version whose /plan understands `selection` (a `transform` plan). */
export const REQUEST_NEEDS_VERSION = '0.2.41';

export const EMPTY_REQUEST = 'Say what should happen to the selected bars, for example: make this half as busy.';
export const NO_BARS_SELECTED = 'Select some bars first: click them in the bar list, Shift-click to extend.';
/** What an old service gets told, and what a 404 says for the same reason (one sentence for one trouble). */
export const OLD_SERVICE = `This transpile service does not offer planning yet (it needs version ${REQUEST_NEEDS_VERSION} or newer). The person who runs it has to update it.`;
export const NOT_A_TRANSFORM = 'The planner answered with a new phrase, not an operation on the selected bars. Try saying what to do to them, for example: make this half as busy.';

export interface TransformRequestPayload {
  sentence: string;
  bars: string[];
  phrases: string[];
  selection: PlanSelection;
  user_anthropic_key?: string;
}

/** One line, single spaces: what a sentence is called on a cell, in a note and in the evidence line. */
export const oneLine = (sentence: string): string => sentence.replace(/\s+/g, ' ').trim();

/** The request for a sentence and a selection. `runs` are the selection's stretches of consecutive bars ([first, last], sorted); the service is told the FIRST one (a scattered selection gets the same op on each run, as the op picker does).
 *  The vault's bar and phrase names ride along as for every /plan call (an old service plans from them; the new one ignores them). Nothing is sent for an empty sentence, an over-long one, or no bars. */
export function buildTransformRequest(input: { sentence: string; source: string; runs: ReadonlyArray<readonly [number, number]>; row: string | null; barNames: Iterable<string>; phraseNames: Iterable<string>; ownKey?: string | undefined }):
  { ok: true; payload: TransformRequestPayload } | { ok: false; message: string } {
  const sentence = oneLine(input.sentence);
  if (sentence === '') return { ok: false, message: EMPTY_REQUEST };
  if (sentence.length > SENTENCE_MAX) return { ok: false, message: `That sentence is ${sentence.length} characters; the limit is ${SENTENCE_MAX}. Make it shorter.` };
  const first = input.runs[0];
  if (first === undefined) return { ok: false, message: NO_BARS_SELECTED };
  const bars = [...new Set(input.barNames)].filter((n) => n !== 'README').sort();
  const phrases = [...new Set(input.phraseNames)].filter((n) => n !== 'README').sort();
  const selection: PlanSelection = { phrase: input.source, first: first[0], last: first[1], ...(input.row !== null ? { row: input.row } : {}) };
  return { ok: true, payload: { sentence, bars, phrases, selection, ...(input.ownKey ? { user_anthropic_key: input.ownKey } : {}) } };
}

// ---- the service's answer -------------------------------------------------------------------------------------------------------------------------------------------------------------------

export type TransformOutcome =
  | { ok: true; op: 'thin_out' | 'double_up'; ops: TransformOp[] }
  /** `suspectOld`: the answer is one an old service (that ignores `selection`) could also give, so the caller may ask its version before showing the message. */
  | { ok: false; message: string; suspectOld: boolean };

type Plan = Record<string, unknown>;

/** The ops of a `transform` plan over the selection's runs. Only `op`, `amount`, `keep` and `grid` are read from the plan; first/last/row come from the SELECTION whatever the plan says. validatePhrase has the last word. */
function opsFromPlan(plan: Plan, source: string, runs: ReadonlyArray<readonly [number, number]>, row: string | null): { ok: true; ops: TransformOp[] } | { ok: false; message: string } {
  const number = Object.fromEntries((['amount', 'keep', 'grid'] as const).filter((k) => plan[k] !== undefined).map((k) => [k, plan[k]]));   // a field the op does not hold is validatePhrase's refusal, not silently dropped
  const raw = runs.map(([first, last]) => ({ op: plan.op, first, last, ...(row !== null ? { row } : {}), ...number }));
  const checked = validatePhrase({ kind: 'transform', source, ops: raw });
  if (checked.ok === false) return { ok: false, message: `The planner's answer is not a valid operation: ${checked.message}` };
  return { ok: true, ops: (checked.value as TransformPhrase).ops };
}

export function interpretTransformResponse(res: { status: number; json: unknown }, ctx: { source: string; runs: ReadonlyArray<readonly [number, number]>; row: string | null }): TransformOutcome {
  const transport = planTransportRefusal(res, REQUEST_NEEDS_VERSION);
  if (transport !== null) return { ok: false, message: transport, suspectOld: false };
  const json = res.json as Plan;
  if (json.ok !== true || json.plan === undefined || json.plan === null) return { ok: false, message: planRefusalText(json), suspectOld: true };
  const plan = json.plan as Plan;                                         // a string, a number or an array has no `kind`: the same refusal as another kind of phrase
  if (plan.kind !== 'transform') return { ok: false, message: NOT_A_TRANSFORM, suspectOld: true };
  if (plan.op !== 'thin_out' && plan.op !== 'double_up') return { ok: false, message: `The planner's answer is not a valid operation: op must be "thin_out" or "double_up", got ${JSON.stringify(plan.op)}.`, suspectOld: false };
  const made = opsFromPlan(plan, ctx.source, ctx.runs, ctx.row);
  if (made.ok === false) return { ok: false, message: made.message, suspectOld: false };
  return { ok: true, op: plan.op, ops: made.ops };
}

// ---- the service's version ------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** Is `version` (x.y.z, anything after the third number ignored) at least `min`? null when `version` is not a version: unknown is not "old". */
export function versionAtLeast(version: string | null | undefined, min: string): boolean | null {
  const parse = (v: string): number[] | null => { const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim()); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
  const a = typeof version === 'string' ? parse(version) : null;
  const b = parse(min);
  if (a === null || b === null) return null;
  return (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) >= 0;                // the first number that differs decides; all equal is "at least"
}

// ---- the evidence line ----------------------------------------------------------------------------------------------------------------------------------------------------------------------

export function askedLine(sentence: string, outcome: TransformOutcome | { ok: false; message: string }): string {
  const one = oneLine(sentence);
  const shown = one.length > 80 ? `${one.slice(0, 80)}...` : one;
  return `[forge-notebook] asked "${shown}" -> ${outcome.ok === false ? `refused: ${outcome.message}` : outcome.op}`;
}
