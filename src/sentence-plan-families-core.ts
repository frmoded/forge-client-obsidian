// 2026-11-12-1206 - the sentence service learns ARRANGEMENTS and COMPOSITIONS (forge-transpile 0.2.48). The pure side of the client: the request (the kind is named; only the vault's names for that kind ride along), the answer (read twice: the
// service validated the wire, the plugin's own validators and the vault's lists validate the vault - the second boundary), the version gate (a service older than 0.2.48 cannot plan these kinds and is told apart by the version its own answer
// carries, never guessed from its message) and the loop check for a composition (the draw-time rule of composition-core.ts, asked of the vault BEFORE anything is written). No `obsidian` import: the vault and the service are ports.
import { validateArrangement, arrangementRecipeSteps, type ArrangementParams } from './arrangement-core.ts';
import { COMPOSITION_DEPTH_MAX, compositionRecipeSteps, validateComposition, type CompositionParams, type CompositionSection } from './composition-core.ts';
import { answerVersion, versionAtLeast } from './notebook-request-core.ts';
import { SENTENCE_MAX, planRefusalText, planTransportRefusal, type PlanPayload } from './sentence-plan-core.ts';

/** The forge-transpile version whose /plan understands `family` "arrangement" and "composition". */
export const FAMILY_SERVICE_VERSION = '0.2.48';
export type NewFamily = 'arrangement' | 'composition';
export type FamilyParams = ArrangementParams | CompositionParams;

/** What a service older than FAMILY_SERVICE_VERSION is told (the version it reported, when it did). */
export const OLD_FAMILY_SERVICE = (version: string | null | undefined): string =>
  `This transpile service does not plan arrangements or compositions yet (it needs version ${FAMILY_SERVICE_VERSION} or newer${typeof version === 'string' && version.trim() !== '' ? `; this one is ${version.trim()}` : ''}). The person who runs it has to update it.`;

// ---- the request ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const EMPTY_SENTENCE: Record<NewFamily, string> = {
  arrangement: 'Say in a sentence which phrase plays on which kit, for example: play phrase_001 on the rock kit.',
  composition: 'Say in a sentence what the piece plays and in what order, for example: play phrase_001, then phrase_002 twice.',
};
const NO_KITS_OR_PHRASES = 'This vault has no kits or no phrases yet, so there is nothing to put in an arrangement. Make a kit and a phrase first.';
const NO_SOURCES = 'This vault has no phrases, arrangements or compositions yet, so there is nothing to build a piece from. Make a phrase first.';
const names = (list: Iterable<string> | undefined): string[] => [...new Set(list ?? [])].filter((n) => n !== 'README').sort();

export function buildFamilyPlanRequest(input: {
  family: NewFamily; sentence: string; kitNames: Iterable<string>; phraseNames: Iterable<string>; arrangementNames: Iterable<string>; compositionNames: Iterable<string>; note?: string; ownKey?: string | undefined;
}): { ok: true; payload: PlanPayload } | { ok: false; message: string } {
  const sentence = input.sentence.trim();
  if (sentence === '') return { ok: false, message: EMPTY_SENTENCE[input.family] };
  if (sentence.length > SENTENCE_MAX) return { ok: false, message: `That sentence is ${sentence.length} characters; the limit is ${SENTENCE_MAX}. Make it shorter.` };
  const phrases = names(input.phraseNames);
  const own = input.ownKey ? { user_anthropic_key: input.ownKey } : {};
  if (input.family === 'arrangement') {
    const kits = names(input.kitNames);
    if (kits.length === 0 || phrases.length === 0) return { ok: false, message: NO_KITS_OR_PHRASES };
    return { ok: true, payload: { sentence, bars: [], phrases, family: 'arrangement', kits, ...own } };
  }
  const arrangements = names(input.arrangementNames), compositions = names(input.compositionNames);
  if (phrases.length === 0 && arrangements.length === 0 && compositions.length === 0) return { ok: false, message: NO_SOURCES };
  return { ok: true, payload: { sentence, bars: [], phrases, family: 'composition', arrangements, compositions, ...(input.note ? { note: input.note } : {}), ...own } };
}

// ---- the service's answer -------------------------------------------------------------------------------------------------------------------------------------------------------------------

export interface FamilyContext { family: NewFamily; kits?: readonly string[]; phrases: readonly string[]; arrangements?: readonly string[]; compositions?: readonly string[]; note?: string }
export type FamilyOutcome =
  | { ok: true; params: FamilyParams; serviceVersion?: string }
  /** `suspectOld`: the answer carried no version and it is a refusal an old service could also give, so the caller may ask /health before showing the message. */
  | { ok: false; message: string; suspectOld: boolean; serviceVersion?: string | null };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const FOLDER_OF: Record<string, string> = { phrases: 'phrase', arrangements: 'arrangement', compositions: 'composition' };

export function interpretFamilyResponse(res: { status: number; json: unknown }, ctx: FamilyContext): FamilyOutcome {
  const transport = planTransportRefusal(res, FAMILY_SERVICE_VERSION);
  if (transport !== null) return { ok: false, message: transport, suspectOld: false };
  const json = res.json as Record<string, unknown>;
  const version = answerVersion(json);
  const carried = version !== null ? { serviceVersion: version } : {};
  if (versionAtLeast(version, FAMILY_SERVICE_VERSION) === false) return { ok: false, message: OLD_FAMILY_SERVICE(version), suspectOld: false, ...carried };   // BEFORE the plan is read: an old service's answer is about phrases and bars
  if (json.ok !== true || json.plan === undefined || json.plan === null) return { ok: false, message: planRefusalText(json), suspectOld: version === null, ...carried };
  const refuse = (message: string): FamilyOutcome => ({ ok: false, message, suspectOld: false, ...carried });
  const plan = json.plan;
  if (ctx.family === 'arrangement') {
    if (!isObject(plan) || plan.kind !== 'arrangement') return refuse(`The planner's answer is not an arrangement (kind ${isObject(plan) ? JSON.stringify(plan.kind) : 'missing'}). Try saying which phrase plays on which kit.`);
    const checked = validateArrangement(plan);
    if (checked.ok === false) return refuse(checked.message);
    const kits = new Set(ctx.kits ?? []), phrases = new Set(ctx.phrases);
    for (const t of checked.value.tracks) {
      if (!kits.has(t.kit)) return refuse(`"${t.kit}" is not a kit in this vault.`);
      if (!phrases.has(t.phrase)) return refuse(`"${t.phrase}" is not a phrase in this vault.`);
    }
    return { ok: true, params: checked.value, ...carried };
  }
  if (!isObject(plan) || plan.kind !== 'composition') return refuse(`The planner's answer is not a composition (kind ${isObject(plan) ? JSON.stringify(plan.kind) : 'missing'}). Try saying what the piece plays and in what order.`);
  const checked = validateComposition(plan);
  if (checked.ok === false) return refuse(checked.message);
  const lists: Record<string, Set<string>> = { phrases: new Set(ctx.phrases), arrangements: new Set(ctx.arrangements ?? []), compositions: new Set(ctx.compositions ?? []) };
  for (const s of checked.value.sections) {
    const [folder, name] = s.source.split('/');
    if (!lists[folder]?.has(name)) return refuse(`"${s.source}" is not a phrase, an arrangement or a composition of this vault.`);
    if (ctx.note !== undefined && s.source === ctx.note) return refuse(selfLoop(name));
  }
  return { ok: true, params: checked.value, ...carried };
}

// ---- the loop check -------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const selfLoop = (name: string): string => `The composition "${name}" cannot play itself; that would loop.`;
const baseName = (id: string): string => id.split('/').pop() ?? id;

/** The draw-time rule of composition-core.ts (barsOfSource) asked BEFORE anything is written: starting from the note being planned, a section that is already in the chain, or that would make the chain COMPOSITION_DEPTH_MAX long, is a refusal.
 *  `readSections` gives the sections of a composition note in the vault (`compositions/<name>`), or null when it cannot be read. A phrase or an arrangement section is never read: only a composition can send the chain on. Null = fine. */
export async function compositionLoopRefusal(self: string, params: CompositionParams, readSections: (id: string) => Promise<CompositionSection[] | null>): Promise<string | null> {
  const walk = async (sections: readonly CompositionSection[], chain: readonly string[]): Promise<string | null> => {
    for (const s of sections) {
      if (chain.length === 1 && s.source === self) return selfLoop(baseName(self));
      const kind = s.source.split('/')[0];
      const what = FOLDER_OF[kind] ?? 'composition';
      if (chain.includes(s.source) || chain.length >= COMPOSITION_DEPTH_MAX) return `The ${what} ${baseName(s.source)} loops back to this composition or is nested more than ${COMPOSITION_DEPTH_MAX} deep.`;
      if (kind !== 'compositions') continue;
      const inner = await readSections(s.source);
      if (inner === null) return `The composition ${baseName(s.source)} could not be read, so it cannot be played from here.`;
      const found = await walk(inner, [...chain, s.source]);
      if (found !== null) return found;
    }
    return null;
  };
  return walk(params.sections, [self]);
}

// ---- the preview -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** The Recipe the note will carry for this plan (the lines the preview shows under the Description). */
export const familyRecipeSteps = (p: FamilyParams): string[] => (p.kind === 'arrangement' ? arrangementRecipeSteps(p) : compositionRecipeSteps(p));
