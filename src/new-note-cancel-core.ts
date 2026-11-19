// 2026-11-19-0975 (finding 3 of the CCQA weekly of 2026-11-18, ad hoc item 5) - Cancel on the "Note title" dialog undoes the note the action just made. "New phrase from these bars" (and Copy, Delete, Move on a phrase that is not a plain transform)
// write a NEW phrase note at once and then offer Obsidian's rename prompt for it; Cancel on that prompt used to leave the note. The rule, pure (no obsidian, no DOM):
//   - the title dialog was CANCELLED (closed without Save): the note this action wrote is removed, but ONLY when nothing has touched it since: its text is, byte for byte, what the action wrote, and its modification time (when the host
//     tells it) is the one the action's own write had. A note the person edited, saved again, renamed away, moved or deleted is never removed: it is kept and the line says why;
//   - the dialog was SAVED (with the same title or a new one): nothing to undo;
//   - the dialog could not be watched (an Obsidian whose prompt is not the one this was written against): nothing is removed (a note too many is better than a note lost).
// The removal itself is the plugin's own (score-first.ts `removeNote`: close the tabs that show it, trash it, check it is gone: rule L12), passed in as a port. The ORIGINAL (the phrase the selection was made on) is never part of this: it is never written.

/** What the action wrote: the path and the text it created the note with, and the modification time the host gave the new file (null = the host gave none). */
export interface WrittenNote { readonly path: string; readonly content: string; readonly mtime: number | null }
/** How the title dialog ended. `unknown` = it could not be watched. */
export type TitleOutcome = 'saved' | 'cancelled' | 'unknown';
export type CancelVerdict =
  | { verdict: 'remove' }
  | { verdict: 'keep'; why: 'saved' | 'unwatched' | 'gone' | 'moved' | 'unreadable' | 'edited' | 'touched' };

/** The decision, from what is known now: `now` = the note's text and mtime as they are (null = the note is not there). */
export function cancelVerdict(outcome: TitleOutcome, written: WrittenNote, now: { path: string; text: string | null; mtime: number | null } | null): CancelVerdict {
  if (outcome === 'saved') return { verdict: 'keep', why: 'saved' };
  if (outcome === 'unknown') return { verdict: 'keep', why: 'unwatched' };
  if (now === null) return { verdict: 'keep', why: 'gone' };
  if (now.path !== written.path) return { verdict: 'keep', why: 'moved' };
  if (now.text === null) return { verdict: 'keep', why: 'unreadable' };
  if (now.text !== written.content) return { verdict: 'keep', why: 'edited' };
  if (written.mtime !== null && now.mtime !== null && now.mtime !== written.mtime) return { verdict: 'keep', why: 'touched' };
  return { verdict: 'remove' };
}

export interface TitleClosedPorts<F> {
  /** The note as it is now, or null when it is not in the vault any more (a rename away, a delete). */
  current(file: F): { path: string; mtime: number | null } | null;
  read(file: F): Promise<string>;
  /** The plugin's own removal of a note (tabs closed first, trashed, verified). Throws when the note is still there. */
  remove(path: string): Promise<void>;
  trace(line: string): void;
}

const WHY: Record<Extract<CancelVerdict, { verdict: 'keep' }>['why'], string> = {
  saved: 'the title was saved',
  unwatched: 'the dialog could not be watched',
  gone: 'it is not in the vault any more',
  moved: 'it is not at the path the action made it at',
  unreadable: 'it could not be read',
  edited: 'its text is not what the action wrote (it was edited)',
  touched: 'it was written again since the action made it',
};

/** The title dialog of the new note `file` has closed with `outcome`: remove the note when that is a Cancel and nothing touched it. Never throws: a failure is a console.error and the note stays. Returns what happened, for the tests. */
export async function onTitleClosed<F>(ports: TitleClosedPorts<F>, file: F, written: WrittenNote, outcome: TitleOutcome): Promise<'removed' | 'kept' | 'failed'> {
  const where = ports.current(file);
  let text: string | null = null;
  if (outcome === 'cancelled' && where !== null) { try { text = await ports.read(file); } catch (e) { console.error('onTitleClosed: could not read the note', e); } }
  const decision = cancelVerdict(outcome, written, where === null ? null : { path: where.path, text, mtime: where.mtime });
  if (decision.verdict === 'keep') {
    if (outcome === 'cancelled') ports.trace(`[forge-barsel] title dialog cancelled: ${where?.path ?? 'the new note'} is kept (${WHY[decision.why]})`);
    return 'kept';
  }
  try {
    await ports.remove(where!.path);
    ports.trace(`[forge-barsel] title dialog cancelled: removed ${where!.path} (untouched since it was made)`);
    return 'removed';
  } catch (e) {
    console.error('onTitleClosed: the new note could not be removed', e);
    ports.trace(`[forge-barsel] title dialog cancelled: ${where!.path} could not be removed (${(e as Error)?.message ?? e}); it is kept`);
    return 'failed';
  }
}
