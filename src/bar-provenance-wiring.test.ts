// 2026-11-05-1182 (M17a) - the bar's provenance on the REAL wiring, both editions: the real ForgePlugin.onload from the real bundle and the real Beat Box tab. (1) The Beat Box SAVE of a bar that carries its sections keeps them current
// in the same write (the widget's `forge-rhythm-save` message through the tab's autosave and vault.process); a bar that carries none is written exactly as before (P3). (2) The REAL "Refresh note links" command migrates the bars of a
// score-first vault (bars made by hand, an old-form fork, a bar made in the Beat Box), changes nothing on a second run, and keeps every json fence byte for byte. The rules are proven in bar-provenance-core.test.ts; this proves they are connected.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, before } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload, type LoadedPlugin } from './test-support/real-onload.ts';
import { RHYTHM_BOX_WIDGET_PATH, formatRhythmJson, readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';
import { barOriginOf, hasBarProvenance, withBarProvenance } from './bar-provenance-core.ts';
import { widgetHtml, skip } from './test-support/rhythm-widget-harness.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const row = (...on: number[]) => Array.from({ length: 16 }, (_, i) => on.includes(i));
const DATA = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: row(0, 8), snare: row(4, 12) } } as unknown as RhythmData;
const bar = (front = '') => `---\ntype: data\ncontent_type: json\n${front}---\n\n\`\`\`json\n${formatRhythmJson(DATA)}\n\`\`\`\n`;
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const REFRESH = 'refresh-note-links';
const fence = (t: string) => t.slice(t.indexOf('```json'));

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin; let plugin: LoadedPlugin; let win: any;
  const P = (s: string) => `[${edition}] ${s}`;
  before(async () => {
    win = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
    real = await bundleRealPlugin(process.cwd(), edition);
    const EV = real.EditableFileView.prototype as any;
    EV.addAction = () => win.document.createElement('button'); EV.register = () => {};
    EV.onLoadFile = async () => {}; EV.onOpen = async () => {}; EV.registerEvent = () => {};
  });

  function vaultOf(initial: Record<string, string>, toml: string | null) {
    const files = new Map<string, string>(Object.entries(initial));
    files.set(RHYTHM_BOX_WIDGET_PATH, widgetHtml);
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const processed: string[] = [];
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => p === 'forge.toml' && toml !== null, read: async (p: string) => (p === 'forge.toml' && toml !== null ? toml : '') },
        on: () => ({}), configDir: '.obsidian',
        getFiles: () => [...files.keys()].map(tf), getMarkdownFiles: () => [...files.keys()].map(tf),
        getAbstractFileByPath: (p: string) => (files.has(p) ? tf(p) : null),
        read: async (f: any) => files.get(f.path)!,
        process: async (f: any, fn: (t: string) => string) => { processed.push(f.path); files.set(f.path, fn(files.get(f.path)!)); },
        create: async () => {}, createFolder: async () => {},
      },
      workspace: { onLayoutReady: (cb: () => void) => { cb(); }, iterateAllLeaves: iterateAllLeavesLikeObsidian<unknown>(() => ({})), on: () => ({}), getLeavesOfType: () => [], getActiveFile: () => null, getActiveViewOfType: () => null },
      metadataCache: { on: () => ({}), getFileCache: () => ({ frontmatter: { type: 'data' } }) }, plugins: {},
    };
    return { app, files, processed, tf };
  }

  /** Open `bars/bar_001.md` in a REAL Beat Box tab and play the widget: ready, then one `forge-rhythm-save` with `data`; wait for the autosave to land in the vault. */
  async function saveFromBeatBox(initial: string, data: RhythmData, toml: string | null) {
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
    const v = vaultOf({ 'bars/bar_001.md': initial }, toml);
    plugin = await loadRealOnload(real, v.app);
    real.messageDelivery.resetForTests();
    plugin.target.app = v.app;
    const view = plugin.views.get('forge-rhythm-edit')!({}) as any;
    const contentEl: any = win.document.createElement('div'); win.document.body.appendChild(contentEl);
    contentEl.empty = () => { contentEl.innerHTML = ''; }; contentEl.addClass = (c: string) => contentEl.classList.add(c);
    contentEl.createEl = (tag: string, o: { cls?: string } = {}) => { const el: any = win.document.createElement(tag); if (o.cls) el.className = o.cls; contentEl.appendChild(el); if (tag === 'iframe') Object.defineProperty(el, 'contentWindow', { value: { postMessage: () => {} }, configurable: true }); return el; };
    contentEl.createDiv = (o: { cls?: string } = {}) => contentEl.createEl('div', o);
    const file = v.tf('bars/bar_001.md');
    Object.assign(view, { app: v.app, contentEl, file, leaf: { view } });
    const saved = { log: console.log, info: console.info, debug: console.debug, warn: console.warn };
    console.log = console.info = console.debug = console.warn = () => {};
    try {
      await view.onOpen(); await view.onLoadFile(file); await tick();
      const iframe = contentEl.querySelector('iframe');
      win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'forge-rhythm-ready' }, source: iframe.contentWindow })); await tick();
      win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'forge-rhythm-save', data }, source: iframe.contentWindow }));
      for (let waited = 0; waited < 3000 && v.processed.length === 0; waited += 50) await tick(50);
      await view.flush?.();
    } finally { Object.assign(console, saved); }
    return v;
  }

  const MORE: RhythmData = { ...DATA, tempo_bpm: 120, channels: { kick: row(0, 8), snare: row(4, 12), hihat: row(2, 6, 10, 14) } } as unknown as RhythmData;

  test(P('the Beat Box SAVE of a bar made in the Beat Box rewrites its sections in the same write: the new hits and tempo in the Description, the origin kept, the json the new data'), { skip }, async () => {
    const made = withBarProvenance(bar('description: "bar_001 — x."\n'), { kind: 'beatbox' }, DATA);
    assert.ok(hasBarProvenance(made));
    const v = await saveFromBeatBox(made, MORE, SCORE_FIRST_TOML);
    assert.deepEqual(v.processed, ['bars/bar_001.md'], 'one write');
    const after = v.files.get('bars/bar_001.md')!;
    assert.match(after, /\nBar made in the Beat Box; 8 hits in 16 steps, tempo 120\.\n/);
    assert.match(after, /\n# Recipe\n\nDraw the bar in the Beat Box\.\n\n```json\n/);
    assert.deepEqual(barOriginOf(after), { kind: 'beatbox' });
    const read = readRhythmNote(after);
    assert.ok(read.ok);
    if (read.ok) { assert.equal(read.value.data.tempo_bpm, 120); assert.deepEqual(Object.keys(read.value.data.channels), ['kick', 'snare', 'hihat']); }
    assert.ok(after.startsWith('---\ntype: data\ncontent_type: json\ndescription: "bar_001 — x."\n---\n'), 'the frontmatter lines are untouched');
  });

  test(P('a fork keeps its origin through a Beat Box save: still "Bar 9 of [[phrase_006]]", still linking the phrase'), { skip }, async () => {
    const fork = withBarProvenance(bar('forked_from: "[[phrase_006]]"\nforked_bar: 9\n'), { kind: 'fork', phrase: 'phrase_006', bar: 9 }, DATA);
    const v = await saveFromBeatBox(fork, MORE, SCORE_FIRST_TOML);
    const after = v.files.get('bars/bar_001.md')!;
    assert.match(after, /\nBar 9 of \[\[phrase_006\]\], forked to edit by hand\.\n/);
    assert.match(after, /^links:\n  - "\[\[phrase_006\]\]"$/m);
    assert.equal(readRhythmNote(after).ok, true);
  });

  test(P('P3: a bar that carries NO sections (every bar of any other vault, and an unmigrated one) is written by the Beat Box save exactly as before: only the json block changes'), { skip }, async () => {
    for (const toml of [null, 'name = "forge-tutorial"\nversion = "0.1.0"\ndescription = "x"\ndomains = []\n', SCORE_FIRST_TOML]) {
      const plain = bar('description: "bar_001 — x."\n');
      const v = await saveFromBeatBox(plain, MORE, toml);
      const after = v.files.get('bars/bar_001.md')!;
      assert.equal(after.slice(0, after.indexOf('```json')), plain.slice(0, plain.indexOf('```json')), `${toml === null ? 'no forge.toml' : toml.slice(0, 20)}: every byte above the fence`);
      assert.equal(hasBarProvenance(after), false);
      assert.equal((readRhythmNote(after) as { value: { data: RhythmData } }).value.data.tempo_bpm, 120);
    }
  });

  test(P('the REAL "Refresh note links" command migrates the bars of a score-first vault (made by hand, an old-form fork, made in the Beat Box); every json fence is byte for byte; a second run writes nothing'), async () => {
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
    const madeInBeatBox = withBarProvenance(bar('description: "bar_003 — x."\n'), { kind: 'beatbox' }, { ...DATA, tempo_bpm: 90 } as RhythmData).replace(/tempo_bpm": 100/, 'tempo_bpm": 90');
    const v = vaultOf({
      'bars/bar_001.md': bar('description: "bar_001 — my words."\n'),
      'bars/bar_002.md': bar('description: "bar_002 — forked from phrases/phrase_006 bar 3 to edit by hand. The phrase shows this bar instead of the generated one."\nforked_from: "phrases/phrase_006 bar 3"\n'),
      'bars/bar_003.md': madeInBeatBox, 'bars/README.md': '# bars\n',
    }, SCORE_FIRST_TOML);
    const before = new Map(v.files);
    const p = await loadRealOnload(real, v.app);
    await tick();
    const savedInfo = console.info; console.info = () => {};
    try {
      p.commands.get(REFRESH)!.checkCallback!(false); await tick(80);
      const one = v.files.get('bars/bar_001.md')!, two = v.files.get('bars/bar_002.md')!, three = v.files.get('bars/bar_003.md')!;
      assert.match(one, /\n# Description\n\nBar made by hand\.\n\n# Recipe\n\nWrite the bar by hand\.\n\n```json\n/);
      assert.match(one, /^description: "bar_001 — my words\."$/m, 'the person\'s description is kept');
      assert.match(two, /\nBar 3 of \[\[phrase_006\]\], forked to edit by hand\.\n/);
      assert.match(two, /^links:\n  - "\[\[phrase_006\]\]"$/m);
      assert.match(three, /\nBar made in the Beat Box; 4 hits in 16 steps, tempo 90\.\n/, 'the origin of a bar made in the Beat Box is kept and its hits counted');
      for (const k of ['bars/bar_001.md', 'bars/bar_002.md', 'bars/bar_003.md']) { assert.equal(fence(v.files.get(k)!), fence(before.get(k)!), `${k}: the json fence and what follows`); assert.equal(readRhythmNote(v.files.get(k)!).ok, true, k); }
      assert.equal(v.files.get('bars/README.md'), '# bars\n', 'README.md is never touched');
      const snapshot = JSON.stringify([...v.files]); v.processed.length = 0;
      p.commands.get(REFRESH)!.checkCallback!(false); await tick(80);
      assert.deepEqual(v.processed, [], 'a second run writes nothing');
      assert.equal(JSON.stringify([...v.files]), snapshot);
    } finally { console.info = savedInfo; }
  });
}
