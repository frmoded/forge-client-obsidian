// LEAN implementation of the list-model seam (see ListModel in music-edition.ts): no list model. The lean edition has no Score and no composer to type a list into, so the shared composer path asks these stubs and gets
// what lean answered before the list model existed: no sentence is an action, no bar has a list, no Beat Box host is made (the tab writes through its autosave), nothing can be copied. This module imports NO core: that is
// the whole point (scripts/build-main.test.mjs greps the lean bundle for every core's sentinel).
import type { ListModel } from './music-edition.ts';

const NOT_IN_LEAN = 'The list model is part of the music edition of the plugin.';

export const listModel: ListModel = {
  present: false,
  cores: [],
  createBarList: () => ({
    appendBar: async () => ({ ok: false, message: NOT_IN_LEAN, reason: 'refused' }),
    previewBar: async () => ({ ok: false, message: NOT_IN_LEAN }),
    applyBar: async () => ({ ok: false, message: NOT_IN_LEAN }),
    stepBar: async () => ({ ok: false, message: NOT_IN_LEAN }),
    canStepBar: () => false,
    evaluateBar: async () => {},
    canonicalOf: () => null,
    reset() {},
    dispose() {},
  }),
  createBarBoxHost: () => null,
  withBarLines: (text) => text,
  duplicate: {
    readActionText: () => ({ kind: 'none' }),
    barWordVerb: () => null,
    barNumberOf: () => null,
    barInsertion: (before) => before,
    linkInsertion: () => '',
    idParts: () => null,
    resolveDuplicateTarget: () => ({ ok: false, message: NOT_IN_LEAN }),
    duplicatePreviewLine: () => '',
    copyNoteText: () => ({ ok: false, message: NOT_IN_LEAN }),
    createdLine: () => '',
    duplicateNote: async () => ({ ok: false, message: NOT_IN_LEAN }),
    undoCopy: async (_ports, mark) => ({ state: 'failed', message: `${mark.name} was not moved to the trash: ${NOT_IN_LEAN}` }),
  },
  steps: { annotate: () => null, lineageOf: () => [] },          // 2026-11-20-1000: lean has no Score: nothing is tied through steps
};
