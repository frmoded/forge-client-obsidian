// FULL implementation of the list-model seam (see ListModel in music-edition.ts): the real cores. Bundled by the music edition and by every unbundled test (the committed selector points here); the lean build never
// reaches this module, so none of the cores is in lean's main.js.
import type { ListModel } from './music-edition.ts';
import { createBarList } from './bar-list-controller.ts';
import { createBarBoxHost } from './bar-box-host-core.ts';
import { withBarLines } from './bar-list-note-core.ts';
import { barInsertion, barNumberOf, barWordVerb, duplicatePreviewLine, idParts, linkInsertion, readActionText, resolveDuplicateTarget } from './duplicate-sentence-core.ts';
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
import { LIST_MODEL_SENTINEL_DID_YOU_MEAN_CORE, offerRepair, placeWordSentence } from './did-you-mean-core.ts';
import { LIST_MODEL_SENTINEL_TYPED_STEP_CORE, applyTyped, previewTyped } from './typed-step-core.ts';
import { LIST_MODEL_SENTINEL_UNDO_TRACE_CORE, createUndoTrace } from './undo-trace-core.ts';
import { LIST_MODEL_SENTINEL_RENAME_FOLLOW_CORE, followRenamedDescription } from './rename-follow-core.ts';
import { ASK_ONCE, LIST_MODEL_SENTINEL_SCRIPT_EDIT_CORE, SCRIPT_LABELS, heldMessage, rewriteFromScript, staleMessage } from './script-edit-core.ts';
import { LIST_MODEL_SENTINEL_WAITING_LINE_CORE, isWaitingLine, keptMessage, translateRequest, waitingLine, waitingWords } from './waiting-line-core.ts';
import { LIST_MODEL_SENTINEL_DIALOG_FOLLOW_CORE, dialogDeleted, dialogFresh, dialogPrune, dialogRenamed, dialogStamp, noteCtimeOf } from './dialog-follow-core.ts';
import { LIST_MODEL_SENTINEL_RENAME_DESCRIPTION_CORE } from './rename-description-core.ts';
import { LIST_MODEL_SENTINEL_FAILED_PROMPT_CORE } from './failed-prompt-core.ts';
import { LIST_MODEL_SENTINEL_FAILED_PROMPT_STORE } from './failed-prompt-store.ts';
import { LIST_MODEL_SENTINEL_FAILED_PROMPT_TAB_DOM } from './failed-prompt-tab-dom.ts';
import { LIST_MODEL_SENTINEL_FAILED_PROMPT_SETUP_CORE, createReview, createTracker } from './failed-prompt-setup-core.ts';
import { LIST_MODEL_SENTINEL_SERVICE_LINES_CORE, LINES_SERVICE_VERSION, askLinesBar, askLinesNote, linesRequestFields, readLinesAnswer } from './service-lines-core.ts';

export const listModel: ListModel = {
  present: true,
  cores: [
    LIST_MODEL_SENTINEL_BAR_LIST_CONTROLLER, LIST_MODEL_SENTINEL_BAR_LIST_CORE, LIST_MODEL_SENTINEL_BAR_GRAMMAR_CORE, LIST_MODEL_SENTINEL_BAR_BOX_HOST_CORE, LIST_MODEL_SENTINEL_BAR_LIST_NOTE_CORE,
    LIST_MODEL_SENTINEL_DUPLICATE_SENTENCE_CORE, LIST_MODEL_SENTINEL_DUPLICATE_NOTE_CORE, LIST_MODEL_SENTINEL_DUPLICATE_UNDO_CORE,
    LIST_MODEL_SENTINEL_PHRASE_STEPS_LINEAGE_CORE, LIST_MODEL_SENTINEL_DID_YOU_MEAN_CORE, LIST_MODEL_SENTINEL_TYPED_STEP_CORE, LIST_MODEL_SENTINEL_SERVICE_LINES_CORE, LIST_MODEL_SENTINEL_UNDO_TRACE_CORE, LIST_MODEL_SENTINEL_RENAME_FOLLOW_CORE, LIST_MODEL_SENTINEL_DIALOG_FOLLOW_CORE, LIST_MODEL_SENTINEL_WAITING_LINE_CORE, LIST_MODEL_SENTINEL_SCRIPT_EDIT_CORE, LIST_MODEL_SENTINEL_RENAME_DESCRIPTION_CORE, LIST_MODEL_SENTINEL_FAILED_PROMPT_CORE, LIST_MODEL_SENTINEL_FAILED_PROMPT_STORE, LIST_MODEL_SENTINEL_FAILED_PROMPT_TAB_DOM, LIST_MODEL_SENTINEL_FAILED_PROMPT_SETUP_CORE,
  ],
  createBarList,
  createBarBoxHost,
  withBarLines,
  duplicate: { readActionText, barWordVerb, barNumberOf, barInsertion, linkInsertion, idParts, resolveDuplicateTarget, duplicatePreviewLine, copyNoteText, createdLine, duplicateNote, undoCopy },
  steps: { annotate: annotateWithSteps, lineageOf: stepLineageOf },
  typed: { preview: previewTyped, apply: applyTyped },
  repair: { offer: offerRepair, placeWords: placeWordSentence },
  trace: { create: createUndoTrace },          // 2026-11-20-1004z
  renamed: { follow: followRenamedDescription },          // 2026-11-20-1005 (F9)
  waiting: { line: waitingLine, words: waitingWords, translate: translateRequest, kept: keptMessage, is: isWaitingLine },          // 2026-11-21-1015 (Part C)
  script: { on: true, stale: staleMessage, held: heldMessage, askOnce: ASK_ONCE, labels: SCRIPT_LABELS, rewrite: rewriteFromScript },          // 2026-11-22-1016 (11i)
  dialogs: { renamed: dialogRenamed, deleted: dialogDeleted, ctime: noteCtimeOf, fresh: dialogFresh, stamp: dialogStamp, prune: dialogPrune },          // 2026-11-21-1011
  review: { create: createReview, track: createTracker },          // 2026-11-20-1004
  service: { fields: linesRequestFields, read: readLinesAnswer, version: LINES_SERVICE_VERSION, ask: askLinesNote, askBar: askLinesBar },          // 2026-11-20-1003
};
