// score_first M10 slice 1 (drain 2026-10-29-0820, design 4.10) - an ARRANGEMENT is a note: `arrangements/arr_NNN.md`, Forge shape (# Description, # Recipe, # Python) above ONE json fence
// `{"kind": "arrangement", "tracks": [{"kit": "rock", "phrase": "phrase_003"}, ...]}`: phrases played together, each on a kit. Pure; no `obsidian` import.
//   * Description: names the tracks and says what a shorter phrase does ("rests until the longest one ends");
//   * Recipe: "Play [[phrase_003]] on the [[rock]] kit." per track, then "Together." - the wikilinks are real (backlinks, the structure strip and the notes pane work), and `links:` in the frontmatter lists them once each;
//   * Python: `def compute(context):` reading each kit and phrase by calling its name (the way a Forge note reads a data note) and returning combine_tracks(...), the BAR LIST (the contract of a phrase's compute since 2026-10-29-0810).
// The Score is drawn from the json by the code that draws every phrase (produceArrangement -> the engine glue's `arrangement` branch -> rhythm_bars_to_stream); the Python text is never run to draw it (P4).
import { barsOfPayload, producePhrase, readPhraseNote, type PhraseScoreDeps } from './phrase-core.ts';
import { callNote, descriptionEditedByHand, extractPhraseJsonBlock, handEditRefusal, pyStr, renderSourceChainNote, type SourceChainParts } from './phrase-notes-core.ts';
import { describe } from './phrase-describe-core.ts';
import type { RhythmData } from './rhythm-edit-core.ts';
import { computeScore, type ScoreOutcome } from './rhythm-score-core.ts';
import { KIT_NAME_PATTERN, kitPath, readKitNote, type KitParams } from './kit-core.ts';
import { FORGE_PHRASES_KEY } from './arrangement-nav-core.ts';
import type { PhraseParams } from './phrase-core.ts';

export const ARRANGEMENT_FOLDER = 'arrangements';
export const ARRANGEMENT_VIEW_TYPE = 'forge-arrangement-view';
/** `mute`, `solo` and `volume` (a whole number 0 to 100; 100 = unchanged) are optional and written only when set; the engine's combine_tracks applies them (a muted kit plays nothing, solo = every other kit muted, volume scales velocities). */
export interface ArrangementTrack { kit: string; phrase: string; mute?: boolean; solo?: boolean; volume?: number }
export interface ArrangementParams { kind: 'arrangement'; tracks: ArrangementTrack[] }
type Validation<T> = { ok: true; value: T } | { ok: false; message: string };

export const arrangementPath = (name: string): string => `${ARRANGEMENT_FOLDER}/${name}.md`;
export const isArrangementPath = (path: string): boolean => /^arrangements\/[^/]+\.md$/.test(path) && path !== `${ARRANGEMENT_FOLDER}/README.md`;
export const phraseNotePath = (phrase: string): string => `phrases/${phrase}.md`;

const NAME = KIT_NAME_PATTERN;      // a kit and a phrase are files in a flat folder; the same safe-name rule

export function validateArrangement(raw: unknown): Validation<ArrangementParams> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, message: 'An arrangement is an object with a kind and tracks.' };
  const o = raw as Record<string, unknown>;
  if (o.kind !== 'arrangement') return { ok: false, message: `The kind must be "arrangement", got ${JSON.stringify(o.kind)}.` };
  for (const key of Object.keys(o)) if (!['kind', 'tracks'].includes(key)) return { ok: false, message: `Unexpected field "${key}" (an arrangement holds only kind and tracks).` };
  if (!Array.isArray(o.tracks) || o.tracks.length === 0) return { ok: false, message: 'An arrangement needs at least one track (a kit and a phrase to play on it).' };
  const tracks: ArrangementTrack[] = [];
  const kits = new Set<string>();
  for (let i = 0; i < o.tracks.length; i++) {
    const t = o.tracks[i] as Record<string, unknown> | null;
    if (typeof t !== 'object' || t === null || Array.isArray(t)) return { ok: false, message: `tracks[${i}] must be an object with a kit and a phrase.` };
    for (const key of Object.keys(t)) if (!['kit', 'phrase', 'mute', 'solo', 'volume'].includes(key)) return { ok: false, message: `tracks[${i}]: unexpected field "${key}" (a track holds only kit, phrase, mute, solo and volume).` };
    if (typeof t.kit !== 'string' || !NAME.test(t.kit)) return { ok: false, message: `tracks[${i}]: the kit ${JSON.stringify(t.kit)} is not a kit name.` };
    if (typeof t.phrase !== 'string' || !NAME.test(t.phrase)) return { ok: false, message: `tracks[${i}]: the phrase ${JSON.stringify(t.phrase)} is not a phrase name.` };
    if (kits.has(t.kit)) return { ok: false, message: `The kit "${t.kit}" plays two tracks; a kit plays one phrase.` };
    for (const flag of ['mute', 'solo'] as const) if (t[flag] !== undefined && typeof t[flag] !== 'boolean') return { ok: false, message: `tracks[${i}]: ${flag} must be true or false, got ${JSON.stringify(t[flag])}.` };
    if (t.volume !== undefined && (typeof t.volume !== 'number' || !Number.isInteger(t.volume) || t.volume < 0 || t.volume > 100)) return { ok: false, message: `tracks[${i}]: volume must be a whole number from 0 to 100, got ${JSON.stringify(t.volume)}.` };
    kits.add(t.kit);
    tracks.push({ kit: t.kit, phrase: t.phrase, ...(t.mute !== undefined ? { mute: t.mute as boolean } : {}), ...(t.solo !== undefined ? { solo: t.solo as boolean } : {}), ...(t.volume !== undefined ? { volume: t.volume as number } : {}) });
  }
  return { ok: true, value: { kind: 'arrangement', tracks } };
}

const settingsJson = (t: ArrangementTrack): string => `${t.mute !== undefined ? `, "mute": ${t.mute}` : ''}${t.solo !== undefined ? `, "solo": ${t.solo}` : ''}${t.volume !== undefined ? `, "volume": ${t.volume}` : ''}`;
export function formatArrangementJson(p: ArrangementParams): string {
  return ['{', `  "kind": "arrangement",`, '  "tracks": [', ...p.tracks.map((t, i) => `    {"kit": ${JSON.stringify(t.kit)}, "phrase": ${JSON.stringify(t.phrase)}${settingsJson(t)}}${i < p.tracks.length - 1 ? ',' : ''}`), '  ]', '}'].join('\n');
}

const link = (name: string): string => `[[${name}]]`;
/** Every note this arrangement reads, once each, in the order the Recipe names them: each track's phrase, then its kit. */
export const arrangementLinks = (p: ArrangementParams): string[] => [...new Set(p.tracks.flatMap((t) => [t.phrase, t.kit]))];
const bpmWords = (t: { from: number; to: number }): string => { const f = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1)); return t.from === t.to ? `${f(t.from)} bpm` : `${f(t.from)} to ${f(t.to)} bpm`; };
/** What the tracks' settings say in the Description: who is muted, who is solo, who is not at full volume. Empty when nothing is set (a slice 1 note's Description is unchanged by it). */
function settingsWords(p: ArrangementParams): string {
  const muted = p.tracks.filter((t) => t.mute === true).map((t) => link(t.kit));
  const solo = p.tracks.filter((t) => t.solo === true).map((t) => link(t.kit));
  const volumes = [...new Set(p.tracks.filter((t) => t.volume !== undefined && t.volume !== 100).map((t) => t.volume as number))];
  return [...(muted.length > 0 ? [`Muted: ${muted.join(', ')}.`] : []), ...(solo.length > 0 ? [`Solo: ${solo.join(', ')}.`] : []),
    ...volumes.map((v) => `Volume ${v} percent: ${p.tracks.filter((t) => t.volume === v).map((t) => link(t.kit)).join(', ')}.`)].join(' ');
}
/** `tempo` (optional) is the first phrase's bpm from the engine's drawn bars, known to the tab header only: the stored Description cannot hold a number the engine decides and that moves when the phrase is edited. */
export function arrangementDescription(name: string, p: ArrangementParams, tempo?: { from: number; to: number }): string {
  const played = p.tracks.map((t) => `${link(t.phrase)} on the ${link(t.kit)} kit`).join(', ');
  const retime = p.tracks.length > 1 ? ` All tracks play at the tempo of ${link(p.tracks[0].phrase)}${tempo ? `: ${bpmWords(tempo)}` : ''}.` : '';
  const settings = settingsWords(p);
  return `${name} — ${p.tracks.length === 1 ? 'one track' : `${p.tracks.length} tracks played together`}: ${played}. A phrase that is shorter than the others rests until the longest one ends.${retime}${settings ? ` ${settings}` : ''}`;
}
const kitsWords = (kits: string[]): string => (kits.length === 1 ? `the ${link(kits[0])} kit plays` : `the ${kits.slice(0, -1).map(link).join(', ')} and ${link(kits[kits.length - 1])} kits play`);
/** The English steps for the tracks' settings, in this order: volume, mute, solo (a track at full volume, not muted and not solo has none). */
export function trackSettingsSteps(p: ArrangementParams): string[] {
  const solo = p.tracks.filter((t) => t.solo === true).map((t) => t.kit);
  return [
    ...p.tracks.filter((t) => t.volume !== undefined && t.volume !== 100).map((t) => `Play the ${link(t.kit)} kit at ${t.volume} percent volume.`),
    ...p.tracks.filter((t) => t.mute === true).map((t) => `Mute the ${link(t.kit)} kit.`),
    ...(solo.length > 0 ? [`Only ${kitsWords(solo)}.`] : []),
  ];
}
export const arrangementRecipeSteps = (p: ArrangementParams): string[] => [...p.tracks.map((t) => `Play ${link(t.phrase)} on the ${link(t.kit)} kit.`), ...trackSettingsSteps(p), 'Together.'];
export function arrangementPython(p: ArrangementParams): string {
  return [
    'def compute(context):',
    '  tracks = []',
    ...p.tracks.map((t) => `  tracks.append({'kit': ${pyStr(t.kit)}, 'channels': ${callNote(t.kit)}['channels'], 'bars': ${callNote(t.phrase)}${t.mute === true ? ", 'mute': True" : ''}${t.solo === true ? ", 'solo': True" : ''}${t.volume !== undefined && t.volume !== 100 ? `, 'volume': ${t.volume}` : ''}})`),
    '  bars = combine_tracks(tracks=tracks)',
    '  return bars',
    '  # for a Score of these bars: rhythm_bars_to_stream(bars=bars)',
  ].join('\n');
}
/** The parts of an arrangement note (2026-10-30-1050, M15b): the `# Description` is the grammar's sentence for the tracks (`describe`), the frontmatter `description` stays the words with wikilinks for the graph, Recipe and Python derive as before. */
export const arrangementParts = (name: string, p: ArrangementParams): SourceChainParts => ({ description: arrangementDescription(name, p), links: arrangementLinks(p), sentence: describe(p), recipe: arrangementRecipeSteps(p), python: arrangementPython(p) });
/** The arrangement note with its source chain written (the one renderer phrases use too); the text from the fence on is kept byte for byte. */
export const renderArrangementNote = (text: string, name: string, p: ArrangementParams, fenceStart: number): string => renderSourceChainNote(text, arrangementParts(name, p), fenceStart);

export function newArrangementNote(name: string, p: ArrangementParams): string {
  const fence = ['```json', formatArrangementJson(p), '```', ''].join('\n');
  const stub = ['---', 'type: data', 'content_type: json', '---', '', ''].join('\n');
  return renderArrangementNote(stub + fence, name, p, stub.length);
}

export function readArrangementNote(text: string): Validation<ArrangementParams> {
  const block = extractPhraseJsonBlock(text);          // refuses a note with no frontmatter, no json block, an unclosed or non-last one
  if (block.ok === false) return { ok: false, message: block.message };
  let parsed: unknown;
  try { parsed = JSON.parse(text.slice(block.contentStart, block.contentEnd)); } catch (e) { return { ok: false, message: `The json block is not valid JSON: ${(e as Error).message}` }; }
  return validateArrangement(parsed);
}

/** "Refresh note links" on one arrangement note: derived parts regenerated from the json (fence and the person's own frontmatter lines untouched). Idempotent. */
export function refreshArrangementNoteText(text: string, name: string): { ok: true; text: string; changed: boolean } | { ok: false; message: string } {
  const read = readArrangementNote(text);
  if (read.ok === false) return { ok: false, message: read.message };
  const block = extractPhraseJsonBlock(text);
  if (block.ok === false) return { ok: false, message: block.message };
  if (descriptionEditedByHand(text)) return { ok: false, message: handEditRefusal(false) };
  const next = renderArrangementNote(text, name, read.value, block.fenceStart);
  return { ok: true, text: next, changed: next !== text };
}

/** One field of one track changed: the new arrangement. A field back at its default (mute off, solo off, volume 100) is dropped, so an undone change leaves the note as it was; an unknown track or a value that is not allowed changes nothing (the same object comes back). */
export function setTrackSetting(p: ArrangementParams, index: number, patch: { mute?: boolean; solo?: boolean; volume?: number }): ArrangementParams {
  if (!Number.isInteger(index) || index < 0 || index >= p.tracks.length) return p;
  for (const flag of ['mute', 'solo'] as const) if (patch[flag] !== undefined && typeof patch[flag] !== 'boolean') return p;
  if (patch.volume !== undefined && (typeof patch.volume !== 'number' || !Number.isInteger(patch.volume) || patch.volume < 0 || patch.volume > 100)) return p;
  const track: ArrangementTrack = { ...p.tracks[index], ...patch };
  if (track.mute === false) delete track.mute;
  if (track.solo === false) delete track.solo;
  if (track.volume === 100) delete track.volume;
  return { kind: 'arrangement', tracks: p.tracks.map((t, i) => (i === index ? track : t)) };
}

/** The controls' write: the note with ITS json replaced by `p` and the derived parts (Description, links, Recipe, Python) made again by the same builders New arrangement uses, so a changed note is the note New arrangement would have made for the changed arrangement. The person's own frontmatter lines stay. Idempotent. */
export function applyArrangementWrite(text: string, name: string, p: ArrangementParams): { ok: true; text: string; changed: boolean } | { ok: false; message: string } {
  const block = extractPhraseJsonBlock(text);
  if (block.ok === false) return { ok: false, message: block.message };
  if (descriptionEditedByHand(text)) return { ok: false, message: handEditRefusal(false) };
  const withJson = text.slice(0, block.contentStart) + formatArrangementJson(p) + text.slice(block.contentEnd);
  const next = renderArrangementNote(withJson, name, p, block.fenceStart);
  return { ok: true, text: next, changed: next !== text };
}

/** The control changes `patches` (track number, change), in order, applied to the CURRENT text of the note; a change that changes nothing writes nothing (`changed` false). */
export function applySettingsPatches(text: string, name: string, patches: ReadonlyArray<readonly [number, { mute?: boolean; solo?: boolean; volume?: number }]>): { ok: true; text: string; changed: boolean } | { ok: false; message: string } {
  const read = readArrangementNote(text);
  if (read.ok === false) return { ok: false, message: read.message };
  let next = read.value;
  for (const [index, patch] of patches) next = setTrackSetting(next, index, patch);
  return applyArrangementWrite(text, name, next);
}

/** The bpm the Score plays at, first bar to last, for the tab header (the engine's number: the stored Description cannot hold it). `null` = no bars or no tempo. */
export function tempoRangeOf(bars: readonly RhythmData[]): { from: number; to: number } | null {
  const first = bars[0]?.tempo_bpm, last = bars[bars.length - 1]?.tempo_bpm;
  return typeof first === 'number' && typeof last === 'number' ? { from: first, to: last } : null;
}

/** `arr_001`, `arr_002` ...: the first number not taken (zero-padded to three, like phrase_NNN and bar_NNN). */
export function nextArrangementName(taken: (path: string) => boolean): string {
  for (let n = 1; ; n++) { const name = `arr_${String(n).padStart(3, '0')}`; if (!taken(arrangementPath(name))) return name; }
}
export const arrangementCreatedLine = (name: string, p: ArrangementParams): string => `[forge-arrangement] created ${arrangementPath(name)} tracks=${p.tracks.map((t) => `${t.phrase}@${t.kit}`).join(',')}`;

// ---- the Score ----------------------------------------------------------------------------------------------------------------------------------------------------------------

/** What the engine glue gets: each track's kit (its name and channels) and the bars of the phrase played on it. */
export interface ArrangementInput { tracks: Array<{ kit: string; channels: string[]; bars: RhythmData[]; phrase?: string; mute?: boolean; solo?: boolean; volume?: number }> }

export interface ArrangementDeps {
  /** Reading phrases (and the bars they are made of) and drawing them: exactly what draws a phrase tab. */
  phrases: PhraseScoreDeps;
  /** The engine: combine_tracks over the tracks, then rhythm_bars_to_stream and the tagged MusicXML payload (the `arrangement` branch of the plugin-side phrase glue). */
  compute(data: ArrangementInput, title: string): Promise<unknown>;
}

/** Shown instead of an empty Score when every kit is muted (the engine refuses to draw nothing). */
export const ALL_MUTED = 'Every kit is muted, so nothing plays. Unmute one of them.';

/** The engine's own `combine_tracks: ...` line out of an error (two kits with one channel, a different meter or tempo). `null` = not one of its refusals. */
export function combineRefusal(message: string): string | null {
  const last = message.trim().split('\n').pop() ?? '';          // the exception line is the last line of a Python traceback, whatever prefix the host puts before it
  const m = /(combine_tracks: .*?)\s*$/.exec(last);
  return m ? m[1] : null;
}

/** The Score of an arrangement note: every kit and phrase is read FRESH and each phrase is drawn by the same code that draws every phrase tab (so any kind of phrase works); the engine merges the bars. A kit or
 *  phrase that is missing or unusable, or two tracks the engine refuses to play together, is a refusal naming which and why. */
export async function produceArrangement(deps: ArrangementDeps, note: string | { unreadable: string }, title: string): Promise<ScoreOutcome> {
  if (typeof note !== 'string') return { kind: 'refusal', message: `Arrangement: the arrangement note could not be read (${note.unreadable}).` };
  const read = readArrangementNote(note);
  if (read.ok === false) return { kind: 'refusal', message: `Arrangement: ${read.message}` };
  const tracks: ArrangementInput['tracks'] = [];
  const phrasesRead: Record<string, PhraseParams> = {};
  for (const track of read.value.tracks) {
    const kit = await readKit(deps.phrases, track.kit);
    if (typeof kit === 'string') return { kind: 'refusal', message: `Arrangement: ${kit}` };
    const drawn = await drawPhraseBars(deps.phrases, track.phrase);
    if (typeof drawn === 'string') return { kind: 'refusal', message: `Arrangement: ${drawn}` };
    const { bars, params } = drawn;
    phrasesRead[track.phrase] = params;
    tracks.push({ kit: kit.name, channels: kit.channels, bars, phrase: track.phrase, ...(track.mute !== undefined ? { mute: track.mute } : {}), ...(track.solo !== undefined ? { solo: track.solo } : {}), ...(track.volume !== undefined ? { volume: track.volume } : {}) });
  }
  let refused: string | null = null;
  const outcome = await computeScore(async (_data, t) => {
    try {
      return await deps.compute({ tracks }, t);
    } catch (e) {
      const line = combineRefusal((e as Error)?.message ?? String(e));
      if (line !== null) { refused = line; return null; }
      throw e;
    }
  }, tracks[0].bars[0], title);
  if (refused !== null) return { kind: 'refusal', message: /^combine_tracks: every track is muted/.test(refused) ? ALL_MUTED : `Arrangement: ${refused}` };
  // 2026-10-30-1000: the phrases this Score was made from ride along (as a morph's two bars do), so a row of the Score can name the bar note its phrase got that bar from without reading the vault again
  return outcome.kind === 'score' ? { kind: 'score', payload: { ...outcome.payload, [FORGE_PHRASES_KEY]: phrasesRead } } : outcome;
}

/** 2026-10-30-1050 (M15b): the deps a phrase is drawn with, plus the way to draw an ARRANGEMENT as the source of a transform (the engine's arrangement step is `computeArrangement`). The phrases an arrangement plays are drawn with the same deps
 *  one level down, carrying the chain of sources already being drawn, so an arrangement whose phrase is a transform of that arrangement is a refusal naming the loop. */
export function phraseDepsWithArrangements(base: Pick<PhraseScoreDeps, 'readNote' | 'compute'>, computeArrangement: ArrangementDeps['compute'], chain: readonly string[] = []): PhraseScoreDeps {
  const deps: PhraseScoreDeps = {
    readNote: base.readNote,
    compute: base.compute,
    chain,
    arrangementBars: (note, name, drawing) => produceArrangement({ phrases: phraseDepsWithArrangements(base, computeArrangement, drawing), compute: computeArrangement }, note, name),
  };
  return deps;
}

async function readKit(deps: PhraseScoreDeps, name: string): Promise<KitParams | string> {
  let text: string;
  try { text = await deps.readNote(kitPath(name)); } catch (e) { return `the kit ${name} (${kitPath(name)}) was not found or could not be read (${(e as Error)?.message ?? e}).`; }
  const kit = readKitNote(text);
  return kit.ok === false ? `the kit ${name} is not usable: ${kit.message}` : kit.value;
}

async function drawPhraseBars(deps: PhraseScoreDeps, phrase: string): Promise<{ bars: RhythmData[]; params: PhraseParams } | string> {
  let text: string;
  try { text = await deps.readNote(phraseNotePath(phrase)); } catch (e) { return `the phrase ${phrase} (${phraseNotePath(phrase)}) was not found or could not be read (${(e as Error)?.message ?? e}).`; }
  const parsed = readPhraseNote(text);
  if (parsed.ok === false) return `the phrase ${phrase} is not usable: ${parsed.message}`;
  const made = await producePhrase(deps, parsed.value, phrase);
  if (made.kind !== 'score') return `the phrase ${phrase} could not be drawn: ${made.message}`;
  const bars = barsOfPayload(made.payload);
  return bars === null ? `the phrase ${phrase} gave no bars to play.` : { bars, params: parsed.value };
}
