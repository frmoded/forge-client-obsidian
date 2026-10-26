// score_first M7b (a) (drain 2026-10-26-1260, DEMO profile) — "Refresh note links": every phrase note (`phrases/phrase_NNN.md`) and bar note (`bars/bar_NNN.md`) of the vault brought up to date with what the json says
// (phrase-core.ts refreshPhraseNoteText, phrase-notes-core.ts refreshBarNoteText). Pure: the vault is injected. It reads each note first and writes ONLY a note that would change (so a second run touches nothing: no write, no
// modify event, no byte), the write itself re-derives from the note's CURRENT text inside one atomic read-modify-write, and a note it cannot read is a line naming why, never a throw and never a change.
import { refreshPhraseNoteText } from './phrase-core.ts';
import { refreshBarNoteText } from './phrase-notes-core.ts';

export interface RefreshNotesPorts {
  /** The notes to look at: `{ path, name }` for every `phrases/phrase_NNN.md` and `bars/bar_NNN.md` (never README.md). */
  phrases(): Array<{ path: string; name: string }>;
  bars(): Array<{ path: string; name: string }>;
  read(path: string): Promise<string>;
  /** One atomic read-modify-write of the note: `fn` gets the CURRENT text and returns the new one. */
  process(path: string, fn: (current: string) => string): Promise<void>;
}

export interface RefreshSummary {
  phrases: { total: number; updated: number; current: number; skipped: string[] };
  bars: { total: number; updated: number; current: number; keptAsWritten: number; skipped: string[] };
}

export async function refreshNoteLinks(ports: RefreshNotesPorts): Promise<RefreshSummary> {
  const sum: RefreshSummary = { phrases: { total: 0, updated: 0, current: 0, skipped: [] }, bars: { total: 0, updated: 0, current: 0, keptAsWritten: 0, skipped: [] } };
  for (const { path, name } of ports.phrases()) {
    sum.phrases.total++;
    try {
      const r = refreshPhraseNoteText(await ports.read(path), name);
      if (r.ok === false) { sum.phrases.skipped.push(`${path}: ${r.message}`); continue; }
      if (!r.changed) { sum.phrases.current++; continue; }
      await ports.process(path, (cur) => { const again = refreshPhraseNoteText(cur, name); return again.ok ? again.text : cur; });
      sum.phrases.updated++;
    } catch (e) { sum.phrases.skipped.push(`${path}: ${(e as Error)?.message ?? e}`); }
  }
  for (const { path, name } of ports.bars()) {
    sum.bars.total++;
    try {
      const r = refreshBarNoteText(await ports.read(path), name);
      if (r.ok === false) { sum.bars.skipped.push(`${path}: ${r.message}`); continue; }
      if (r.kept) sum.bars.keptAsWritten++;
      if (!r.changed) { sum.bars.current++; continue; }
      await ports.process(path, (cur) => { const again = refreshBarNoteText(cur, name); return again.ok ? again.text : cur; });
      sum.bars.updated++;
    } catch (e) { sum.bars.skipped.push(`${path}: ${(e as Error)?.message ?? e}`); }
  }
  return sum;
}

/** The evidence line (`[forge-notes] ...`) and the one-line Notice of a run. */
export function refreshLine(s: RefreshSummary): string {
  const skipped = s.phrases.skipped.length + s.bars.skipped.length;
  return `[forge-notes] refresh note links: phrases ${s.phrases.total} (${s.phrases.updated} updated, ${s.phrases.current} already current), bars ${s.bars.total} (${s.bars.updated} updated, ${s.bars.current} already current, ${s.bars.keptAsWritten} descriptions left as written)${skipped > 0 ? `, ${skipped} skipped` : ''}`;
}
export function refreshNotice(s: RefreshSummary): string {
  const n = s.phrases.updated + s.bars.updated;
  const skipped = [...s.phrases.skipped, ...s.bars.skipped];
  return `Refresh note links: ${n === 0 ? 'every note was already up to date' : `${s.phrases.updated} phrase note(s) and ${s.bars.updated} bar note(s) updated`}${skipped.length > 0 ? `; ${skipped.length} could not be read (${skipped[0]})` : ''}.`;
}
