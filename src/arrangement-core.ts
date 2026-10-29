// score_first M10 slice 1 (drain 2026-10-29-0820, design 4.10) - an ARRANGEMENT is a note: `arrangements/arr_NNN.md`, Forge shape (# Description, # Recipe, # Python) above ONE json fence
// `{"kind": "arrangement", "tracks": [{"kit": "rock", "phrase": "phrase_003"}, ...]}`: phrases played together, each on a kit. Pure; no `obsidian` import.
//   * Description: names the tracks and says what a shorter phrase does ("rests until the longest one ends");
//   * Recipe: "Play [[phrase_003]] on the [[rock]] kit." per track, then "Together." - the wikilinks are real (backlinks, the structure strip and the notes pane work), and `links:` in the frontmatter lists them once each;
//   * Python: `def compute(context):` reading each kit and phrase by calling its name (the way a Forge note reads a data note) and returning combine_tracks(...), the BAR LIST (the contract of a phrase's compute since 2026-10-29-0810).
// The Score is drawn from the json by the code that draws every phrase (produceArrangement -> the engine glue's `arrangement` branch -> rhythm_bars_to_stream); the Python text is never run to draw it (P4).
import { barsOfPayload, producePhrase, readPhraseNote, type PhraseScoreDeps } from './phrase-core.ts';
import { DERIVED_NOTE, callNote, extractPhraseJsonBlock, renderDerivedNote, pyStr } from './phrase-notes-core.ts';
import type { RhythmData } from './rhythm-edit-core.ts';
import { computeScore, type ScoreOutcome } from './rhythm-score-core.ts';
import { KIT_NAME_PATTERN, kitPath, readKitNote, type KitParams } from './kit-core.ts';

export const ARRANGEMENT_FOLDER = 'arrangements';
export const ARRANGEMENT_VIEW_TYPE = 'forge-arrangement-view';
export interface ArrangementTrack { kit: string; phrase: string }
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
    for (const key of Object.keys(t)) if (!['kit', 'phrase'].includes(key)) return { ok: false, message: `tracks[${i}]: unexpected field "${key}" (a track holds only kit and phrase).` };
    if (typeof t.kit !== 'string' || !NAME.test(t.kit)) return { ok: false, message: `tracks[${i}]: the kit ${JSON.stringify(t.kit)} is not a kit name.` };
    if (typeof t.phrase !== 'string' || !NAME.test(t.phrase)) return { ok: false, message: `tracks[${i}]: the phrase ${JSON.stringify(t.phrase)} is not a phrase name.` };
    if (kits.has(t.kit)) return { ok: false, message: `The kit "${t.kit}" plays two tracks; a kit plays one phrase.` };
    kits.add(t.kit);
    tracks.push({ kit: t.kit, phrase: t.phrase });
  }
  return { ok: true, value: { kind: 'arrangement', tracks } };
}

export function formatArrangementJson(p: ArrangementParams): string {
  return ['{', `  "kind": "arrangement",`, '  "tracks": [', ...p.tracks.map((t, i) => `    {"kit": ${JSON.stringify(t.kit)}, "phrase": ${JSON.stringify(t.phrase)}}${i < p.tracks.length - 1 ? ',' : ''}`), '  ]', '}'].join('\n');
}

const link = (name: string): string => `[[${name}]]`;
/** Every note this arrangement reads, once each, in the order the Recipe names them: each track's phrase, then its kit. */
export const arrangementLinks = (p: ArrangementParams): string[] => [...new Set(p.tracks.flatMap((t) => [t.phrase, t.kit]))];
export function arrangementDescription(name: string, p: ArrangementParams): string {
  const played = p.tracks.map((t) => `${link(t.phrase)} on the ${link(t.kit)} kit`).join(', ');
  return `${name} — ${p.tracks.length === 1 ? 'one track' : `${p.tracks.length} tracks played together`}: ${played}. A phrase that is shorter than the others rests until the longest one ends.`;
}
export const arrangementRecipeSteps = (p: ArrangementParams): string[] => [...p.tracks.map((t) => `Play ${link(t.phrase)} on the ${link(t.kit)} kit.`), 'Together.'];
export function arrangementPython(p: ArrangementParams): string {
  return [
    'def compute(context):',
    '  tracks = []',
    ...p.tracks.map((t) => `  tracks.append({'kit': ${pyStr(t.kit)}, 'channels': ${callNote(t.kit)}['channels'], 'bars': ${callNote(t.phrase)}})`),
    '  bars = combine_tracks(tracks=tracks)',
    '  return bars',
    '  # for a Score of these bars: rhythm_bars_to_stream(bars=bars)',
  ].join('\n');
}
export const arrangementSections = (name: string, p: ArrangementParams): string[] => [DERIVED_NOTE, '', '# Description', '', arrangementDescription(name, p), '', '# Recipe', '', ...arrangementRecipeSteps(p), '', '# Python', '', '```python', ...arrangementPython(p).split('\n'), '```'];

export function newArrangementNote(name: string, p: ArrangementParams): string {
  const fence = ['```json', formatArrangementJson(p), '```', ''].join('\n');
  const stub = ['---', 'type: data', 'content_type: json', '---', '', ''].join('\n');
  return renderDerivedNote(stub + fence, arrangementDescription(name, p), arrangementLinks(p), arrangementSections(name, p), stub.length);
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
  const next = renderDerivedNote(text, arrangementDescription(name, read.value), arrangementLinks(read.value), arrangementSections(name, read.value), block.fenceStart);
  return { ok: true, text: next, changed: next !== text };
}

/** `arr_001`, `arr_002` ...: the first number not taken (zero-padded to three, like phrase_NNN and bar_NNN). */
export function nextArrangementName(taken: (path: string) => boolean): string {
  for (let n = 1; ; n++) { const name = `arr_${String(n).padStart(3, '0')}`; if (!taken(arrangementPath(name))) return name; }
}
export const arrangementCreatedLine = (name: string, p: ArrangementParams): string => `[forge-arrangement] created ${arrangementPath(name)} tracks=${p.tracks.map((t) => `${t.phrase}@${t.kit}`).join(',')}`;

// ---- the Score ----------------------------------------------------------------------------------------------------------------------------------------------------------------

/** What the engine glue gets: each track's kit (its name and channels) and the bars of the phrase played on it. */
export interface ArrangementInput { tracks: Array<{ kit: string; channels: string[]; bars: RhythmData[] }> }

export interface ArrangementDeps {
  /** Reading phrases (and the bars they are made of) and drawing them: exactly what draws a phrase tab. */
  phrases: PhraseScoreDeps;
  /** The engine: combine_tracks over the tracks, then rhythm_bars_to_stream and the tagged MusicXML payload (the `arrangement` branch of the plugin-side phrase glue). */
  compute(data: ArrangementInput, title: string): Promise<unknown>;
}

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
  for (const track of read.value.tracks) {
    const kit = await readKit(deps.phrases, track.kit);
    if (typeof kit === 'string') return { kind: 'refusal', message: `Arrangement: ${kit}` };
    const bars = await drawPhraseBars(deps.phrases, track.phrase);
    if (typeof bars === 'string') return { kind: 'refusal', message: `Arrangement: ${bars}` };
    tracks.push({ kit: kit.name, channels: kit.channels, bars });
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
  if (refused !== null) return { kind: 'refusal', message: `Arrangement: ${refused}` };
  return outcome;
}

async function readKit(deps: PhraseScoreDeps, name: string): Promise<KitParams | string> {
  let text: string;
  try { text = await deps.readNote(kitPath(name)); } catch (e) { return `the kit ${name} (${kitPath(name)}) was not found or could not be read (${(e as Error)?.message ?? e}).`; }
  const kit = readKitNote(text);
  return kit.ok === false ? `the kit ${name} is not usable: ${kit.message}` : kit.value;
}

async function drawPhraseBars(deps: PhraseScoreDeps, phrase: string): Promise<RhythmData[] | string> {
  let text: string;
  try { text = await deps.readNote(phraseNotePath(phrase)); } catch (e) { return `the phrase ${phrase} (${phraseNotePath(phrase)}) was not found or could not be read (${(e as Error)?.message ?? e}).`; }
  const parsed = readPhraseNote(text);
  if (parsed.ok === false) return `the phrase ${phrase} is not usable: ${parsed.message}`;
  const made = await producePhrase(deps, parsed.value, phrase);
  if (made.kind !== 'score') return `the phrase ${phrase} could not be drawn: ${made.message}`;
  const bars = barsOfPayload(made.payload);
  return bars === null ? `the phrase ${phrase} gave no bars to play.` : bars;
}
