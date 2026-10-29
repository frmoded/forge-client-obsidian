// score_first M7b (a) / design 4.12 phase B (drain 2026-10-26-1260, DEMO profile) — phrase and bar notes that READ as notes. Pure, deterministic, derived from the json (no LLM; the json stays the only parsed data):
//   * a `links:` list in the FRONTMATTER ("[[bar_005]]" strings) and a `description` with [[wikilinks]]: Obsidian indexes links in properties, so backlinks and the graph know which bars a phrase reads;
//   * for a PHRASE note, derived sections above the json fence in the Forge shape (# Description, # Recipe as English steps, # Python as a fenced block; 2026-10-27-1020), regenerated on every plugin write and by "Refresh note links": a hand edit of them is overwritten;
//   * for a BAR note, FRONTMATTER only (a description that names the hits and the tempo, a fork's `forked_from` as a wikilink); the body stays exactly one json fence (the Beat Box requires it).
// Runtime imports from phrase-core.ts are NOT allowed here (phrase-core imports this file): types only.
import type { PhraseParams } from './phrase-core.ts';
import { transformOpWords } from './phrase-words-core.ts';
import { parseFrontmatter, readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';

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
const pyStr = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
/** A bar read the way a Forge note reads a data note: call it by its name (music-theory/rhythm_data/rhythm_extended_fills.md: `base = rhythm_pattern_straight_rock()`). A name that is not a Python identifier goes through globals(). */
const callNote = (name: string): string => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? `${name}()` : `globals()[${pyStr(name)}]()`);

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

/** The derived body above the fence (no json fence, no trailing blank line): the comment, then the three Forge layers. */
export function derivedSections(name: string, p: PhraseParams): string[] {
  return [DERIVED_NOTE, '', '# Description', '', phraseDescription(name, p), '', '# Recipe', '', ...phraseRecipeSteps(p), '', '# Python', '', '```python', ...phrasePython(p).split('\n'), '```'];   // one array element per line: the caller joins with the note's own line ending (CRLF too)
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

interface Front { eol: string; lines: string[] }

function splitFront(text: string): Front | null {
  const m = /^---(\r?\n)([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  return m ? { eol: m[1], lines: m[2].split(/\r?\n/) } : null;
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

