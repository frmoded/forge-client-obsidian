// 2026-11-02-1155 (score_first M16b): a CUSTOM note on the real phrase tab in real Chrome - the REAL phrase DOM (strip, live Score area) with the REAL description bar above it (the banner), the real music edition (Verovio), and the REAL engine behind
// /phrase and /run (the plugin's Pyodide, in Node: the production `_forge_run_custom_bars` with its time limit and the production Score glue). The Obsidian DOM shims and the vault stand-in are entry-phrase.ts's.
import './entry-phrase.ts';
import { mountPhrase } from '@client/phrase-dom.ts';
import { mountDescriptionBar } from '@client/description-bar-dom.ts';
import { musicEdition } from '@client/music-edition.full.ts';
import { scoreClickPlays } from '@client/score-click-policy.ts';
import { CUSTOM_BANNER } from '@client/phrase-notes-core.ts';

(window as any).__mountCustom = async (parent: HTMLElement, opts: { note: string; bars: Record<string, string> }) => {
  const PATH = 'phrases/phrase_001.md';
  const files = new Map<string, string>([[PATH, opts.note]]);
  for (const [n, t] of Object.entries(opts.bars)) files.set(`bars/${n}.md`, t);
  (window as any).__files = files;
  const post = async (url: string, body: unknown) => (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  const heard: string[] = ((window as any).__heard = []);
  (window as any).__bar = mountDescriptionBar(parent, (a) => heard.push(a));
  (window as any).__bar.show({ message: CUSTOM_BANNER, actions: ['revert-generated'], tone: 'custom' });
  const handle = mountPhrase(parent, {
    path: PATH, title: 'phrase_001', plan: 'score', initial: opts.note,
    listBars: () => ['bar_005'],
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async () => { ((window as any).__writes ??= []).push('write'); return { ok: true }; },
    compute: async (data, params, title) => { const out = await post('/phrase', { data, params, title }); if (out.__error) throw new Error(out.__error); return out.payload; },
    runCustom: async (python, name, limitS) => { const t0 = performance.now(); const out = await post('/run', { python, name, limitS }); ((window as any).__runs ??= []).push({ ms: Math.round(performance.now() - t0), out }); return out; },
    renderInto: (host, payload) => musicEdition.renderTaggedMusicXML(host, payload, 'phrase_001', { clickToPlay: scoreClickPlays, trace: () => {} }),
    stopPlayers: (host) => musicEdition.stopPlayers(host, (m, e) => console.error(m, e)),
    setTimer: (fn, ms) => window.setTimeout(fn, ms), clearTimer: (h) => window.clearTimeout(h as number),
    structure: { goto: async () => false, onNotesNavigated: () => () => {} },
  });
  (window as any).__phrase = handle;
  await handle.load();
};
(window as any).__editCustom = (text: string) => { (window as any).__files.set('phrases/phrase_001.md', text); (window as any).__phrase.noteModified('phrases/phrase_001.md'); };
