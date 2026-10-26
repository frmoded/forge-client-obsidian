// score_first M7b (a) / design 4.12 phase B (drain 2026-10-26-1260, DEMO profile) — phrase and bar notes that READ as notes. Pure, deterministic, derived from the json (no LLM; the json stays the only parsed data):
//   * a `links:` list in the FRONTMATTER ("[[bar_005]]" strings) and a `description` with [[wikilinks]]: Obsidian indexes links in properties, so backlinks and the graph know which bars a phrase reads;
//   * for a PHRASE note, derived sections above the json fence (## Description, ## Recipe, ## Bars made), regenerated on every plugin write and by "Refresh note links": a hand edit of them is overwritten;
//   * for a BAR note, FRONTMATTER only (a description that names the hits and the tempo, a fork's `forked_from` as a wikilink); the body stays exactly one json fence (the Beat Box requires it).
// Runtime imports from phrase-core.ts are NOT allowed here (phrase-core imports this file): types only.
import type { PhraseParams } from './phrase-core.ts';
import { parseFrontmatter, readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';

export const DERIVED_NOTE = '<!-- derived from the json below; edit the controls, not this text -->';

const link = (name: string): string => `[[${name}]]`;
const baseName = (noteId: string): string => noteId.split('/').pop() ?? noteId;
const words = (s: string): string => s.replace(/_/g, ' ');
const tempoWords = (pct: number): string => (pct < 0 ? `slowing ${-pct} %` : pct > 0 ? `speeding up ${pct} %` : 'no tempo change');
const q = (s: string): string => JSON.stringify(s);

/** The fork notes of a phrase in bar-number order (`overrides` values are note ids like `bars/bar_009`). */
function forks(p: PhraseParams): Array<{ bar: number; note: string }> {
  const o = p.kind === 'extend' || p.kind === 'morph' ? p.overrides : undefined;
  return Object.keys(o ?? {}).sort((x, y) => Number(x) - Number(y)).map((k) => ({ bar: Number(k), note: baseName(o![k]) }));
}

/** Every note this phrase reads, once each, in the order the Recipe names them, then the fork notes. */
export function phraseLinks(p: PhraseParams): string[] {
  const read = p.kind === 'extend' ? [p.source] : [p.a, p.b];
  return [...new Set([...read, ...forks(p).map((f) => f.note)])];
}

export function phraseDescription(name: string, p: PhraseParams): string {
  let sentence: string;
  if (p.kind === 'extend') sentence = `${name} — ${link(p.source)} extended to ${p.bars} bars: ${words(p.style)}, ${tempoWords(p.tempo_change_pct)}.`;
  else if (p.kind === 'morph') sentence = `${name} — a morph from ${link(p.a)} to ${link(p.b)} in ${p.bars} bars, ${p.order} order${p.order === 'seeded' ? ` (seed ${p.seed})` : ''}.`;
  else if (p.mode === 'path') sentence = `${name} — a mix of ${link(p.a)} and ${link(p.b)} as a path of single-hit changes: weight 1 is all of ${p.a}, 0 is all of ${p.b}, ${p.order ?? 'musical'} order.`;
  else sentence = `${name} — a mix of ${link(p.a)} and ${link(p.b)} by vote: ${Math.round(p.weight * 100)} % ${p.a} / ${Math.round((1 - p.weight) * 100)} % ${p.b}, threshold ${p.threshold.toFixed(2)}, ghost notes ${p.ghost ? 'on' : 'off'}.`;
  const f = forks(p);
  return f.length > 0 ? `${sentence} Edited by hand: ${f.map((x) => `bar ${x.bar} is ${link(x.note)}`).join(', ')}.` : sentence;
}

/** The engine call the json stands for, as plain text with wikilinks (a code span would hide the links from Obsidian). */
export function phraseRecipe(p: PhraseParams): string {
  if (p.kind === 'extend') return `extend_rhythm(${link(p.source)}, bars=${p.bars}, style=${q(p.style)}, tempo_change_pct=${p.tempo_change_pct})`;
  if (p.kind === 'morph') return `morph_rhythm(${link(p.a)}, ${link(p.b)}, bars=${p.bars}, order=${q(p.order)}, seed=${p.seed}${p.position !== undefined ? `, position=${p.position}` : ''})`;
  if (p.mode === 'path') return `mix_rhythm(${link(p.a)}, ${link(p.b)}, weight=${p.weight}, mode="path", order=${q(p.order ?? 'musical')}, seed=${p.seed ?? 0})`;
  return `mix_rhythm(${link(p.a)}, ${link(p.b)}, weight=${p.weight}, threshold=${p.threshold}, ghost=${p.ghost})`;
}

/** The derived body above the fence (no fence, no trailing blank line). */
export function derivedSections(name: string, p: PhraseParams): string[] {
  const out = [DERIVED_NOTE, '', '## Description', '', phraseDescription(name, p), '', '## Recipe', '', phraseRecipe(p)];
  const f = forks(p);
  if (f.length > 0) out.push('', '## Bars made', '', ...f.map((x) => `- bar ${x.bar}: ${link(x.note)}`));
  return out;
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

interface Front { eol: string; lines: string[]; end: number }

function splitFront(text: string): Front | null {
  const m = /^---(\r?\n)([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  return m ? { eol: m[1], lines: m[2].split(/\r?\n/), end: m[0].length } : null;
}

/** The frontmatter lines with `description` and the `links:` block replaced (description where it was, links straight after it), every other line kept as it is. */
function withDerivedFront(lines: string[], description: string, links: string[]): string[] {
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

/** The whole phrase note with its derived parts regenerated from `p`; `fenceText` (the opening fence line to the end of the note) is kept byte for byte. */
export function renderPhraseNote(text: string, name: string, p: PhraseParams, fenceStart: number): string {
  const front = splitFront(text);
  if (!front) return text;
  const eol = front.eol;
  const lines = withDerivedFront(front.lines, phraseDescription(name, p), phraseLinks(p));
  return `---${eol}${lines.join(eol)}${eol}---${eol}${eol}${derivedSections(name, p).join(eol)}${eol}${eol}${text.slice(fenceStart)}`;
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

