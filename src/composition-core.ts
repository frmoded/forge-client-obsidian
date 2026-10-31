// 2026-10-31-1100 (score_first M17b, design 4.14) - a COMPOSITION is the ROOT note of a piece: `compositions/<name>.md`, in the Forge shape (# Description, # Recipe, # Python, # Cache) above ONE json fence
// `{"kind": "composition", "sections": [{"source": "phrases/phrase_003", "length": 8}, {"source": "arrangements/arr_001", "length": 4, "repeat": 2}]}`: sections played one after another, each the bars of
// a phrase, an arrangement or another composition (a loop or a chain deeper than COMPOSITION_DEPTH_MAX is a refusal). Pure; no `obsidian` import.
//   * the Description is the one grammar's sentences (`describe`): "Play [[phrase_003]] for 8 bars. Then play [[arr_001]] for 4 bars. Repeat that 2 times." - written by the controls (M15b writer path), the json is its cache;
//   * the Recipe is those same sentences, one per line; the Python is `def compute(context):` reading each source by calling its name and returning compose_sections(...), the BAR LIST (forge/music/lib.py);
//   * the Score is drawn from the json by the code that draws every phrase (produceComposition -> the engine glue's `composition` branch -> rhythm_bars_to_stream); the Python text is never run to draw it (P4).
// A section of `length` N bars is REPEATED to fill N or CUT to N (never padded, never stretched), no `length` is all its bars once; `repeat` R plays the whole section R more times (the sentence "Repeat that R times."). Every bar keeps its tempo.
import { barsOfPayload, producePhrase, readPhraseNote, TRANSFORM_DEPTH_MAX, type PhraseScoreDeps } from './phrase-core.ts';
import { callNote, descriptionEditedByHand, extractPhraseJsonBlock, handEditRefusal, pyStr, renderSourceChainNote, type SourceChainParts } from './phrase-notes-core.ts';
import { describe, compositionSentences } from './phrase-describe-core.ts';
import { FORGE_COMPOSITION_KEY } from './composition-nav-core.ts';
export { FORGE_COMPOSITION_KEY } from './composition-nav-core.ts';
import { computeScore, type ScoreOutcome } from './rhythm-score-core.ts';
import { produceArrangement, type ArrangementDeps } from './arrangement-core.ts';
import type { RhythmData } from './rhythm-edit-core.ts';

export const COMPOSITION_FOLDER = 'compositions';
export const COMPOSITION_VIEW_TYPE = 'forge-composition-view';
/** The most sections a composition holds, the longest a section may be told to be, and the most times it may be repeated: a limit with a sentence, never a silent clamp. */
export const COMPOSITION_SECTIONS_MAX = 32;
export const COMPOSITION_LENGTH_MAX = 256;
export const COMPOSITION_REPEAT_MAX = 16;
/** How deep a composition may nest (a section that is a composition whose section is a composition ...), the same limit a chain of transforms has. */
export const COMPOSITION_DEPTH_MAX = TRANSFORM_DEPTH_MAX;

/** `source` is a note id without .md: `phrases/phrase_003`, `arrangements/arr_001` or `compositions/<name>`. `length` (bars) and `repeat` (more times) are written only when set. */
export interface CompositionSection { source: string; length?: number; repeat?: number }
export interface CompositionParams { kind: 'composition'; sections: CompositionSection[] }
type Validation<T> = { ok: true; value: T } | { ok: false; message: string };

export const compositionPath = (name: string): string => `${COMPOSITION_FOLDER}/${name}.md`;
export const isCompositionPath = (path: string): boolean => /^compositions\/[^/]+\.md$/.test(path) && path !== `${COMPOSITION_FOLDER}/README.md`;
/** The name a composition note is given when the person does not choose one, and the pattern a chosen one must match (a file in a flat folder: letters, digits, _ and -). */
export const COMPOSITION_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const SECTION_SOURCE = /^(?:phrases\/phrase_\d+|arrangements\/arr_\d+|compositions\/[A-Za-z0-9_-]+)$/;
const baseName = (id: string): string => id.split('/').pop() ?? id;

export function validateComposition(raw: unknown): Validation<CompositionParams> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, message: 'A composition is an object with a kind and sections.' };
  const o = raw as Record<string, unknown>;
  if (o.kind !== 'composition') return { ok: false, message: `The kind must be "composition", got ${JSON.stringify(o.kind)}.` };
  for (const key of Object.keys(o)) if (!['kind', 'sections'].includes(key)) return { ok: false, message: `Unexpected field "${key}" (a composition holds only kind and sections).` };
  if (!Array.isArray(o.sections) || o.sections.length === 0) return { ok: false, message: 'A composition needs at least one section (a phrase, an arrangement or a composition to play).' };
  if (o.sections.length > COMPOSITION_SECTIONS_MAX) return { ok: false, message: `A composition holds at most ${COMPOSITION_SECTIONS_MAX} sections, got ${o.sections.length}.` };
  const sections: CompositionSection[] = [];
  for (let i = 0; i < o.sections.length; i++) {
    const s = o.sections[i] as Record<string, unknown> | null;
    if (typeof s !== 'object' || s === null || Array.isArray(s)) return { ok: false, message: `sections[${i}] must be an object with a source and, optionally, a length and a repeat.` };
    for (const key of Object.keys(s)) if (!['source', 'length', 'repeat'].includes(key)) return { ok: false, message: `sections[${i}]: unexpected field "${key}" (a section holds only source, length and repeat).` };
    if (typeof s.source !== 'string' || !SECTION_SOURCE.test(s.source)) {
      return { ok: false, message: `sections[${i}]: the source must be a phrase, an arrangement or a composition note without .md, like phrases/phrase_003, arrangements/arr_001 or compositions/intro, got ${JSON.stringify(s.source)}.` };
    }
    const whole = (v: unknown, min: number, max: number): boolean => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
    if (s.length !== undefined && !whole(s.length, 1, COMPOSITION_LENGTH_MAX)) return { ok: false, message: `sections[${i}]: length must be a whole number of bars from 1 to ${COMPOSITION_LENGTH_MAX}, got ${JSON.stringify(s.length)}.` };
    if (s.repeat !== undefined && !whole(s.repeat, 1, COMPOSITION_REPEAT_MAX)) return { ok: false, message: `sections[${i}]: repeat must be a whole number of times from 1 to ${COMPOSITION_REPEAT_MAX}, got ${JSON.stringify(s.repeat)}.` };
    sections.push({ source: s.source, ...(s.length !== undefined ? { length: s.length as number } : {}), ...(s.repeat !== undefined ? { repeat: s.repeat as number } : {}) });
  }
  return { ok: true, value: { kind: 'composition', sections } };
}

const sectionJson = (s: CompositionSection): string => `{"source": ${JSON.stringify(s.source)}${s.length !== undefined ? `, "length": ${s.length}` : ''}${s.repeat !== undefined ? `, "repeat": ${s.repeat}` : ''}}`;
export function formatCompositionJson(p: CompositionParams): string {
  return ['{', `  "kind": "composition",`, '  "sections": [', ...p.sections.map((s, i) => `    ${sectionJson(s)}${i < p.sections.length - 1 ? ',' : ''}`), '  ]', '}'].join('\n');
}

const link = (name: string): string => `[[${name}]]`;
const barsWord = (n: number): string => (n === 1 ? 'bar' : 'bars');
/** Every note this composition plays, once each, in the order the Recipe names them. */
export const compositionLinks = (p: CompositionParams): string[] => [...new Set(p.sections.map((s) => baseName(s.source)))];
/** The frontmatter `description` (words with wikilinks, for the graph; not the source). */
export function compositionDescription(name: string, p: CompositionParams): string {
  const played = p.sections.map((s) => `${link(baseName(s.source))}${s.length !== undefined ? ` for ${s.length} ${barsWord(s.length)}` : ''}${s.repeat !== undefined ? `, ${s.repeat === 1 ? 'once more' : `${s.repeat} more times`}` : ''}`).join(', then ');
  return `${name} — a piece of ${p.sections.length === 1 ? 'one section' : `${p.sections.length} sections`}: ${played}.`;
}
export const compositionRecipeSteps = (p: CompositionParams): string[] => compositionSentences(p);
export function compositionPython(p: CompositionParams): string {
  const sections = expandSections(p);
  return [
    'def compute(context):',
    '  sections = []',
    ...sections.map((s) => `  sections.append({'source': ${pyStr(baseName(s.source))}, 'bars': ${callNote(baseName(s.source))}${s.length !== undefined ? `, 'length': ${s.length}` : ''}})`),
    '  bars = compose_sections(sections=sections)',
    '  return bars',
    '  # for a Score of these bars: rhythm_bars_to_stream(bars=bars)',
  ].join('\n');
}

/** The sections the engine plays: each section of the json, then its `repeat` copies (the sentence "Repeat that 2 times." plays the section 2 more times). `index` is the section of the json (from 0), `copy` which play of it (0 is the first). */
export interface ExpandedSection { index: number; copy: number; source: string; length?: number }
export function expandSections(p: CompositionParams): ExpandedSection[] {
  const out: ExpandedSection[] = [];
  p.sections.forEach((s, index) => {
    for (let copy = 0; copy <= (s.repeat ?? 0); copy++) out.push({ index, copy, source: s.source, ...(s.length !== undefined ? { length: s.length } : {}) });
  });
  return out;
}

export const compositionParts = (name: string, p: CompositionParams): SourceChainParts => ({ description: compositionDescription(name, p), links: compositionLinks(p), sentence: describe(p), recipe: compositionRecipeSteps(p), python: compositionPython(p) });
/** The composition note with its source chain written (the one renderer every note uses); the text from the fence on is kept byte for byte. */
export const renderCompositionNote = (text: string, name: string, p: CompositionParams, fenceStart: number): string => renderSourceChainNote(text, compositionParts(name, p), fenceStart);

export function newCompositionNote(name: string, p: CompositionParams, extraFront: string[] = []): string {
  const fence = ['```json', formatCompositionJson(p), '```', ''].join('\n');
  const stub = ['---', 'type: data', 'content_type: json', ...extraFront, '---', '', ''].join('\n');
  return renderCompositionNote(stub + fence, name, p, stub.length);
}

export function readCompositionNote(text: string): Validation<CompositionParams> {
  const block = extractPhraseJsonBlock(text);
  if (block.ok === false) return { ok: false, message: block.message };
  let parsed: unknown;
  try { parsed = JSON.parse(text.slice(block.contentStart, block.contentEnd)); } catch (e) { return { ok: false, message: `The json block is not valid JSON: ${(e as Error).message}` }; }
  return validateComposition(parsed);
}

/** "Refresh note links" on one composition note: derived parts regenerated from the json. Idempotent; refuses a Description edited by hand. */
export function refreshCompositionNoteText(text: string, name: string): { ok: true; text: string; changed: boolean } | { ok: false; message: string } {
  const block = extractPhraseJsonBlock(text);
  if (block.ok === false) return { ok: false, message: block.message };
  const read = readCompositionNote(text);
  if (read.ok === false) return { ok: false, message: read.message };
  if (descriptionEditedByHand(text)) return { ok: false, message: handEditRefusal(false) };
  const next = renderCompositionNote(text, name, read.value, block.fenceStart);
  return { ok: true, text: next, changed: next !== text };
}

/** The controls' write: the note with ITS json replaced by `p` and the derived parts made again by the same builders New composition uses. */
export function applyCompositionWrite(text: string, name: string, p: CompositionParams): { ok: true; text: string; changed: boolean } | { ok: false; message: string } {
  const block = extractPhraseJsonBlock(text);
  if (block.ok === false) return { ok: false, message: block.message };
  if (descriptionEditedByHand(text)) return { ok: false, message: handEditRefusal(true) };         // the sentence of M15b, unchanged: "Not saved: the Description was edited by hand; ..."
  const withJson = text.slice(0, block.contentStart) + formatCompositionJson(p) + text.slice(block.contentEnd);
  const next = renderCompositionNote(withJson, name, p, block.fenceStart);
  return { ok: true, text: next, changed: next !== text };
}

/** `comp_001`, `comp_002` ...: the first number not taken (zero-padded to three, like phrase_NNN and arr_NNN). */
export function nextCompositionName(taken: (path: string) => boolean): string {
  for (let n = 1; ; n++) { const name = `comp_${String(n).padStart(3, '0')}`; if (!taken(compositionPath(name))) return name; }
}
export const compositionCreatedLine = (name: string, p: CompositionParams): string => `[forge-composition] created ${compositionPath(name)} sections=${p.sections.map((s) => `${baseName(s.source)}${s.length !== undefined ? `:${s.length}` : ''}${s.repeat !== undefined ? `x${s.repeat + 1}` : ''}`).join(',')}`;

// ---- the Score ----------------------------------------------------------------------------------------------------------------------------------------------------------------

/** What the engine glue gets: each (expanded) section's source and the bars of the note it plays, and how many bars it is to fill (absent = all of them, once). */
export interface CompositionInput { sections: Array<{ source: string; bars: RhythmData[]; length?: number }> }
/** What the Score on screen is made of: the expanded sections with the number of bars each fills and its own tempo range, in the order they play. Carried on the payload under FORGE_COMPOSITION_KEY. */
export interface CompositionShape { sections: Array<ExpandedSection & { bars: number; first: number }> }

export interface CompositionDeps {
  /** Reading phrases (and the bars they are made of) and drawing them: exactly what draws a phrase tab (with the arrangement and composition sources a transform may take). */
  phrases: PhraseScoreDeps;
  /** The engine: compose_sections over the sections, then rhythm_bars_to_stream and the tagged MusicXML payload (the `composition` branch of the plugin-side phrase glue). */
  compute(data: CompositionInput, title: string): Promise<unknown>;
  /** The engine's arrangement step, for a section that is an arrangement. */
  computeArrangement: ArrangementDeps['compute'];
  /** The sources being drawn above this call, outermost first (empty = the top): a loop through a composition is a refusal naming it. */
  chain?: readonly string[];
}

/** The engine's own `compose_sections: ...` line out of an error (two sections with different meters). `null` = not one of its refusals. */
export function composeRefusal(message: string): string | null {
  const last = message.trim().split('\n').pop() ?? '';
  const m = /(compose_sections(?:_lineage)?: .*?)\s*$/.exec(last);
  return m ? m[1] : null;
}

/** The deps a phrase is drawn with when a transform may take an arrangement OR a composition as its source: the phrase deps (`readNote`, `compute`), the chain of sources being drawn, and the two ways to draw the other kinds of note. */
export function phraseDepsWithSources(base: Pick<PhraseScoreDeps, 'readNote' | 'compute'>, engines: { computeArrangement: ArrangementDeps['compute']; computeComposition: CompositionDeps['compute'] }, chain: readonly string[] = []): PhraseScoreDeps {
  return {
    readNote: base.readNote,
    compute: base.compute,
    chain,
    arrangementBars: (note, name, drawing) => produceArrangement({ phrases: phraseDepsWithSources(base, engines, drawing), compute: engines.computeArrangement }, note, name),
    compositionBars: (note, name, drawing) => produceComposition({ phrases: phraseDepsWithSources(base, engines, drawing), compute: engines.computeComposition, computeArrangement: engines.computeArrangement, chain: drawing }, note, name),
  };
}

/** The bars one section's note plays: a phrase is drawn by the code that draws every phrase tab, an arrangement and a composition by theirs (each with the chain one level deeper). A string is a sentence saying why not. */
async function barsOfSource(deps: CompositionDeps, source: string, chain: readonly string[]): Promise<RhythmData[] | string> {
  const name = baseName(source);
  const what = source.startsWith('phrases/') ? 'phrase' : source.startsWith('arrangements/') ? 'arrangement' : 'composition';
  if (chain.includes(source) || chain.length >= COMPOSITION_DEPTH_MAX) return `the ${what} ${name} loops back to this composition or is nested more than ${COMPOSITION_DEPTH_MAX} deep.`;
  let text: string;
  try { text = await deps.phrases.readNote(`${source}.md`); } catch (e) { return `the ${what} ${name} (${source}.md) was not found or could not be read (${(e as Error)?.message ?? e}).`; }
  const next = [...chain, source];
  const inner = phraseDepsWithSources(deps.phrases, { computeArrangement: deps.computeArrangement, computeComposition: deps.compute }, next);
  let made: ScoreOutcome;
  if (what === 'phrase') {
    const parsed = readPhraseNote(text);
    if (parsed.ok === false) return `the phrase ${name} is not usable: ${parsed.message}`;
    made = await producePhrase(inner, parsed.value, name);
  } else if (what === 'arrangement') made = await produceArrangement({ phrases: inner, compute: deps.computeArrangement }, text, name);
  else made = await produceComposition({ ...deps, phrases: inner, chain: next }, text, name);
  if (made.kind !== 'score') return `the ${what} ${name} could not be drawn: ${made.message}`;
  const bars = barsOfPayload(made.payload);
  return bars === null ? `the ${what} ${name} gave no bars to play.` : bars;
}

/** The Score of a composition note: every section's note is read FRESH and drawn by the code that draws it (a phrase, an arrangement, another composition); the engine joins the bars. A source that is missing, unusable, looping or nested
 *  too deep, or two sections the engine refuses to join (another meter), is a refusal naming which and why. The sources of the payload ride along (`forge_composition`) for the tab. */
export async function produceComposition(deps: CompositionDeps, note: string | { unreadable: string }, title: string): Promise<ScoreOutcome> {
  if (typeof note !== 'string') return { kind: 'refusal', message: `Composition: the composition note could not be read (${note.unreadable}).` };
  const read = readCompositionNote(note);
  if (read.ok === false) return { kind: 'refusal', message: `Composition: ${read.message}` };
  const chain = deps.chain && deps.chain.length > 0 ? deps.chain : [`${COMPOSITION_FOLDER}/${title}`];
  const expanded = expandSections(read.value);
  const drawn = new Map<string, RhythmData[]>();
  for (const s of expanded) {
    if (drawn.has(s.source)) continue;
    const bars = await barsOfSource(deps, s.source, chain);
    if (typeof bars === 'string') return { kind: 'refusal', message: `Composition: ${bars}` };
    drawn.set(s.source, bars);
  }
  const sections: CompositionInput['sections'] = expanded.map((s) => ({ source: s.source, bars: drawn.get(s.source) as RhythmData[], ...(s.length !== undefined ? { length: s.length } : {}) }));
  let refused: string | null = null;
  const outcome = await computeScore(async (_data, t) => {
    try {
      return await deps.compute({ sections }, t);
    } catch (e) {
      const line = composeRefusal((e as Error)?.message ?? String(e));
      if (line !== null) { refused = line; return null; }
      throw e;
    }
  }, sections[0].bars[0], title);
  if (refused !== null) return { kind: 'refusal', message: `Composition: ${refused}` };
  if (outcome.kind !== 'score') return outcome;
  let first = 1;
  const shape: CompositionShape = { sections: expanded.map((s, i) => { const bars = s.length ?? sections[i].bars.length; const out = { ...s, bars, first }; first += bars; return out; }) };
  return { kind: 'score', payload: { ...outcome.payload, [FORGE_COMPOSITION_KEY]: shape } };
}

/** The tab header: "3 sections, 22 bars, 1.4 min" - the sections as the json has them (a repeat is the same section), the bars the Score has, the minutes it plays at each bar's own tempo. `null` = nothing to say yet. */
export function compositionHeader(p: CompositionParams, bars: readonly RhythmData[] | null): string {
  const n = p.sections.length;
  const sections = `${n} ${n === 1 ? 'section' : 'sections'}`;
  if (bars === null || bars.length === 0) return sections;
  const minutes = bars.reduce((sum, b) => sum + barSeconds(b), 0) / 60;
  return `${sections}, ${bars.length} ${barsWord(bars.length)}, ${minutes < 0.1 ? '<0.1' : minutes.toFixed(1)} min`;
}
/** How long one bar plays: its beats (the numerator of the meter, in the beat the denominator names, a quarter note = one beat) at its own tempo. */
export function barSeconds(bar: RhythmData): number {
  const m = /^(\d+)\/(\d+)$/.exec(bar.time_signature);
  const tempo = bar.tempo_bpm;
  if (!m || typeof tempo !== 'number' || !(tempo > 0)) return 0;
  return (Number(m[1]) * (4 / Number(m[2])) * 60) / tempo;
}
