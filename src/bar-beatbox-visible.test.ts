// 2026-11-19-0992c (BUG, P1) - a bar's Beat Box tab showed the composer and NOTHING else (no Beat Box, no Score) since 0993 put the composer on it. No Chrome needed here: this is the DOM and the order of events; the real-Chrome measure that adds
// Obsidian's own stylesheet and real mouse clicks is scripts/dev/measure-bar-beatbox-layout.mjs (its verdicts: the tab in all three orders below, at 360 / 800 / 1100 px, short and tall panes, light and dark).
//
// THE CAUSE: RhythmEditView.mount builds its content with `this.contentEl.empty()` and then draws the Beat Box iframe and the Score straight into `contentEl`. When the composer (mountChatPanel) is ALREADY on that element - it joined while the
// tab was still reading its note (a workspace event synced the panes), or the tab builds a second time - `empty()` takes the composer's BODY and PANEL out of the element, and the panel's MutationObserver moved everything the tab drew next into the DETACHED
// body: the tab showed nothing; the controller's next sync mounted a fresh panel (the composer alone). Driver's words: "either the score or the input box, the Beat Box in neither" (the Score view, and a Beat Box tab with only the composer).
// The 0993 layout measures (96 verdicts) and the wiring tests mounted the composer AFTER the tab had finished building, the one order that works.
//
// FIXED in chat-panel-dom.ts: a panel whose body or panel is no longer in the host knows its tab emptied its content: it drops what the (torn down) body still held, puts the body and the panel (with the composer's text) back, and adopts what the tab drew.
//   1. the panel alone: a tab that empties its content element after the panel is mounted, then draws; once; twice; draws nothing; the composer keeps its element and its text; dispose still gives the content back; ordinary appends still go into the body
//   2. the REAL Beat Box tab (RhythmEditView, built through the view factory the real onload registered): the composer joins while the tab is opening; the control (it joins after); the tab builds a second time: in each, ONE iframe, in the body, in the document, the Score
//      in the body, the panel last, `attached()` true
//   3. mechanism pin: the observer's re-adoption is in the source (so a refactor that drops it is red here before it is red in a tab)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test, before } from 'node:test';
import { Window } from 'happy-dom';

import { mountChatPanel, type ChatPanelHandle } from './chat-panel-dom.ts';
import { memoryStore } from './dialog-core.ts';
import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { loadRealOnload, type LoadedPlugin } from './test-support/real-onload.ts';
import { RHYTHM_BOX_WIDGET_PATH } from './rhythm-edit-core.ts';
import { widgetHtml, skip } from './test-support/rhythm-widget-harness.ts';
import { PLAYGROUND_BARS } from './test-support/bar-list-fixtures.ts';

const BOX = { preview: async () => ({ ok: false as const, message: 'x' }), apply: async () => ({ ok: false }) };
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
/** 2026-11-19-0992c (load-proof): wait until a condition holds (the observer's callback is a timer in happy-dom, so a fixed 30 ms tick is a race on a machine under load: the matrix's lean leg failed on it); gives up after `ms` and lets the assertions below say what is wrong. */
async function settle(ok: () => boolean, ms = 5000): Promise<void> { const t0 = Date.now(); while (!ok() && Date.now() - t0 < ms) await tick(5); await tick(5); }
const win: any = new Window({ url: 'http://localhost/' });
const doc: any = win.document;

// 2026-11-19-0992c (load-proof): happy-dom 20's MutationObserver hands the page only a WEAKREF to its report function (lib/mutation-observer/MutationObserverListener.js: `callback: new WeakRef(...)`), so a garbage collection between mount and use silently ends the delivery:
// on a machine under load (the matrix's lean leg, two legs at once) this file lost the observer and failed or stalled. The panel's own observer callback is what is under test, so this file gives the window a PLAIN observer that holds its callback strongly and notices a
// change of the observed element's children by looking (every 3 ms, unref'd); the real browser's observer is proved by the real-Chrome measure scripts/dev/measure-bar-beatbox-layout.mjs (236 verdicts, the three orders).
class PollingObserver {
  private timer: any = null; private snap: any[] = [];
  private readonly cb: (records: unknown[], obs: unknown) => void;
  constructor(cb: (records: unknown[], obs: unknown) => void) { this.cb = cb; }
  observe(target: any): void {
    this.snap = Array.from(target.childNodes);
    this.timer = setInterval(() => {
      const now = Array.from(target.childNodes) as any[];
      if (now.length !== this.snap.length || now.some((n, i) => n !== this.snap[i])) { this.snap = now; this.cb([], this); this.snap = Array.from(target.childNodes); }
    }, 3); this.timer.unref?.();
  }
  disconnect(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
  takeRecords(): unknown[] { return []; }
}
win.MutationObserver = PollingObserver;
Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });

/** An element as Obsidian's `empty()` empties it: every child removed, one by one. */
const empty = (el: HTMLElement): void => { while (el.firstChild) el.removeChild(el.firstChild); };
const kids = (el: Element): string[] => Array.from(el.children).map((c) => c.className || c.tagName.toLowerCase());
function host(): HTMLElement { const h = doc.createElement('div'); h.className = 'forge-rhythm-edit-view'; doc.body.appendChild(h); return h; }
const mount = (h: HTMLElement, initial = ''): ChatPanelHandle => mountChatPanel(h, { box: BOX, store: memoryStore() }, initial);
/** What RhythmEditView.mount draws: the iframe first, then the Score above it (first: true), straight into the content element. */
function draw(h: HTMLElement): { iframe: HTMLElement; score: HTMLElement } {
  const iframe = doc.createElement('iframe'); iframe.className = 'forge-html-embed-iframe'; h.appendChild(iframe);
  const score = doc.createElement('div'); score.className = 'forge-rhythm-edit-score'; h.insertBefore(score, h.firstChild);
  return { iframe, score };
}

// ---- 1. the panel alone -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('a tab that EMPTIES its content element after the panel is mounted, then draws: the Score and the iframe are in the body, in the document, the panel is back last with the same composer', async () => {
  const h = host(); const a = draw(h); const chat = mount(h);
  assert.deepEqual(kids(h), ['forge-chat-body', 'forge-chat-panel']);
  chat.box.focus(); const field = h.querySelector('textarea') as HTMLTextAreaElement; field.value = 'half a sentence'; field.dispatchEvent(new win.Event('input', { bubbles: true }));
  const panelEl = chat.el;
  empty(h);                                                                           // RhythmEditView.mount: this.contentEl.empty() ...
  const b = draw(h);                                                                  // ... then the iframe and the Score, into the content element
  await settle(() => b.iframe.parentElement === h.querySelector('.forge-chat-body') && b.score.parentElement === h.querySelector('.forge-chat-body'));
  const body = h.querySelector('.forge-chat-body') as HTMLElement;
  assert.ok(body && body.isConnected, 'the body is in the host again');
  assert.deepEqual(kids(h), ['forge-chat-body', 'forge-chat-panel'], 'the host holds the body and the panel, nothing else');
  assert.ok(b.iframe.isConnected && b.score.isConnected, 'what the tab drew is on the page');
  assert.equal(b.iframe.parentElement, body); assert.equal(b.score.parentElement, body);
  assert.deepEqual(kids(body), ['forge-rhythm-edit-score', 'forge-html-embed-iframe'], 'the Score first, then the iframe: the order the tab drew');
  assert.equal(a.iframe.isConnected, false, 'the OLD render is gone (the tab tore it down before it emptied)'); assert.equal(a.score.isConnected, false);
  assert.equal(h.querySelectorAll('iframe').length, 1, 'one Beat Box, no ghost');
  assert.equal(chat.el, panelEl, 'the same panel element: the composer was not rebuilt');
  assert.equal((h.querySelector('textarea') as HTMLTextAreaElement).value, 'half a sentence', 'the half-typed sentence is still there');
  assert.equal(chat.attached(), true, 'the controller\'s sync does not mount a second panel');
  chat.dispose();
});

test('a tab that builds its content twice in a row (a second mount): still one Score, one iframe, in the body', async () => {
  const h = host(); const chat = mount(h);
  empty(h); const mid = draw(h); await settle(() => mid.iframe.parentElement === h.querySelector('.forge-chat-body'));
  empty(h); const last = draw(h); await settle(() => last.iframe.parentElement === h.querySelector('.forge-chat-body'));
  assert.deepEqual(kids(h), ['forge-chat-body', 'forge-chat-panel']);
  const body = h.querySelector('.forge-chat-body') as HTMLElement;
  assert.deepEqual(kids(body), ['forge-rhythm-edit-score', 'forge-html-embed-iframe']);
  assert.equal(last.iframe.parentElement, body); assert.equal(chat.attached(), true);
  chat.dispose();
});

test('a tab that empties its content and draws nothing (a refusal that comes later): the body and the panel are back, the body empty; what it draws later is adopted', async () => {
  const h = host(); const chat = mount(h); draw(h);
  empty(h); await settle(() => kids(h).join() === 'forge-chat-body,forge-chat-panel');
  assert.deepEqual(kids(h), ['forge-chat-body', 'forge-chat-panel']); assert.equal((h.querySelector('.forge-chat-body') as HTMLElement).childElementCount, 0);
  const late = draw(h); await settle(() => late.iframe.parentElement === h.querySelector('.forge-chat-body'));
  assert.equal(late.iframe.parentElement, h.querySelector('.forge-chat-body')); assert.equal(chat.attached(), true);
  chat.dispose();
});

test('control: content appended to a panel that was NOT emptied still goes into the body (before the panel), and dispose gives the content back to the host', async () => {
  const h = host(); const chat = mount(h);
  const strip = doc.createElement('div'); strip.className = 'a-strip'; h.appendChild(strip); await settle(() => strip.parentElement === h.querySelector('.forge-chat-body'));
  assert.equal(strip.parentElement, h.querySelector('.forge-chat-body')); assert.deepEqual(kids(h), ['forge-chat-body', 'forge-chat-panel']);
  chat.dispose();
  assert.deepEqual(kids(h), ['a-strip'], 'the tab\'s content is back in the host, the panel and the body are gone');
});

test('after the panel is disposed, a tab that empties and draws is left alone (nothing is moved, nothing comes back)', async () => {
  const h = host(); const chat = mount(h); chat.dispose();
  empty(h); const d = draw(h); await tick();
  assert.deepEqual(kids(h), ['forge-rhythm-edit-score', 'forge-html-embed-iframe']); assert.equal(d.iframe.parentElement, h);
});

// ---- 2. the REAL Beat Box tab ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const SCORE_FIRST_TOML = 'name = "playground"\nprofile = "score_first"\n';
const BAR = PLAYGROUND_BARS['bar_001'];
let real: RealPlugin; let plugin: LoadedPlugin;
before(async () => {
  real = await bundleRealPlugin(process.cwd(), 'music');
  const EV = real.EditableFileView.prototype as any;
  EV.addAction = () => doc.createElement('button'); EV.register = () => {}; EV.onLoadFile = async () => {}; EV.onOpen = async () => {}; EV.onClose = async () => {}; EV.onUnloadFile = async () => {}; EV.registerEvent = () => {};
  const probe = fakeVault(); plugin = await loadRealOnload(real, probe.app);
});

/** A vault of one bar in a score-first vault; `onFirstRead` runs inside the tab's FIRST read of its note: a workspace event that syncs the panes while the tab is still opening. */
function fakeVault(onFirstRead?: () => void) {
  const tf = Object.assign(new real.TFile(), { path: 'bars/bar_001.md', extension: 'md', basename: 'bar_001' });
  const widget = Object.assign(new real.TFile(), { path: RHYTHM_BOX_WIDGET_PATH, extension: 'html', basename: 'rhythm_box' });
  const files = new Map<string, any>([[tf.path, tf], [widget.path, widget]]);
  const text = new Map<string, string>([[tf.path, BAR], [widget.path, widgetHtml]]);
  let first = true;
  const app: any = {
    vault: {
      adapter: { exists: async (p: string) => p === 'forge.toml', read: async () => SCORE_FIRST_TOML },
      on: () => ({}), configDir: '.obsidian',
      getFiles: () => [...files.values()], getMarkdownFiles: () => [...files.values()], getAbstractFileByPath: (p: string) => files.get(p) ?? null,
      read: async (f: any) => { if (first && f.path === tf.path) { first = false; onFirstRead?.(); } return text.get(f.path) ?? ''; },
      process: async (f: any, fn: (cur: string) => string) => { text.set(f.path, fn(text.get(f.path)!)); },
    },
    workspace: { onLayoutReady: () => {}, on: () => ({}), getLeavesOfType: () => [], getActiveViewOfType: () => null, getActiveFile: () => null },
    metadataCache: { on: () => ({}), getFileCache: () => ({ frontmatter: { type: 'data' } }) }, plugins: {},
  };
  return { app, file: tf };
}

async function openTab(order: 'during' | 'after' | 'again') {
  Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  real.messageDelivery.resetForTests();
  const contentEl: any = doc.createElement('div'); doc.body.appendChild(contentEl);
  contentEl.empty = () => empty(contentEl); contentEl.addClass = (c: string) => contentEl.classList.add(c);
  contentEl.createEl = (tag: string, o: { cls?: string } = {}) => { const el: any = doc.createElement(tag); if (o.cls) el.className = o.cls; contentEl.appendChild(el); return el; };
  contentEl.createDiv = (o: { cls?: string } = {}) => contentEl.createEl('div', o);
  let chat: ChatPanelHandle | null = null;
  const v = fakeVault(order === 'during' ? () => { chat = mount(contentEl); } : undefined);   // 'during': the composer is mounted on the still EMPTY content element, inside the tab's own first read
  plugin.target.app = v.app;
  const view = plugin.views.get('forge-rhythm-edit')!({}) as any;
  Object.assign(view, { app: v.app, contentEl, file: v.file, leaf: { view } });
  const saved = { log: console.log, info: console.info, debug: console.debug, warn: console.warn };
  console.log = console.info = console.debug = console.warn = () => {};
  try {
    const shaped = (): boolean => { const b = contentEl.querySelector('.forge-chat-body'); return !!b && !!b.querySelector('iframe') && !!b.querySelector('.forge-rhythm-edit-score') && contentEl.lastElementChild === contentEl.querySelector('.forge-chat-panel'); };
    await view.onOpen();
    await view.onLoadFile(v.file); await tick();
    if (order === 'after') chat = mount(contentEl);                                        // the order 0993 tested: the composer joins a finished tab
    if (order === 'again') { chat = mount(contentEl); await view.onLoadFile(v.file); }   // the tab builds its content a second time with the composer on it
    await settle(shaped);                                                                  // (the observer is a timer: wait for the shape, bounded, then the assertions say what is wrong)
  } finally { Object.assign(console, saved); }
  return { view, contentEl: contentEl as HTMLElement, chat: chat! };
}

test('the skip guard: the Beat Box page is found, so none of the tab tests below can skip', () => { assert.equal(skip, false, String(skip)); assert.ok(widgetHtml.length > 1000); });

for (const order of ['after', 'during', 'again'] as const) {
  test(`the real Beat Box tab, the composer joins ${order === 'after' ? 'AFTER the tab is built (the order 0993 tested)' : order === 'during' ? 'WHILE the tab is still opening' : 'and the tab builds a SECOND time'}: ONE iframe in the body, in the document, the Score in the body, the panel last, attached`, async () => {
    const { view, contentEl, chat } = await openTab(order);
    try {
      assert.ok(chat, 'the composer was mounted');
      const body = contentEl.querySelector('.forge-chat-body') as HTMLElement;
      assert.ok(body && body.isConnected, 'there is a body');
      const frames = Array.from(contentEl.querySelectorAll('iframe'));
      assert.equal(frames.length, 1, 'exactly one Beat Box iframe in the tab');
      assert.ok(frames[0]!.isConnected, 'the Beat Box iframe is in the document');
      assert.equal(frames[0]!.parentElement, body, 'the Beat Box iframe is in the scrolling body');
      assert.ok(body.querySelector('.forge-rhythm-edit-score'), 'the Score area is in the body, above the Beat Box');
      assert.ok(body.firstElementChild!.classList.contains('forge-rhythm-edit-score'), 'the Score is the first thing in the body (the order the tab draws)');
      assert.deepEqual(kids(contentEl), ['forge-chat-body', 'forge-chat-panel'], 'the tab holds the body and the panel, nothing else');
      assert.ok(contentEl.querySelector('.forge-chat-panel textarea'), 'the composer is there');
      assert.equal(chat.attached(), true, 'the controller\'s sync finds the panel where it was mounted: no second panel');
    } finally { chat?.dispose(); await view.onClose(); }
  });
}

// ---- 3. mechanism pin -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('mechanism pin (0992c): the panel\'s observer re-adopts the content of a tab that emptied its content element (body or panel out of the host: drop the old render, put both back)', () => {
  const src = fs.readFileSync(new URL('./chat-panel-dom.ts', import.meta.url), 'utf8');
  const obs = /const watch = Observer \? new Observer\(\(\) => \{[\s\S]*?\}\) : null;/.exec(src)![0];
  assert.match(obs, /body\.parentElement !== host \|\| panel\.parentElement !== host/, 'it notices that the body or the panel left the host');
  assert.match(obs, /while \(body\.firstChild\) body\.removeChild\(body\.firstChild\)/, 'it drops the old render');
  assert.match(obs, /host\.insertBefore\(body, host\.firstChild\)/); assert.match(obs, /host\.appendChild\(panel\)/);
  assert.ok(obs.indexOf('body.parentElement !== host') < obs.indexOf('for (const n of Array.from(host.childNodes))'), 'the re-adoption comes BEFORE the loop that moves the new content into the body');
  const tab = fs.readFileSync(new URL('./rhythm-edit-view.ts', import.meta.url), 'utf8');
  assert.match(tab, /this\.releaseIframe\(\);\s*this\.contentEl\.empty\(\);/, 'the tab still builds with releaseIframe + contentEl.empty() (the premise of the re-adoption)');
});
