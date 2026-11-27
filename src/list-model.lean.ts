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
    discard() {},
    reset() {},
    dispose() {},
  }),
  createBarBoxHost: () => null,
  melody: { read: () => null, template: () => '', names: (app, folder) => app.vault.getFiles().filter((f) => f.path.startsWith(`${folder}/`) && app.metadataCache?.getFileCache?.(f as never)?.frontmatter?.melody === true).map((f) => f.basename), mark() {} },          // 2026-11-23-1030: lean has no melody bar
  withBarLines: (text) => text,
  duplicate: {
    readActionText: () => ({ kind: 'none' }),
    barNumberOf: () => null,
    barClickText: () => ({ need: 'bar' }),
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
  typed: { preview: () => null, apply: () => null },     // 2026-11-20-1002: lean reads no step sentence (Undo is the grammar's to refuse, as before) and offers no "did you mean" (the bare message stays)
  repair: { offer: async () => null, placeWords: () => false, notAsked: () => '', duplicate: () => null, names: () => null, paintNames: () => 0 },
  trace: { create: () => ({ record() {}, entries: () => [] }) },          // 2026-11-20-1004z: lean keeps no trace
  renamed: { follow: async () => {} },          // 2026-11-20-1005: lean has none of these notes
  waiting: { line: () => null, words: () => null, translate: () => null, kept: () => '', is: () => false, already: () => '', blocked: () => '', tail: () => '' },          // 2026-11-21-1015: lean makes and reads no waiting line
  script: { on: false, forge: () => ({ ok: false, message: '' }) },          // 2026-11-23-1023: lean has no Forge button
  dialogs: { renamed() {}, deleted() {}, ctime: () => undefined, fresh: () => true, stamp() {}, prune() {} },          // 2026-11-21-1011: lean keeps no per-note history to move, drop or date
  review: { create: () => null, track: () => null },          // 2026-11-20-1004: lean keeps nothing and has no review tab
  service: { fields: () => null, read: async () => ({ kind: 'legacy' }), version: '', ask: async (io) => io.legacy(await io.askPlan(io.payload)), askBar: async () => null },          // 2026-11-20-1003: lean adds nothing to a request and reads every answer as it always did
};
