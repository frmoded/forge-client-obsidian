// 2026-10-31-1100 (M17b, item 4) - NAVIGATION IN A COMPOSITION: which section, and which bar of which note, made each bar of the Score. Pure; no `obsidian` import.
// The engine already says it (compose_sections_lineage -> `composition_lineage`, one dict per bar: {section, source, bar, tempo_bpm}); this ties that to the drawn MusicXML the way a phrase's bars are tied (annotatePhraseXml: an id on
// every measure, `ph_bar_N`, so the artifact inspector works on bars) and reuses the 1000 navigation (the same pin -> notes pane hook, the same chips strip, the same lighting) with nothing copied: a click on a bar follows its lineage to the
// SECTION, then to the note that section plays (a phrase, an arrangement or another composition), and the notes pane goes there.
import type { LineageEntry } from './artifact-inspector-core.ts';
import { annotatePhraseXml, phraseBarId, PHRASE_BAR_SCOPE } from './phrase-lineage-core.ts';
import type { Provenance, ProvenanceMap, ProvenanceResult } from './provenance-core.ts';
import type { CompositionShape } from './composition-core.ts';

export const COMPOSITION_BAR_ROLE = 'composition-bar';
/** The key the producer puts on the payload: what the Score on screen is made of (the expanded sections), so the tab can name a bar's section and note without reading the vault again. */
export const FORGE_COMPOSITION_KEY = 'forge_composition';
export const COMPOSITION_INSPECTOR_HINT = 'Click a bar to see which section and which note it came from. Arrow keys move between bars; Esc lets go.';

/** One bar of the engine's `composition_lineage`: `section` is the number (from 1) of the section the engine played, repeats counted, `bar` the bar of that section's note it plays. */
export interface CompositionLineageBar { section: number; source: string | null; bar: number; tempo_bpm: number | null }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const baseName = (id: string): string => id.split('/').pop() ?? id;

/** The engine's lineage, checked: exactly `bars` entries, or the sentence that says what is wrong (an old engine, a different shape). Never throws. */
export function readCompositionLineage(raw: unknown, bars: number): CompositionLineageBar[] | string {
  if (!Array.isArray(raw)) return 'the engine did not say which section made each bar';
  if (raw.length !== bars) return `the engine gave ${raw.length} bar(s) of lineage for ${bars} bar(s)`;
  const out: CompositionLineageBar[] = [];
  for (const [i, b] of raw.entries()) {
    if (!isObj(b) || !Number.isInteger(b.section) || (b.section as number) < 1 || !Number.isInteger(b.bar) || (b.bar as number) < 1) return `the lineage of bar ${i + 1} is not in the shape the plugin reads`;
    out.push({ section: b.section as number, source: typeof b.source === 'string' ? b.source : null, bar: b.bar as number, tempo_bpm: typeof b.tempo_bpm === 'number' && Number.isFinite(b.tempo_bpm) ? b.tempo_bpm : null });
  }
  return out;
}

const shapeOf = (payload: Record<string, unknown>): CompositionShape | null => {
  const s = payload[FORGE_COMPOSITION_KEY];
  return isObj(s) && Array.isArray(s.sections) ? (s as unknown as CompositionShape) : null;
};

/**
 * The whole step for a composition's Score: the payload with its drawn bars (`bars_data`), the engine's lineage and (from the producer) the shape of the sections becomes the payload with an id on every measure plus the map of BARS.
 * Nothing is tied that cannot be verified, and the sentence says why (the inspector shows the reason, never a guess). Never throws.
 */
export function annotateCompositionPayload(compositionNote: string, payload: Record<string, unknown>): ProvenanceResult {
  const none = (problem: string): ProvenanceResult => ({ payload, map: {}, problems: [problem], kitProblems: [] });
  const drawn = payload.bars_data;
  if (!Array.isArray(drawn) || drawn.length === 0) return none('the engine did not return the bars it drew');
  const lineage = readCompositionLineage(payload.composition_lineage, drawn.length);
  if (typeof lineage === 'string') return none(lineage);
  const shape = shapeOf(payload);
  if (shape === null) return none('the Score does not say which sections it was made from');
  const multiKey = typeof payload.multi_staff_content === 'string' ? 'multi_staff_content' : typeof payload.content === 'string' ? 'content' : null;
  if (multiKey === null) return none('the Score payload carries no MusicXML');
  try {
    const tagged = annotatePhraseXml(payload[multiKey] as string, typeof payload.kit_content === 'string' ? payload.kit_content : null, drawn.length);
    if (tagged.ok === false) return none(tagged.problems[0]);
    const map: ProvenanceMap = {};
    for (const info of tagged.bars) {
      const l = lineage[info.index - 1];
      const section = shape.sections[l.section - 1];
      if (section === undefined) return none(`the lineage of bar ${info.index} names section ${l.section}, which the Score does not have`);
      map[info.id] = {
        noteId: compositionNote,
        role: COMPOSITION_BAR_ROLE,
        params: {
          bar: info.index, bars: drawn.length, section: l.section, sections: shape.sections.length, source: section.source, sourceBar: l.bar, sourceBars: section.bars, copy: section.copy, jsonSection: section.index + 1,
          tempo: info.tempo, tempoBpm: l.tempo_bpm,
        },
      };
    }
    const next: Record<string, unknown> = { ...payload, [multiKey]: tagged.multiXml };
    if (tagged.kitXml !== null) next.kit_content = tagged.kitXml;
    return { payload: next, map, problems: [], kitProblems: tagged.kitProblems };
  } catch (e) {
    console.error('annotateCompositionPayload failed', e);
    return none(`the bars could not be tied to the composition (${(e as Error)?.message ?? e})`);
  }
}

const bpm = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const kindWord = (source: string): string => (source.startsWith('arrangements/') ? 'arrangement' : source.startsWith('compositions/') ? 'composition' : 'phrase');

/** The lineage stack of a pinned bar, outermost first: the one line ("bar 5 of 12 · section 2 of 4 · phrase_003 bar 1 · played at 100 bpm"), the note that section plays, then the composition itself; each note a link. */
export function compositionLineageOf(prov: Provenance): LineageEntry[] {
  if (prov.role !== COMPOSITION_BAR_ROLE) return [{ kind: 'hit', text: prov.role }, { kind: 'note', text: prov.noteId, noteId: prov.noteId }];
  const p = prov.params;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const source = str(p.source), tempo = num(p.tempoBpm), sourceBar = num(p.sourceBar), sourceBars = num(p.sourceBars);
  const name = source === null ? null : baseName(source);
  const copy = num(p.copy);
  const out: LineageEntry[] = [
    { kind: 'bar', text: `bar ${String(p.bar)} of ${String(p.bars)} · section ${String(p.section)} of ${String(p.sections)}${name === null ? '' : ` · ${name}${sourceBar === null ? '' : ` bar ${sourceBar}${sourceBars === null ? '' : ` of ${sourceBars}`}`}`}${copy !== null && copy > 0 ? ` · play ${copy + 1} of the section` : ''}${tempo === null ? '' : ` · played at ${bpm(tempo)} bpm`}`, covers: 'self' },
  ];
  if (source !== null && name !== null) out.push({ kind: 'note', text: `${kindWord(source)} ${name}`, noteId: source, openLabel: `Open ${name}` });
  out.push({ kind: 'note', text: `composition ${baseName(prov.noteId)}`, noteId: prov.noteId, openLabel: `Open ${baseName(prov.noteId)}` });
  return out;
}

/** The bars (1-based, in order) played from this note: the bars of every section whose source it is (`[]` for a note no section plays). */
export function barsPlayedFrom(lineage: readonly CompositionLineageBar[], noteId: string): number[] {
  return lineage.flatMap((l, i) => (l.source === noteId ? [i + 1] : []));
}
/** The ids of those bars in the Score (what the lighting takes). */
export const barIdsPlayedFrom = (lineage: readonly CompositionLineageBar[], noteId: string): string[] => barsPlayedFrom(lineage, noteId).map((n) => phraseBarId(PHRASE_BAR_SCOPE, n));

/** The note the notes pane shows for a pinned bar of a composition: the note its section plays. */
export function compositionPinnedNote(prov: Provenance): { noteId: string; reason: string } | null {
  if (prov.role !== COMPOSITION_BAR_ROLE) return null;
  const source = prov.params.source, section = prov.params.section;
  return typeof source === 'string' && source.length > 0 && typeof section === 'number' ? { noteId: source, reason: `section ${section}` } : null;
}
