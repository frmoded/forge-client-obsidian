// 2026-10-27-1015: the dialog of "New phrase from a sentence" (plain DOM, no obsidian import; the Modal around it is a few lines) in happy-dom, with the real EVENT ORDER of a person: type, Plan (the dialog is busy while the service
// answers), read the preview, maybe edit the sentence (the preview is no longer about it), Plan again, Create (the note is written and the dialog closes). Refusals are shown as one sentence; nothing is created by a refusal.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import type { PlanView, SentencePlanner } from './sentence-plan-core.ts';
import { mountSentencePlan } from './sentence-plan-dom.ts';

const win: any = new Window({ url: 'http://localhost/' });
const OK: PlanView = { ok: true, kind: 'morph', name: 'phrase_004', path: 'phrases/phrase_004.md', description: 'phrase_004 — a morph from [[bar_001]] to [[bar_008]] in 5 bars, musical order.', recipe: 'morph_rhythm([[bar_001]], [[bar_008]], bars=5, order="musical", seed=0)' };

function rig(opts: { names?: string[] } = {}) {
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const calls: string[] = [];
  const pending: Array<(v: PlanView) => void> = [];
  const createPending: Array<(v: { ok: boolean; path?: string; message?: string }) => void> = [];
  const planner: SentencePlanner = {
    plan: (s) => { calls.push(`plan ${s}`); return new Promise((res) => { pending.push(res); }); },
    create: () => { calls.push('create'); return new Promise((res) => { createPending.push(res as never); }) as never; },
  };
  let closed = 0;
  const h = mountSentencePlan(parent, { planner, barNames: opts.names ?? ['bar_001', 'bar_008'], close: () => { closed++; } });
  const q = (sel: string) => parent.querySelector(sel) as any;
  const type = (text: string) => { const t = q('textarea'); t.value = text; t.dispatchEvent(new win.Event('input', { bubbles: true })); };
  const flush = () => new Promise((r) => setImmediate(r));
  return { parent, h, q, type, calls, pending, createPending, flush, closed: () => closed, planBtn: () => q('.forge-sentence-plan-plan'), createBtn: () => q('.forge-sentence-plan-create'), msg: () => q('.forge-sentence-plan-message').textContent as string, preview: () => q('.forge-sentence-plan-preview') };
}

test('what the dialog shows when it opens: the title, a sentence box with its limit and an example, the bars you can name, Plan ready, Create and the preview waiting for a plan', () => {
  const r = rig();
  assert.equal(r.q('h3').textContent, 'New phrase from a sentence');
  const box = r.q('textarea');
  assert.equal(box.maxLength, 500);
  assert.equal(box.getAttribute('placeholder'), 'for example: extend bar_005 to 8 bars');
  assert.equal(box.getAttribute('aria-label'), 'Describe the phrase in one sentence');
  assert.equal(r.q('.forge-sentence-plan-bars').textContent, 'Bars you can name: bar_001, bar_008');
  assert.equal(r.planBtn().textContent, 'Plan');
  assert.equal(r.planBtn().disabled, false);
  assert.equal(r.createBtn().textContent, 'Create');
  assert.equal(r.createBtn().disabled, true);
  assert.equal(r.q('.forge-sentence-plan-cancel').textContent, 'Cancel');
  assert.equal(r.preview().style.display, 'none');
  assert.equal(r.msg(), '');
  assert.equal(r.q('.forge-sentence-plan-message').getAttribute('role'), 'status');
});

test('a long list of bars is cut at 12 names and says how many more there are; no bars at all says so', () => {
  const many = Array.from({ length: 15 }, (_, i) => `bar_${String(i + 1).padStart(3, '0')}`);
  const r = rig({ names: many });
  assert.equal(r.q('.forge-sentence-plan-bars').textContent, `Bars you can name: ${many.slice(0, 12).join(', ')} (and 3 more)`);
  assert.equal(rig({ names: [] }).q('.forge-sentence-plan-bars').textContent, 'This vault has no bars yet. Make a bar in the Beat Box first.');
  assert.equal(rig({ names: ['bar_001'] }).q('.forge-sentence-plan-bars').textContent, 'Bars you can name: bar_001');
});

test('PLAN: busy while the service answers (nothing can be pressed twice), then the preview shows Description, Recipe and the file Create would make, and Create is ready', async () => {
  const r = rig();
  r.type('morph bar_001 into bar_008');
  r.planBtn().click();
  assert.deepEqual(r.calls, ['plan morph bar_001 into bar_008']);
  assert.equal(r.planBtn().disabled, true, 'busy');
  assert.equal(r.createBtn().disabled, true);
  assert.equal(r.msg(), 'Asking the planner...');
  r.planBtn().click();
  assert.equal(r.calls.length, 1, 'a second click while busy asks nothing');
  r.pending[0](OK); await r.flush();
  assert.equal(r.planBtn().disabled, false);
  assert.equal(r.createBtn().disabled, false);
  assert.equal(r.msg(), '');
  assert.notEqual(r.preview().style.display, 'none');
  assert.equal(r.q('.forge-sentence-plan-description').textContent, OK.description);
  assert.equal(r.q('.forge-sentence-plan-recipe').textContent, OK.recipe);
  assert.equal(r.q('.forge-sentence-plan-path').textContent, 'Create will make phrases/phrase_004.md (a morph).');
});

test('a REFUSAL is one sentence in the message line; the preview stays hidden and Create stays off; Plan is ready again', async () => {
  const r = rig();
  r.type('make it nicer');
  r.planBtn().click();
  r.pending[0]({ ok: false, message: 'I cannot tell which bar you mean.' }); await r.flush();
  assert.equal(r.msg(), 'I cannot tell which bar you mean.');
  assert.equal(r.q('.forge-sentence-plan-message').getAttribute('role'), 'alert');
  assert.equal(r.preview().style.display, 'none');
  assert.equal(r.createBtn().disabled, true);
  assert.equal(r.planBtn().disabled, false);
  r.createBtn().click();
  assert.deepEqual(r.calls, ['plan make it nicer'], 'a disabled Create asks for nothing');
});

test('EDITING the sentence after a plan withdraws the plan: the preview goes, Create goes off (it would create something the sentence no longer says), and the old message is cleared', async () => {
  const r = rig();
  r.type('morph bar_001 into bar_008'); r.planBtn().click(); r.pending[0](OK); await r.flush();
  assert.equal(r.createBtn().disabled, false);
  r.type('morph bar_001 into bar_008 slowly');
  assert.equal(r.createBtn().disabled, true);
  assert.equal(r.preview().style.display, 'none');
  r.planBtn().click(); r.pending[1](OK); await r.flush();
  assert.equal(r.createBtn().disabled, false);
  assert.deepEqual(r.calls, ['plan morph bar_001 into bar_008', 'plan morph bar_001 into bar_008 slowly']);
});

test('typing while the service is still answering: the answer that arrives is for a sentence that has changed, so it is not offered for Create', async () => {
  const r = rig();
  r.type('first'); r.planBtn().click();
  r.type('first, then more');
  r.pending[0](OK); await r.flush();
  assert.equal(r.createBtn().disabled, true, 'the plan was for "first"');
  assert.equal(r.preview().style.display, 'none');
  assert.equal(r.planBtn().disabled, false);
});

test('CREATE: busy while it writes, then the dialog closes once; a failure keeps the dialog open with the reason and Create ready to try again; Cancel closes without asking anything', async () => {
  const r = rig();
  r.type('x'); r.planBtn().click(); r.pending[0](OK); await r.flush();
  r.createBtn().click();
  assert.deepEqual(r.calls.slice(-1), ['create']);
  assert.equal(r.createBtn().disabled, true);
  assert.equal(r.planBtn().disabled, true);
  r.createPending[0]({ ok: false, message: 'Could not make a new phrase: disk full' }); await r.flush();
  assert.equal(r.closed(), 0);
  assert.equal(r.msg(), 'Could not make a new phrase: disk full');
  assert.equal(r.createBtn().disabled, false);
  assert.equal(r.planBtn().disabled, false);
  r.createBtn().click();
  r.createPending[1]({ ok: true, path: 'phrases/phrase_004.md' }); await r.flush();
  assert.equal(r.closed(), 1);
  const c = rig(); c.q('.forge-sentence-plan-cancel').click();
  assert.equal(c.closed(), 1); assert.deepEqual(c.calls, []);
});

test('Ctrl+Enter or Cmd+Enter in the sentence box plans; a plain Enter does not (a newline is part of typing)', () => {
  const r = rig();
  r.type('abc');
  const key = (init: object) => r.q('textarea').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...init }));
  key({});
  assert.deepEqual(r.calls, []);
  key({ ctrlKey: true });
  assert.deepEqual(r.calls, ['plan abc']);
  r.pending[0]({ ok: false, message: 'm' });
});

test('dispose takes the dialog out of the page', () => {
  const r = rig();
  r.h.dispose();
  assert.equal(r.parent.querySelector('.forge-sentence-plan'), null);
});

test('the markup: the classes and attributes the stylesheet, the tests and a screen reader find things by', () => {
  const r = rig();
  assert.equal(r.parent.querySelector('.forge-sentence-plan')?.tagName, 'DIV');
  assert.equal(r.q('h3').className, 'forge-sentence-plan-title');
  assert.equal(r.q('textarea').className, 'forge-sentence-plan-input');
  assert.equal(Number(r.q('textarea').rows), 3);
  assert.equal(r.q('.forge-sentence-plan-message').getAttribute('aria-live'), 'polite');
  assert.deepEqual([...r.parent.querySelectorAll('h4')].map((h: any) => [h.className, h.textContent]), [['forge-sentence-plan-heading', 'Description'], ['forge-sentence-plan-heading', 'Recipe']]);
  assert.equal(r.q('.forge-sentence-plan-buttons').children.length, 3);
  assert.deepEqual([...r.parent.querySelectorAll('button')].map((b: any) => b.type), ['button', 'button', 'button'], 'no button submits a form');
});

test('thirteen bars: "(and 1 more)"; exactly twelve: nothing more is said', () => {
  const names = (n: number) => Array.from({ length: n }, (_, i) => `bar_${String(i + 1).padStart(3, '0')}`);
  assert.equal(rig({ names: names(13) }).q('.forge-sentence-plan-bars').textContent, `Bars you can name: ${names(12).join(', ')} (and 1 more)`);
  assert.equal(rig({ names: names(12) }).q('.forge-sentence-plan-bars').textContent, `Bars you can name: ${names(12).join(', ')}`);
});

test('a press that reaches the dialog while it is busy, or before a plan exists, asks for nothing (a disabled button is not the only guard)', async () => {
  const r = rig();
  const press = (b: any) => b.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  press(r.createBtn());
  assert.deepEqual(r.calls, [], 'Create with no plan');
  r.type('abc'); press(r.planBtn()); press(r.planBtn());
  assert.equal(r.calls.length, 1, 'Plan while busy');
  r.pending[0](OK); await r.flush();
  press(r.createBtn()); press(r.createBtn());
  assert.deepEqual(r.calls.filter((c) => c === 'create').length, 1, 'Create while busy');
  r.createPending[0]({ ok: true, path: 'p' }); await r.flush();
});

test('the message follows what happened: editing clears a refusal, a stale answer clears "Asking...", a failed Create is an alert, a Create that throws is named', async () => {
  const r = rig();
  r.type('a'); r.planBtn().click(); r.pending[0]({ ok: false, message: 'No.' }); await r.flush();
  assert.equal(r.msg(), 'No.');
  r.type('ab');
  assert.equal(r.msg(), '', 'an edit clears the refusal');
  r.planBtn().click(); r.type('abc');
  assert.equal(r.msg(), '', 'an edit while asking clears "Asking..." too');
  r.pending[1](OK); await r.flush();
  assert.equal(r.msg(), '', 'the stale answer says nothing');
  r.planBtn().click(); r.pending[2](OK); await r.flush();
  r.createBtn().click(); r.createPending[0]({ ok: false, message: 'disk full' }); await r.flush();
  assert.equal(r.q('.forge-sentence-plan-message').getAttribute('role'), 'alert');
  const t = rig();
  t.type('a'); t.planBtn().click(); t.pending[0](OK); await t.flush();
  t.createBtn().click();
  (t.createPending[0] as any)(Promise.reject(new Error('boom')) as never);
  await t.flush();
  assert.equal(t.msg(), 'Could not make the phrase: boom');
  assert.equal(t.q('.forge-sentence-plan-message').getAttribute('role'), 'alert');
  assert.equal(t.createBtn().disabled, false, 'ready to try again');
  assert.equal(t.closed(), 0);
});

test('Cmd+Enter plans as Ctrl+Enter does, and the key is consumed (no newline typed); Shift+Enter alone is just typing', () => {
  const r = rig();
  r.type('abc');
  const ev = new win.KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true });
  r.q('textarea').dispatchEvent(ev);
  assert.deepEqual(r.calls, ['plan abc']);
  assert.equal(ev.defaultPrevented, true);
  const plain = new win.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
  r.q('textarea').dispatchEvent(plain);
  assert.equal(r.calls.length, 1);
  assert.equal(plain.defaultPrevented, false);
  const other = new win.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
  r.q('textarea').dispatchEvent(other);
  assert.equal(r.calls.length, 1, 'Ctrl+A is not Plan');
  r.pending[0]({ ok: false, message: 'm' });
});

test('asking again without editing: the old preview goes while the service answers (it may be replaced by a refusal), Create is off meanwhile, and the message is a status, not an alert', async () => {
  const r = rig();
  r.type('abc'); r.planBtn().click(); r.pending[0](OK); await r.flush();
  assert.notEqual(r.preview().style.display, 'none');
  r.planBtn().click();
  assert.equal(r.preview().style.display, 'none', 'the old plan is not on screen while the new one is asked');
  assert.equal(r.createBtn().disabled, true);
  assert.equal(r.msg(), 'Asking the planner...');
  assert.equal(r.q('.forge-sentence-plan-message').getAttribute('role'), 'status');
  r.pending[1]({ ok: false, message: 'No.' }); await r.flush();
  assert.equal(r.q('.forge-sentence-plan-message').getAttribute('role'), 'alert');
  r.type('abcd');
  assert.equal(r.q('.forge-sentence-plan-message').getAttribute('role'), 'status', 'a cleared message is a status again');
});

test('Ctrl+Enter while the service is still answering asks nothing more', () => {
  const r = rig();
  r.type('abc'); r.planBtn().click();
  r.q('textarea').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
  assert.equal(r.calls.length, 1);
  r.pending[0]({ ok: false, message: 'm' });
});
