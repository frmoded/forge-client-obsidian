// score_first M10 slice 3 (drain 2026-10-30-1000) - NAVIGATION IN AN ARRANGEMENT: which kit, which phrase and which bar of that phrase made each row of each bar of the Score. Pure; no `obsidian` import.
// The engine already says it (0910: combine_tracks_lineage -> `arrangement_lineage`, one dict per bar: {bar, tempo_bpm, channels: {channel: {kit, phrase, bar}}, retimed_from}); this ties that to the drawn MusicXML.
// A ROW is one staff of one bar (the engine draws one part per channel): its element id is `<bar id>_<channel>` (`ph_bar_3_kick`), the rows are the inspector's map, and a click on a row pins it. The measure of every bar carries
// the phrase tab's own id (`ph_bar_3`, annotatePhraseXml); the rows themselves are drawn into the SVG afterwards (arrangement-rows-dom.ts), because the staff of a part has no id of its own in the MusicXML.
import type { LineageEntry } from './artifact-inspector-core.ts';
import { CANONICAL_CHANNELS, scanParts, type Provenance, type ProvenanceMap, type ProvenanceResult } from './provenance-core.ts';
import { annotatePhraseXml, phraseBarId, PHRASE_BAR_SCOPE } from './phrase-lineage-core.ts';
import { barParent } from './structure-strip-core.ts';
import type { PhraseParams } from './phrase-core.ts';

export const ARRANGEMENT_ROW_ROLE = 'arrangement-row';
/** The `PhraseParams` of the phrases an arrangement reads, by name, as the producer read them: the payload carries them so the source of a row can be named without reading the vault again. */
export const FORGE_PHRASES_KEY = 'forge_phrases';

/** One bar of the engine's `arrangement_lineage`. `phrase` is the name given on the track; `bar` is the bar of that phrase played here, or null where it has ended and the kit rests. */
export interface LineageChannel { kit: string; phrase: string | null; bar: number | null }
export interface LineageBar { bar: number; tempo_bpm: number | null; channels: Record<string, LineageChannel>; retimed_from: Record<string, number> }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const baseName = (id: string): string => id.split('/').pop() ?? id;

/** The engine's lineage, checked: `LineageBar[]` of exactly `bars` entries, or the sentence that says what is wrong (an old engine, a different shape). Never throws. */
export function readLineage(raw: unknown, bars: number): LineageBar[] | string {
  if (!Array.isArray(raw)) return 'the engine did not say which kit and phrase made each bar';
  if (raw.length !== bars) return `the engine gave ${raw.length} bar(s) of lineage for ${bars} bar(s)`;
  const out: LineageBar[] = [];
  for (const [i, b] of raw.entries()) {
    if (!isObj(b) || b.bar !== i + 1 || !isObj(b.channels)) return `the lineage of bar ${i + 1} is not in the shape the plugin reads`;
    const channels: Record<string, LineageChannel> = {};
    for (const [channel, c] of Object.entries(b.channels)) {
      if (!isObj(c) || typeof c.kit !== 'string') return `the lineage of bar ${i + 1}, ${channel}, names no kit`;
      const bar = c.bar === null || c.bar === undefined ? null : c.bar;
      if (bar !== null && !Number.isInteger(bar)) return `the lineage of bar ${i + 1}, ${channel}, has a bar that is not a number`;
      channels[channel] = { kit: c.kit, phrase: typeof c.phrase === 'string' ? c.phrase : null, bar: bar as number | null };
    }
    const retimed: Record<string, number> = {};
    if (isObj(b.retimed_from)) for (const [kit, t] of Object.entries(b.retimed_from)) if (typeof t === 'number' && Number.isFinite(t)) retimed[kit] = t;
    out.push({ bar: i + 1, tempo_bpm: typeof b.tempo_bpm === 'number' && Number.isFinite(b.tempo_bpm) ? b.tempo_bpm : null, channels, retimed_from: retimed });
  }
  return out;
}

/** The element id of one row: the staff of `channel` in bar `bar`. */
export const rowId = (bar: number, channel: string): string => `${phraseBarId(PHRASE_BAR_SCOPE, bar)}_${channel}`;

/**
 * The note the notes pane shows for a row: the bar note the row's phrase got this bar from, when the pair's rule for that phrase gives one (a fork, an extend's source, a morph's nearer end, a mix by vote: the SAME `barParent`
 * the strip lights by), else the phrase's own note (a transform, a mix by path - its bar depends on a state the arrangement does not have - or a phrase that could not be read). Where the phrase has ended: its own note, saying so.
 * null = the track names no phrase.
 */
export function rowSource(phrase: string | null, phraseBar: number | null, phrases: Readonly<Record<string, PhraseParams | undefined>>): { noteId: string; reason: string } | null {
  if (phrase === null) return null;
  const own = { noteId: `phrases/${phrase}`, reason: phraseBar === null ? 'phrase ended' : `pinned bar ${phraseBar}` };
  if (phraseBar === null) return own;
  const p = phrases[phrase];
  if (p === undefined) return own;
  const fork = p.kind === 'extend' || p.kind === 'morph' || p.kind === 'transform' ? p.overrides?.[String(phraseBar)] : undefined;
  if (fork) return { noteId: `bars/${baseName(fork)}`, reason: 'forked' };
  if (p.kind === 'transform' || (p.kind === 'mix' && p.mode === 'path')) return own;
  const parent = barParent(p, phraseBar);
  return parent === null ? own : { noteId: `bars/${parent}`, reason: `pinned bar ${phraseBar}` };
}

const channelsOf = (bars: readonly { channels: Record<string, unknown> }[]): string[] => {
  const seen = new Set<string>();
  for (const b of bars) for (const c of Object.keys(b.channels)) seen.add(c);
  return CANONICAL_CHANNELS.filter((c) => seen.has(c));
};

/**
 * The whole step for an arrangement's Score: the payload with its drawn bars (`bars_data`), the engine's lineage and (from the producer) the phrases it read becomes the payload with ids on the measures plus the map of ROWS.
 * Nothing is tied that cannot be verified, and the sentence says why (the inspector shows the reason, never a guess). Never throws.
 */
export function annotateArrangementPayload(arrangementNote: string, payload: Record<string, unknown>): ProvenanceResult {
  const none = (problem: string): ProvenanceResult => ({ payload, map: {}, problems: [problem], kitProblems: [] });
  const drawn = payload.bars_data;
  if (!Array.isArray(drawn) || drawn.length === 0 || !drawn.every((b) => isObj(b) && isObj(b.channels))) return none('the engine did not return the bars it drew');
  const bars = drawn as Array<{ channels: Record<string, unknown>; tempo_bpm?: unknown }>;
  const lineage = readLineage(payload.arrangement_lineage, bars.length);
  if (typeof lineage === 'string') return none(lineage);
  const multiKey = typeof payload.multi_staff_content === 'string' ? 'multi_staff_content' : typeof payload.content === 'string' ? 'content' : null;
  if (multiKey === null) return none('the Score payload carries no MusicXML');
  const present = channelsOf(bars);
  const unknown = Object.keys(Object.assign({}, ...bars.map((b) => b.channels))).filter((c) => !(CANONICAL_CHANNELS as readonly string[]).includes(c));
  if (unknown.length > 0) return none(`channel(s) the provenance map does not know: ${unknown.join(', ')}`);
  try {
    const tagged = annotatePhraseXml(payload[multiKey] as string, typeof payload.kit_content === 'string' ? payload.kit_content : null, bars.length);
    if (tagged.ok === false) return none(tagged.problems[0]);
    const parts = scanParts(tagged.multiXml);
    if (parts === null) return none('the multi-staff MusicXML could not be scanned');
    if (parts.length !== present.length) return none(`the Score has ${parts.length} part(s) but the bars have ${present.length} channel(s)`);
    const phrases = isObj(payload[FORGE_PHRASES_KEY]) ? (payload[FORGE_PHRASES_KEY] as Record<string, PhraseParams>) : {};
    const map: ProvenanceMap = {};
    for (const info of tagged.bars) {
      const l = lineage[info.index - 1];
      for (const [staff, channel] of present.entries()) {
        const c = l.channels[channel];
        if (c === undefined) return none(`the lineage of bar ${info.index} does not say who plays ${channel}`);
        const source = rowSource(c.phrase, c.bar, phrases);
        map[rowId(info.index, channel)] = {
          noteId: arrangementNote,
          role: ARRANGEMENT_ROW_ROLE,
          params: {
            bar: info.index, bars: bars.length, staff, channel, kit: c.kit, phrase: c.phrase, phraseBar: c.bar, ended: c.bar === null,
            tempo: info.tempo, tempoBpm: l.tempo_bpm, cameWith: l.retimed_from[c.kit] ?? null,
            ...(source ? { sourceNote: source.noteId, sourceReason: source.reason } : {}),
          },
        };
      }
    }
    const next: Record<string, unknown> = { ...payload, [multiKey]: tagged.multiXml };
    if (tagged.kitXml !== null) next.kit_content = tagged.kitXml;
    return { payload: next, map, problems: [], kitProblems: [...tagged.kitProblems, ...(typeof payload.kit_content === 'string' ? ['the rows of an arrangement are not tied in the Kit view'] : [])] };
  } catch (e) {
    console.error('annotateArrangementPayload failed', e);
    return none(`the rows could not be tied to the arrangement (${(e as Error)?.message ?? e})`);
  }
}

const bpm = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** The lineage stack of a pinned row, outermost first: the one line ("bar 3 of 6 · rock kit · phrase_006 bar 3 · played at 100 bpm (came with 110)"), the row, then the notes it came from, each a link. */
export function arrangementLineageOf(prov: Provenance): LineageEntry[] {
  if (prov.role !== ARRANGEMENT_ROW_ROLE) return [{ kind: 'hit', text: prov.role }, { kind: 'note', text: prov.noteId, noteId: prov.noteId }];
  const p = prov.params;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const kit = str(p.kit) ?? '?', phrase = str(p.phrase), phraseBar = num(p.phraseBar), tempo = num(p.tempoBpm), cameWith = num(p.cameWith);
  const played = tempo === null ? '' : ` · played at ${bpm(tempo)} bpm${cameWith !== null && cameWith !== tempo ? ` (came with ${bpm(cameWith)})` : ''}`;
  const where = phrase === null ? `${kit} kit` : phraseBar === null ? `${kit} kit · the ${kit} phrase has ended: the kit rests` : `${kit} kit · ${phrase} bar ${phraseBar}`;
  const out: LineageEntry[] = [
    { kind: 'bar', text: `bar ${String(p.bar)} of ${String(p.bars)} · ${where}${phraseBar === null ? '' : played}`, covers: 'self' },
    { kind: 'hit', text: `${String(p.channel)} row` },
  ];
  if (phrase !== null) out.push({ kind: 'note', text: `phrase ${phrase}`, noteId: `phrases/${phrase}`, openLabel: `Open ${phrase}` });
  const source = str(p.sourceNote);
  if (source !== null && source.startsWith('bars/')) out.push({ kind: 'note', text: p.sourceReason === 'forked' ? `forked: edited in ${baseName(source)}` : `bar made from ${baseName(source)}`, noteId: source, openLabel: `Open ${baseName(source)}` });
  out.push({ kind: 'note', text: `${kit} kit`, noteId: `kits/${kit}`, openLabel: `Open ${kit}` });
  return out;
}

/** Who sounds where: the bars (1-based, in order) in which the kit or the phrase of this note plays; `[]` for a note that is neither (the arrangement itself, a bar note). */
export function barsPlayedBy(lineage: readonly LineageBar[], noteId: string): number[] {
  const kit = noteId.startsWith('kits/') ? baseName(noteId) : null, phrase = noteId.startsWith('phrases/') ? baseName(noteId) : null;
  if (kit === null && phrase === null) return [];
  return lineage.filter((l) => Object.values(l.channels).some((c) => c.bar !== null && (kit !== null ? c.kit === kit : c.phrase === phrase))).map((l) => l.bar);
}

/** The ids of the rows to light for a note: its rows in the bars where it sounds (a row that is not drawn - a muted kit - is not in the map and lights nothing). */
export function rowIdsPlayedBy(lineage: readonly LineageBar[], noteId: string): string[] {
  const kit = noteId.startsWith('kits/') ? baseName(noteId) : null, phrase = noteId.startsWith('phrases/') ? baseName(noteId) : null;
  if (kit === null && phrase === null) return [];
  return lineage.flatMap((l) => Object.entries(l.channels).filter(([, c]) => c.bar !== null && (kit !== null ? c.kit === kit : c.phrase === phrase)).map(([channel]) => rowId(l.bar, channel)));
}

/** The two chips (phrase, kit) a pinned row came from: what the strip emphasises. */
export function chipsOfRow(prov: Provenance): string[] {
  if (prov.role !== ARRANGEMENT_ROW_ROLE) return [];
  const phrase = prov.params.phrase, kit = prov.params.kit;
  return [...(typeof phrase === 'string' ? [`phrases/${phrase}`] : []), ...(typeof kit === 'string' ? [`kits/${kit}`] : [])];
}

export const ARRANGEMENT_INSPECTOR_HINT = 'Click a row of a bar to see which kit and which phrase played it. Arrow keys move between rows; Esc lets go.';
