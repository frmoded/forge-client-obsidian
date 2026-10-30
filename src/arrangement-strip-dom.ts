// score_first M10 slice 1 polish (drain 2026-10-29-0830) - the strip above an ARRANGEMENT's Score: one chip per phrase and per kit it reads (structure-strip-core.ts `arrangementChips`), drawn by the strip every tab uses. Plain DOM, no obsidian
// import. A click is the same as on a phrase tab: the pair's notes pane goes to that note; with no pair the tab opens the note itself. A note that cannot be read as an arrangement has no chips (the header already says why).
import { readArrangementNote } from './arrangement-core.ts';
import { arrangementChips, type Chip } from './structure-strip-core.ts';
import { mountStructureStrip, type StripHandle } from './structure-strip-dom.ts';

export interface ArrangementStripPorts {
  /** A chip was clicked: send the notes pane of this Score's pair to that note. false = there is no pair (or the note is not in the vault and was already reported). */
  goto(noteId: string): Promise<boolean>;
  /** No pair: open the note. */
  openNote(noteId: string): void;
  /** 2026-10-30-1000: the pointer or keyboard focus is on a chip (`null` = it left): the Score lights the rows of that kit or phrase. Absent = nothing is told. */
  onHover?(chip: Chip | null): void;
}

export interface ArrangementStrip {
  el: HTMLElement;
  /** Draw the chips of this arrangement note's text (an unreadable or refused note: none). */
  show(text: string | { unreadable: string }): void;
  /** 2026-10-30-1000: emphasise the chips of these notes (the phrase and the kit a pinned row came from); `null` clears. */
  emphasise(noteIds: readonly string[] | null): void;
  dispose(): void;
}

export function mountArrangementStrip(parent: HTMLElement, ports: ArrangementStripPorts, before: Element | null = null): ArrangementStrip {
  const handle: StripHandle = mountStructureStrip(parent, {
    onHover: (chip) => { ports.onHover?.(chip); },
    onClick: (chip) => { void ports.goto(chip.noteId).catch(() => false).then((handled) => { if (!handled) ports.openNote(chip.noteId); }); },
  }, before);
  return {
    el: handle.el,
    show(text) {
      const read = typeof text === 'string' ? readArrangementNote(text) : null;
      handle.set(read && read.ok ? arrangementChips(read.value) : []);
    },
    emphasise(noteIds) { handle.emphasise(noteIds); },
    dispose() { handle.dispose(); },
  };
}
