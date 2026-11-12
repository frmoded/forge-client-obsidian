// 2026-11-12-1203 - the docked prompt box: the pure part (no Obsidian, no DOM). The box is an EDITOR VIEW of a note's Description facet; the Description on disk stays the only source of truth, so the box holds three things and
// nothing else: `disk` (the Description as the note says it now), `text` (what the field shows), and `base` (the disk text the person's typing started from, to tell "the controls changed the Description while I was typing" from
// "nothing happened"). `conflict` is true while the person has unapplied typing AND the Description on disk changed under it: nothing is overwritten, the box offers "Keep my text" / "Use the new one".
import { describe } from './phrase-describe-core.ts';

export interface BoxState { disk: string; text: string; base: string; conflict: boolean }

export const initBox = (disk: string): BoxState => ({ disk, text: disk, base: disk, conflict: false });
/** Typed in the field but not applied: `text` differs from `disk`. */
export const isEdited = (s: BoxState): boolean => s.text !== s.disk;
/** The person typed. (A newline is part of the text: Shift+Enter.) */
export const typed = (s: BoxState, text: string): BoxState => ({ ...s, text, conflict: s.conflict && text !== s.disk });
/**
 * The note's Description on disk is now `disk` (a control wrote it, a hand edit in the text view, an apply from this box).
 *  - not edited: the field follows it;
 *  - edited and it is what the person typed: nothing left to apply, no conflict;
 *  - edited and different from where the typing started: CONFLICT (the typing is kept, the choice is offered);
 *  - edited and unchanged since the typing started: nothing to say.
 */
export function diskChanged(s: BoxState, disk: string): BoxState {
  if (disk === s.disk) return s;
  if (s.text === s.base) return initBox(disk);                  // the field showed the old Description: it shows the new one
  if (s.text === disk) return initBox(disk);                    // the person typed exactly what is now on disk
  return { disk, text: s.text, base: s.base, conflict: disk !== s.base };
}
/** "Keep my text": the typing stays, the choice is answered (the new Description is acknowledged as the base the typing now sits on). */
export const keepMine = (s: BoxState): BoxState => ({ ...s, base: s.disk, conflict: false });
/** "Use the new one": the field shows the Description on disk. */
export const useNew = (s: BoxState): BoxState => initBox(s.disk);
/** An apply went through: whatever the note says now (the canonical sentence the writer made) is what the field shows. */
export const applied = (disk: string): BoxState => initBox(disk);

/** `# Description` body replaced by `sentence` (until the next H1, like `extractDescription`), or null when the note has no such heading. The rest of the note is byte-for-byte what it was. */
export function replaceDescriptionSection(body: string, sentence: string): string | null {
  const m = /^# Description[ \t]*$/m.exec(body);
  if (!m) return null;
  const headEnd = m.index + m[0].length;
  const tail = body.slice(headEnd);
  const next = /^# [^#\n]/m.exec(tail);
  const after = next ? tail.slice(next.index) : '';
  const text = sentence.replace(/^\s+/, '').replace(/\s+$/, '');
  return body.slice(0, headEnd) + '\n\n' + text + '\n' + (after.length > 0 ? '\n' + after : '');
}

/** One example Description per kind of note (the sentences the grammar itself writes, from `describe`), shown as the placeholder when the field is empty. */
const EXAMPLES: Record<string, Parameters<typeof describe>[0]> = {
  extend: { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 },
  mix: { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false },
  morph: { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0 },
  transform: { kind: 'transform', source: 'phrase_001', ops: [{ op: 'thin_out', first: 3, last: 5, amount: 0.5 }] } as never,
  arrangement: { kind: 'arrangement', tracks: [{ kit: 'kit_001', phrase: 'phrase_001' }] },
  composition: { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }] },
};
export function placeholderFor(kind: string): string {
  const p = EXAMPLES[kind];
  return `Describe it in a sentence, for example: ${p ? describe(p) : 'Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote.'}`;
}
