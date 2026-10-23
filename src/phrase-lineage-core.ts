// score_first M6 (drain 2026-10-22-1950) — navigation through an extend: for EVERY bar of a phrase's Score, "which note, which parameter, which parent".
//
// How a bar is found: the engine's MusicXML has one <measure> per bar in each part, and Verovio draws ONE measure group per bar from the FIRST part's measure, keeping its `id` as the SVG
// element's id (measured in real Verovio: ids put on the first part's measures came back as the ids of the 8 `g.measure` elements). So this puts a deterministic id on every bar of the first part
// and the generic artifact inspector (artifact-inspector-core.ts) works on bars exactly as it works on notes. Nothing here knows about Obsidian, Verovio or the engine.
//
// The tempo of a bar is READ from the engine's own `<sound tempo>` in that bar, never recomputed here (no second copy of the stepping formula in TypeScript to drift from forge/music/lib.py).
import type { Provenance, ProvenanceMap } from './provenance-core.ts';
import type { LineageEntry } from './artifact-inspector-core.ts';
import type { ExtendPhrase } from './phrase-core.ts';

/** Keeps a phrase's bar ids apart from the ids of notes (`a_…`, M3) should both ever share a document. */
export const PHRASE_BAR_SCOPE = 'ph';
export const PHRASE_BAR_ROLE = 'phrase-bar';

export interface PhraseBarInfo {
  /** The element id on the bar's measure. */
  id: string;
  /** 1-based. */
  index: number;
  /** The tempo the engine wrote into this bar (`<sound tempo>`), or null when the bar carries none. */
  tempo: number | null;
}

export type PhraseAnnotateResult =
  | { ok: true; multiXml: string; kitXml: string | null; bars: PhraseBarInfo[]; kitProblems: string[] }
  | { ok: false; problems: string[] };

export function phraseBarId(scope: string, n: number): string {
  return `${scope}_bar_${n}`;
}
/** A note's lineage id: its path without `.md` (the id the bar inspector uses too: `bars/bar_003`). */
export function phraseNoteId(path: string): string {
  return path.replace(/\.md$/, '');
}
export function phraseSourceNoteId(source: string): string {
  return `bars/${source}`;
}

const PART_RE = /<part\b[^>]*>([\s\S]*?)<\/part>/;
const MEASURE_RE = /<measure\b([^>]*)>([\s\S]*?)<\/measure>/g;

interface Tagged { xml: string; bars: PhraseBarInfo[]; problems: string[] }

/** Tag the measures of the FIRST part of one MusicXML document and read each bar's tempo. */
function tagFirstPart(xml: string, expectedBars: number, scope: string, what: string): Tagged {
  const bad = (problem: string): Tagged => ({ xml, bars: [], problems: [problem] });
  const part = PART_RE.exec(xml);
  if (!part) return bad(`${what} has no part`);
  const bodyStart = part.index + part[0].indexOf('>') + 1;
  const body = part[1];
  const bars: PhraseBarInfo[] = [];
  const edits: Array<{ at: number; text: string }> = [];
  MEASURE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MEASURE_RE.exec(body)) !== null) {
    const index = bars.length + 1;
    if (/\sid\s*=/.test(m[1])) return bad(`${what}: bar ${index} already carries an id (it is left as the engine wrote it, so the bars cannot be tied to the phrase)`);
    const id = phraseBarId(scope, index);
    const tag = m[0].slice(0, m[0].indexOf('>'));
    edits.push({ at: bodyStart + m.index + tag.length, text: ` id="${id}"` });
    const t = /<sound\b[^>]*\btempo="([0-9.]+)"/.exec(m[2]);
    const tempo = t ? Number(t[1]) : null;
    bars.push({ id, index, tempo: tempo !== null && Number.isFinite(tempo) ? tempo : null });
  }
  if (bars.length === 0) return bad(`${what} has no bar`);
  if (bars.length !== expectedBars) return bad(`${what} has ${bars.length} bars but the phrase asks for ${expectedBars}`);
  let out = xml;
  for (const e of edits.sort((a, b) => b.at - a.at)) out = out.slice(0, e.at) + e.text + out.slice(e.at);   // right to left: earlier indices stay valid
  return { xml: out, bars, problems: [] };
}

/** Put an id on every bar of a phrase Score's MusicXML (the multi-staff view, and the Kit view when given) and read the tempi. The multi-staff view decides: when it cannot be tied to the phrase
 *  nothing is annotated and the reason is returned; the Kit view's trouble is reported separately and never blocks it. */
export function annotatePhraseXml(multiXml: string, kitXml: string | null, expectedBars: number, scope = PHRASE_BAR_SCOPE): PhraseAnnotateResult {
  const multi = tagFirstPart(multiXml, expectedBars, scope, 'the Score');
  if (multi.problems.length > 0) return { ok: false, problems: multi.problems };
  let kitOut: string | null = null;
  const kitProblems: string[] = [];
  if (kitXml !== null) {
    const kit = tagFirstPart(kitXml, expectedBars, scope, 'the Kit view');
    if (kit.problems.length > 0) kitProblems.push(...kit.problems);
    else kitOut = kit.xml;
  }
  return { ok: true, multiXml: multi.xml, kitXml: kitOut, bars: multi.bars, kitProblems };
}

/** element id -> provenance, one entry per bar. The phrase note is the note that made every bar; the parameters carry what the stack prints. */
export function phraseProvenance(phraseNote: string, params: ExtendPhrase, bars: readonly PhraseBarInfo[]): ProvenanceMap {
  const map: ProvenanceMap = {};
  for (const b of bars) {
    map[b.id] = {
      noteId: phraseNote,
      role: PHRASE_BAR_ROLE,
      params: { bar: b.index, bars: params.bars, tempo: b.tempo, source: params.source, style: params.style, tempo_change_pct: params.tempo_change_pct, ...(params.overrides?.[String(b.index)] ? { fork: params.overrides[String(b.index)] } : {}) },
    };
  }
  return map;
}

export function describeTempoChange(pct: number): string {
  if (pct < 0) return `slowing ${-pct} %`;
  if (pct > 0) return `speeding up ${pct} %`;
  return 'no tempo change';
}

/** The lineage stack of a pinned bar, outermost first: which bar, which note made it (and how), which bar it came from, the tempo the engine gave it. Both note entries are links. */
export function phraseLineageOf(prov: Provenance): LineageEntry[] {
  if (prov.role !== PHRASE_BAR_ROLE) return [{ kind: 'hit', text: prov.role }, { kind: 'note', text: prov.noteId, noteId: prov.noteId }];
  const p = prov.params;
  const name = prov.noteId.split('/').pop() ?? prov.noteId;
  const source = String(p.source);
  if (typeof p.fork === 'string') {
    // M9: a forked bar — edited by hand in its own note; its tempo is that note's own
    const forkName = p.fork.split('/').pop() ?? p.fork;
    const forked: LineageEntry[] = [
      { kind: 'bar', text: `bar ${String(p.bar)} of ${String(p.bars)}`, covers: 'self' },
      { kind: 'note', text: `forked: edited in ${forkName} (was made by ${name}, ${String(p.style)})`, noteId: p.fork, openLabel: `Open ${forkName}` },
    ];
    if (typeof p.tempo === 'number') forked.push({ kind: 'tempo', text: `tempo ${p.tempo} (the fork's own)`, covers: 'self' });
    forked.push({ kind: 'action', text: 'Revert to generated', action: { id: 'revert', barNumber: Number(p.bar) } });
    return forked;
  }
  const out: LineageEntry[] = [
    { kind: 'bar', text: `bar ${String(p.bar)} of ${String(p.bars)}`, covers: 'self' },
    { kind: 'note', text: `made by ${name} (extend, ${describeTempoChange(Number(p.tempo_change_pct))}, style ${String(p.style)})`, noteId: prov.noteId, openLabel: `Open ${name}`, covers: 'all' },
    { kind: 'note', text: `from ${source}`, noteId: phraseSourceNoteId(source), openLabel: `Open ${source}`, covers: 'all' },
  ];
  if (typeof p.tempo === 'number') out.push({ kind: 'tempo', text: `tempo ${p.tempo}`, covers: 'self' });
  out.push({ kind: 'action', text: 'Edit this bar', action: { id: 'fork', barNumber: Number(p.bar) } });
  return out;
}

/** The bars a stack entry covers (what hovering it lights): `self` = the pinned bar, `all` = every bar of the map. */
export function barsCoveredBy(map: ProvenanceMap, pinnedId: string, covers: LineageEntry['covers']): string[] {
  if (!Object.prototype.hasOwnProperty.call(map, pinnedId)) return [];
  if (covers === 'self') return [pinnedId];
  if (covers === 'all') return Object.keys(map);
  return [];
}
