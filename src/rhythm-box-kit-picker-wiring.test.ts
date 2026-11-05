// 2026-11-05-1181 (M10c) - the Beat Box tab of a SCORE-FIRST vault gives its widget the vault's kits; any other vault's tab gives it none. The plugin is the REAL one in BOTH editions (the real bundle's onload and the real
// RhythmEditView built through the view factory onload registered), against a host-faithful stand-in for Obsidian (test-support/*): the tab is loaded the way Obsidian loads it (onLoadFile), the widget answers with its
// `ready` message, and what the tab posts back is read. The widget page itself is tested in rhythm-box-kit-picker.test.ts; this file pins that the HOST sends the list, to the right vaults only.
import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { loadRealOnload, type LoadedPlugin } from './test-support/real-onload.ts';
import { newKitNote } from './kit-core.ts';
import { RHYTHM_BOX_WIDGET_PATH } from './rhythm-edit-core.ts';
import { widgetHtml, skip } from './test-support/rhythm-widget-harness.ts';

const BAR = `---\ntype: data\ncontent_type: json\ndescription: "bar_001"\n---\n\n\`\`\`json\n${JSON.stringify({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: new Array(16).fill(false), snare: new Array(16).fill(false) } }, null, 2)}\n\`\`\`\n`;
const ROCK = newKitNote({ kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] });
const LATIN = newKitNote({ kind: 'kit', name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] });
const SCORE_FIRST_TOML = 'name = "playground"\nprofile = "score_first"\n';
const tick = () => new Promise((r) => setTimeout(r, 30));

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin; let plugin: LoadedPlugin; let doc: any; let win: any;
  const P = (s: string) => `[${edition}] ${s}`;
  before(async () => {
    win = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
    doc = win.document;
    real = await bundleRealPlugin(process.cwd(), edition);
    // the stand-in base class of the Beat Box tab: what Obsidian's FileView gives a subclass that the tab's own code calls
    const EV = real.EditableFileView.prototype as any;
    EV.addAction = () => doc.createElement('button');
    EV.register = () => {};
    EV.onLoadFile = async () => {}; EV.onOpen = async () => {}; EV.registerEvent = () => {};
    plugin = await loadRealOnload(real, vaultOf({ scoreFirst: false, kits: [] }).app);
  });

  /** A vault: forge.toml (score-first or not), the bar, and the given kit notes; `files` is what getFiles() lists. */
  function vaultOf(opts: { scoreFirst: boolean; kits: Array<[string, string]>; kitReadFails?: boolean }) {
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: p.replace(/^.*\//, '').replace(/\.md$/, '') });
    const text = new Map<string, string>([['bars/bar_001.md', BAR], [RHYTHM_BOX_WIDGET_PATH, widgetHtml], ...opts.kits.map(([n, t]) => [`kits/${n}.md`, t] as [string, string])]);
    const files = new Map([...text.keys()].map((p) => [p, tf(p)]));
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => p === 'forge.toml', read: async (p: string) => (p === 'forge.toml' ? (opts.scoreFirst ? SCORE_FIRST_TOML : 'name = "plain"\n') : '') },
        on: () => ({}), configDir: '.obsidian',
        getFiles: () => [...files.values()],
        getMarkdownFiles: () => [...files.values()],
        getAbstractFileByPath: (p: string) => files.get(p) ?? null,
        read: async (f: any) => { if (opts.kitReadFails && /^kits\//.test(f.path)) throw new Error('disk gone'); return text.get(f.path) ?? ''; },
      },
      workspace: { onLayoutReady: () => {}, on: () => ({}), getLeavesOfType: () => [], getActiveViewOfType: () => null, getActiveFile: () => null },
      metadataCache: { on: () => ({}), getFileCache: () => ({ frontmatter: { type: 'data' } }) }, plugins: {},
    };
    return { app, file: files.get('bars/bar_001.md')! };
  }

  /** Open the bar in a REAL Beat Box tab and play the widget's part: wait for the iframe, answer with `ready`. Returns what the tab posted into the widget. */
  async function openBeatBox(v: ReturnType<typeof vaultOf>): Promise<{ loads: any[]; view: any }> {
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });   // both editions' hooks ran first: the globals are THIS edition's window while its tab runs
    real.messageDelivery.resetForTests();
    plugin.target.app = v.app;
    const posted: any[] = [];
    const view = plugin.views.get('forge-rhythm-edit')!({}) as any;
    const contentEl: any = doc.createElement('div'); doc.body.appendChild(contentEl);
    contentEl.empty = () => { contentEl.innerHTML = ''; };
    contentEl.addClass = (c: string) => contentEl.classList.add(c);
    contentEl.createEl = (tag: string, o: { cls?: string } = {}) => {
      const el: any = doc.createElement(tag); if (o.cls) el.className = o.cls; contentEl.appendChild(el);
      if (tag === 'iframe') Object.defineProperty(el, 'contentWindow', { value: { postMessage: (m: unknown) => { posted.push(JSON.parse(JSON.stringify(m))); } }, configurable: true });
      return el;
    };
    contentEl.createDiv = (o: { cls?: string } = {}) => contentEl.createEl('div', o);
    Object.assign(view, { app: v.app, contentEl, file: v.file, leaf: { view } });
    const saved = { log: console.log, info: console.info, debug: console.debug, warn: console.warn };
    console.log = console.info = console.debug = console.warn = () => {};
    try {
      await view.onOpen();
      await view.onLoadFile(v.file);
      await tick();
      const iframe = contentEl.querySelector('iframe');
      assert.ok(iframe, 'the tab built the widget iframe');
      // the widget says ready; the tab answers with the load message
      win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'forge-rhythm-ready' }, source: iframe.contentWindow }));
      await tick();
    } finally { Object.assign(console, saved); }
    return { loads: posted.filter((m) => m && m.type === 'forge-rhythm-load'), view };
  }

  test(P('a score-first vault: the Beat Box tab sends the widget its kits - rock first, each with its channels - on the load, and the bar JSON is untouched'), { skip }, async () => {
    const { loads, view } = await openBeatBox(vaultOf({ scoreFirst: true, kits: [['latin', LATIN], ['rock', ROCK]] }));
    assert.equal(loads.length, 1);
    assert.deepEqual(loads[0].kits, [
      { name: 'rock', channels: ['kick', 'snare', 'hihat'] },
      { name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] },
    ]);
    assert.deepEqual(Object.keys(loads[0].data.channels), ['kick', 'snare'], 'the bar the widget is given is the bar on disk: no kit in it');
    assert.equal(loads[0].noteName, 'bar_001');
    void view;
  });

  test(P('P3: any other vault: the load has no `kits` key at all (even when kit notes sit in it) - the widget is exactly what it was'), { skip }, async () => {
    const { loads } = await openBeatBox(vaultOf({ scoreFirst: false, kits: [['latin', LATIN], ['rock', ROCK]] }));
    assert.equal(loads.length, 1);
    assert.equal('kits' in loads[0], false);
    assert.deepEqual(Object.keys(loads[0]).sort(), ['autoHeight', 'data', 'noteName', 'type']);
  });

  test(P('a score-first vault with no kit notes sends no `kits` (no dropdown, as today); a kit that cannot be read does not stop the Beat Box loading'), { skip }, async () => {
    const none = await openBeatBox(vaultOf({ scoreFirst: true, kits: [] }));
    assert.equal(none.loads.length, 1);
    assert.equal('kits' in none.loads[0], false);
    const errors: string[] = []; const savedErr = console.error; console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
    let broken;
    try { broken = await openBeatBox(vaultOf({ scoreFirst: true, kits: [['rock', ROCK]], kitReadFails: true })); } finally { console.error = savedErr; }
    assert.equal(broken.loads.length, 1, 'the bar still loads');
    assert.equal('kits' in broken.loads[0], false);
    assert.ok(errors.some((e) => /RhythmEditView\.readKits/.test(e)), `the failure is logged with the method name: ${errors.join(' | ')}`);
  });

  test(P('a reload sends the kit list again, fresh: a kit made since the tab opened is offered on the next load'), { skip }, async () => {
    const kits: Array<[string, string]> = [['rock', ROCK]];
    const v = vaultOf({ scoreFirst: true, kits });
    const { loads, view } = await openBeatBox(v);
    assert.deepEqual(loads[0].kits.map((k: any) => k.name), ['rock']);
    // a kit note appears, the widget asks again (a reload)
    const tf = Object.assign(new real.TFile(), { path: 'kits/latin.md', extension: 'md', basename: 'latin' });
    const vault = v.app.vault; const getFiles = vault.getFiles; const read = vault.read;
    vault.getFiles = () => [...getFiles(), tf]; vault.read = async (f: any) => (f.path === 'kits/latin.md' ? LATIN : read(f));
    const iframe = view.iframe;
    const again: any[] = [];
    iframe.contentWindow.postMessage = (m: unknown) => { again.push(JSON.parse(JSON.stringify(m))); };
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'forge-rhythm-ready' }, source: iframe.contentWindow }));
    await tick();
    assert.deepEqual(again.filter((m) => m.type === 'forge-rhythm-load')[0].kits.map((k: any) => k.name), ['rock', 'latin']);
  });
}
