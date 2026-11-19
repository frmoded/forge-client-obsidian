// 2026-11-19-0993 (THE LIST MODEL, stage 3: BARS; 11d.1) - the NOTE side of a bar's list. The list is the front matter key `lines:` (a YAML list of canonical sentences, each a double-quoted string: a JSON string is a YAML string, so a quote, a backslash or a
// colon cannot break the front matter); the BODY stays exactly one json fence (the Beat Box needs it); `description:` stays what it is. The fence is the CACHE the Beat Box and the Score read: it is written from the replay of the list, in one go, with the
// bar's derived provenance sections kept current (the same `keepBarProvenance` the Beat Box save uses). Pure strings in, strings out: no `obsidian`, no vault.
//
// A bar with no `lines:` key is an UNLISTED bar (every bar made before this stage): it is never given one by opening it; its FIRST write synthesizes its head (baselineList) and appends. `lines: []` is an empty list: a new bar ("New bar" writes it).
import { extractJsonBlock, formatRhythmJson, readRhythmNote, rhythmDataEqual, type RhythmData } from './rhythm-edit-core.ts';
import { keepBarProvenance } from './bar-provenance-core.ts';
import { baselineList, replayBar, type BarReplay } from './bar-list-core.ts';
import { stopNotice } from './sentence-list-core.ts';

interface Front { eol: string; body: string[]; bodyText: string }
function front(text: string): Front | null {
  const m = /^---(\r?\n)([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  return m === null ? null : { eol: m[1], body: m[2].split(/\r?\n/), bodyText: m[2] };
}
const rebuild = (text: string, f: Front, body: string[]): string => `---${f.eol}${body.join(f.eol)}${text.slice(`---${f.eol}${f.bodyText}`.length)}`;

/** Where the `lines:` key and its items are in the front matter body: [first, last] line indexes, or null. */
function span(f: Front): { first: number; last: number; value: string } | null {
  const first = f.body.findIndex((l) => /^lines:/.test(l));
  if (first < 0) return null;
  const value = f.body[first].slice('lines:'.length).trim();
  let last = first;
  if (value === '' || value === '|' || value === '>') while (last + 1 < f.body.length && /^\s*-(\s|$)/.test(f.body[last + 1])) last++;
  return { first, last, value };
}

function decodeItem(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('"')) { try { const v = JSON.parse(t) as unknown; if (typeof v === 'string') return v; } catch { /* a hand-written item that is not JSON: read it plain below */ } return t.replace(/^"|"$/g, ''); }
  if (t.startsWith("'")) return t.replace(/^'|'$/g, '').replace(/''/g, "'");
  return t;
}

/** The list a bar carries: `hasLines` false = an unlisted bar (no key); `lines: []` is an empty list. Null when the text has no front matter. Never throws. */
export function readBarLines(text: string): { hasLines: boolean; lines: string[] } | null {
  const f = front(String(text ?? ''));
  if (f === null) return null;
  const s = span(f);
  if (s === null) return { hasLines: false, lines: [] };
  if (s.value.startsWith('[')) {
    try { const v = JSON.parse(s.value) as unknown; return { hasLines: true, lines: Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [] }; } catch { return { hasLines: true, lines: [] }; }
  }
  const lines: string[] = [];
  for (let i = s.first + 1; i <= s.last; i++) lines.push(decodeItem(f.body[i].replace(/^\s*-\s?/, '')));
  return { hasLines: true, lines };
}
export const hasBarLines = (text: string): boolean => readBarLines(text)?.hasLines === true;

/** The raw text of the `lines:` key and its items (joined with "\n"), so a copy carries them byte for byte; null when the note has none. */
export function barLinesBlock(text: string): string | null {
  const f = front(String(text ?? ''));
  const s = f === null ? null : span(f);
  return f === null || s === null ? null : f.body.slice(s.first, s.last + 1).join('\n');
}

/** The note with `lines:` set to `list`: in place when the key is there, else just before the closing `---`; every other line, and everything from the closing `---` on, is the note's own bytes. Text with no front matter comes back unchanged. */
export function withBarLines(text: string, list: readonly string[]): string {
  const f = front(text);
  if (f === null) return text;
  const block = list.length === 0 ? ['lines: []'] : ['lines:', ...list.map((l) => `  - ${JSON.stringify(l)}`)];
  const s = span(f);
  const body = s === null ? [...f.body, ...block] : [...f.body.slice(0, s.first), ...block, ...f.body.slice(s.last + 1)];
  return rebuild(text, f, body);
}

/** The note with its `lines:` key and items taken away (the bar is unlisted again: its fence is all it has). Everything else is the note's own bytes. */
export function withoutBarLines(text: string): string {
  const f = front(text);
  const s = f === null ? null : span(f);
  return f === null || s === null ? text : rebuild(text, f, [...f.body.slice(0, s.first), ...f.body.slice(s.last + 1)]);
}

export type BarWrite = { ok: true; text: string; data: RhythmData; replay: BarReplay } | { ok: false; message: string };

/** The whole bar made again from its list in one go: the json fence = the replay (`formatRhythmJson`, the Beat Box's own writer), `lines:` = the list (every line kept, readable or not), the provenance sections current. A list of which NO line can be read writes nothing
 *  (a typo in line 1 never empties the Score); a note that is not an editable rhythm note (not data, not json, `read_only: true`, no single fence) is refused with the Beat Box's own words. */
export function writeBarNote(note: string, list: readonly string[]): BarWrite {
  const read = readRhythmNote(note);
  if (read.ok === false) return { ok: false, message: read.message };
  const block = extractJsonBlock(note);
  if (block.ok === false) return { ok: false, message: block.message };
  const rp = replayBar(list);
  if (list.length > 0 && rp.applied === 0) return { ok: false, message: `No line of the list can be read, so nothing was written; the note keeps what it shows.${rp.stop === null ? '' : ` ${stopNotice(rp.stop, 0)}`}` };
  const json = formatRhythmJson(rp.data).replace(/\n/g, block.eol);
  const written = note.slice(0, block.contentStart) + json + note.slice(block.contentEnd);
  return { ok: true, text: keepBarProvenance(withBarLines(written, list), rp.data), data: rp.data, replay: rp };
}

export interface BarInspection {
  hasLines: boolean;
  /** The list: the lines of the note, or (an unlisted bar) the head its first write would give it. */
  list: string[];
  replay: BarReplay;
  /** The bar the json fence says (what the Beat Box and the Score show); null when the note is not a readable rhythm note. */
  fence: RhythmData | null;
  /** The replay of the list says what the fence says (an unlisted bar is its fence: always). A hand edit of the list, or of the fence, makes it false. */
  inSync: boolean;
}

/** What a bar's list and its fence say, and whether they agree. Reads only. */
export function inspectBarNote(text: string): BarInspection {
  const l = readBarLines(text);
  const read = readRhythmNote(text);
  const fence = read.ok === true ? read.value.data : null;
  const list = l?.hasLines === true ? l.lines : (fence === null ? [] : baselineList(fence) ?? []);
  const replay = replayBar(list);
  const inSync = fence !== null && (l?.hasLines !== true || rhythmDataEqual(replay.data, fence));
  return { hasLines: l?.hasLines === true, list, replay, fence, inSync };
}
