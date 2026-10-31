// score_first M7b (a) / design 4.12 phase B (drain 2026-10-26-1260, DEMO profile) — phrase and bar notes that READ as notes. Pure, deterministic, derived from the json (no LLM; the json stays the only parsed data):
//   * a `links:` list in the FRONTMATTER ("[[bar_005]]" strings) and a `description` with [[wikilinks]]: Obsidian indexes links in properties, so backlinks and the graph know which bars a phrase reads;
//   * for a PHRASE note, the SOURCE CHAIN above the json fence in the Forge shape (# Description = the grammar's sentence, # Recipe as English steps, # Python as a fenced block, # Cache; since 2026-10-30-1050 the Description is the source and the json a cache of it), regenerated on every plugin write and by "Refresh note links": a hand edit of the Recipe or the Python is overwritten, a hand edit of the Description is refused;
//   * for a BAR note, FRONTMATTER only (a description that names the hits and the tempo, a fork's `forked_from` as a wikilink); the body stays exactly one json fence (the Beat Box requires it).
// Runtime imports from phrase-core.ts are NOT allowed here (phrase-core imports this file): types only.
import type { PhraseParams } from './phrase-core.ts';
import { describe } from './phrase-describe-core.ts';
import { facetHashSync } from './facet-sync-hash-core.ts';
import { transformOpWords } from './phrase-words-core.ts';
import { parseFrontmatter, readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';
import { extractDescription, extractPythonSection, extractRecipeSection } from './v2-note-core.ts';

export const DERIVED_NOTE = '<!-- derived from the json below; edit the controls, not this text -->';

const link = (name: string): string => `[[${name}]]`;
const baseName = (noteId: string): string => noteId.split('/').pop() ?? noteId;
const words = (s: string): string => s.replace(/_/g, ' ');
const tempoWords = (pct: number): string => (pct < 0 ? `slowing ${-pct} %` : pct > 0 ? `speeding up ${pct} %` : 'no tempo change');
const q = (s: string): string => JSON.stringify(s);

/** The fork notes of a phrase in bar-number order (`overrides` values are note ids like `bars/bar_009`). */
function forks(p: PhraseParams): Array<{ bar: number; note: string }> {
  const o = p.kind === 'extend' || p.kind === 'morph' || p.kind === 'transform' ? p.overrides : undefined;
  return Object.keys(o ?? {}).sort((x, y) => Number(x) - Number(y)).map((k) => ({ bar: Number(k), note: baseName(o![k]) }));
}

/** Every note this phrase reads, once each, in the order the Recipe names them, then the fork notes. */
export function phraseLinks(p: PhraseParams): string[] {
  const read = p.kind === 'extend' ? [p.source] : p.kind === 'transform' ? [baseName(p.source)] : [p.a, p.b];
  return [...new Set([...read, ...forks(p).map((f) => f.note)])];
}

export function phraseDescription(name: string, p: PhraseParams): string {
  let sentence: string;
  if (p.kind === 'extend') sentence = `${name} — ${link(p.source)} extended to ${p.bars} bars: ${words(p.style)}, ${tempoWords(p.tempo_change_pct)}.`;
  else if (p.kind === 'transform') sentence = `${name} — a transform of ${link(baseName(p.source))}: ${p.ops.map(transformOpWords).join('; ')}.`;
  else if (p.kind === 'morph') sentence = `${name} — a morph from ${link(p.a)} to ${link(p.b)} in ${p.bars} bars, ${p.order} order${p.order === 'seeded' ? ` (seed ${p.seed})` : ''}.`;
  else if (p.mode === 'path') sentence = `${name} — a mix of ${link(p.a)} and ${link(p.b)} as a path of single-hit changes: weight 1 is all of ${p.a}, 0 is all of ${p.b}, ${p.order ?? 'musical'} order.`;
  else sentence = `${name} — a mix of ${link(p.a)} and ${link(p.b)} by vote: ${Math.round(p.weight * 100)} % ${p.a} / ${Math.round((1 - p.weight) * 100)} % ${p.b}, threshold ${p.threshold.toFixed(2)}, ghost notes ${p.ghost ? 'on' : 'off'}.`;
  const f = forks(p);
  return f.length > 0 ? `${sentence} Edited by hand: ${f.map((x) => `bar ${x.bar} is ${link(x.note)}`).join(', ')}.` : sentence;
}

const orderWords = (order: string, seed: number | undefined): string => (order === 'seeded' ? `seeded order (seed ${seed ?? 0})` : `${order} order`);

/** The Recipe: what the json asks for as English steps, one per line, the bars as wikilinks (2026-10-27-1020; the same layer a Forge note's # Recipe is). Derived, never read back. A fork override is a step of its own. */
export function phraseRecipeSteps(p: PhraseParams): string[] {
  const steps: string[] = [];
  if (p.kind === 'extend') {
    const tempo = p.tempo_change_pct < 0 ? `, ${-p.tempo_change_pct} % slower` : p.tempo_change_pct > 0 ? `, ${p.tempo_change_pct} % faster` : '';
    const how = p.style === 'building' ? `Build it up over ${p.bars} bars` : `Repeat it for ${p.bars} bars with ${p.style === 'ghost_notes' ? 'ghost notes' : 'fills'}`;
    steps.push(`Take ${link(p.source)}.`, `${how}${tempo}.`);
  } else if (p.kind === 'transform') {
    steps.push(`Take ${link(baseName(p.source))}.`, ...p.ops.map((o) => { const w = transformOpWords(o); return `${w[0].toUpperCase()}${w.slice(1)}.`; }));
  } else if (p.kind === 'morph') {
    steps.push(`Take ${link(p.a)} and ${link(p.b)}.`,
      p.bars === 1 ? `Morph from the first to the second and keep the bar at position ${p.position ?? 0}, in ${orderWords(p.order, p.seed)}.` : `Morph from the first to the second over ${p.bars} bars, in ${orderWords(p.order, p.seed)}.`);
  } else if (p.mode === 'path') {
    steps.push(`Take ${link(p.a)} and ${link(p.b)}.`, `Mix them as a path of single-hit changes from the first to the second, in ${orderWords(p.order ?? 'musical', p.seed)}.`,
      `Keep the state at weight ${p.weight} (1 is all of ${link(p.a)}, 0 is all of ${link(p.b)}).`);
  } else {
    steps.push(`Take ${link(p.a)} and ${link(p.b)}.`,
      `Mix them by vote: ${Math.round(p.weight * 100)} % ${link(p.a)} and ${Math.round((1 - p.weight) * 100)} % ${link(p.b)}, threshold ${p.threshold.toFixed(2)}, ghost notes ${p.ghost ? 'on' : 'off'}.`);
  }
  for (const f of forks(p)) steps.push(`Bar ${f.bar} is replaced by ${link(f.note)}.`);
  return steps;
}

/** The last line of every block: how to get a Score from the bars it returns, as a COMMENT (2026-10-29-0810; the block returns bars, it never calls the stream helper). */
const streamHint = (bars: string): string => `  # for a Score of these bars: rhythm_bars_to_stream(bars=${bars})`;
export const pyStr = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
/** A bar read the way a Forge note reads a data note: call it by its name (music-theory/rhythm_data/rhythm_extended_fills.md: `base = rhythm_pattern_straight_rock()`). A name that is not a Python identifier goes through globals(). */
export const callNote = (name: string): string => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? `${name}()` : `globals()[${pyStr(name)}]()`);

/** The Python facet: `def compute(context):` calling the engine functions of forge/music/lib.py with the json's own arguments (extend_rhythm, mix_rhythm, morph_rhythm, morph_rhythm_info; signatures grep-verified
 *  2026-10-27-1020). A vote mix is mix_rhythm; a PATH mix is one bar of the morph path, at the stop pathStopOf gives (the weight in millionths, integer arithmetic, the rule phrase-core.ts and the engine glue share). Forks replace their bar
 *  by index. Since 2026-10-29-0810 `compute` RETURNS THE BAR LIST (the shape rhythm_bars_to_stream takes), so a phrase called by name from another phrase's Python yields bars and a transform's Python can really apply its ops to its source;
 *  the way to a Score is the last line, a comment (never a call). Text only: the plugin draws the Score from the json through its own engine glue, never by running this. */
export function phrasePython(p: PhraseParams): string {
  const out: string[] = ['def compute(context):'];
  if (p.kind === 'extend') {
    out.push(`  base = ${callNote(p.source)}`, `  bars = extend_rhythm(data=base, bars=${p.bars}, style=${pyStr(p.style)}, tempo_change_pct=${p.tempo_change_pct})`);
  } else if (p.kind === 'transform') {
    out.push(`  bars = ${callNote(baseName(p.source))}`);
    for (const o of p.ops) {
      const row = o.row !== undefined ? `, row=${pyStr(o.row)}` : '';
      out.push(o.op === 'double_up'
        ? `  bars = double_up_bars(bars=bars, first=${o.first}, last=${o.last}${row}, grid=${o.grid})`
        : `  bars = thin_out_bars(bars=bars, first=${o.first}, last=${o.last}${row}, amount=${o.amount}${o.keep === 'seeded' ? `, keep='seeded', seed=${o.seed ?? 0}` : ''})`);
    }
  } else if (p.kind === 'morph') {
    out.push(`  a = ${callNote(p.a)}`, `  b = ${callNote(p.b)}`);
    out.push(p.bars === 1
      ? `  bars = [morph_rhythm(a=a, b=b, bars=1, order=${pyStr(p.order)}, seed=${p.seed}, position=${p.position ?? 0})]`
      : `  bars = morph_rhythm(a=a, b=b, bars=${p.bars}, order=${pyStr(p.order)}, seed=${p.seed})`);
  } else if (p.mode === 'path') {
    const order = pyStr(p.order ?? 'musical'), seed = p.seed ?? 0;
    const millionths = Math.round(Math.min(1, Math.max(0, p.weight)) * 1e6);
    out.push(`  a = ${callNote(p.a)}`, `  b = ${callNote(p.b)}`, `  changes = morph_rhythm_info(a=a, b=b, order=${order}, seed=${seed})['d']`,
      `  stop = min(changes, max(0, ((1000000 - ${millionths}) * changes + 500000) // 1000000))`,
      `  bar = morph_rhythm(a=a, b=b, bars=1, order=${order}, seed=${seed}, position=stop)`);
    return [...out, '  return [bar]', streamHint('[bar]')].join('\n');
  } else {
    out.push(`  a = ${callNote(p.a)}`, `  b = ${callNote(p.b)}`, `  mixed = mix_rhythm(a=a, b=b, weight=${p.weight}, threshold=${p.threshold}, ghost=${p.ghost ? 'True' : 'False'})`);
    return [...out, '  return [mixed]', streamHint('[mixed]')].join('\n');
  }
  for (const f of forks(p)) out.push(`  bars[${f.bar - 1}] = ${callNote(f.note)}`);
  out.push('  return bars', streamHint('bars'));
  return out.join('\n');
}

// ---- the json fence of a phrase note -------------------------------------------------------------------------------------------------------------------------------------------------

export interface PhraseJsonBlock { contentStart: number; contentEnd: number; eol: string; fenceStart: number }

/**
 * The json block of a PHRASE note: the first ```json fence after the frontmatter, with the derived text (anything that is not a fence) above it and NOTHING after its closing fence. A bar's body stays exactly one fence
 * (extractJsonBlock); a phrase's derived text sits above it. Exactly one fence either way.
 */
export function extractPhraseJsonBlock(text: string): ({ ok: true } & PhraseJsonBlock) | { ok: false; message: string } {
  const fm = parseFrontmatter(text);
  if (!fm) return { ok: false, message: 'The note has no frontmatter, so it is not a data note.' };
  const body = text.slice(fm.bodyStart);
  const open = /^```json[ \t]*(\r?\n)/m.exec(body);
  if (!open) return { ok: false, message: 'The note body must end with one fenced ```json block (no json block found).' };
  const fenceStart = fm.bodyStart + open.index;
  const contentStart = fenceStart + open[0].length;
  const close = /\r?\n```[ \t]*(?=\r?\n|$)/.exec(text.slice(contentStart));
  if (!close) return { ok: false, message: 'The json block is not closed.' };
  const contentEnd = contentStart + close.index;
  const rest = text.slice(contentStart + close.index + close[0].length);
  if (rest.trim() !== '') return { ok: false, message: 'The note has text after the json block; it must contain exactly one fenced json block, last.' };
  return { ok: true, contentStart, contentEnd, eol: open[1], fenceStart };
}

// ---- frontmatter assembly --------------------------------------------------------------------------------------------------------------------------------------------------------------

export interface Front { eol: string; lines: string[] }

export function splitFront(text: string): Front | null {
  const m = /^---(\r?\n)([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  return m ? { eol: m[1], lines: m[2].split(/\r?\n/) } : null;
}

/** The frontmatter lines with `description` and the `links:` block replaced (description where it was, links straight after it), every other line kept as it is. */
export function withDerivedFront(lines: string[], description: string, links: string[]): string[] {
  const out: string[] = [];
  let placed = false;
  const put = () => { out.push(`description: ${q(description)}`); if (links.length > 0) { out.push('links:', ...links.map((l) => `  - ${q(link(l))}`)); } placed = true; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^description:/.test(line)) { if (!placed) put(); continue; }
    if (/^links:/.test(line)) { while (i + 1 < lines.length && /^\s*-/.test(lines[i + 1])) i++; continue; }
    out.push(line);
    if (!placed && /^content_type:/.test(line) && !lines.some((l) => /^description:/.test(l))) put();
  }
  if (!placed) put();
  return out;
}

/** A data note with its derived parts regenerated: the frontmatter keeps every line it has except `description` and `links` (set from the arguments), the derived sections replace everything between the frontmatter and the json fence, and `text.slice(fenceStart)`
 *  (the opening fence line to the end of the note) is kept byte for byte. The ONE renderer of a phrase, a kit and an arrangement note (2026-10-29-0820). */
export function renderDerivedNote(text: string, description: string, links: string[], sections: string[], fenceStart: number): string {
  const front = splitFront(text);
  if (!front) return text;
  const eol = front.eol;
  const lines = withDerivedFront(front.lines, description, links);
  return `---${eol}${lines.join(eol)}${eol}---${eol}${eol}${sections.join(eol)}${eol}${eol}${text.slice(fenceStart)}`;
}

// ---- the SOURCE CHAIN of a phrase or an arrangement note (2026-10-30-1050, M15b) --------------------------------------------------------------------------------------------------------------------------------------
// The Description is the note's SOURCE: the grammar sentence(s) of phrase-describe-core.ts. The Recipe and the Python derive from it (deterministically, no LLM, as they did), the json fence below is a CACHE of what the
// sentence says (every reader still parses it, none changed), and the note carries the Forge hash fields so the stale-facet plugin and the status bar judge it as they judge any Forge note. ONE renderer writes all of it
// in one go, so no reader ever sees half a note; the hashes are taken from the FINISHED text by the same extractors the plugin reads a Forge note with (never from the strings that went in).

/** The first line of the body: what the note is (the Description is the source; the rest is derived from it). */
export const SOURCE_CHAIN_NOTE = '<!-- the Description below is the source of this note: the controls write it, and the Recipe, the Python and the json cache are derived from it -->';
/** The line above the json fence: the json is a cache of what the grammar understood in the Description, never the place to edit. */
export const CACHE_NOTE = '<!-- derived from the Description above; edit the Description, not this -->';
/** The one sentence a control path answers with when the Description was changed by hand since the note was written (the M15c button is named here so the sentence need not change then). */
export const DESCRIPTION_EDITED_BY_HAND = 'the Description was edited by hand; press Update from Description first or revert it';
/** That sentence as a refusal: `Not saved: the Description was ...` for the phrase strip's write (every refusal there starts so), `The Description was ...` elsewhere (the arrangement notice, the refresh command: they add their own lead). */
export const handEditRefusal = (notSavedLead: boolean): string => (notSavedLead ? `Not saved: ${DESCRIPTION_EDITED_BY_HAND}.` : `The ${DESCRIPTION_EDITED_BY_HAND.slice('the '.length)}.`);

/** The frontmatter fields the source chain owns, in the order they are written. */
export const SOURCE_CHAIN_KEYS = ['source_facet', 'description_hash', 'recipe_hash', 'python_hash', 'recipe_derived_from_description_hash', 'python_derived_from_recipe_hash'] as const;

export interface SourceChainParts {
  /** The frontmatter `description` property (words with wikilinks, for the graph): not the source. */
  description: string;
  links: string[];
  /** The `# Description` body: the grammar's canonical text. */
  sentence: string;
  recipe: string[];
  python: string;
}

/** The sections between the frontmatter and the json fence: the comment, then Description, Recipe, Python and the Cache heading with its comment (the heading ends the Python section, so the Python hash covers the Python only). */
export function sourceChainSections(parts: Pick<SourceChainParts, 'sentence' | 'recipe' | 'python'>): string[] {
  return [SOURCE_CHAIN_NOTE, '', '# Description', '', parts.sentence, '', '# Recipe', '', ...parts.recipe, '', '# Python', '', '```python', ...parts.python.split('\n'), '```', '', '# Cache', '', CACHE_NOTE];
}

/** The six frontmatter stamps of a finished note text: the source is the Description; each hash is the one `computeFacetHash` gives for what the plugin's own extractors read from that text. */
export function sourceChainStamps(finished: string): Record<(typeof SOURCE_CHAIN_KEYS)[number], string> {
  const description = facetHashSync(extractDescription(finished));
  const recipe = facetHashSync(extractRecipeSection(finished) ?? '');
  const python = facetHashSync(extractPythonSection(finished) ?? '');
  return { source_facet: 'description', description_hash: description, recipe_hash: recipe, python_hash: python, recipe_derived_from_description_hash: description, python_derived_from_recipe_hash: recipe };
}

/** The frontmatter lines with the stamps in: a line that is already one of ours is replaced where it stands (a second run changes nothing), the missing ones come last, every other line is the person's and is kept. */
export function withSourceChainStamps(lines: string[], stamps: Record<(typeof SOURCE_CHAIN_KEYS)[number], string>): string[] {
  const placed = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = /^([A-Za-z0-9_-]+):/.exec(line)?.[1];
    if (key !== undefined && (SOURCE_CHAIN_KEYS as readonly string[]).includes(key)) {
      if (placed.has(key)) continue;
      placed.add(key);
      out.push(`${key}: ${stamps[key as (typeof SOURCE_CHAIN_KEYS)[number]]}`);
    } else out.push(line);
  }
  for (const key of SOURCE_CHAIN_KEYS) if (!placed.has(key)) out.push(`${key}: ${stamps[key]}`);
  return out;
}

/** A data note with its source chain written: the frontmatter keeps every line it has except `description`, `links` and ours (set from the arguments), the sections replace everything between the frontmatter and the json fence,
 *  and `text.slice(fenceStart)` (the opening fence line to the end) is kept byte for byte. The ONE renderer of a phrase and an arrangement note. */
export function renderSourceChainNote(text: string, parts: SourceChainParts, fenceStart: number): string {
  const front = splitFront(text);
  if (!front) return text;
  const eol = front.eol;
  const lines = withDerivedFront(front.lines, parts.description, parts.links);
  const assemble = (l: string[]): string => `---${eol}${l.join(eol)}${eol}---${eol}${eol}${sourceChainSections(parts).join(eol)}${eol}${eol}${text.slice(fenceStart)}`;
  return assemble(withSourceChainStamps(lines, sourceChainStamps(assemble(lines))));
}

/** Was the Description of this note changed by hand since the note was written? Only a note that carries `description_hash` can say so: a note written before the source chain has nothing to disagree with, and is rewritten whole. */
export function descriptionEditedByHand(text: string): boolean {
  const stored = parseFrontmatter(text)?.fields.description_hash;
  return typeof stored === 'string' && stored !== '' && stored !== facetHashSync(extractDescription(text));
}

/** The parts of a phrase note: the `# Description` is the grammar's sentence for `p` (`describe`), the frontmatter `description` stays the words with wikilinks for the graph, Recipe and Python derive from `p` as they always did. */
export const phraseParts = (name: string, p: PhraseParams): SourceChainParts => ({ description: phraseDescription(name, p), links: phraseLinks(p), sentence: describe(p), recipe: phraseRecipeSteps(p), python: phrasePython(p) });

/** The whole phrase note with its source chain regenerated from `p`; the text from the fence on is kept byte for byte. */
export function renderPhraseNote(text: string, name: string, p: PhraseParams, fenceStart: number): string {
  return renderSourceChainNote(text, phraseParts(name, p), fenceStart);
}

/** The starter text of a new phrase note: frontmatter, derived sections, then the fence last. */
export function newPhraseNote(name: string, p: PhraseParams, json: string, extraFront: string[] = []): string {
  const fence = ['```json', json, '```', ''].join('\n');
  const stub = ['---', 'type: data', 'content_type: json', ...extraFront, '---', '', ''].join('\n');
  return renderPhraseNote(stub + fence, name, p, stub.length);
}

// ---- bars ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const isHit = (v: unknown): boolean => v !== false && v !== 0 && v !== null && v !== undefined;
const STARTER_DESCRIPTION = (name: string): string => `${name} — a one-bar rhythm for the Beat Box: kick on beats 1 and 3, snare on 2 and 4.`;

/** What a bar note's description says: the hits per channel and the tempo. */
export function barDescription(name: string, data: RhythmData): string {
  const per = Object.entries(data.channels).map(([c, row]) => [c, row.filter(isHit).length] as const).filter(([, n]) => n > 0);
  const total = per.reduce((s, [, n]) => s + n, 0);
  const hits = total === 0 ? `no hits in ${data.steps} steps` : `${total} hit${total === 1 ? '' : 's'} in ${data.steps} steps (${per.map(([c, n]) => `${c} ${n}`).join(', ')})`;
  return `${name} — a one-bar rhythm for the Beat Box: ${hits}, tempo ${data.tempo_bpm}.`;
}

/** Is this description one WE wrote (the New bar starter, or an earlier derived one)? A description a person wrote is never replaced. */
function isGeneratedBarDescription(name: string, desc: string): boolean {
  return desc === STARTER_DESCRIPTION(name) || new RegExp(`^${name} — a one-bar rhythm for the Beat Box: (no hits in \\d+ steps|\\d+ hits? in \\d+ steps \\(.*\\)), tempo \\d+(\\.\\d+)?\\.$`).test(desc);
}

const OLD_FORK_DESCRIPTION = /^(bar_\d+) — forked from phrases\/(phrase_\d+) bar (\d+) to edit by hand\. (The phrase shows this bar instead of the generated one\.)$/;
const OLD_FORKED_FROM = /^forked_from: "phrases\/(phrase_\d+) bar (\d+)"$/;     // a property is indexed as a link only when its WHOLE value is [[x]]: the bar number moves to forked_bar

/** A bar note brought up to date: only its FRONTMATTER changes (a generated description is derived again; a fork's old `forked_from` / description become wikilinks); the json fence and every other byte are kept. */
export function refreshBarNoteText(text: string, name: string): { ok: true; text: string; changed: boolean; kept?: 'hand-written' } | { ok: false; message: string } {
  const read = readRhythmNote(text);
  if (read.ok === false) return { ok: false, message: read.message };
  const front = splitFront(text);
  if (!front) return { ok: false, message: 'The note has no frontmatter, so it is not a data note.' };
  let handWritten = false;
  const lines = front.lines.map((line) => {
    const fork = OLD_FORKED_FROM.exec(line);
    if (fork) return `forked_from: ${q(link(fork[1]))}${front.eol}forked_bar: ${fork[2]}`;
    if (!line.startsWith('description:')) return line;
    let desc: string;
    try { desc = JSON.parse(line.slice('description:'.length).trim()) as string; } catch { return line; }
    const oldFork = OLD_FORK_DESCRIPTION.exec(desc);
    if (oldFork) return `description: ${q(`${oldFork[1]} — forked from ${link(oldFork[2])} bar ${oldFork[3]} to edit by hand. ${oldFork[4]}`)}`;
    if (isGeneratedBarDescription(name, desc)) return `description: ${q(barDescription(name, read.value.data))}`;
    handWritten = true;
    return line;
  });
  const next = `---${front.eol}${lines.join(front.eol)}${text.slice(front.eol.length + 3 + front.lines.join(front.eol).length)}`;
  return { ok: true, text: next, changed: next !== text, ...(handWritten ? { kept: 'hand-written' as const } : {}) };
}

