// 2026-10-31-1100 (M17b): the structure strip of a COMPOSITION in real Chrome - the REAL tree DOM (composition-strip-dom.ts) over the REAL rows (composition-strip-core.ts treeRows) of a three-section composition whose last section is
// itself a composition, so a click is a real click and the indent is a real indent. No engine: what is measured is where the rows and chips are, what they look like and what a hover and a click tell the owner.
import { mountCompositionStrip } from '@client/composition-strip-dom.ts';
import { treeRows } from '@client/composition-strip-core.ts';
import type { CompositionParams, CompositionShape } from '@client/composition-core.ts';

(window as any).__mountStrip = (parent: HTMLElement) => {
  const p: CompositionParams = { kind: 'composition', sections: [{ source: 'phrases/phrase_003', length: 8 }, { source: 'arrangements/arr_001', length: 4, repeat: 2 }, { source: 'compositions/intro' }] };
  const shape: CompositionShape = { sections: [
    { index: 0, copy: 0, source: 'phrases/phrase_003', length: 8, bars: 8, first: 1 }, { index: 1, copy: 0, source: 'arrangements/arr_001', length: 4, bars: 4, first: 9 },
    { index: 1, copy: 1, source: 'arrangements/arr_001', length: 4, bars: 4, first: 13 }, { index: 1, copy: 2, source: 'arrangements/arr_001', length: 4, bars: 4, first: 17 }, { index: 2, copy: 0, source: 'compositions/intro', bars: 6, first: 21 },
  ] };
  const inner = { 'compositions/intro': { kind: 'composition' as const, sections: [{ source: 'phrases/phrase_004', length: 4 }, { source: 'phrases/phrase_009' }] } };
  const events: string[] = ((window as any).__events = []);
  const strip = mountCompositionStrip(parent, { onHover: (r) => events.push(`hover ${r ? r.noteId : 'none'}`), onClick: (r) => { events.push(`click ${r.noteId}`); strip.emphasise([r.noteId]); } });
  strip.show(treeRows(p, shape, inner));
};
