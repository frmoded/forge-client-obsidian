// 2026-11-16-1000 - "the note opens with its title selected for renaming": a new phrase made from the Score's selection has the next free name (phrase_NNN, no dialog first); right after it opens, Obsidian's own rename prompt is offered for it
// (`fileManager.promptForFileRename`, which selects the whole title). An Obsidian without that call simply does not offer it. Never throws: a rename that cannot be offered is a console line, not a failure of the new phrase.
export interface RenameHost { fileManager?: { promptForFileRename?: (file: never) => unknown } }
export function offerRename(app: unknown, file: unknown): boolean {
  const fm = (app as RenameHost | null)?.fileManager;
  if (typeof fm?.promptForFileRename !== 'function') return false;
  try { void fm.promptForFileRename(file as never); return true; } catch (e) { console.error('[forge-barsel] offerRename: the rename prompt could not be opened', e); return false; }
}

// 2026-11-19-0975 - the same offer, WATCHED: how did the "Note title" dialog end? Obsidian's `promptForFileRename` opens a Modal and returns nothing, so there is nothing to await. The prompt is a Modal subclass opened with `modal.open()` inside that
// call: for the length of the call only, `open` of the Modal class notes which object it was called on, and the class is put back exactly as it was. The prompt's own `submit` (Save, or Enter) is wrapped to tell a close that comes from it from any other
// close (Cancel, Esc, a click outside); the close itself is its `onClose`. Anything that does not look like that (no Modal class, no `submit`, nothing opened) answers `unknown`, and the caller then leaves the note alone.
import type { TitleOutcome } from './new-note-cancel-core.ts';

interface WatchedModal { submit?: (...a: unknown[]) => unknown; onClose?: (...a: unknown[]) => unknown }
export function offerRenameWatched(app: unknown, file: unknown, modalClass: unknown): { offered: boolean; closed: Promise<TitleOutcome> } {
  const fm = (app as RenameHost | null)?.fileManager;
  if (typeof fm?.promptForFileRename !== 'function') return { offered: false, closed: Promise.resolve('unknown') };
  const proto = (modalClass as { prototype?: { open?: (...a: unknown[]) => unknown } } | null)?.prototype;
  const realOpen = proto?.open;
  let modal: (WatchedModal & object) | null = null;
  if (proto && typeof realOpen === 'function') {
    proto.open = function (this: unknown, ...a: unknown[]): unknown {
      if (modal === null && typeof (this as WatchedModal | null)?.submit === 'function') modal = this as WatchedModal & object;
      return realOpen.apply(this, a);
    };
  }
  try {
    void fm.promptForFileRename(file as never);
  } catch (e) {
    console.error('[forge-barsel] offerRenameWatched: the rename prompt could not be opened', e);
    return { offered: false, closed: Promise.resolve('unknown') };
  } finally {
    if (proto && proto.open !== realOpen) proto.open = realOpen;                       // the class is exactly as it was, whatever the prompt did
  }
  const opened = modal as (WatchedModal & object) | null;
  if (opened === null) return { offered: true, closed: Promise.resolve('unknown') };
  const closed = new Promise<TitleOutcome>((resolve) => {
    const submit = opened.submit!; const onClose = opened.onClose;
    let inSubmit = false;                                                              // `this.close()` runs in the first, synchronous part of the prompt's async `submit`: a close while this is true is the Save
    opened.submit = function (this: unknown, ...a: unknown[]): unknown { inSubmit = true; try { return submit.apply(this, a); } finally { inSubmit = false; } };
    opened.onClose = function (this: unknown, ...a: unknown[]): unknown {
      const out = typeof onClose === 'function' ? onClose.apply(this, a) : undefined;
      resolve(inSubmit ? 'saved' : 'cancelled');
      return out;
    };
  });
  return { offered: true, closed };
}
