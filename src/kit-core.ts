// score_first M10 slice 1 (drain 2026-10-29-0820, design 4.10) - a KIT is a note: `kits/<name>.md`, Forge shape (# Description, # Recipe, # Python) above ONE json fence `{"kind": "kit", "name", "channels": [...]}`. Its channels are the
// ones the engine knows (RHYTHM_CHANNELS, the vocabulary rhythm_data_to_stream draws); a kit says which rows of a bar a track may play. Pure, deterministic, derived from the json (no LLM); no `obsidian` import.
//   * Description: "A rock kit: kick, snare, hi-hat." (the display words of the channels, in the engine's channel order);
//   * Recipe: one English step per channel, linking to nothing (a channel is not a note);
//   * Python: `def compute(context):` returning the kit as a dict, so another note's Python reads a kit by calling its name (`rock()['channels']`), the way a Forge note reads a data note.
// The presets are derived from the vocabulary (a name that is not a channel falls away), never a second list of channels.
import { RHYTHM_CHANNELS } from './rhythm-edit-core.ts';
import { DERIVED_NOTE, extractPhraseJsonBlock, pyStr, renderDerivedNote } from './phrase-notes-core.ts';

export const KIT_FOLDER = 'kits';
export type Channel = (typeof RHYTHM_CHANNELS)[number];
export interface KitParams { kind: 'kit'; name: string; channels: Channel[] }
type Validation<T> = { ok: true; value: T } | { ok: false; message: string };

export const KIT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
export const KIT_NAME_RULE = 'A kit name is 1 to 40 letters, digits, "_" or "-", starting with a letter or digit.';

/** What a channel is called in a sentence. A channel the table does not list reads as its own name with the underscores undone (the engine can grow a channel; the sentence will not break). */
const CHANNEL_WORDS: Readonly<Record<string, string>> = { hihat: 'hi-hat', conga_high: 'high conga', conga_low: 'low conga' };
export const channelWords = (channel: string): string => CHANNEL_WORDS[channel] ?? channel.replace(/_/g, ' ');

/** The channels in the engine's own order, each once. */
export const inEngineOrder = (channels: Iterable<string>): Channel[] => {
  const want = new Set(channels);
  return RHYTHM_CHANNELS.filter((c) => want.has(c));
};

/** The starter kits (names, channels): derived from the vocabulary. `congas` are the two conga channels the engine has. */
const preset = (names: readonly string[]): Channel[] => inEngineOrder(names);
export const KIT_PRESETS: ReadonlyArray<{ name: string; channels: Channel[] }> = [
  { name: 'rock', channels: preset(['kick', 'snare', 'hihat']) },
  { name: 'latin', channels: preset(['conga_high', 'conga_low', 'claves', 'bell']) },
];

export const kitPath = (name: string): string => `${KIT_FOLDER}/${name}.md`;
export const isKitPath = (path: string): boolean => /^kits\/[^/]+\.md$/.test(path) && path !== `${KIT_FOLDER}/README.md`;

export function validateKit(raw: unknown): Validation<KitParams> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, message: 'A kit is an object with a kind, a name and channels.' };
  const o = raw as Record<string, unknown>;
  if (o.kind !== 'kit') return { ok: false, message: `The kind must be "kit", got ${JSON.stringify(o.kind)}.` };
  for (const key of Object.keys(o)) if (!['kind', 'name', 'channels'].includes(key)) return { ok: false, message: `Unexpected field "${key}" (a kit holds only kind, name and channels).` };
  if (typeof o.name !== 'string' || !KIT_NAME_PATTERN.test(o.name)) return { ok: false, message: `The kit name ${JSON.stringify(o.name)} is not usable. ${KIT_NAME_RULE}` };
  if (!Array.isArray(o.channels) || o.channels.length === 0) return { ok: false, message: 'A kit needs at least one channel.' };
  const seen = new Set<string>();
  for (const c of o.channels) {
    if (typeof c !== 'string' || !(RHYTHM_CHANNELS as readonly string[]).includes(c)) return { ok: false, message: `Unknown channel ${JSON.stringify(c)} (the engine knows: ${RHYTHM_CHANNELS.join(', ')}).` };
    if (seen.has(c)) return { ok: false, message: `The channel "${c}" is listed twice.` };
    seen.add(c);
  }
  return { ok: true, value: { kind: 'kit', name: o.name, channels: inEngineOrder(seen) } };
}

export function formatKitJson(p: KitParams): string {
  return ['{', `  "kind": "kit",`, `  "name": ${JSON.stringify(p.name)},`, `  "channels": [${p.channels.map((c) => JSON.stringify(c)).join(', ')}]`, '}'].join('\n');
}

const list = (words: string[]): string => words.join(', ');
export const kitDescription = (p: KitParams): string => `A ${p.name} kit: ${list(p.channels.map(channelWords))}.`;
export const kitRecipeSteps = (p: KitParams): string[] => p.channels.map((c) => `Add the ${channelWords(c)}.`);
export const kitPython = (p: KitParams): string => ['def compute(context):', `  return {'name': ${pyStr(p.name)}, 'channels': [${p.channels.map(pyStr).join(', ')}]}`].join('\n');

/** The derived body above the fence, one array element per line (the same three Forge layers a phrase note has). */
export const kitSections = (p: KitParams): string[] => [DERIVED_NOTE, '', '# Description', '', kitDescription(p), '', '# Recipe', '', ...kitRecipeSteps(p), '', '# Python', '', '```python', ...kitPython(p).split('\n'), '```'];

/** The starter text of a new kit note: frontmatter, derived sections, then the fence last. */
export function newKitNote(p: KitParams): string {
  const fence = ['```json', formatKitJson(p), '```', ''].join('\n');
  const stub = ['---', 'type: data', 'content_type: json', '---', '', ''].join('\n');
  return renderDerivedNote(stub + fence, kitDescription(p), [], kitSections(p), stub.length);
}

export function readKitNote(text: string): Validation<KitParams> {
  const block = extractPhraseJsonBlock(text);          // refuses a note with no frontmatter, no json block, an unclosed or non-last one
  if (block.ok === false) return { ok: false, message: block.message };
  let parsed: unknown;
  try { parsed = JSON.parse(text.slice(block.contentStart, block.contentEnd)); } catch (e) { return { ok: false, message: `The json block is not valid JSON: ${(e as Error).message}` }; }
  return validateKit(parsed);
}

/** "Refresh note links" on one kit note: its derived parts regenerated from its json (the fence and every frontmatter line of the person's own untouched). Idempotent. */
export function refreshKitNoteText(text: string): { ok: true; text: string; changed: boolean } | { ok: false; message: string } {
  const read = readKitNote(text);
  if (read.ok === false) return { ok: false, message: read.message };
  const block = extractPhraseJsonBlock(text);
  if (block.ok === false) return { ok: false, message: block.message };
  const next = renderDerivedNote(text, kitDescription(read.value), [], kitSections(read.value), block.fenceStart);
  return { ok: true, text: next, changed: next !== text };
}

/** What "New kit" is told by the person: a name and the channels, from a preset or picked. A refusal is one sentence. */
export function kitFromChoice(name: string, channels: readonly string[]): Validation<KitParams> {
  return validateKit({ kind: 'kit', name: name.trim(), channels: [...channels] });
}

/** `rock`, `rock_2`, `rock_3` ... the first name not taken (a name is a file name in kits/). */
export function freeKitName(wanted: string, taken: (path: string) => boolean): string {
  if (!taken(kitPath(wanted))) return wanted;
  for (let n = 2; ; n++) if (!taken(kitPath(`${wanted}_${n}`))) return `${wanted}_${n}`;
}

/** The evidence line printed when a kit note is made (card: evidence lines ship with the feature). */
export const kitCreatedLine = (p: KitParams): string => `[forge-kit] created ${kitPath(p.name)} channels=${p.channels.join(',')}`;
