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
import { LIST_MODEL_SENTINEL_DID_YOU_MEAN_CORE, offerRepair } from './did-you-mean-core.ts';
import { LIST_MODEL_SENTINEL_TYPED_STEP_CORE, applyTyped, previewTyped } from './typed-step-core.ts';

export const listModel: ListModel = {
  present: true,
  cores: [
    LIST_MODEL_SENTINEL_BAR_LIST_CONTROLLER, LIST_MODEL_SENTINEL_BAR_LIST_CORE, LIST_MODEL_SENTINEL_BAR_GRAMMAR_CORE, LIST_MODEL_SENTINEL_BAR_BOX_HOST_CORE, LIST_MODEL_SENTINEL_BAR_LIST_NOTE_CORE,
    LIST_MODEL_SENTINEL_DUPLICATE_SENTENCE_CORE, LIST_MODEL_SENTINEL_DUPLICATE_NOTE_CORE, LIST_MODEL_SENTINEL_DUPLICATE_UNDO_CORE,
    LIST_MODEL_SENTINEL_PHRASE_STEPS_LINEAGE_CORE, LIST_MODEL_SENTINEL_DID_YOU_MEAN_CORE, LIST_MODEL_SENTINEL_TYPED_STEP_CORE,
  ],
  createBarList,
  createBarBoxHost,
  withBarLines,
  duplicate: { readActionText, barWordVerb, barNumberOf, barInsertion, linkInsertion, idParts, resolveDuplicateTarget, duplicatePreviewLine, copyNoteText, createdLine, duplicateNote, undoCopy },
  steps: { annotate: annotateWithSteps, lineageOf: stepLineageOf },
  typed: { preview: previewTyped, apply: applyTyped },
  repair: { offer: offerRepair },
};
