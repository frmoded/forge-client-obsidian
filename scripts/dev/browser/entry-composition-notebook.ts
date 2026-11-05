// 2026-11-05-1183 (M17c): the REAL CompositionView (src/compositions.ts) in a pane carrying Obsidian's own app.css and the plugin's styles.css, with the real live Score (Verovio, the music edition), the real notebook component below
// it, the real notebook core over an in-memory vault, and the real engine behind /phrase. The ONLY double is the planning service (`__answer`): a proof never calls forge-transpile.
import { TFile } from 'obsidian';
import { CompositionView } from '@client/compositions.ts';
import { createNotebook } from '@client/notebook-core.ts';

const proto: any = HTMLElement.prototype;
const apply = (el: HTMLElement, o: any) => {
  if (!o) return el;
  if (o.cls) String(o.cls).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
  if (o.text != null) el.textContent = o.text;
  if (o.attr) Object.keys(o.attr).forEach((k) => el.setAttribute(k, String(o.attr[k])));
  return el;
};
proto.createEl = function (tag: string, o?: any) { const e = document.createElement(tag); apply(e, o); this.appendChild(e); return e; };
proto.createDiv = function (o?: any) { return this.createEl('div', o); };
proto.createSpan = function (o?: any) { return this.createEl('span', o); };
proto.empty = function () { this.innerHTML = ''; };
proto.addClass = function (c: string) { this.classList.add(c); };
proto.removeClass = function (c: string) { this.classList.remove(c); };
proto.toggleClass = function (c: string, on: boolean) { this.classList.toggle(c, !!on); };
proto.setText = function (t: string) { this.textContent = t; };

(window as any).__mountComposition = async (pane: HTMLElement, opts: { files: Record<string, string>; path: string }) => {
  const w = window as any;
  const store = new Map<string, string>(Object.entries(opts.files));
  w.__store = store; w.__opened = []; w.__asked = []; w.__notices = []; w.__lines = [];
  const handlers: Record<string, Array<(f: { path: string }) => void>> = {};
  const fire = (name: string, path: string) => { for (const fn of handlers[name] ?? []) fn({ path }); };
  const tf = (p: string) => new TFile(p);
  const app: any = {
    vault: {
      read: async (f: any) => store.get(f.path) ?? '',
      getFiles: () => [...store.keys()].map(tf),
      getAbstractFileByPath: (p: string) => (store.has(p) ? tf(p) : null),
      on: (name: string, fn: (f: { path: string }) => void) => { (handlers[name] ??= []).push(fn); return {}; },
      process: async (f: any, fn: (t: string) => string) => { store.set(f.path, fn(store.get(f.path) ?? '')); fire('modify', f.path); },
      create: async (p: string, c: string) => { if (store.has(p)) throw new Error('File already exists.'); store.set(p, c); const f = tf(p); fire('create', p); return f; },
      createFolder: async () => {},
      adapter: { exists: async () => false, read: async () => '' },
    },
    workspace: {}, metadataCache: {},
  };
  const notebookFor = (file: TFile, chip: (s: any) => string | null) => ({
    notebook: createNotebook<TFile>({
      sourcePhrase: file.path.replace(/\.md$/, ''),
      chip,
      activePath: () => file.path,
      folderExists: (folder) => [...store.keys()].some((p) => p.startsWith(`${folder}/`)),
      createFolder: async (folder) => { store.set(`${folder}/README.md`, `${folder}\n`); },
      listPhraseBasenames: () => [...store.keys()].filter((p) => p.startsWith('phrases/')).map((p) => p.replace(/^phrases\//, '').replace(/\.md$/, '')),
      listCellPaths: () => [...store.keys()].filter((p) => p.startsWith('notebook/')),
      exists: (p) => store.has(p),
      read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('File not found'); return t; },
      create: (p, content) => app.vault.create(p, content),
      write: async (p, content) => { store.set(p, content); fire('modify', p); },
      remove: async (p) => { store.delete(p); fire('delete', p); },
      open: async (f) => { w.__opened.push(f.path); },
      notify: (m) => { w.__notices.push(m); },
      isAlreadyExists: (e) => /already exists/i.test(String((e as Error)?.message ?? e)),
      trace: (l) => { w.__lines.push(l); },
      ask: async (payload) => { w.__asked.push(payload); return w.__answer ?? { status: 0, json: { detail: 'no service in this proof' } }; },
      ownKey: () => undefined,
      listBarBasenames: () => [...store.keys()].filter((p) => p.startsWith('bars/')).map((p) => p.replace(/^bars\//, '').replace(/\.md$/, '')),
      serviceVersion: async () => '0.2.45',
      preflight: async () => null,
    }),
    trace: (l: string) => { w.__lines.push(l); },
    openPhrase: (p: string) => { w.__opened.push(p); },
  });
  const leaf: any = { app, contentEl: pane };
  const structure: any = { goto: async () => false, onNotesNavigated: () => () => {}, trace: () => {} };
  const view: any = new CompositionView(leaf, 'score', structure, (id: string) => { w.__opened.push(`${id}.md`); }, undefined, notebookFor as never);
  const file = tf(opts.path);
  view.file = file;
  w.__view = view;
  await view.onOpen();
  await view.onLoadFile(file);
  return true;
};
