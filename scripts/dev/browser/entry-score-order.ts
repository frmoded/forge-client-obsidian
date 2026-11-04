// 2026-11-03-1155-93: every score-first tab kind in ONE page, to measure what sits where: the Beat Box tab (entry.ts: the real RhythmEditView), the phrase tab (entry-phrase.ts: the real mountPhrase), and here the
// REAL ArrangementView and CompositionView over an in-memory vault, with the engine behind /phrase (stub-phrase-engine.ts).
import './entry-m4.ts';
import './entry-phrase.ts';
import { TFile } from 'obsidian';
import { ArrangementView } from '@client/kits-arrangements.ts';
import { CompositionView } from '@client/compositions.ts';

async function mountView(make: (leaf: any) => any, pane: HTMLElement, opts: { files: Record<string, string>; path: string }): Promise<void> {
  const files = new Map(Object.entries(opts.files));
  const handlers = new Map<string, (f: any) => void>();
  const tf = (p: string) => new TFile(p);
  const app: any = {
    vault: {
      read: async (f: any) => { const t = files.get(f.path); if (t === undefined) throw new Error('File not found'); return t; },
      on: (name: string, cb: (f: any) => void) => { handlers.set(name, cb); return {}; },
      getAbstractFileByPath: (p: string) => (files.has(p) ? tf(p) : null),
      getFiles: () => [...files.keys()].map(tf),
      process: async (f: any, fn: (t: string) => string) => { ((window as any).__processed ??= []).push(f.path); files.set(f.path, fn(files.get(f.path) ?? '')); },       // a write the view makes (recorded: the 1160 measure asks whether a click wrote)
      adapter: { exists: async () => false, read: async () => { throw new Error('no'); } },
    },
    metadataCache: {}, workspace: {},
  };
  const leaf: any = { app, contentEl: pane, setViewState: async () => {} };
  const view = make(leaf);
  view.file = tf(opts.path);
  (window as any).__view = view;
  (window as any).__files = files;
  (window as any).__modify = (p: string, text?: string) => { if (text !== undefined) files.set(p, text); handlers.get('modify')?.(tf(p)); };
  await view.onOpen();
  await view.onLoadFile(view.file);
}
// The hooks a tab with a notes pane beside it has (a chip strip and a pinned row): the harness answers them with nothing, so the strip and the inspector are on the page as they are in a pair.
const hooks = { goto: async () => false, onNotesNavigated: () => () => {} };
(window as any).__mountArrangement = (pane: HTMLElement, opts: { files: Record<string, string>; path: string }) => mountView((leaf) => new ArrangementView(leaf, 'score', hooks as any, () => {}, () => {}), pane, opts);
(window as any).__mountComposition = (pane: HTMLElement, opts: { files: Record<string, string>; path: string }) => mountView((leaf) => new CompositionView(leaf, 'score', hooks as any, () => {}, () => {}), pane, opts);
