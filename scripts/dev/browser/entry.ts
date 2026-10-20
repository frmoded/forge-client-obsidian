// Mounts the REAL RhythmEditView in a pane carrying Obsidian's own app.css and the plugin's styles.css, with the real widget iframe, the real live-score area, the real music
// edition (Verovio) — and the real engine behind /compute.
import { TFile } from 'obsidian';
import { RhythmEditView } from '@client/rhythm-edit-view.ts';

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

(window as any).__mountTab = async (pane: HTMLElement, opts: { note: string; widget: string; toml: string | null }) => {
  (globalThis as any).__WIDGET_HTML = opts.widget;
  const file = new TFile('bars/bar_001.md');
  let noteText = opts.note;
  const app: any = {
    vault: {
      read: async () => noteText,
      on: () => ({}),
      process: async (_f: unknown, fn: (s: string) => string) => { noteText = fn(noteText); },
      adapter: {
        exists: async (p: string) => p === 'forge.toml' && opts.toml !== null,
        read: async (p: string) => { if (p === 'forge.toml' && opts.toml !== null) return opts.toml; throw new Error('no ' + p); },
      },
    },
    metadataCache: {},
    workspace: {},
  };
  const leaf: any = { app, contentEl: pane };
  const view: any = new RhythmEditView(leaf, { setMark() {}, isDefaultViewEnabled: () => true, createNewNote() {}, toggleEdgesPanel() {} } as any);
  view.file = file;
  (window as any).__view = view;
  (window as any).__note = () => noteText;
  await view.onOpen();
  await view.onLoadFile(file);
  return true;
};
