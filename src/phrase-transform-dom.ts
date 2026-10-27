// 2026-10-27-1030 (M14 slice 1) - the strip of a TRANSFORM tab: plain DOM, no obsidian import. Read-only: a transform is made and unmade by the notebook below the Score, so this names the source phrase (a button that opens it) and lists
// the ops in words. Same group, same status line as the other strips (phrase-dom.ts), so the tab looks like its siblings.
import { transformOpWords } from './phrase-words-core.ts';
import type { PhraseParams } from './phrase-core.ts';

export interface TransformStrip {
  readonly el: HTMLElement;
  set(params: PhraseParams | null): void;
  setStatus(text: string): void;
  dispose(): void;
}

export function mountTransformStrip(parent: HTMLElement, ports: { openSource?(sourceNoteId: string): void }): TransformStrip {
  const doc = parent.ownerDocument;
  const el = doc.createElement('div');
  el.className = 'forge-phrase-controls forge-transform-strip';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Phrase');
  const head = doc.createElement('div');
  const label = doc.createElement('span'); label.className = 'forge-transform-label';
  const ops = doc.createElement('ul'); ops.className = 'forge-transform-ops';
  const status = doc.createElement('span'); status.className = 'forge-phrase-status'; status.setAttribute('role', 'status');
  head.appendChild(label);
  el.append(head, ops, status);
  parent.appendChild(el);
  let source: HTMLButtonElement | null = null;
  let sourceId = '';
  return {
    el,
    set(params) {
      source?.remove();
      ops.textContent = '';
      if (!params || params.kind !== 'transform') { label.textContent = 'This transform could not be read.'; return; }
      label.textContent = 'Transform of';
      sourceId = params.source;
      const name = params.source.split('/').pop() ?? params.source;
      source = doc.createElement('button');
      source.type = 'button';
      source.className = 'forge-phrase-source';
      source.textContent = name;
      source.setAttribute('aria-label', `Open ${name}`);
      source.addEventListener('click', () => { ports.openSource?.(sourceId); });
      head.appendChild(source);
      for (const o of params.ops) { const li = doc.createElement('li'); li.textContent = transformOpWords(o); ops.appendChild(li); }
    },
    setStatus(text) { status.textContent = text; },
    dispose() { el.remove(); },
  };
}
