// M5 (drain 2026-10-22-1850): the phrase surface in real Chrome — the REAL phrase DOM (control strip + live Score area), the real music edition (Verovio + html-midi-player), and the REAL engine
// behind /phrase (the bundled Pyodide engine, in Node). Exposes what the measurement needs: mount, the vault stand-in, Verovio's own render (timeMap) for the same XML.
import { mountPhrase } from '@client/phrase-dom.ts';
import { musicEdition } from '@client/music-edition.full.ts';        // the music edition itself (the build's ./music-edition-selected redirect only catches relative imports)
import { renderMusicXMLAndMIDI } from '@client/verovio.ts';

const proto: any = HTMLElement.prototype;         // the Obsidian DOM helpers the music edition's renderer uses
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

const PATH = 'phrases/phrase_001.md';
(window as any).__mountPhrase = async (parent: HTMLElement, opts: { phrase: string; bar: string; plan?: 'score' | 'lean-note' }) => {
  const files = new Map<string, string>([[PATH, opts.phrase], ['bars/bar_005.md', opts.bar]]);
  (window as any).__files = files;
  let handle: any;
  handle = mountPhrase(parent, {
    path: PATH, title: 'phrase_001', plan: opts.plan ?? 'score',
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async (params) => {
      const { applyPhraseWrite } = await import('@client/phrase-core.ts');
      const w = applyPhraseWrite(files.get(PATH)!, params);
      if (w.ok === false) return w;
      files.set(PATH, w.text);
      queueMicrotask(() => handle.noteModified(PATH));            // Obsidian's vault `modify` for our own write
      return { ok: true };
    },
    compute: async (data, params, title) => {
      const r = await fetch('/phrase', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data, params, title }) });
      const out = await r.json();
      if (out.__error) throw new Error(out.__error);
      return out.payload;
    },
    inspector: { openNote: (id) => { ((window as any).__opened ??= []).push(id); } },   // M6: the lineage links, the bracket and the source link report which note they would open
    renderInto: (host, payload) => musicEdition.renderTaggedMusicXML(host, payload, 'phrase_001'),
    stopPlayers: (host) => musicEdition.stopPlayers(host, (m, e) => console.error(m, e)),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (h) => window.clearTimeout(h as number),
  });
  (window as any).__phrase = handle;
  await handle.load();
};
(window as any).__edit = (path: string, text: string) => { (window as any).__files.set(path, text); (window as any).__phrase.noteModified(path); };
(window as any).__verovio = renderMusicXMLAndMIDI;
