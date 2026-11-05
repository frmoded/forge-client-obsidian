// 2026-11-05-1183 (M17c) - the notebook below a composition's Score on the REAL wiring, both editions: the real ForgePlugin.onload from the real bundle, the real composition view and the real phrase view built through the view
// factories onload registered, loaded the way Obsidian loads a tab (onOpen, onLoadFile), against a host-faithful stand-in for Obsidian (test-support/*). Proves: a composition tab mounts exactly one notebook, BELOW its header and
// tree (the Score is first); a phrase tab still mounts exactly one, and is given the notebook ports WITHOUT a chip (so its chip text is the one it always had); a note made in notebook/ or phrases/ lists the cells again; another vault
// (no profile) has neither view and mounts nothing (P3). The rules are proven in composition-notebook.test.ts; the Score and the engine are not part of this file (no engine here: the Score says why, the notebook is mounted regardless).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, before } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { COMPOSITION_VIEW_TYPE, newCompositionNote } from './composition-core.ts';
import { PHRASE_VIEW_TYPE, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { newNotebookCellForTest } from './test-support/notebook-fixture.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const BAR = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/bar_007.md'), 'utf8');
const EXTEND = (source: string): PhraseParams => ({ kind: 'extend', source, bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 } as PhraseParams);
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const code = (f: string) => fs.readFileSync(path.join(import.meta.dirname, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin; let win: any;
  const P = (s: string) => `[${edition}] ${s}`;
  before(async () => {
    win = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
    real = await bundleRealPlugin(ROOT, edition);
    const EV = real.EditableFileView.prototype as any;
    EV.addAction = () => win.document.createElement('button'); EV.register = () => {}; EV.registerEvent = () => {};
    EV.onOpen = async () => {}; EV.onLoadFile = async () => {}; EV.onUnloadFile = async () => {}; EV.onClose = async () => {};
  });

  function vaultOf(toml: string | null) {
    const files = new Map<string, string>([
      ['bars/bar_005.md', BAR], ['phrases/phrase_003.md', noteContentFor('phrase_003', EXTEND('bar_005'))],
      ['compositions/comp_001.md', newCompositionNote('comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_003' }] })],
    ]);
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const handlers: Record<string, Array<(f: { path: string }) => void>> = {};
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => p === 'forge.toml' && toml !== null, read: async (p: string) => (p === 'forge.toml' && toml !== null ? toml : '') },
        on: (name: string, fn: (f: { path: string }) => void) => { (handlers[name] ??= []).push(fn); return {}; }, configDir: '.obsidian',
        getFiles: () => [...files.keys()].map(tf), getMarkdownFiles: () => [...files.keys()].map(tf),
        getAbstractFileByPath: (p: string) => (files.has(p) ? tf(p) : null),
        read: async (f: any) => files.get(f.path) ?? '', process: async (f: any, fn: (t: string) => string) => { files.set(f.path, fn(files.get(f.path) ?? '')); },
        create: async (p: string, c: string) => { files.set(p, c); return tf(p); }, createFolder: async () => {},
      },
      workspace: { onLayoutReady: (cb: () => void) => { cb(); }, iterateAllLeaves: iterateAllLeavesLikeObsidian<unknown>(() => ({})), on: () => ({}), getLeavesOfType: () => [], getActiveFile: () => null, getActiveViewOfType: () => null, getMostRecentLeaf: () => null },
      metadataCache: { on: () => ({}), getFileCache: () => ({ frontmatter: { type: 'data' } }) }, plugins: {},
    };
    return { app, files, tf, handlers };
  }

  /** Load a tab of `type` for `file` the way Obsidian does, into a real DOM pane. */
  async function openTab(v: ReturnType<typeof vaultOf>, plugin: any, type: string, file: string) {
    const factory = plugin.views.get(type);
    assert.ok(factory, `${type} is registered`);
    const view: any = factory({});
    const contentEl: any = win.document.createElement('div'); win.document.body.appendChild(contentEl);
    contentEl.empty = () => { contentEl.innerHTML = ''; }; contentEl.addClass = (c: string) => contentEl.classList.add(c); contentEl.setText = (t: string) => { contentEl.textContent = t; };
    const make = (el: any) => { el.createEl = (tag: string, o: any = {}) => { const e: any = win.document.createElement(tag); if (o.cls) e.className = o.cls; if (o.text) e.textContent = o.text; make(e); el.appendChild(e); return e; }; el.createDiv = (o: any = {}) => el.createEl('div', o); el.setText = (t: string) => { el.textContent = t; }; el.empty = () => { el.innerHTML = ''; }; el.addClass = (c: string) => el.classList.add(c); return el; };
    make(contentEl);
    const f = v.tf(file);
    Object.assign(view, { app: v.app, contentEl, file: f, leaf: { view } });
    const saved = { log: console.log, info: console.info, debug: console.debug, warn: console.warn, error: console.error };
    console.log = console.info = console.debug = console.warn = console.error = () => {};
    try { await view.onOpen(); await view.onLoadFile(f); await tick(80); } finally { Object.assign(console, saved); }
    return { view, contentEl };
  }
  async function boot(toml: string | null) {
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
    const v = vaultOf(toml);
    const plugin = await loadRealOnload(real, v.app);
    real.messageDelivery.resetForTests();
    await tick();
    return { v, plugin };
  }

  test(P('a composition tab mounts exactly ONE notebook, below its header and its tree (the Score takes the first place); a phrase tab still mounts exactly one'), async () => {
    const { v, plugin } = await boot(SCORE_FIRST_TOML);
    const comp = await openTab(v, plugin, COMPOSITION_VIEW_TYPE, 'compositions/comp_001.md');
    const books = comp.contentEl.querySelectorAll('.forge-notebook');
    assert.equal(books.length, 1, `composition tab: ${comp.contentEl.innerHTML.slice(0, 300)}`);
    const kids = [...comp.contentEl.children].map((c: any) => String(c.className).split(' ')[0]);
    assert.ok(kids.indexOf('forge-notebook') > kids.indexOf('forge-composition-header'), `the notebook is after the header: ${kids.join(' | ')}`);
    assert.equal(kids.at(-1), 'forge-notebook', 'and it is the last thing in the tab');
    assert.ok(comp.contentEl.querySelector('.forge-notebook-request'), 'the typed request box is there');
    assert.ok(comp.contentEl.querySelector('.forge-notebook-do'), 'and the op picker with Run');
    const phrase = await openTab(v, plugin, PHRASE_VIEW_TYPE, 'phrases/phrase_003.md');
    assert.equal(phrase.contentEl.querySelectorAll('.forge-notebook').length, 1, 'the phrase tab is as it was');
  });

  test(P('closing the composition tab takes its notebook with it; loading another note into it mounts one again (never two)'), async () => {
    const { v, plugin } = await boot(SCORE_FIRST_TOML);
    const comp = await openTab(v, plugin, COMPOSITION_VIEW_TYPE, 'compositions/comp_001.md');
    const saved = { log: console.log, info: console.info, debug: console.debug, warn: console.warn, error: console.error };
    console.log = console.info = console.debug = console.warn = console.error = () => {};
    try {
      await comp.view.onLoadFile(comp.view.file); await tick(60);
      assert.equal(comp.contentEl.querySelectorAll('.forge-notebook').length, 1, 'a second load does not stack a second notebook');
      await comp.view.onUnloadFile(comp.view.file);
      assert.equal(comp.contentEl.querySelectorAll('.forge-notebook').length, 0, 'unloaded: nothing left');
    } finally { Object.assign(console, saved); }
  });

  test(P('a cell made in notebook/ lists on the composition tab\'s notebook (the vault events refresh it, as a phrase tab\'s)'), async () => {
    const { v, plugin } = await boot(SCORE_FIRST_TOML);
    const comp = await openTab(v, plugin, COMPOSITION_VIEW_TYPE, 'compositions/comp_001.md');
    assert.equal(comp.contentEl.querySelectorAll('.forge-notebook-cell').length, 0);
    v.files.set('notebook/cell_001.md', newNotebookCellForTest('compositions/comp_001', 'phrases/phrase_004'));
    v.files.set('phrases/phrase_004.md', noteContentFor('phrase_004', EXTEND('bar_005')));
    for (const fn of v.handlers.create ?? []) fn({ path: 'notebook/cell_001.md' });
    await tick(80);
    assert.equal(comp.contentEl.querySelectorAll('.forge-notebook-cell').length, 1);
    assert.equal(comp.contentEl.querySelector('.forge-notebook-cell')!.getAttribute('data-role'), 'source');
  });

  test(P('P3: a vault with no profile (and one with no forge.toml) has neither the composition view nor a notebook anywhere'), async () => {
    for (const toml of ['name = "forge-tutorial"\nversion = "0.1.0"\ndescription = "x"\ndomains = []\n', null]) {
      const { plugin } = await boot(toml);
      assert.equal(plugin.views.has(COMPOSITION_VIEW_TYPE), false);
      assert.equal(plugin.views.has(PHRASE_VIEW_TYPE), false);
    }
  });

  test(P('MECHANISM PIN (if the design moves this SHOULD go red - reassess, do not just rewrite): the phrase tab asks for its notebook ports with the file ONLY (no chip: its chip text is the phrase one), and the composition tab asks with the chip'), () => {
    assert.match(code('phrase-view.ts'), /notebook: this\.notebookFor\?\.\(file\),/);
    assert.match(code('compositions.ts'), /this\.notebookFor\(file, \(s\) => compositionSelectionChip\(s, this\.shape\?\.sections \?\? \[\]\)\)/);
    assert.match(code('score-first.ts'), /registerCompositions\(plugin, \{[^}]*notebookFor,/);
  });
}
