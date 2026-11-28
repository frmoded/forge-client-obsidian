// FULL implementation of the list-model seam (see ListModel in music-edition.ts): the real cores. Bundled by the music edition and by every unbundled test (the committed selector points here); the lean build never
// reaches this module, so none of the cores is in lean's main.js.
import type { ListModel } from './music-edition.ts';
import { createBarListWithMelody, LIST_MODEL_SENTINEL_MELODY_LIST_CONTROLLER } from './melody-list-controller.ts';
import { LIST_MODEL_SENTINEL_MELODY_BAR_CORE, markMelody, melodyNames, melodyNoteTemplate, readMelodyNote } from './melody-bar-core.ts';
import { LIST_MODEL_SENTINEL_MELODY_GRAMMAR_CORE } from './melody-grammar-core.ts';
import { LIST_MODEL_SENTINEL_MELODY_LIST_CORE } from './melody-list-core.ts';
import { createBarBoxHost } from './bar-box-host-core.ts';
import { withBarLines } from './bar-list-note-core.ts';
import { barClickText, barNumberOf, duplicatePreviewLine, idParts, linkInsertion, readActionText, resolveDuplicateTarget } from './duplicate-sentence-core.ts';
import { copyNoteText, createdLine, duplicateNote } from './duplicate-note-core.ts';
import { undoCopy } from './duplicate-undo-core.ts';
import { LIST_MODEL_SENTINEL_BAR_LIST_CONTROLLER } from './bar-list-controller.ts';
import { LIST_MODEL_SENTINEL_BAR_LIST_CORE } from './bar-list-core.ts';
import { LIST_MODEL_SENTINEL_BAR_GRAMMAR_CORE } from './bar-grammar-core.ts';
import { LIST_MODEL_SENTINEL_BAR_BOX_HOST_CORE } from './bar-box-host-core.ts';
import { LIST_MODEL_SENTINEL_BAR_LIST_NOTE_CORE } from './bar-list-note-core.ts';
import { LIST_MODEL_SENTINEL_DUPLICATE_SENTENCE_CORE } from './duplicate-sentence-core.ts';
import { LIST_MODEL_SENTINEL_DUPLICATE_NOTE_CORE } from './duplicate-note-core.ts';
import { LIST_MODEL_SENTINEL_DUPLICATE_UNDO_CORE } from './duplicate-undo-core.ts';
import { LIST_MODEL_SENTINEL_PHRASE_STEPS_LINEAGE_CORE, annotateWithSteps, stepLineageOf } from './phrase-steps-lineage-core.ts';
import { LIST_MODEL_SENTINEL_DID_YOU_MEAN_CORE, drawnBarNames, duplicateByLink, notAskedNote, offerRepair, placeWordSentence } from './did-you-mean-core.ts';
import { LIST_MODEL_SENTINEL_TYPED_STEP_CORE, applyTyped, previewTyped } from './typed-step-core.ts';
import { LIST_MODEL_SENTINEL_UNDO_TRACE_CORE, createUndoTrace } from './undo-trace-core.ts';
import { LIST_MODEL_SENTINEL_RENAME_FOLLOW_CORE, followRenamedDescription } from './rename-follow-core.ts';
import { paintBarNotes } from './selection-tint-dom.ts';
import { LIST_MODEL_SENTINEL_SCRIPT_EDIT_CORE, forgeText } from './script-edit-core.ts';
import { LIST_MODEL_SENTINEL_WAITING_LINE_CORE, alreadyWaiting, blockedMessage, blockedTail, isWaitingLine, keptMessage, translateRequest, waitingLine, waitingWords } from './waiting-line-core.ts';
import { LIST_MODEL_SENTINEL_DIALOG_FOLLOW_CORE, dialogDeleted, dialogFresh, dialogPrune, dialogRenamed, dialogStamp, noteCtimeOf } from './dialog-follow-core.ts';
import { LIST_MODEL_SENTINEL_RENAME_DESCRIPTION_CORE } from './rename-description-core.ts';
import { LIST_MODEL_SENTINEL_FAILED_PROMPT_CORE } from './failed-prompt-core.ts';
import { LIST_MODEL_SENTINEL_FAILED_PROMPT_STORE } from './failed-prompt-store.ts';
import { LIST_MODEL_SENTINEL_FAILED_PROMPT_TAB_DOM } from './failed-prompt-tab-dom.ts';
import { LIST_MODEL_SENTINEL_FAILED_PROMPT_SETUP_CORE, createReview, createTracker } from './failed-prompt-setup-core.ts';
import { LIST_MODEL_SENTINEL_SERVICE_LINES_CORE, LINES_SERVICE_VERSION, askLinesBar, askLinesNote, linesRequestFields, readLinesAnswer } from './service-lines-core.ts';
import { LIST_MODEL_SENTINEL_GROUP_CORE } from './group-core.ts';
import { LIST_MODEL_SENTINEL_GROUP_NOTE_CORE, carryGroups, dropGroups, writeNoteGroups } from './group-note-core.ts';
import { LIST_MODEL_SENTINEL_GROUP_CONTROLLER, createGroups, popCommand } from './group-controller.ts';
import { LIST_MODEL_SENTINEL_GROUP_PROMPTS_DOM } from './group-prompts-dom.ts';
import { LIST_MODEL_SENTINEL_BAR_ORDER_CORE } from './bar-order-core.ts';

export const listModel: ListModel = {
  present: true,
  cores: [
    LIST_MODEL_SENTINEL_MELODY_BAR_CORE, LIST_MODEL_SENTINEL_MELODY_GRAMMAR_CORE, LIST_MODEL_SENTINEL_MELODY_LIST_CORE, LIST_MODEL_SENTINEL_MELODY_LIST_CONTROLLER,          // 2026-11-23-1030 (pitch in bars, Stage 1a)
    LIST_MODEL_SENTINEL_BAR_LIST_CONTROLLER, LIST_MODEL_SENTINEL_BAR_LIST_CORE, LIST_MODEL_SENTINEL_BAR_GRAMMAR_CORE, LIST_MODEL_SENTINEL_BAR_BOX_HOST_CORE, LIST_MODEL_SENTINEL_BAR_LIST_NOTE_CORE,
    LIST_MODEL_SENTINEL_DUPLICATE_SENTENCE_CORE, LIST_MODEL_SENTINEL_DUPLICATE_NOTE_CORE, LIST_MODEL_SENTINEL_DUPLICATE_UNDO_CORE,
    LIST_MODEL_SENTINEL_PHRASE_STEPS_LINEAGE_CORE, LIST_MODEL_SENTINEL_DID_YOU_MEAN_CORE, LIST_MODEL_SENTINEL_TYPED_STEP_CORE, LIST_MODEL_SENTINEL_SERVICE_LINES_CORE, LIST_MODEL_SENTINEL_UNDO_TRACE_CORE, LIST_MODEL_SENTINEL_RENAME_FOLLOW_CORE, LIST_MODEL_SENTINEL_DIALOG_FOLLOW_CORE, LIST_MODEL_SENTINEL_WAITING_LINE_CORE, LIST_MODEL_SENTINEL_SCRIPT_EDIT_CORE, LIST_MODEL_SENTINEL_RENAME_DESCRIPTION_CORE, LIST_MODEL_SENTINEL_FAILED_PROMPT_CORE, LIST_MODEL_SENTINEL_FAILED_PROMPT_STORE, LIST_MODEL_SENTINEL_FAILED_PROMPT_TAB_DOM, LIST_MODEL_SENTINEL_FAILED_PROMPT_SETUP_CORE,
    LIST_MODEL_SENTINEL_GROUP_CORE, LIST_MODEL_SENTINEL_GROUP_NOTE_CORE, LIST_MODEL_SENTINEL_GROUP_CONTROLLER, LIST_MODEL_SENTINEL_GROUP_PROMPTS_DOM, LIST_MODEL_SENTINEL_BAR_ORDER_CORE,          // 2026-11-27-1050 (the prompt stack)
  ],
  createBarList: createBarListWithMelody,          // 2026-11-23-1030: the rhythm bar's controller, untouched, and the melody bar's, each call sent to the kind the note is
  createBarBoxHost,
  melody: { read: (text) => { const r = readMelodyNote(text); return r.ok ? r.value.data : null; }, template: melodyNoteTemplate, names: melodyNames, mark: markMelody },          // 2026-11-23-1030
  withBarLines,
  duplicate: { readActionText, barNumberOf, barClickText, linkInsertion, idParts, resolveDuplicateTarget, duplicatePreviewLine, copyNoteText, createdLine, duplicateNote, undoCopy },
  steps: { annotate: annotateWithSteps, lineageOf: stepLineageOf },
  typed: { preview: previewTyped, apply: applyTyped },
  repair: { offer: offerRepair, placeWords: placeWordSentence, notAsked: notAskedNote, duplicate: duplicateByLink, names: drawnBarNames, paintNames: paintBarNotes },
  trace: { create: createUndoTrace },          // 2026-11-20-1004z
  renamed: { follow: followRenamedDescription },          // 2026-11-20-1005 (F9)
  waiting: { line: waitingLine, words: waitingWords, translate: translateRequest, kept: keptMessage, is: isWaitingLine, already: alreadyWaiting, blocked: blockedMessage, tail: blockedTail },          // 2026-11-21-1015 (Part C)
  script: { on: true, forge: forgeText },          // 2026-11-23-1023: the Forge button
  groups: { carry: carryGroups, drop: dropGroups, write: writeNoteGroups, create: createGroups, command: popCommand },          // 2026-11-27-1050 (the prompt stack)
  dialogs: { renamed: dialogRenamed, deleted: dialogDeleted, ctime: noteCtimeOf, fresh: dialogFresh, stamp: dialogStamp, prune: dialogPrune },          // 2026-11-21-1011
  review: { create: createReview, track: createTracker },          // 2026-11-20-1004
  service: { fields: linesRequestFields, read: readLinesAnswer, version: LINES_SERVICE_VERSION, ask: askLinesNote, askBar: askLinesBar },          // 2026-11-20-1003
};
