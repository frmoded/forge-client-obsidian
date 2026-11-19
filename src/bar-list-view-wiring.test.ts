// 2026-11-19-0993 (THE LIST MODEL, stage 3: BARS) - the REAL Beat Box tab (RhythmEditView, built through the view factory the real onload registered, in the real bundle) against a host-faithful stand-in for Obsidian: what the TAB does with the widget's messages.
// The page itself and the list are tested in bar-list-wiring.test.ts (the real widget, the real controller); here the tab is the subject. Written RED first against the tab of HEAD (every message went to the autosave; a bar's list was unknown to it). Pinned:
//   * a bar in a vault whose plugin registered the list host: a `forge-rhythm-save` goes to the host as ONE appendLine (the sentences of that message), never to the autosave (no `vault.process` after the 600 ms the autosave waits);
//   * P3: with no host (a lean edition, another vault), or a note that is not a bar (`rhythm_data/...`), the tab writes through the autosave EXACTLY as before: one process, the json only, no `lines:`;
//   * a bar the host calls `unlistable` falls back to the autosave (nothing lost); a write whose replay is not the grid redraws the widget from the replay; a `modify` that is our own write does nothing, one that is not reloads the widget;
//   * `forge-rhythm-undo` / `-redo` from the widget, and Cmd/Ctrl+Z on the tab (outside a text field), reach the host's undo and redo; opening writes nothing.
// 2026-11-19-0996 (the last tests of the file): the whole chain with NOTHING stood in for - a real keydown in the real widget page, the real tab, the real controller: one Cmd+Z undoes ONE gesture, Shift+Cmd+Z and Ctrl+Y redo one, a text field keeps its key.
import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { loadRealOnload, type LoadedPlugin } from './test-support/real-onload.ts';
import { RHYTHM_BOX_WIDGET_PATH, formatRhythmJson, readRhythmNote, rhythmDataEqual, type RhythmData } from './rhythm-edit-core.ts';
import { widgetHtml, skip } from './test-support/rhythm-widget-harness.ts';
import { PLAYGROUND_BARS } from './test-support/bar-list-fixtures.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';
import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { readBarLines } from './bar-list-note-core.ts';

const SCORE_FIRST_TOML = 'name = "playground"\nprofile = "score_first"\n';
const BAR = PLAYGROUND_BARS['bar_001'];
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const dataOf = (t: string): RhythmData => (readRhythmNote(t) as { value: { data: RhythmData } }).value.data;

test('the Beat Box page (rhythm_box.html) is found, so none of the tests below can skip (a missing page is a failure, never a skip)', () => { assert.equal(skip, false, String(skip)); assert.ok(widgetHtml.length > 1000); });

let real: RealPlugin; let plugin: LoadedPlugin; let doc: any; let win: any;
before(async () => {
  win = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  doc = win.document;
  real = await bundleRealPlugin(process.cwd(), 'music');
  const EV = real.EditableFileView.prototype as any;
  EV.addAction = () => doc.createElement('button');
  EV.register = () => {};
  EV.onLoadFile = async () => {}; EV.onOpen = async () => {}; EV.registerEvent = () => {};
  plugin = await loadRealOnload(real, vaultOf('bars/bar_001.md', BAR).app);
});

function vaultOf(path: string, noteText: string) {
  const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: p.replace(/^.*\//, '').replace(/\.md$/, '') });
  const text = new Map<string, string>([[path, noteText], [RHYTHM_BOX_WIDGET_PATH, widgetHtml]]);
  const files = new Map([...text.keys()].map((p) => [p, tf(p)]));
  const handlers: Record<string, (f: any) => void> = {};
  const processed: string[] = [];
  const app: any = {
    vault: {
      adapter: { exists: async (p: string) => p === 'forge.toml', read: async (p: string) => (p === 'forge.toml' ? SCORE_FIRST_TOML : '') },
      on: (name: string, cb: (f: any) => void) => { handlers[name] = cb; return {}; }, configDir: '.obsidian',
      getFiles: () => [...files.values()], getMarkdownFiles: () => [...files.values()], getAbstractFileByPath: (p: string) => files.get(p) ?? null,
      read: async (f: any) => text.get(f.path) ?? '',
      process: async (f: any, fn: (cur: string) => string) => { const cur = text.get(f.path)!; const next = fn(cur); processed.push(f.path); text.set(f.path, next); },
    },
    workspace: { onLayoutReady: () => {}, on: () => ({}), getLeavesOfType: () => [], getActiveViewOfType: () => null, getActiveFile: () => null },
    metadataCache: { on: () => ({}), getFileCache: () => ({ frontmatter: { type: 'data' } }) }, plugins: {},
  };
  return { app, file: files.get(path)!, text, handlers, processed };
}
type V = ReturnType<typeof vaultOf>;

/** Open the note in a REAL Beat Box tab and play the widget's part. Returns the tab, what it posted into the widget, and how to send it a message. */
async function openTab(v: V, onPost?: (m: unknown) => void) {
  Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  real.messageDelivery.resetForTests();
  plugin.target.app = v.app;
  const posted: any[] = [];
  const view = plugin.views.get('forge-rhythm-edit')!({}) as any;
  const contentEl: any = doc.createElement('div'); doc.body.appendChild(contentEl);
  contentEl.empty = () => { contentEl.innerHTML = ''; };
  contentEl.addClass = (c: string) => contentEl.classList.add(c);
  contentEl.createEl = (tag: string, o: { cls?: string } = {}) => { const el: any = doc.createElement(tag); if (o.cls) el.className = o.cls; contentEl.appendChild(el); return el; };
  contentEl.createDiv = (o: { cls?: string } = {}) => contentEl.createEl('div', o);
  Object.assign(view, { app: v.app, contentEl, file: v.file, leaf: { view } });
  const saved = { log: console.log, info: console.info, debug: console.debug, warn: console.warn };
  console.log = console.info = console.debug = console.warn = () => {};
  try {
    await view.onOpen();
    await view.onLoadFile(v.file);
    await tick();
    const iframe = contentEl.querySelector('iframe'); assert.ok(iframe, 'the tab built the widget iframe');
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: (m: unknown) => { const c = JSON.parse(JSON.stringify(m)); posted.push(c); onPost?.(c); } }, configurable: true });
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'forge-rhythm-ready' }, source: iframe.contentWindow }));
    await tick();
    const send = async (data: unknown) => { win.dispatchEvent(new win.MessageEvent('message', { data, source: iframe.contentWindow })); await tick(); };
    return { view, contentEl, iframe, posted, send, loads: () => posted.filter((m) => m && m.type === 'forge-rhythm-load'), restoreConsole: () => Object.assign(console, saved) };
  } catch (e) { Object.assign(console, saved); throw e; }
}

function fakeHost(over: Partial<{ appendLine: (path: string, s: string, o?: unknown) => Promise<any> }> = {}) {
  const calls = { append: [] as Array<{ path: string; sentence: string }>, undo: [] as string[], redo: [] as string[] };
  const host = {
    appendLine: over.appendLine ?? (async (path: string, sentence: string) => { calls.append.push({ path, sentence }); return { ok: true, message: 'Added', data: undefined }; }),
    undoLast: async (path: string) => { calls.undo.push(path); return { ok: true, message: 'Removed' }; },
    redoLast: async (path: string) => { calls.redo.push(path); return { ok: true, message: 'Added again' }; },
  };
  const wrapped = over.appendLine === undefined ? host : { ...host, appendLine: async (path: string, sentence: string, o?: unknown) => { calls.append.push({ path, sentence }); return over.appendLine!(path, sentence, o); } };
  return { host: wrapped, calls };
}
const withClick = (d: RhythmData, ch: string, i: number, v: boolean | number = true): RhythmData => { const c = JSON.parse(JSON.stringify(d)) as RhythmData; c.channels[ch][i] = v; return c; };
const save = (d: RhythmData) => ({ type: 'forge-rhythm-save', data: d });

test('a bar with the list host registered: a save message is ONE appendLine with the sentences of that message; the autosave is NOT used (no process after its 600 ms)', async () => {
  const v = vaultOf('bars/bar_001.md', BAR); const { host, calls } = fakeHost();
  const off = real.registerBarListHost(host);
  const t = await openTab(v);
  try {
    assert.equal(calls.append.length, 0, 'opening writes nothing'); assert.deepEqual(v.processed, []);
    await t.send(save(withClick(dataOf(BAR), 'kick', 2)));
    assert.deepEqual(calls.append, [{ path: 'bars/bar_001.md', sentence: 'Hit kick on step 3.' }]);
    await tick(750);
    assert.deepEqual(v.processed, [], 'the autosave never ran');
    assert.equal(v.text.get('bars/bar_001.md'), BAR, 'the tab itself wrote nothing: the controller does');
  } finally { off(); t.restoreConsole(); }
});

test('P3: with NO list host (a lean edition, another vault) the tab writes through the autosave exactly as before: one process, the json only, no `lines:`', async () => {
  const v = vaultOf('bars/bar_001.md', BAR);
  const t = await openTab(v);
  try {
    await t.send(save(withClick(dataOf(BAR), 'kick', 2)));
    await tick(750);
    assert.deepEqual(v.processed, ['bars/bar_001.md']);
    const out = v.text.get('bars/bar_001.md')!;
    assert.ok(!out.includes('lines:'), 'no list is invented');
    assert.equal(out, BAR.replace(formatRhythmJson(dataOf(BAR)), formatRhythmJson(withClick(dataOf(BAR), 'kick', 2))));
  } finally { t.restoreConsole(); }
});

test('P3: a rhythm note that is not a bar (a library pattern) goes through the autosave even when the host is registered', async () => {
  const v = vaultOf('rhythm_data/rhythm_pattern_tresillo.md', BAR); const { host, calls } = fakeHost();
  const off = real.registerBarListHost(host);
  const t = await openTab(v);
  try {
    await t.send(save(withClick(dataOf(BAR), 'kick', 2)));
    await tick(750);
    assert.deepEqual(calls.append, []); assert.deepEqual(v.processed, ['rhythm_data/rhythm_pattern_tresillo.md']);
  } finally { off(); t.restoreConsole(); }
});

test('a bar the host calls `unlistable` is written by the autosave (nothing is lost)', async () => {
  const v = vaultOf('bars/bar_001.md', BAR);
  const { host, calls } = fakeHost({ appendLine: async () => ({ ok: false, message: 'cannot', reason: 'unlistable' }) });
  const off = real.registerBarListHost(host);
  const t = await openTab(v);
  try {
    await t.send(save(withClick(dataOf(BAR), 'kick', 2)));
    assert.equal(calls.append.length, 1);
    await tick(750);
    assert.deepEqual(v.processed, ['bars/bar_001.md']);
  } finally { off(); t.restoreConsole(); }
});

test('when the note\'s replay is not the grid the widget holds, the tab draws the widget again from the replay (a load message with the replay\'s bar)', async () => {
  const v = vaultOf('bars/bar_001.md', BAR); const truth = withClick(dataOf(BAR), 'snare', 1);
  const { host } = fakeHost({ appendLine: async () => ({ ok: true, message: 'Added', data: truth }) });
  const off = real.registerBarListHost(host);
  const t = await openTab(v);
  try {
    const before = t.loads().length;
    await t.send(save(withClick(dataOf(BAR), 'kick', 2)));
    const loads = t.loads();
    assert.equal(loads.length, before + 1);
    assert.deepEqual(loads[loads.length - 1].data, truth);
  } finally { off(); t.restoreConsole(); }
});

test('our own write heard back (`modify` with the grid\'s own data) does nothing; a change that is not the grid reloads the widget', async () => {
  const v = vaultOf('bars/bar_001.md', BAR); const grid = withClick(dataOf(BAR), 'kick', 2);
  const { host } = fakeHost({ appendLine: async () => ({ ok: true, message: 'Added', data: grid }) });
  const off = real.registerBarListHost(host);
  const t = await openTab(v);
  try {
    await t.send(save(grid));
    const before = t.loads().length;
    v.text.set('bars/bar_001.md', BAR.replace(formatRhythmJson(dataOf(BAR)), formatRhythmJson(grid)));
    await v.handlers.modify!(v.file); await tick();
    assert.equal(t.loads().length, before, 'the note says what the widget shows: nothing to redraw');
    const other = withClick(dataOf(BAR), 'snare', 6);
    v.text.set('bars/bar_001.md', BAR.replace(formatRhythmJson(dataOf(BAR)), formatRhythmJson(other)));
    await v.handlers.modify!(v.file); await tick();
    assert.equal(t.loads().length, before + 1, 'a hand edit of the list (or a sync) shows in the widget');
    assert.deepEqual(t.loads()[before].data, other);
  } finally { off(); t.restoreConsole(); }
});

test('undo and redo reach the host: from a message the widget posts, and from Cmd/Ctrl+Z on the tab (not inside a text field: the composer has its own)', async () => {
  const v = vaultOf('bars/bar_001.md', BAR); const { host, calls } = fakeHost();
  const off = real.registerBarListHost(host);
  const t = await openTab(v);
  try {
    await t.send({ type: 'forge-rhythm-undo' }); assert.deepEqual(calls.undo, ['bars/bar_001.md']);
    await t.send({ type: 'forge-rhythm-redo' }); assert.deepEqual(calls.redo, ['bars/bar_001.md']);
    const key = (target: any, init: Record<string, unknown>) => { const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'z', ...init }); target.dispatchEvent(e); return e.defaultPrevented as boolean; };
    const chrome = doc.createElement('button'); t.contentEl.appendChild(chrome);
    assert.equal(key(chrome, { metaKey: true }), true); await tick(); assert.equal(calls.undo.length, 2);
    assert.equal(key(chrome, { ctrlKey: true, shiftKey: true, key: 'Z' }), true); await tick(); assert.equal(calls.redo.length, 2);
    const field = doc.createElement('textarea'); t.contentEl.appendChild(field);
    assert.equal(key(field, { metaKey: true }), false, 'inside a text field the key is the browser\'s own'); await tick(); assert.equal(calls.undo.length, 2);
    assert.equal(key(chrome, { key: 'x', metaKey: true }), false);
  } finally { off(); t.restoreConsole(); }
});

test('with no host registered, undo messages and Cmd+Z do nothing (a tab that keeps no list)', async () => {
  const v = vaultOf('bars/bar_001.md', BAR);
  const t = await openTab(v);
  try {
    await t.send({ type: 'forge-rhythm-undo' });
    const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'z', metaKey: true }); t.contentEl.dispatchEvent(e);
    assert.equal(e.defaultPrevented, false); assert.deepEqual(v.processed, []);
  } finally { t.restoreConsole(); }
});

test('the list host may be registered AFTER the tab opened (the vault\'s profile answer is asynchronous): the first edit looks again and goes to the list; before that, the tab was the old one', async () => {
  const v = vaultOf('bars/bar_001.md', BAR);
  const t = await openTab(v);                                          // no host yet
  const { host, calls } = fakeHost();
  const off = real.registerBarListHost(host);
  try {
    await t.send(save(withClick(dataOf(BAR), 'kick', 2)));
    assert.deepEqual(calls.append, [{ path: 'bars/bar_001.md', sentence: 'Hit kick on step 3.' }]);
    await tick(750);
    assert.deepEqual(v.processed, [], 'the autosave never ran');
  } finally { off(); t.restoreConsole(); }
});

test('the widget\'s own indicator hears a list write: "Saved" after one, the reason after a refusal (a refusal also draws the widget again from the note)', async () => {
  const v = vaultOf('bars/bar_001.md', BAR);
  let ok = true;
  const { host } = fakeHost({ appendLine: async () => (ok ? { ok: true, message: 'Added' } : { ok: false, message: 'Line 2 is not a sentence I can read.' }) });
  const off = real.registerBarListHost(host);
  const t = await openTab(v);
  try {
    await t.send(save(withClick(dataOf(BAR), 'kick', 2)));
    assert.deepEqual(t.posted.filter((m) => m && m.type === 'forge-rhythm-status'), [{ type: 'forge-rhythm-status', state: 'saved' }]);
    ok = false; const loads = t.loads().length;
    await t.send(save(withClick(dataOf(BAR), 'kick', 3)));
    const statuses = t.posted.filter((m) => m && m.type === 'forge-rhythm-status');
    assert.deepEqual(statuses[statuses.length - 1], { type: 'forge-rhythm-status', state: 'error', message: 'Line 2 is not a sentence I can read.' });
    assert.equal(t.loads().length, loads + 1, 'and the grid is the note\'s again');
  } finally { off(); t.restoreConsole(); }
});

// ---- 2026-11-19-0996: the whole chain, a REAL key in the REAL widget page -> the real tab -> the real controller ----------------------------------------------------------------------------------------------
// The widget runs in its own happy-dom window (its `parent` is the tab's window: what it posts reaches the tab's `message` listener with the iframe's window as `source`, and what the tab posts into the iframe reaches the widget); the host is the REAL
// controller (description-apply.ts) on the same in-memory vault; a vault `modify` is fired after each controller write, as Obsidian does, so the tab redraws the widget from the note.
async function chain(v: V) {
  const ports: DescriptionPorts = {
    read: async (p) => { const t = v.text.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = v.text.get(p)!; const next = fn(cur); if (next !== cur) { v.text.set(p, next); v.processed.push(p); } },
    vault: () => PHRASE_VAULT, barNames: () => PHRASE_VAULT.bars as string[], phraseNames: () => PHRASE_VAULT.phrases as string[],
    setTimer: () => 0, clearTimer: () => {}, trace: () => {}, panes: () => [],
    composerMenu: () => ({ items: [{ id: 'new_bar', label: 'New bar' }], run: () => {} }),
  };
  const ctl = createDescriptionController(ports);
  const heard = async <T,>(r: T): Promise<T> => { await v.handlers.modify?.(v.file); await tick(10); return r; };      // the vault tells the tab about every write (its own, too)
  const off = real.registerBarListHost({
    appendLine: async (p, s, o) => heard(await ctl.appendLine(p, s, o as never)),
    undoLast: async (p) => heard(await ctl.undoLast(p)),
    redoLast: async (p) => heard(await ctl.redoLast(p)),
  });
  const bwin: any = new Window({ url: 'http://localhost/' });
  const current: RhythmData[] = [];
  let parentStub: object | null = null; let iframeWin: object | null = null;
  const toTab = (m: any) => { if (m.type === 'forge-rhythm-current-data') current.push(m.data); win.dispatchEvent(new win.MessageEvent('message', { data: m, source: iframeWin })); };
  parentStub = { postMessage: (m: unknown) => { const c = JSON.parse(JSON.stringify(m)); setTimeout(() => toTab(c), 0); } };
  Object.defineProperty(bwin, 'parent', { value: parentStub, configurable: true });
  const t = await openTab(v, (m) => { setTimeout(() => bwin.dispatchEvent(new bwin.MessageEvent('message', { data: m, source: parentStub })), 0); });
  iframeWin = t.iframe.contentWindow;
  await ctl.inspect('bars/bar_001.md');
  const m = /<script>([\s\S]*?)<\/script>/.exec(widgetHtml)!;
  bwin.document.write(widgetHtml.replace(m[0], ''));
  bwin.eval(m[1]);                                                                                                           // the widget posts its `ready`; the tab answers with the bar
  await tick(40);
  const cell = (ch: string, s: number): any => bwin.document.querySelector(`.step[data-channel="${ch}"][data-step="${s}"]`);
  const key = async (target: any, init: Record<string, unknown>) => { const e = new bwin.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); target.dispatchEvent(e); await tick(40); return e.defaultPrevented as boolean; };
  const click = async (ch: string, s: number) => { cell(ch, s).dispatchEvent(new bwin.MouseEvent('click', { bubbles: true })); await tick(40); };
  const grid = async (): Promise<RhythmData> => { current.length = 0; await tick(0); bwin.dispatchEvent(new bwin.MessageEvent('message', { data: { type: 'forge-rhythm-request-data' }, source: parentStub })); await tick(20); return current[current.length - 1]; };
  const lines = () => readBarLines(v.text.get('bars/bar_001.md')!)?.lines ?? [];
  return { t, bwin, cell, key, click, grid, lines, stop: () => { off(); t.restoreConsole(); } };
}
const withHits = (d: RhythmData, hits: Array<[string, number]>): RhythmData => hits.reduce((acc, [ch, i]) => withClick(acc, ch, i), d);

test('0996 THE WHOLE CHAIN: three clicks, then ONE real Cmd+Z in the widget undoes ONE gesture each (the grid is redrawn from the list), Shift+Cmd+Z and Ctrl+Y redo ONE each, one write per press', async () => {
  const v = vaultOf('bars/bar_001.md', BAR); const start = dataOf(BAR);
  const off = start.channels.kick.map((x, i) => (x === false ? i : -1)).filter((i) => i >= 0).slice(0, 3); assert.equal(off.length, 3, 'the fixture bar has three empty kick steps');
  const hits = off.map((i) => ['kick', i] as [string, number]);
  const c = await chain(v);
  try {
    assert.deepEqual(v.processed, [], 'opening writes nothing'); assert.ok(rhythmDataEqual(await c.grid(), start), 'the widget shows the bar');
    for (const [ch, i] of hits) await c.click(ch, i);
    assert.equal(c.lines().length, 4, 'the head and three lines: one line per click'); assert.equal(v.processed.length, 3, 'one write per click');
    assert.ok(rhythmDataEqual(await c.grid(), withHits(start, hits)));
    const key = { key: 'z', metaKey: true };
    for (let n = 2; n >= 0; n--) {
      const w = v.processed.length;
      assert.equal(await c.key(c.cell('snare', 0), key), true, 'the page took the key');
      assert.equal(v.processed.length, w + 1, `Cmd+Z: ONE write`); assert.equal(c.lines().length, n + 1, `Cmd+Z: one line off the list`);
      assert.ok(rhythmDataEqual(await c.grid(), withHits(start, hits.slice(0, n))), `Cmd+Z: the grid is the list's replay, ${n} click(s) left`);
    }
    const w0 = v.processed.length;
    await c.key(c.cell('snare', 0), key); assert.equal(v.processed.length, w0, 'nothing left to undo: no write'); assert.ok(rhythmDataEqual(await c.grid(), start));
    assert.equal(await c.key(c.bwin.document.body, { key: 'Z', metaKey: true, shiftKey: true }), true);
    assert.equal(c.lines().length, 2, 'Shift+Cmd+Z: ONE line back'); assert.equal(v.processed.length, w0 + 1);
    assert.ok(rhythmDataEqual(await c.grid(), withHits(start, hits.slice(0, 1))));
    assert.equal(await c.key(c.cell('snare', 0), { key: 'y', ctrlKey: true }), true);
    assert.equal(c.lines().length, 3, 'Ctrl+Y: ONE line back'); assert.equal(v.processed.length, w0 + 2);
    assert.ok(rhythmDataEqual(await c.grid(), withHits(start, hits.slice(0, 2))));
    assert.equal(await c.key(c.cell('snare', 0), { key: 'Z', ctrlKey: true, shiftKey: true }), true); assert.equal(c.lines().length, 4);
    assert.ok(rhythmDataEqual(await c.grid(), withHits(start, hits)), 'all three are back');
    const w1 = v.processed.length; await c.key(c.cell('snare', 0), { key: 'y', ctrlKey: true }); assert.equal(v.processed.length, w1, 'nothing left to redo: no write');
    await c.click('snare', 2); assert.equal(c.lines().length, 5, 'a new gesture after the undo and redo is one more line');
  } finally { c.stop(); }
});

test('0996: with the list host registered, a key in a text field of the page, in a modified combination or a plain Z does nothing at all (no write, the grid untouched, the key not taken)', async () => {
  const v = vaultOf('bars/bar_001.md', BAR); const start = dataOf(BAR);
  const c = await chain(v);
  try {
    await c.click('kick', start.channels.kick.indexOf(false)); const w = v.processed.length, n = c.lines().length; const shown = await c.grid();
    const field: any = c.bwin.document.createElement('input'); field.setAttribute('type', 'text'); c.bwin.document.body.appendChild(field);
    const area: any = c.bwin.document.createElement('textarea'); c.bwin.document.body.appendChild(area);
    for (const [what, target, init] of [
      ['Cmd+Z in a text input', field, { key: 'z', metaKey: true }], ['Shift+Cmd+Z in a textarea', area, { key: 'Z', metaKey: true, shiftKey: true }], ['Ctrl+Y in a text input', field, { key: 'y', ctrlKey: true }],
      ['plain Z on the grid', c.cell('kick', 1), { key: 'z' }], ['Cmd+Alt+Z on the grid', c.cell('kick', 1), { key: 'z', metaKey: true, altKey: true }],
    ] as Array<[string, any, Record<string, unknown>]>) {
      assert.equal(await c.key(target, init), false, `${what}: not taken`);
      assert.equal(v.processed.length, w, `${what}: no write`); assert.equal(c.lines().length, n);
    }
    assert.ok(rhythmDataEqual(await c.grid(), shown));
  } finally { c.stop(); }
});

test('0996: a bar tab with NO list host (a lean edition, another vault) takes the widget\'s undo message and does nothing: no write, no error, the grid untouched', async () => {
  const v = vaultOf('bars/bar_001.md', BAR);
  const bwin: any = new Window({ url: 'http://localhost/' });
  let parentStub: object | null = null; let iframeWin: object | null = null;
  parentStub = { postMessage: (m: unknown) => { const c = JSON.parse(JSON.stringify(m)); setTimeout(() => win.dispatchEvent(new win.MessageEvent('message', { data: c, source: iframeWin })), 0); } };
  Object.defineProperty(bwin, 'parent', { value: parentStub, configurable: true });
  const t = await openTab(v, (m) => { setTimeout(() => bwin.dispatchEvent(new bwin.MessageEvent('message', { data: m, source: parentStub })), 0); });
  iframeWin = t.iframe.contentWindow;
  const m = /<script>([\s\S]*?)<\/script>/.exec(widgetHtml)!;
  bwin.document.write(widgetHtml.replace(m[0], '')); bwin.eval(m[1]); await tick(40);
  const errors: unknown[] = []; const saved = console.error; console.error = (...a: unknown[]) => { errors.push(a); };
  try {
    for (const init of [{ key: 'z', metaKey: true }, { key: 'Z', metaKey: true, shiftKey: true }]) {
      const e = new bwin.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); bwin.document.querySelector('.step').dispatchEvent(e); await tick(40);
      assert.equal(e.defaultPrevented, true, 'the page cannot know whether the tab keeps a list: it takes the key and posts');
    }
    assert.deepEqual(v.processed, []); assert.deepEqual(errors, []);
  } finally { console.error = saved; t.restoreConsole(); }
});

test('0996: a rhythm note that is not a bar (a library pattern) in a Beat Box tab, with the list host registered: the widget\'s undo message reaches NO undo (its edits are autosaved, there is no list)', async () => {
  const v = vaultOf('rhythm_data/rhythm_pattern_tresillo.md', BAR); const { host, calls } = fakeHost();
  const off = real.registerBarListHost(host);
  const t = await openTab(v);
  try {
    await t.send({ type: 'forge-rhythm-undo' }); await t.send({ type: 'forge-rhythm-redo' });
    assert.deepEqual(calls.undo, []); assert.deepEqual(calls.redo, []); assert.deepEqual(v.processed, []);
  } finally { off(); t.restoreConsole(); }
});
