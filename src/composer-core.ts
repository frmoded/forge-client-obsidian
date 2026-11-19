// 2026-11-17-2001 - the music tab's chat-style composer (design doc checklists/music_tabs_chat_ui_design.md sections 3 and 7): the pure part, no DOM, no obsidian. The SUBMIT STATE MACHINE:
//   idle -> (Enter) working -> previewing -> (Enter) applying -> idle        and Esc / typing / errors on the way.
// Enter submits, Shift+Enter is a new line (the browser's own), Enter while an IME composition is open only confirms the composition. The FIRST Enter asks for a PREVIEW (the grammar first, then the
// sentence service when the grammar cannot read it: the caller's rules, unchanged) and writes NOTHING; the preview is shown with "Press Enter to apply, Esc to discard"; the SECOND Enter applies; Esc discards;
// typing a new sentence replaces the preview. With MUSIC_COMPOSER_AUTO_APPLY on (default OFF) a sentence the grammar reads exactly skips the preview. Esc while a request runs cancels it (its late answer is
// dropped). `seq` numbers the requests so an answer that arrives for a request that is gone changes nothing.

export interface Proposal {
  /** The canonical wording of what would be written (`describe`), shown in the dialog. */
  description: string;
  /** Who understood the sentence: the grammar (free, instant, exact) or the sentence service. */
  via: 'grammar' | 'service';
  /** 2026-11-19-0970 (the list model): the earlier sentence of the note's list that this one REPLACES (same kit, same volume target), in plain text. Absent = it replaces nothing. */
  replaces?: string;
}
export type ComposerState =
  | { phase: 'idle'; text: string; seq: number }
  | { phase: 'working'; text: string; seq: number }
  | { phase: 'previewing'; text: string; seq: number; proposal: Proposal }
  | { phase: 'applying'; text: string; seq: number; proposal: Proposal }
  | { phase: 'error'; text: string; seq: number; message: string };
export type ComposerPhase = ComposerState['phase'];

export type ComposerEvent =
  | { type: 'type'; text: string }
  | { type: 'enter'; shift?: boolean; composing?: boolean; autoApply?: boolean }
  | { type: 'escape' }
  | { type: 'resolved'; seq: number; proposal: Proposal; autoApply?: boolean }
  | { type: 'failed'; seq: number; message: string }
  | { type: 'applied'; seq: number; disk: string }
  | { type: 'applyFailed'; seq: number; message: string }
  | { type: 'externalText'; text: string };

/** What the caller does next: nothing, ask for a preview of `text`, apply `proposal` (written for `text`), cancel the running request, or just drop the preview. */
export type ComposerEffect =
  | { do: 'none' }
  | { do: 'preview'; text: string; seq: number }
  | { do: 'apply'; text: string; proposal: Proposal; seq: number }
  | { do: 'cancel'; seq: number }
  | { do: 'discard' };

export const initComposer = (text = ''): ComposerState => ({ phase: 'idle', text, seq: 0 });
const none: ComposerEffect = { do: 'none' };

/** Can the text be sent? (The return glyph brightens, Enter does something.) Not while a request runs, an apply is writing, or the field is empty. */
export function canSubmit(s: ComposerState): boolean {
  return (s.phase === 'idle' || s.phase === 'error') && s.text.trim() !== '';
}
/** A request is running or an apply is writing: the field is read-only and the glyph is a spinner. */
export const isWorking = (s: ComposerState): boolean => s.phase === 'working' || s.phase === 'applying';

export function step(s: ComposerState, ev: ComposerEvent): { state: ComposerState; effect: ComposerEffect } {
  switch (ev.type) {
    case 'type': {
      if (isWorking(s)) return { state: s, effect: none };                                   // read-only while working
      const hadPreview = s.phase === 'previewing';
      return { state: { phase: 'idle', text: ev.text, seq: s.seq }, effect: hadPreview ? { do: 'discard' } : none };   // typing replaces the preview (and clears an error)
    }
    case 'externalText':                                                                      // the field is set from outside (Up recall, a link inserted, the note was applied): like typing, but allowed any time but working
      return step(s, { type: 'type', text: ev.text });
    case 'enter': {
      if (ev.shift === true || ev.composing === true) return { state: s, effect: none };    // Shift+Enter: a new line (the browser's); IME: confirms the composition only
      if (s.phase === 'previewing') return { state: { phase: 'applying', text: s.text, seq: s.seq, proposal: s.proposal }, effect: { do: 'apply', text: s.text, proposal: s.proposal, seq: s.seq } };
      if (s.phase === 'idle' || s.phase === 'error') {
        if (s.text.trim() === '') return { state: s, effect: none };
        const seq = s.seq + 1;
        return { state: { phase: 'working', text: s.text, seq }, effect: { do: 'preview', text: s.text, seq } };
      }
      return { state: s, effect: none };                                                       // working / applying: a second Enter does nothing
    }
    case 'escape': {
      if (s.phase === 'working') return { state: { phase: 'idle', text: s.text, seq: s.seq }, effect: { do: 'cancel', seq: s.seq } };
      if (s.phase === 'previewing') return { state: { phase: 'idle', text: s.text, seq: s.seq }, effect: { do: 'discard' } };
      if (s.phase === 'error') return { state: { phase: 'idle', text: s.text, seq: s.seq }, effect: none };
      return { state: s, effect: none };                                                       // idle: nothing; applying: a write in flight is not cancelled
    }
    case 'resolved': {
      if (s.phase !== 'working' || ev.seq !== s.seq) return { state: s, effect: none };       // a late answer for a request that is gone
      if (ev.autoApply === true && ev.proposal.via === 'grammar') return { state: { phase: 'applying', text: s.text, seq: s.seq, proposal: ev.proposal }, effect: { do: 'apply', text: s.text, proposal: ev.proposal, seq: s.seq } };
      return { state: { phase: 'previewing', text: s.text, seq: s.seq, proposal: ev.proposal }, effect: none };
    }
    case 'failed': {
      if (s.phase !== 'working' || ev.seq !== s.seq) return { state: s, effect: none };
      return { state: { phase: 'error', text: s.text, seq: s.seq, message: ev.message }, effect: none };
    }
    case 'applied': {
      if (s.phase !== 'applying' || ev.seq !== s.seq) return { state: s, effect: none };
      return { state: { phase: 'idle', text: ev.disk, seq: s.seq }, effect: none };           // the field shows what the note says now
    }
    case 'applyFailed': {
      if (s.phase !== 'applying' || ev.seq !== s.seq) return { state: s, effect: none };
      return { state: { phase: 'error', text: s.text, seq: s.seq, message: ev.message }, effect: none };
    }
  }
}

// ---- the words ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const PREVIEW_HINT = 'Press Enter to apply, Esc to discard';
/** 2026-11-19-0970: the "+" menu's two list items (words and ids; the menu shows them disabled, never hidden, when there is nothing to undo or redo). */
export const UNDO_LABEL = 'Undo last sentence';
export const REDO_LABEL = 'Redo';
export const UNDO_ID = '__undo__';
export const REDO_ID = '__redo__';
export const WORKING_TEXT = 'Working... Esc cancels';
export const COMPOSER_LABELS = {
  region: 'Composer', field: 'Describe the next step in a sentence', send: 'Send, Enter', plus: 'More actions', menu: 'More actions', sr: 'Composer status',
} as const;
/** One muted line under the card: an error, said once, never a modal. Empty when there is none. */
export function errorLine(s: ComposerState): string { return s.phase === 'error' ? s.message : ''; }
/** What a screen reader hears when the phase changes (the live region). */
export function announcement(s: ComposerState): string {
  switch (s.phase) {
    case 'working': return 'Working. Press Escape to cancel.';
    case 'previewing': return `Preview: ${s.proposal.description.replace(/\.\s*$/, '')}. ${s.proposal.replaces ? `This replaces: ${s.proposal.replaces.replace(/\.\s*$/, '')}. ` : ''}${PREVIEW_HINT}.`;
    case 'applying': return 'Applying.';
    case 'error': return s.message;
    default: return '';
  }
}

// ---- history: Up in an empty composer recalls the previous sentence (per note) ----------------------------------------------------------------------------------------------
export const HISTORY_CAP = 20;
/** The sentences sent from this note, oldest first, each once in a row (sending the same sentence again does not add it again), the newest HISTORY_CAP. */
export function pushHistory(history: readonly string[], sentence: string): string[] {
  const t = sentence.trim(); if (t === '') return [...history];
  const out = history[history.length - 1] === t ? [...history] : [...history, t];
  return out.slice(-HISTORY_CAP);
}
export interface Recall { text: string; index: number }
/** Up: the previous sentence. `index` is where the last recall stopped (-1 = none yet = start from the newest). Returns null when there is nothing older. */
export function recallOlder(history: readonly string[], index: number): Recall | null {
  if (history.length === 0) return null;
  const i = index < 0 ? history.length - 1 : index - 1;
  return i < 0 ? null : { text: history[i], index: i };
}
/** Down: the next newer sentence, or the empty composer again after the newest (index -1). */
export function recallNewer(history: readonly string[], index: number): Recall {
  if (index < 0) return { text: '', index: -1 };
  const i = index + 1;
  return i >= history.length ? { text: '', index: -1 } : { text: history[i], index: i };
}
/** Up recalls only from an EMPTY composer (or while already walking the history): in a field with text Up is the caret moving up a line. */
export function upRecalls(text: string, walking: boolean): boolean { return walking || text === ''; }
