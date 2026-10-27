// 2026-10-27-1015 (M7b (b), "a sentence becomes a phrase") — the pure core of "New phrase from a sentence". Score-first vaults only. A sentence goes to the hosted service's POST /plan (forge-transpile, plan.py) together with the
// names of the vault's bars and phrases; what comes back is ONE plan, which this file re-validates with the plugin's own validatePhrase (the second boundary: the service validates the wire, the plugin validates the vault) and turns into a
// note through noteContentFor, the same function the controls' starters use, so a note made from a sentence is byte for byte the note the controls would have made for the same value. Every refusal is one plain sentence and no refusal
// ever writes a note. No `obsidian` import: the vault, the service and the UI are ports.
import {
  MIX_DEFAULTS, MORPH_DEFAULTS, PHRASE_DEFAULTS, createNewPhraseFromParams, planNewPhraseFromParams, starterMix, validatePhrase,
  type NewPhrasePorts, type NewPhraseResult, type PhraseParams,
} from './phrase-core.ts';
import { phraseDescription, phraseRecipeSteps } from './phrase-notes-core.ts';

export const PLAN_COMMAND_ID = 'new-phrase-from-sentence';
export const PLAN_COMMAND_NAME = 'New phrase from a sentence';
export const SENTENCE_MAX = 500;

/** Only in a score-first vault: everywhere else the command does not exist (not hidden: absent). */
export function planAvailable(input: { scoreFirst: boolean }): boolean {
  return input.scoreFirst === true;
}

// ---- the request ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** 2026-10-27-0720 (M14 slice 2): `selection` (a phrase, a bar range, an optional row) makes the sentence about THOSE bars; the service (0.2.41+) answers a `transform` plan and never chooses the bars. */
export interface PlanSelection { phrase: string; first: number; last: number; row?: string }
export interface PlanPayload { sentence: string; bars: string[]; phrases: string[]; user_anthropic_key?: string; selection?: PlanSelection }

const EMPTY_SENTENCE = 'Say in a sentence what phrase you want, for example: extend bar_005 to 8 bars.';
const NO_BARS = 'This vault has no bars yet, so there is nothing to build a phrase from. Make a bar in the Beat Box first.';

export function buildPlanRequest(input: { sentence: string; barNames: Iterable<string>; phraseNames: Iterable<string>; ownKey?: string | undefined }): { ok: true; payload: PlanPayload } | { ok: false; message: string } {
  const sentence = input.sentence.trim();
  if (sentence === '') return { ok: false, message: EMPTY_SENTENCE };
  if (sentence.length > SENTENCE_MAX) return { ok: false, message: `That sentence is ${sentence.length} characters; the limit is ${SENTENCE_MAX}. Make it shorter.` };
  const bars = [...new Set(input.barNames)].filter((n) => n !== 'README').sort();
  if (bars.length === 0) return { ok: false, message: NO_BARS };
  const phrases = [...new Set(input.phraseNames)].filter((n) => n !== 'README').sort();
  return { ok: true, payload: { sentence, bars, phrases, ...(input.ownKey ? { user_anthropic_key: input.ownKey } : {}) } };
}

// ---- plan -> controls -----------------------------------------------------------------------------------------------------------------------------------------------------------------------

type Plan = Record<string, unknown>;
const isPlan = (v: unknown): v is Plan => typeof v === 'object' && v !== null && !Array.isArray(v);
const pick = (plan: Plan, keys: readonly string[]): Record<string, unknown> => Object.fromEntries(keys.filter((k) => plan[k] !== undefined).map((k) => [k, plan[k]]));

/** A plan as the controls' value: what the plan says laid over the controls' own starter, then checked by validatePhrase like any note's json. */
export function paramsFromPlan(plan: unknown): { ok: true; value: PhraseParams } | { ok: false; message: string } {
  if (!isPlan(plan)) return { ok: false, message: 'The planner\'s answer was not a plan.' };
  let raw: Record<string, unknown>;
  if (plan.kind === 'extend') raw = { kind: 'extend', source: plan.bar, ...PHRASE_DEFAULTS, ...pick(plan, ['bars', 'style', 'tempo_change_pct']) };
  else if (plan.kind === 'morph') raw = { kind: 'morph', a: plan.a, b: plan.b, ...MORPH_DEFAULTS, ...pick(plan, ['bars', 'order', 'seed']) };
  else if (plan.kind === 'mix') {
    if (plan.mode === 'vote') raw = { kind: 'mix', a: plan.a, b: plan.b, weight: MIX_DEFAULTS.weight, threshold: MIX_DEFAULTS.threshold, ghost: MIX_DEFAULTS.ghost, ...pick(plan, ['weight']), mode: 'vote' };
    else raw = { ...starterMix(String(plan.a), String(plan.b)), a: plan.a, b: plan.b, ...pick(plan, ['weight', 'order', 'seed']), mode: 'path' };
  } else return { ok: false, message: `The planner's answer was not a phrase I know how to build: kind must be "extend", "mix" or "morph" (got ${JSON.stringify(plan.kind)}).` };
  const checked = validatePhrase(raw);
  return checked.ok === false ? { ok: false, message: `The planner's answer is not a valid phrase: ${checked.message}` } : { ok: true, value: checked.value };
}

const namesOf = (p: PhraseParams): string[] => (p.kind === 'extend' ? [p.source] : p.kind === 'transform' ? [] : [p.a, p.b]);       // a sentence never plans a transform (slice 2); its source is a phrase, not a bar

// ---- the service's answer -------------------------------------------------------------------------------------------------------------------------------------------------------------------

export type PlanOutcome = { ok: true; params: PhraseParams } | { ok: false; message: string };

const BUSY = 'The planner is busy right now. Try again in a moment.';
const detailText = (json: unknown): string | null => {
  const d = isPlan(json) ? json.detail : undefined;
  if (typeof d === 'string' && d !== '') return d;
  if (isPlan(d) && typeof d.error === 'string' && d.error !== '') return d.error;
  return null;
};

/** What the service's answer says before there is a plan to read: no token, unreachable, 401, an old service (404), 422, busy, 502, any other status, an answer that is not an object. `null` = a readable 200. `needs` is the service version
 *  that has the thing being asked (0.2.39 for a sentence about the vault, 0.2.41 for a sentence about selected bars). Shared by the dialog and the notebook, so both say the same sentence for the same trouble. */
export function planTransportRefusal(res: { status: number; json: unknown }, needs: string): string | null {
  const { status, json } = res;
  if (status === 0) {
    const d = detailText(json);
    if (d !== null && d.startsWith('Set your transpile token')) return 'Set your transpile token in Settings → Forge → Transpile token before planning a phrase from a sentence.';
    return d !== null ? `The transpile service could not be reached (${d}).` : 'The transpile service could not be reached.';
  }
  if (status === 401) return 'The transpile service did not accept your token. Check Settings → Forge → Transpile token.';
  if (status === 404) return `This transpile service does not offer planning yet (it needs version ${needs} or newer). The person who runs it has to update it.`;
  if (status === 422) return `The service refused the request. A sentence can be at most ${SENTENCE_MAX} characters.`;
  if (status === 429 || status === 503) return BUSY;
  if (status === 502) { const d = detailText(json); return d !== null ? `The planner could not answer: ${d}` : 'The planner could not answer.'; }
  if (status !== 200) return `The service answered ${status}.`;
  if (!isPlan(json)) return 'The service\'s answer could not be read.';
  return null;
}

/** The service's own reason when it did not plan (`ok` false or no plan), or the generic one. */
export function planRefusalText(json: Record<string, unknown>): string {
  return typeof json.error === 'string' && json.error !== '' ? json.error : 'The planner did not say why it could not plan that. Try saying it differently.';
}

export function interpretPlanResponse(res: { status: number; json: unknown }, barNames: Iterable<string>): PlanOutcome {
  const refuse = (message: string): PlanOutcome => ({ ok: false, message });
  const transport = planTransportRefusal(res, '0.2.39');
  if (transport !== null) return refuse(transport);
  const json = res.json as Plan;
  if (json.ok !== true || json.plan === undefined || json.plan === null) return refuse(planRefusalText(json));
  const params = paramsFromPlan(json.plan);
  if (params.ok === false) return refuse(params.message);
  const bars = new Set(barNames);
  for (const n of namesOf(params.value)) if (!bars.has(n)) return refuse(`"${n}" is not a bar in this vault.`);
  return { ok: true, params: params.value };
}

// ---- the evidence lines ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

export function askedLine(sentence: string, outcome: PlanOutcome): string {
  const one = sentence.replace(/\s+/g, ' ').trim();
  const shown = one.length > 80 ? `${one.slice(0, 80)}...` : one;
  return `[forge-plan] asked "${shown}" -> ${outcome.ok === false ? `refused: ${outcome.message}` : outcome.params.kind}`;
}
export function createdLine(path: string, kind: string): string {
  return `[forge-plan] created ${path} (${kind})`;
}

// ---- the planner: Plan, then Create ---------------------------------------------------------------------------------------------------------------------------------------------------------

export interface SentencePlannerPorts<F> extends NewPhrasePorts<F> {
  /** Basenames in `bars/` right now. */
  listBarBasenames(): string[];
  /** POST /plan. Rejects when the service cannot be reached; a status of 0 is "no token" (nothing was sent). */
  ask(payload: PlanPayload): Promise<{ status: number; json: unknown }>;
  /** The BYOK key to send, or undefined. */
  ownKey(): string | undefined;
  trace(line: string): void;
}

export type PlanView = { ok: true; kind: PhraseParams['kind']; name: string; path: string; description: string; recipe: string } | { ok: false; message: string };

export interface SentencePlanner {
  /** Ask the service and show what Create would write. Writes nothing. */
  plan(sentence: string): Promise<PlanView>;
  /** Write the note the last successful Plan showed (the name is picked again from a fresh listing) and open it. */
  create(): Promise<NewPhraseResult>;
}

export function createSentencePlanner<F>(ports: SentencePlannerPorts<F>): SentencePlanner {
  let current: { params: PhraseParams } | null = null;
  let seq = 0;
  return {
    async plan(sentence) {
      const mine = ++seq;
      current = null;
      const request = buildPlanRequest({ sentence, barNames: ports.listBarBasenames(), phraseNames: ports.listPhraseBasenames(), ownKey: ports.ownKey() });
      let outcome: PlanOutcome;
      if (request.ok === false) outcome = { ok: false, message: request.message };
      else {
        try {
          outcome = interpretPlanResponse(await ports.ask(request.payload), request.payload.bars);
        } catch (e) {
          outcome = { ok: false, message: `Could not reach the transpile service (${(e as Error)?.message ?? e}). Check your connection and Settings → Forge → Transpile service URL.` };
        }
      }
      if (mine !== seq) return { ok: false, message: 'A newer sentence was planned; this answer was dropped.' };
      ports.trace(askedLine(sentence, outcome));
      if (outcome.ok === false) return { ok: false, message: outcome.message };
      const where = planNewPhraseFromParams({ params: outcome.params, existingBasenames: ports.listPhraseBasenames(), exists: (p) => ports.exists(p) });
      if (where.ok === false) return { ok: false, message: where.message };
      current = { params: outcome.params };
      return { ok: true, kind: outcome.params.kind, name: where.name, path: where.path, description: phraseDescription(where.name, outcome.params), recipe: phraseRecipeSteps(outcome.params).join('\n') };
    },
    async create() {
      if (current === null) { const message = 'Plan the sentence first.'; ports.notify(message); return { ok: false, message }; }
      const params = current.params;
      const result = await createNewPhraseFromParams(ports, params);
      if (result.ok) ports.trace(createdLine(result.path, params.kind));
      return result;
    },
  };
}
