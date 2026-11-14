// 2026-11-12-1204 - the prompt box, part two: when the GRAMMAR rejects the text typed in the box, the note is a PHRASE and the sentence service is set up, Apply asks the service ONCE (the same `askPlan` path and request builder as the strip's
// "Ask the sentence service" button) and shows the existing PREVIEW; nothing is written until the person applies it. The service costs money and needs a credential, so the whole file is about WHEN it is called: only on Apply, only after the
// grammar said no, never while typing, never when it is not configured. (2026-11-12-1206: for an arrangement and a composition too, forge-transpile 0.2.48: see prompt-box-families.test.ts.)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dialogButtons, dialogClick, dialogEntries, dialogLast } from './test-support/dialog-view.ts';
import { Window } from 'happy-dom';

import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { noteContentFor, readPhraseNote, type PhraseParams } from './phrase-core.ts';
import { newArrangementNote } from './arrangement-core.ts';
import { extractDescription } from './v2-note-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PATH = 'phrases/phrase_001.md';
const MIX: PhraseParams = { kind: 'mix', a: 'bar_007', b: 'bar_008', weight: 0.5, threshold: 0.5, ghost: false };
const FREE = 'make bar_007 twelve bars long, a bit slower';
const PLAN_EXTEND = { kind: 'extend', bar: 'bar_007', bars: 12, tempo_change_pct: -10 };
type Answer = { status: number; json: unknown };
const OK = (plan: unknown): Answer => ({ status: 200, json: { ok: true, parsed_ok: true, plan, error: null } });

function rig(opts: { service?: (payload: any) => Promise<Answer>; configured?: boolean; note?: string; path?: string } = {}) {
  const path = opts.path ?? PATH;
  const store = new Map<string, string>([[path, opts.note ?? noteContentFor('phrase_001', MIX)]]);
  const writes: string[] = [], asked: any[] = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    vault: () => ({ bars: ['bar_007', 'bar_008'], phrases: ['phrase_001', 'phrase_003'], arrangements: [], compositions: [], kits: ['rock'] }),
    barNames: () => ['bar_007', 'bar_008'], phraseNames: () => ['phrase_001'],
    setTimer: () => 0, clearTimer: () => {},
    trace: () => {}, panes: () => panes,
    ...(opts.service !== undefined ? { askPlan: async (payload: any) => { asked.push(payload); return opts.service!(payload); }, configured: () => opts.configured !== false } : {}),
  };
  const ctl = createDescriptionController(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const score = win.document.createElement('div'); score.className = 'forge-rhythm-edit-score'; el.appendChild(score);
  panes.push({ path, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const enter = async () => { field().dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await flush(); };
  const strip = () => dialogLast(el);                // 2026-11-13-1214: a box sentence's outcome is said in the dialog, no longer in the strip
  const buttons = () => dialogButtons(el);
  const click = async (action: string) => { dialogClick(el, action as 'apply-preview' | 'cancel-preview'); await flush(); };
  const ready = async () => { await ctl.inspect(path); await flush(); };
  return { ctl, store, writes, asked, el, flush, field, type, enter, strip, buttons, click, ready, path };
}

test('grammar-accepted text NEVER calls the service (a counting stub): it applies as in 1203', async () => {
  const r = rig({ service: async () => OK(PLAN_EXTEND) });
  await r.ready();
  r.type('Mix [[bar_007]] and [[bar_008]], 35 percent [[bar_007]], as a vote.'); await r.enter();
  assert.deepEqual(r.asked, []);
  assert.equal(r.writes.length, 1, 'applied by the grammar');
});

test('a rejected phrase sentence calls the service EXACTLY ONCE on Apply (the same request as the strip button), shows the PREVIEW, and writes nothing', async () => {
  const r = rig({ service: async () => OK(PLAN_EXTEND) });
  await r.ready();
  r.type(FREE); await r.enter();
  assert.equal(r.asked.length, 1);
  assert.equal(r.asked[0].sentence, FREE);
  assert.deepEqual(r.asked[0].bars, ['bar_007', 'bar_008']);
  assert.deepEqual(r.writes, [], 'a preview writes nothing');
  assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview']);
  assert.match(r.el.querySelector('.forge-chat-suggestion-description')!.textContent!, /12 bars/);
  assert.match(r.el.querySelector('.forge-chat-suggestion-recipe')!.textContent!, /12 bars/);
  assert.equal(r.field().value, FREE, 'the box keeps the text');
});

test('Cancel writes nothing and the box keeps the text; the suggestion in the DIALOG says Cancelled and its buttons are off (2026-11-13-1214: no strip, no explicit Ask for a box sentence: pressing Apply again asks), and no second request was made', async () => {
  const r = rig({ service: async () => OK(PLAN_EXTEND) });
  await r.ready();
  r.type(FREE); await r.enter(); await r.click('cancel-preview');
  assert.deepEqual(r.writes, []);
  assert.equal(r.field().value, FREE);
  assert.deepEqual(r.buttons(), [], 'the suggestion was used: its buttons are off');
  assert.equal(r.el.querySelector('.forge-chat-chosen')?.textContent, 'Cancelled.');
  assert.equal(r.asked.length, 1);
});

test('applying the preview writes the note (one write, the phrase the suggestion describes) and the box shows the CANONICAL grammar sentence, not the free one', async () => {
  const r = rig({ service: async () => OK(PLAN_EXTEND) });
  await r.ready();
  r.type(FREE); await r.enter(); await r.click('apply-preview');
  assert.deepEqual(r.writes, [PATH]);
  const read = readPhraseNote(r.store.get(PATH)!);
  assert.ok(read.ok && read.value.kind === 'extend' && read.value.bars === 12 && read.value.tempo_change_pct === -10);
  assert.equal(r.field().value, extractDescription(r.store.get(PATH)!), 'the box is the Description the note says now');
  assert.notEqual(r.field().value, FREE);
  assert.equal(r.el.querySelector('.forge-prompt-box.is-edited'), null);
  assert.equal(r.el.querySelector('.forge-prompt-box-conflict') === null || (r.el.querySelector('.forge-prompt-box-conflict') as HTMLElement).style.display === 'none', true, 'no leftover conflict');
  assert.match(r.strip(), /^Applied \(/, 'the dialog says what was applied (2026-11-13-1214: no longer the strip)');
  assert.equal(r.el.querySelector('.forge-chat-chosen')?.textContent, 'Applied.');
  assert.deepEqual(r.buttons(), []);
});

test('while the service thinks the box says so; a SECOND Apply does nothing (one request in flight); the answer then arrives once', async () => {
  let release!: (a: Answer) => void;
  const r = rig({ service: () => new Promise<Answer>((res) => { release = res; }) });
  await r.ready();
  r.type(FREE);
  r.field().dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await r.flush();
  assert.match(r.el.querySelector('.forge-prompt-box-state')!.textContent!, /Asking the sentence service/);
  assert.equal((r.el.querySelector('.forge-prompt-box-apply') as HTMLButtonElement).disabled, true);
  await r.enter(); (r.el.querySelector('.forge-prompt-box-apply') as HTMLElement).click(); await r.flush();
  assert.equal(r.asked.length, 1, 'a second Apply while busy does nothing');
  release(OK(PLAN_EXTEND)); await r.flush();
  assert.equal(r.asked.length, 1);
  assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview']);
  assert.doesNotMatch(r.el.querySelector('.forge-prompt-box-state')!.textContent!, /Asking/);
});

test('text edited in the box WHILE the service thinks: the answer is dropped with the existing guard message, nothing is written, the typing is kept', async () => {
  let release!: (a: Answer) => void;
  const r = rig({ service: () => new Promise<Answer>((res) => { release = res; }) });
  await r.ready();
  r.type(FREE); r.field().dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await r.flush();
  r.type(FREE + ' and louder');                                                                            // typed on while it thinks
  release(OK(PLAN_EXTEND)); await r.flush();
  assert.match(r.strip(), /^Dropped: The Description changed while the service was thinking; its suggestion was dropped/);
  assert.ok(!r.buttons().includes('apply-preview'), 'no preview for a sentence that is gone');
  assert.deepEqual(r.writes, []);
  assert.equal(r.field().value, FREE + ' and louder');
});

test('an unreachable service and a refusal each say their one plain sentence in the DIALOG, write nothing and leave the text', async () => {
  for (const [service, expect] of [
    [async () => { throw new Error('offline'); }, /Could not reach the transpile service \(offline\)/],
    [async () => ({ status: 200, json: { ok: false, parsed_ok: true, plan: null, error: 'That bar does not exist.' } }), /./],
    [async () => ({ status: 404, json: {} }), /does not offer planning yet/],
  ] as Array<[() => Promise<Answer>, RegExp]>) {
    const r = rig({ service });
    await r.ready();
    r.type(FREE); await r.enter();
    assert.match(r.strip(), expect);
    assert.deepEqual(r.writes, []);
    assert.equal(r.field().value, FREE, 'the text is kept');
    assert.ok(r.el.querySelector('.forge-prompt-box.is-edited'));
    assert.deepEqual(r.buttons(), []);                                                                      // 2026-11-13-1214: nothing to press in the dialog; the person presses Apply again to ask again
  }
});

test('NOT configured, or no service at all: a rejected sentence is the plain error with line and column (as in 1203) and the service is never called', async () => {
  for (const r of [rig({ service: async () => OK(PLAN_EXTEND), configured: false }), rig()]) {
    await r.ready();
    r.type(FREE); await r.enter();
    assert.deepEqual(r.asked, []);
    assert.ok(dialogEntries(r.el).some((e) => e.kind === 'rejected' && /line 1, column \d+/.test(e.text)), 'the dialog says where (line and column)');
    assert.match(r.strip(), /not set up|not available/, '2026-11-13-1214: and then why the service was not asked');
    assert.equal(r.field().value, FREE);
  }
});

test('an ARRANGEMENT asks the service too (2026-11-12-1206, replacing "never asks"): and a PHRASE plan in answer is refused as "not an arrangement" - nothing written, the text kept', async () => {
  const r = rig({ service: async () => OK(PLAN_EXTEND), path: 'arrangements/arr_001.md', note: newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }] }) });
  await r.ready();
  assert.ok(r.field(), 'the arrangement tab has its box');
  r.type('a rock groove with everything on'); await r.enter();
  assert.equal(r.asked.length, 1);
  assert.equal(r.asked[0].family, 'arrangement');
  assert.match(r.strip(), /not an arrangement/);
  assert.deepEqual(r.writes, []);
  assert.equal(r.field().value, 'a rock groove with everything on');
});

test('TYPING never calls the service: not on input, not on a pause, not on Shift+Enter; only Apply does', async () => {
  const r = rig({ service: async () => OK(PLAN_EXTEND) });
  await r.ready();
  for (const t of ['m', 'ma', 'make bar_00', FREE]) { r.type(t); await r.flush(); }
  r.field().dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })); await r.flush();
  await new Promise((res) => setTimeout(res, 20)); await r.flush();
  assert.deepEqual(r.asked, [], 'nothing asked while typing');
  await r.enter();
  assert.equal(r.asked.length, 1, 'and exactly once on Apply');
});

test('CONTROL: the checks can fail - a box that asks on INPUT calls the service while typing, and the same assertion catches it', async () => {
  const r = rig({ service: async () => OK(PLAN_EXTEND) });
  await r.ready();
  r.field().addEventListener('input', () => { void r.ctl.applyFromBox(r.path, r.field().value); });          // the damage: asks as you type
  for (const t of ['m', 'make bar_00', FREE]) { r.type(t); await r.flush(); }
  assert.notDeepEqual(r.asked, [], 'the damaged box DID ask while typing (so "nothing asked while typing" can fail)');
  assert.ok(r.asked.length >= 1);
});
