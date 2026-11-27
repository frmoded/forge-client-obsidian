// 2026-11-26-1047 (stage 5): DETACH while the composer has a sentence-service SUGGESTION open, or a request still OUT. Detach drops the note's undo, preview and pending question: the tab shows the custom banner, the composer is gone, the command is gone, a late
// answer puts nothing on the note, and the custom note's bytes stay. The same for a note that becomes custom by another hand while a suggestion is open. Through the real plugin tabs and through the real controller.
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { Window } from 'happy-dom';

import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { DESCRIPTION_DEBOUNCE_MS } from './description-apply-core.ts';
import { memoryStore } from './dialog-core.ts';
import { PHRASE_DEFAULTS, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { CUSTOM_BANNER, asCustom, withLinks } from './phrase-notes-core.ts';
import { asListNote } from './test-support/phrase-list-fixtures.ts';
import { musicTabsWorld, realMusicPlugin, type MusicTabsWorld } from './test-support/music-tabs-world.ts';
import type { RealPlugin } from './test-support/bundle-real-plugin.ts';

const PATH = 'phrases/phrase_001.md', COMMAND = 'detach-to-custom-python';
const UNREADABLE = 'make it longer please and slower';
const SUGGESTION = { status: 200, json: { ok: true, lines: ['Make it 7 bars long.'], question: null } };
const QUESTION = { status: 200, json: { ok: true, lines: [], question: 'How many bars?' } };
const REFUSAL = { status: 200, json: { ok: false, error: 'I cannot say that yet.', lines: null, question: null } };

// ---- the real plugin tabs -------------------------------------------------------------------------------------------------------------------------------------------------------------

let real: RealPlugin;
before(async () => { real = await realMusicPlugin(); });

/** A phrase tab of the real plugin with the sentence service set up; `answer()` is what POST /plan says (a promise holds the request out). */
async function phraseTab(answer: () => Promise<unknown>) {
  const sent: string[] = [];
  (globalThis as any).__shimFns = { requestUrl: async (req: any) => { if (!String(req.url).endsWith('/plan')) return undefined; sent.push(String(req.body)); return answer(); } };
  const x = await musicTabsWorld(real);
  Object.assign(x.plugin.target.settings, { transpileServiceUrl: 'https://svc.example', transpileServiceToken: 'tok-123', useOwnAnthropicKey: false, ownAnthropicKey: '' });
  const view = x.viewOf(await x.restoreTab('forge-phrase', PATH));
  const command = x.plugin.commands.get(COMMAND)! as { checkCallback: (checking: boolean) => boolean };
  return { x, view, command, sent, done: () => { delete (globalThis as any).__shimFns; x.done(); } };
}
const modalButton = (x: MusicTabsWorld, label: string): HTMLElement => [...x.modals.at(-1).contentEl.querySelectorAll('button')].find((b: any) => b.textContent === label) as HTMLElement;
const tabMsg = (v: any): string => v.contentEl.querySelector('.forge-description-message')?.textContent ?? '';
const suggestions = (el: HTMLElement): number => el.querySelectorAll('.forge-chat-msg[data-kind="suggestion"]').length;

async function assertTabDetached(t: Awaited<ReturnType<typeof phraseTab>>, start: string, oldField: HTMLTextAreaElement): Promise<void> {
  const custom = withLinks(asCustom(start), ['bar_007']);
  assert.equal(t.x.store.get(PATH), custom);
  assert.equal(tabMsg(t.view), CUSTOM_BANNER);
  assert.equal(t.x.field(t.view) === null, true, 'no composer');
  assert.equal(suggestions(t.view.contentEl), 0, 'no suggestion in the tab');
  assert.equal(t.command.checkCallback(true), false, 'the command is gone');
  const asked = t.sent.length;
  for (let i = 0; i < 2; i++) { oldField.dispatchEvent(new (globalThis as any).window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' })); await t.x.settle(500); }
  assert.equal(t.x.store.get(PATH), custom, 'Enter does nothing');
  assert.deepEqual(t.x.writes, [PATH], 'the one write is the Detach');
  assert.equal(t.sent.length, asked);
  assert.equal(tabMsg(t.view), CUSTOM_BANNER);
  assert.equal(t.x.field(t.view) === null, true);
}

test('1047 DETACH (tab) with a service suggestion OPEN: the banner, no composer, no command, Enter does nothing, the custom bytes stay', async () => {
  const t = await phraseTab(async () => SUGGESTION);
  try {
    const start = t.x.store.get(PATH)!;
    const field = t.x.field(t.view)!;
    field.value = UNREADABLE; field.dispatchEvent(new (globalThis as any).window.Event('input', { bubbles: true }));
    await t.x.press(t.view, { key: 'Enter' }); await t.x.settle(800);
    assert.equal(t.sent.length, 1);
    assert.equal(suggestions(t.view.contentEl), 1, 'the suggestion is open');
    assert.equal(t.command.checkCallback(false), true); await t.x.settle(60);
    modalButton(t.x, 'Detach').click(); await t.x.settle(1500);
    await assertTabDetached(t, start, field);
  } finally { t.done(); }
});

test('1047 DETACH (tab) with a request still OUT: the banner at once; the late answer puts no suggestion on the note and brings no composer back', async () => {
  let release!: () => void; const hold = new Promise<void>((ok) => { release = ok; });
  const t = await phraseTab(async () => { await hold; return SUGGESTION; });
  try {
    const start = t.x.store.get(PATH)!;
    const field = t.x.field(t.view)!;
    field.value = UNREADABLE; field.dispatchEvent(new (globalThis as any).window.Event('input', { bubbles: true }));
    await t.x.press(t.view, { key: 'Enter' }); await t.x.settle(100);
    assert.equal(t.sent.length, 1);
    t.command.checkCallback(false); await t.x.settle(60);
    modalButton(t.x, 'Detach').click(); await t.x.settle(1500);
    assert.equal(tabMsg(t.view), CUSTOM_BANNER, 'before the answer');
    assert.equal(t.x.field(t.view) === null, true, 'before the answer');
    release(); await t.x.settle(1500);
    await assertTabDetached(t, start, field);
  } finally { release(); t.done(); }
});

// ---- the real controller ------------------------------------------------------------------------------------------------------------------------------------------------------------

const win: any = new Window({ url: 'http://localhost/' });
const VAULT = { bars: ['bar_007', 'bar_008'], phrases: ['phrase_001'], arrangements: [] as string[], compositions: [] as string[], kits: [] as string[] };
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 };
const START = (): string => asListNote(noteContentFor('phrase_001', EXTEND), 'phrase_001');

function rig(answers: Array<unknown | (() => Promise<unknown>)>) {
  const store = new Map<string, string>([[PATH, START()]]);
  let now = 0; const timers: Array<{ id: number; at: number; fn: () => void }> = []; let ids = 0;
  const writes: string[] = [], sent: any[] = [], lines: string[] = [];
  const dialog = memoryStore();
  const el: HTMLElement = win.document.createElement('div'); win.document.body.appendChild(el);
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    vault: () => VAULT, barNames: () => VAULT.bars, phraseNames: () => VAULT.phrases,
    setTimer: (fn, ms) => { const id = ++ids; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    trace: (l) => lines.push(l), panes: () => [{ path: PATH, contentEl: el, tab: true }], dialogStore: dialog,
    askPlan: async (payload: unknown) => { sent.push(JSON.parse(JSON.stringify(payload))); const a = answers.shift(); return (typeof a === 'function' ? await a() : a) as { status: number; json: unknown }; },
    configured: () => true, confirm: async () => true,
  };
  const ctl = createDescriptionController(ports);
  const settle = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 80; i++) await Promise.resolve(); };
  const advance = async (ms: number) => { now += ms; for (;;) { const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); } await settle(); };
  const open = async () => { await ctl.inspect(PATH); ctl.syncBars(); await settle(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement | null;
  const enter = async (f: HTMLTextAreaElement) => { f.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await settle(); };
  const send = async (text: string) => { const f = field()!; assert.ok(f, 'the composer'); f.value = text; f.dispatchEvent(new win.Event('input', { bubbles: true })); await enter(f); return f; };
  const escape = async (f: HTMLTextAreaElement) => { f.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await settle(); };
  const entries = () => dialog.entries(PATH);
  const suggested = () => entries().filter((e) => e.kind === 'suggestion');
  const msg = () => el.querySelector('.forge-description-message')?.textContent ?? '';
  return { ctl, store, writes, sent, lines, el, advance, settle, open, field, enter, send, escape, entries, suggested, msg };
}
type Rig = ReturnType<typeof rig>;
const held = () => { let release!: () => void; const gate = new Promise<void>((ok) => { release = ok; }); return { release, answer: (a: unknown) => async () => { await gate; return a; } }; };

/** The note is custom on disk (`custom`), the tab says so and has no composer, and nothing the old composer does changes that. */
async function assertDetached(r: Rig, custom: string, oldField: HTMLTextAreaElement): Promise<void> {
  assert.equal(r.store.get(PATH), custom);
  assert.equal(r.msg(), CUSTOM_BANNER);
  assert.equal(r.el.querySelectorAll('.forge-description-button').length, 0);
  assert.equal(r.field() === null, true, 'no composer');
  assert.equal(r.suggested().filter((e) => e.suggestion?.state === 'open').length, 0, 'no suggestion is open');
  assert.equal(r.ctl.canDetach(PATH), false);
  const writes = r.writes.length, asked = r.sent.length, said = r.entries().length;
  await r.enter(oldField); await r.enter(oldField);
  r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS); await r.ctl.inspect(PATH); await r.settle();
  assert.equal(r.store.get(PATH), custom, 'Enter does nothing');
  assert.deepEqual([r.writes.length, r.sent.length, r.entries().length], [writes, asked, said], 'no write, no request, nothing said');
  assert.equal(r.msg(), CUSTOM_BANNER);
  assert.equal(r.field() === null, true);
}

test('1047 DETACH with a suggestion OPEN: banner, no composer, canDetach false, the suggestion is over, Enter does nothing', async () => {
  const r = rig([SUGGESTION]); await r.open();
  const f = await r.send(UNREADABLE);
  assert.equal(r.suggested().at(-1)?.suggestion?.state, 'open');
  await r.ctl.detach(PATH); await r.settle();
  await assertDetached(r, withLinks(asCustom(START()), ['bar_007']), f);
});

test('1047 DETACH with a request still OUT: the late answer is no suggestion and repaints nothing', async () => {
  const h = held(); const r = rig([h.answer(SUGGESTION)]); await r.open();
  const f = await r.send(UNREADABLE);
  await r.ctl.detach(PATH); await r.settle();
  assert.equal(r.msg(), CUSTOM_BANNER, 'before the answer'); assert.equal(r.field() === null, true, 'before the answer');
  h.release(); await r.settle();
  assert.deepEqual(r.suggested(), [], 'no suggestion was ever said');
  await assertDetached(r, withLinks(asCustom(START()), ['bar_007']), f);
});

test('1047 DETACH after Esc while the service still thinks: the dropped (cancelled) answer does not bring the composer back or take the banner away', async () => {
  const h = held(); const r = rig([h.answer(SUGGESTION)]); await r.open();
  const f = await r.send(UNREADABLE);
  await r.escape(f);
  await r.ctl.detach(PATH); await r.settle();
  h.release(); await r.settle();
  assert.ok(r.lines.includes('[forge-description] asked the service about phrase_001 -> dropped: cancelled'), r.lines.join('\n'));
  assert.equal(r.msg(), CUSTOM_BANNER, 'at once, before any other look');
  assert.equal(r.field() === null, true, 'at once, before any other look');
  await assertDetached(r, withLinks(asCustom(START()), ['bar_007']), f);
});

for (const [what, answer] of [['a suggestion', SUGGESTION], ['a question', QUESTION]] as const) {
  test(`1047 DETACH with "Translate line N." still OUT, answered by ${what}: nothing on the note, no composer back, no question remembered`, async () => {
    const h = held(); const r = rig([REFUSAL, h.answer(answer), SUGGESTION]); await r.open();
    await r.send(UNREADABLE);                                                      // refused: kept as a waiting line (line 2)
    await r.settle();
    const waiting = r.store.get(PATH)!; assert.notEqual(waiting, START(), 'a waiting line is in the note');
    const f = await r.send('Translate line 2.');
    assert.equal(r.sent.length, 2);
    await r.ctl.detach(PATH); await r.settle();
    const custom = r.store.get(PATH)!;
    h.release(); await r.settle();
    assert.deepEqual(r.suggested(), []);
    assert.equal(r.entries().some((e) => e.text.includes('How many bars?')), false, 'the question is not put to a custom note');
    assert.deepEqual([r.entries().at(-1)!.kind, r.entries().at(-1)!.text], ['notice', CUSTOM_BANNER], 'the asking ends with why');
    assert.equal(r.msg(), CUSTOM_BANNER, 'at once'); assert.equal(r.field() === null, true, 'at once');
    await assertDetached(r, custom, f);
    // the generated note comes back (Restore to last commit): the next request carries no question from before the Detach
    r.store.set(PATH, START()); await r.ctl.reset(PATH); await r.settle();
    await r.send(UNREADABLE);
    assert.equal(r.sent.length, 3);
    assert.equal('previous' in r.sent[2], false);
  });
}

for (const state of ['a suggestion open', 'a request still out'] as const) {
  test(`1047 a note that becomes custom by ANOTHER hand with ${state}: the next look shows the banner and takes the composer away; nothing writes over it`, async () => {
    const h = held(); const r = rig([state === 'a suggestion open' ? SUGGESTION : h.answer(SUGGESTION)]); await r.open();
    const f = await r.send(UNREADABLE);
    const custom = asCustom(START());                                              // the Description is as it was: only the front matter says custom now
    r.store.set(PATH, custom); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
    assert.equal(r.msg(), CUSTOM_BANNER); assert.equal(r.field() === null, true); assert.equal(r.ctl.canDetach(PATH), false);
    h.release(); await r.settle();
    assert.equal(r.msg(), CUSTOM_BANNER); assert.equal(r.field() === null, true);
    await r.enter(f); await r.enter(f);
    assert.equal(r.store.get(PATH), custom); assert.deepEqual(r.writes, []);
    assert.equal(r.msg(), CUSTOM_BANNER); assert.equal(r.field() === null, true);
  });
}

test('1047 a custom note made generated again BY HAND (no reset) is read as generated: the banner goes, the composer comes back and takes a sentence', async () => {
  const r = rig([]); await r.open();
  await r.ctl.detach(PATH); await r.settle();
  assert.equal(r.msg(), CUSTOM_BANNER);
  r.store.set(PATH, START()); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.equal(r.msg(), ''); assert.equal(r.ctl.canDetach(PATH), true);
  await r.send('Make it 5 bars long.');
  assert.equal(r.suggested().at(-1)?.suggestion?.state, 'open');
});
