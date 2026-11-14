// 2026-11-13-1214 - the chat-style panel: the DOM (flex siblings, the dialog's messages, the resize handle that remembers its height, the dock toggle) and the controller's event feed into it (the person's sentence, every outcome, the service's suggestion
// with Apply / Cancel inside the message, a CONTROL's change told from a hand edit, persistence per note through the settings object), on the real writers. CONTROL: a controller without the event feed turns these red.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { mountChatPanel } from './chat-panel-dom.ts';
import { DIALOG_HEIGHT_DEFAULT, append, fromOutcome, memoryStore, settingsStore, type DialogEntry } from './dialog-core.ts';
import { PHRASE_DEFAULTS, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { dialogEntries } from './test-support/dialog-view.ts';
import { extractDescription } from './v2-note-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PATH = 'phrases/phrase_001.md';
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 };
const FREE = 'make bar_007 twelve bars long, a bit slower';
const PLAN = { kind: 'extend', bar: 'bar_007', bars: 12, tempo_change_pct: -10 };
const settle = async (n = 40) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
type Factory = typeof createDescriptionController;

function rig(opts: { factory?: Factory; store?: ReturnType<typeof settingsStore>; configured?: boolean; hold?: Promise<void>; start?: string } = {}) {
  const files = new Map<string, string>([[PATH, opts.start ?? noteContentFor('phrase_001', EXTEND)]]);
  const lines: string[] = [], writes: string[] = [], timers: Array<() => void> = []; let clock = 1_700_000_000_000;
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = files.get(p)!; const next = fn(cur); if (next !== cur) { files.set(p, next); writes.push(p); } },
    vault: () => ({ bars: ['bar_007', 'bar_008'], phrases: ['phrase_001'], arrangements: [], compositions: [], kits: [] }),
    barNames: () => ['bar_007', 'bar_008'], phraseNames: () => ['phrase_001'],
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {},
    trace: (l) => lines.push(l), panes: () => panes,
    askPlan: async () => { if (opts.hold) await opts.hold; return { status: 200, json: { ok: true, parsed_ok: true, plan: PLAN, error: null } }; },
    configured: () => opts.configured !== false,
    now: () => (clock += 60_000),
    ...(opts.store ? { dialogStore: opts.store } : {}),
  };
  const ctl = (opts.factory ?? createDescriptionController)(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const score = win.document.createElement('div'); score.className = 'forge-rhythm-edit-score'; el.appendChild(score);
  panes.push({ path: PATH, contentEl: el, tab: true });
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const enter = async () => { field().dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await settle(); };
  const fire = async () => { while (timers.length) timers.shift()!(); await settle(); };
  const open = async () => { await ctl.inspect(PATH); await settle(); };
  return { ctl, files, lines, writes, el: el as HTMLElement, field, type, enter, fire, open };
}
const kinds = (el: HTMLElement) => dialogEntries(el).map((e) => e.kind);

// ---- the DOM ------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the panel is a FLEX SIBLING below the body: the tab\'s content moves into the body (Score first), the panel holds the dialog and the box LAST; nothing is positioned over the Score; dispose gives the content back', () => {
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const score = win.document.createElement('div'); score.className = 'forge-rhythm-edit-score'; host.appendChild(score);
  const h = mountChatPanel(host, { box: { placeholder: 'x', apply: async () => ({ ok: false }) }, store: memoryStore(), choose() {} }, 'Extend [[bar_007]].');
  assert.deepEqual([...host.children].map((c: any) => c.className), ['forge-chat-body', 'forge-chat-panel']);
  assert.equal(host.firstElementChild!.firstElementChild, score);
  const panel = host.lastElementChild as HTMLElement;
  assert.deepEqual([...panel.children].map((c: any) => c.className.split(' ')[0]), ['forge-chat-resize', 'forge-chat-head', 'forge-chat-current', 'forge-chat-log', 'forge-prompt-box']);
  for (const c of [host.firstElementChild!, panel, panel.lastElementChild!]) assert.doesNotMatch((c as HTMLElement).getAttribute('style') ?? '', /position:\s*(sticky|absolute|fixed)/);
  assert.ok(host.classList.contains('forge-chat-host') && host.classList.contains('forge-chat-dock-bottom'));
  h.dispose();
  assert.deepEqual([...host.children], [score]); assert.equal(host.classList.contains('forge-chat-host'), false);
});
test('something the tab appends later (a strip for a note\'s new kind) goes into the BODY, in its place: before the body = first, after = last; never beside or under the panel', async () => {
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const h = mountChatPanel(host, { box: { placeholder: 'x', apply: async () => ({ ok: false }) }, store: memoryStore(), choose() {} }, '');
  const late = win.document.createElement('div'); late.className = 'late'; host.appendChild(late);
  const first = win.document.createElement('div'); first.className = 'first'; host.insertBefore(first, host.firstChild);
  await settle(); await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual([...host.children].map((c: any) => c.className), ['forge-chat-body', 'forge-chat-panel']);
  assert.deepEqual([...host.firstElementChild!.children].map((c: any) => c.className), ['first', 'late']);
  h.dispose();
});
test('the dialog draws entries oldest first with who and time, the pinned "Current:" line is not part of the history, links stay plain text, and no HTML in a message is ever interpreted', () => {
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const h = mountChatPanel(host, { box: { placeholder: '', apply: async () => ({ ok: false }) }, store: memoryStore(), choose() {} }, '');
  let l: DialogEntry[] = [];
  l = append(l, fromOutcome({ type: 'you', text: 'make [[bar_007]] <b>longer</b>' }), Date.UTC(2026, 10, 13, 12, 5));
  l = append(l, fromOutcome({ type: 'control', summary: 'weight 0.5 -> 0.35', description: 'Mix [[bar_007]].' }), Date.UTC(2026, 10, 13, 12, 6));
  h.render(l, 'Extend [[bar_007]] to 8 bars.');
  const msgs = [...host.querySelectorAll('.forge-chat-msg')] as HTMLElement[];
  assert.equal(msgs.length, 2);
  assert.deepEqual(msgs.map((m) => m.getAttribute('data-kind')), ['you', 'control']);
  assert.equal(msgs[0]!.querySelector('.forge-chat-who')!.textContent, 'You'); assert.equal(msgs[1]!.querySelector('.forge-chat-who')!.textContent, 'Controls');
  assert.match(msgs[0]!.querySelector('.forge-chat-time')!.textContent!, /^\d\d:\d\d$/);
  assert.equal(msgs[0]!.querySelector('.forge-chat-text')!.textContent, 'make [[bar_007]] <b>longer</b>'); assert.equal(msgs[0]!.querySelector('b'), null);
  assert.equal((host.querySelector('.forge-chat-current') as HTMLElement).textContent, 'Current: Extend [[bar_007]] to 8 bars.');
  assert.equal(host.querySelectorAll('.forge-chat-log .forge-chat-current').length, 0);
  h.dispose();
});
test('resize: a drag on the top edge changes the dialog\'s height and the end of the drag remembers it; the arrow keys do too; the height is clamped; a new mount starts from the remembered height', () => {
  const store = memoryStore();
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const h = mountChatPanel(host, { box: { placeholder: '', apply: async () => ({ ok: false }) }, store, choose() {} }, '');
  const log = host.querySelector('.forge-chat-log') as HTMLElement, handle = host.querySelector('.forge-chat-resize') as HTMLElement;
  assert.equal(log.style.height, `${DIALOG_HEIGHT_DEFAULT}px`);
  const ev = (type: string, y: number) => { const e = new win.Event(type, { bubbles: true, cancelable: true }); (e as any).clientY = y; (e as any).pointerId = 1; handle.dispatchEvent(e); };
  ev('pointerdown', 500); ev('pointermove', 440);                                                           // up 60 px = 60 px taller
  assert.equal(log.style.height, `${DIALOG_HEIGHT_DEFAULT + 60}px`); assert.equal(store.height(), DIALOG_HEIGHT_DEFAULT, 'not remembered until the drag ends');
  ev('pointerup', 440); assert.equal(store.height(), DIALOG_HEIGHT_DEFAULT + 60);
  handle.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  assert.equal(store.height(), DIALOG_HEIGHT_DEFAULT + 36);
  ev('pointerdown', 500); ev('pointermove', -5000); ev('pointerup', -5000);
  assert.equal(store.height(), 480, 'clamped');
  h.dispose();
  const host2 = win.document.createElement('div'); win.document.body.appendChild(host2);
  const h2 = mountChatPanel(host2, { box: { placeholder: '', apply: async () => ({ ok: false }) }, store, choose() {} }, '');
  assert.equal((host2.querySelector('.forge-chat-log') as HTMLElement).style.height, '480px', 'a new tab opens at the remembered height'); h2.dispose();
});
test('the dock toggle (phase B): "Dock: bottom" -> right turns the host to a row, hides the resize handle, remembers the choice; back again; a new mount opens as it was left', () => {
  const store = memoryStore();
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const h = mountChatPanel(host, { box: { placeholder: '', apply: async () => ({ ok: false }) }, store, choose() {} }, '');
  const btn = host.querySelector('.forge-chat-dock') as HTMLElement;
  assert.equal(btn.textContent, 'Dock: bottom');
  btn.click();
  assert.equal(btn.textContent, 'Dock: right'); assert.ok(host.classList.contains('forge-chat-dock-right') && !host.classList.contains('forge-chat-dock-bottom'));
  assert.equal((host.querySelector('.forge-chat-resize') as HTMLElement).style.display, 'none'); assert.equal(store.dock(), 'right');
  assert.deepEqual([...host.children].map((c: any) => c.className), ['forge-chat-body', 'forge-chat-panel'], 'same panel, same order: the CSS makes it a row');
  h.dispose();
  const host2 = win.document.createElement('div'); win.document.body.appendChild(host2);
  const h2 = mountChatPanel(host2, { box: { placeholder: '', apply: async () => ({ ok: false }) }, store, choose() {} }, '');
  assert.ok(host2.classList.contains('forge-chat-dock-right')); (host2.querySelector('.forge-chat-dock') as HTMLElement).click(); assert.ok(host2.classList.contains('forge-chat-dock-bottom')); h2.dispose();
});

// ---- the controller feeds it --------------------------------------------------------------------------------------------------------------------------------------------
test('a box Apply adds YOU (the sentence as typed), then the outcome in plain words: a sentence the grammar accepts is "Applied (...)" with the Description now', async () => {
  const r = rig(); await r.open();
  r.type('Extend [[bar_007]] to 6 bars, repeating with fills.'); await r.enter();
  assert.deepEqual(kinds(r.el), ['you', 'applied']);
  const e = dialogEntries(r.el);
  assert.equal(e[0]!.text, 'Extend [[bar_007]] to 6 bars, repeating with fills.');
  assert.match(e[1]!.text, /^Applied \(8 -> 6 bars\): Extend \[\[bar_007\]\] to 6 bars/);
  assert.equal((r.el.querySelector('.forge-chat-current') as HTMLElement).textContent!.startsWith('Current: Extend'), true);
});
test('a rejected sentence adds the grammar message WITH line and column, then (service set up) "Asking...", then the suggestion as an assistant message carrying the Description, the Recipe and Apply / Cancel', async () => {
  let release!: () => void; const hold = new Promise<void>((ok) => { release = ok; });
  const r = rig({ hold }); await r.open();
  r.type(FREE); await r.enter();
  assert.deepEqual(kinds(r.el), ['you', 'rejected', 'asking']);
  assert.match(dialogEntries(r.el)[1]!.text, /^The grammar did not accept this sentence \(line 1, column \d+: /);
  release(); await settle();
  assert.deepEqual(kinds(r.el), ['you', 'rejected', 'asking', 'suggestion']);
  const m = r.el.querySelector('.forge-chat-msg[data-kind="suggestion"]')!;
  assert.match(m.querySelector('.forge-chat-suggestion-description')!.textContent!, /12 bars/);
  assert.match(m.querySelector('.forge-chat-suggestion-recipe')!.textContent!, /12 bars/);
  assert.deepEqual([...m.querySelectorAll('.forge-chat-action')].map((b: any) => [b.textContent, b.disabled]), [['Apply', false], ['Cancel', false]]);
  assert.equal(r.el.querySelector('.forge-description-bar'), null, 'nothing in the strip at the top for a box sentence');
  assert.deepEqual(r.writes, []);
});
test('Apply inside the message writes the note once and the message says Applied (buttons off), then an "Applied (...)" line follows; a second click does nothing', async () => {
  const r = rig(); await r.open();
  r.type(FREE); await r.enter();
  (r.el.querySelector('.forge-chat-action[data-choice="apply"]') as HTMLElement).click(); await settle();
  assert.deepEqual(r.writes, [PATH]);
  assert.match(extractDescription(r.files.get(PATH)!), /12 bars/);
  assert.equal(r.el.querySelector('.forge-chat-chosen')!.textContent, 'Applied.');
  assert.ok([...r.el.querySelectorAll('.forge-chat-action')].every((b: any) => b.disabled));
  assert.equal(kinds(r.el).at(-1), 'applied');
  (r.el.querySelector('.forge-chat-action[data-choice="apply"]') as HTMLElement).click(); await settle();
  assert.deepEqual(r.writes, [PATH], 'the second click did nothing');
  assert.equal(r.el.querySelector('.forge-description-bar'), null);
});
test('Cancel inside the message writes nothing and says Cancelled; a NEWER sentence expires an older suggestion that was never used', async () => {
  const r = rig(); await r.open();
  r.type(FREE); await r.enter();
  (r.el.querySelector('.forge-chat-action[data-choice="cancel"]') as HTMLElement).click(); await settle();
  assert.deepEqual(r.writes, []); assert.equal(r.el.querySelector('.forge-chat-chosen')!.textContent, 'Cancelled.');
  r.type(FREE + ' please'); await r.enter();                                                               // a new suggestion
  r.type(FREE + ' again'); await r.enter();                                                                // and another: the one before is no longer current
  const states = [...r.el.querySelectorAll('.forge-chat-msg[data-kind="suggestion"] .forge-chat-chosen')].map((x) => x.textContent);
  assert.deepEqual(states, ['Cancelled.', 'No longer current.']);
  assert.equal(r.el.querySelectorAll('.forge-chat-action:not([disabled])').length, 2, 'only the newest suggestion has live buttons');
});
test('service not set up: the dialog says so (and no request was made); the text stays in the box', async () => {
  const r = rig({ configured: false }); await r.open();
  r.type(FREE); await r.enter();
  assert.deepEqual(kinds(r.el), ['you', 'rejected', 'notice']);
  assert.match(dialogEntries(r.el)[2]!.text, /not set up/);
});
test('a CONTROL changing the Description adds a CONTROL message ("Controls: <what changed>. The Description is now: ...") and moves the pinned Current line; a HAND edit and the controller\'s own writes do not', async () => {
  const r = rig(); await r.open();
  const before = kinds(r.el);
  r.files.set(PATH, noteContentFor('phrase_001', { ...EXTEND, bars: 12 }));                                 // what a control writes: every facet in step (the note is synced)
  r.ctl.modified(PATH); await settle();
  assert.deepEqual(kinds(r.el), [...before, 'control']);
  assert.match(dialogEntries(r.el).at(-1)!.text, /^Controls: 8 -> 12 bars\. The Description is now: Extend \[\[bar_007\]\] to 12 bars/);
  assert.match((r.el.querySelector('.forge-chat-current') as HTMLElement).textContent!, /12 bars/);
  r.ctl.modified(PATH); await settle();
  assert.equal(kinds(r.el).filter((k) => k === 'control').length, 1, 'the same text heard again is not a second change');
  // a hand edit in the text view: the Description moves, the other facets do not (not synced when heard): no CONTROL message
  const hand = r.files.get(PATH)!.replace(extractDescription(r.files.get(PATH)!), 'Extend [[bar_007]] to 5 bars, repeating with fills.');
  r.files.set(PATH, hand); r.ctl.modified(PATH); await settle();
  assert.equal(kinds(r.el).filter((k) => k === 'control').length, 1, 'a hand edit is not a control');
  await r.fire();                                                                                           // the debounce applies it by itself: the controller's own write, still no control message
  assert.equal(kinds(r.el).filter((k) => k === 'control').length, 1);
  assert.deepEqual(r.writes, [PATH]);
  // the box's own Apply is not a control either
  r.type('Extend [[bar_007]] to 7 bars, repeating with fills.'); await r.enter();
  assert.equal(kinds(r.el).filter((k) => k === 'control').length, 1);
});
test('the history is kept 50 per note and PERSISTS through the settings object: a new controller and a new tab show it again; entries carry no token or URL; open suggestions come back expired', async () => {
  const settings: any = {}; let saves = 0;
  const store = settingsStore(settings, () => { saves++; });
  const r = rig({ store }); await r.open();
  r.type(FREE); await r.enter();                                                                            // a suggestion left open
  r.type('Extend [[bar_007]] to 6 bars, repeating with fills.'); await r.enter();
  assert.ok(saves > 0);
  const raw = JSON.parse(JSON.stringify(settings));                                                         // what data.json round-trips to
  assert.deepEqual(Object.keys(raw.dialogHistory), [PATH]);
  assert.ok(!/https?:\/\/|token/i.test(JSON.stringify(raw)), 'no URL and no token in the stored history');
  const r2 = rig({ store: settingsStore(raw, () => {}) }); await r2.open();
  assert.deepEqual(kinds(r2.el), kinds(r.el), 'the reopened tab shows the same history');
  assert.deepEqual([...r2.el.querySelectorAll('.forge-chat-action')].every((b: any) => b.disabled), true, 'an old suggestion has no live buttons after a restart');
  for (let i = 0; i < 60; i++) { r2.type('Extend [[bar_007]] to 6 bars, repeating with fills.'); await r2.enter(); r2.type('Extend [[bar_007]] to 8 bars, repeating with fills.'); await r2.enter(); }
  assert.ok(dialogEntries(r2.el).length <= 50, `${dialogEntries(r2.el).length} entries`);
  assert.equal(JSON.parse(JSON.stringify(settings)).dialogHistory[PATH].length <= 50, true);
});

// ---- the CONTROL: a controller without the event feed turns the dialog tests red ---------------------------------------------------------------------------------------------
async function damagedFactory(from: string, to: string): Promise<Factory> {
  const src = path.resolve(import.meta.dirname, 'description-apply.ts');
  let text = fs.readFileSync(src, 'utf8');
  assert.ok(text.includes(from), `the control's premise: description-apply.ts contains ${from.slice(0, 60)}`);
  text = text.replace(from, to).replace(/from '\.\/([^']+)'/g, (_m, f) => `from '${pathToFileURL(path.resolve(import.meta.dirname, f)).href}'`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-control-1214-'));
  try { const file = path.join(dir, 'description-apply-damaged.ts'); fs.writeFileSync(file, text); return (await import(pathToFileURL(file).href)).createDescriptionController as Factory; }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('CONTROL: without the event feed (say) the dialog stays empty; without the control-change notice a control is silent; with the real controller the same scenarios pass', async () => {
  const noFeed = await damagedFactory("    dialogs.set(path, l); store.setEntries(path, l); drawDialog(path);\n  };\n  const endSuggestion", "    void l;\n  };\n  const endSuggestion");
  const a = rig({ factory: noFeed }); await a.open(); a.type('Extend [[bar_007]] to 6 bars, repeating with fills.'); await a.enter();
  assert.deepEqual(kinds(a.el), [], 'without the feed nothing is said');
  const noControl = await damagedFactory("    say(path, { type: 'control', summary, description: extractDescription(text) });", '');
  const b = rig({ factory: noControl }); await b.open();
  b.files.set(PATH, noteContentFor('phrase_001', { ...EXTEND, bars: 12 })); b.ctl.modified(PATH); await settle();
  assert.deepEqual(kinds(b.el), [], 'without the notice a control change is silent');
  const real = rig(); await real.open(); real.type('Extend [[bar_007]] to 6 bars, repeating with fills.'); await real.enter();
  assert.deepEqual(kinds(real.el), ['you', 'applied']);
});

test('WIRING: the plugin hands the controller the settings-backed store (main.ts -> score-first hooks -> descriptionPortsFor), and the settings have the three keys with sane defaults', async () => {
  const { descriptionPortsFor } = await import('./description-wiring.ts');
  const store = memoryStore();
  const env = { read: async () => '', process: async () => {}, basenamesIn: () => [], panes: () => [], setTimer: () => 0, clearTimer: () => {}, trace: () => {}, warn: () => {} };
  assert.equal(descriptionPortsFor(env, { dialogStore: store }).dialogStore, store);
  assert.equal(descriptionPortsFor(env, {}).dialogStore, undefined, 'none given: the controller keeps its own session memory');
  const main = fs.readFileSync(path.resolve(import.meta.dirname, 'main.ts'), 'utf8');
  assert.match(main, /dialogStore: settingsStore\(this\.settings, \(\) => \{ this\.saveDialogSoon\(\); \}\)/);
  const settings = fs.readFileSync(path.resolve(import.meta.dirname, 'settings.ts'), 'utf8');                      // settings.ts imports obsidian: read as text
  assert.match(settings, /dialogHistory: \{\},\s*dialogHeight: 112,\s*dialogDock: 'bottom',/);
});
