// 2026-11-12-1203 - the docked prompt box (prompt-box-dom.ts) in a plain DOM: the text equals the Description, the edited state, Enter applies and Shift+Enter is a new line, the apply that did not go through keeps the text, and the
// Description arriving from disk never overwrites typing (the keep / use choice).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPromptBox, type PromptBoxPorts } from './prompt-box-dom.ts';

const SENTENCE = 'Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote.';
function rig(apply?: PromptBoxPorts['apply']) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const calls: string[] = [];
  const handle = mountPromptBox(parent, { placeholder: 'Describe it…', apply: apply ?? (async (t) => { calls.push(t); return { ok: true, disk: t }; }) }, SENTENCE);
  const q = (sel: string) => parent.querySelector(sel) as any;
  const type = (text: string) => { q('.forge-prompt-box-text').value = text; q('.forge-prompt-box-text').dispatchEvent(new win.Event('input', { bubbles: true })); };
  const key = (k: string, init: Record<string, unknown> = {}) => { const e = new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }); q('.forge-prompt-box-text').dispatchEvent(e); return e; };
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  return { win, parent, handle, calls, q, type, key, flush };
}

test('on mount the field is exactly the Description, the box is not edited, Apply is disabled and the placeholder is set', () => {
  const r = rig();
  assert.equal(r.q('.forge-prompt-box-text').value, SENTENCE);
  assert.equal(r.q('.forge-prompt-box').classList.contains('is-edited'), false);
  assert.equal(r.q('.forge-prompt-box-apply').disabled, true);
  assert.equal(r.q('.forge-prompt-box-state').textContent, '');
  assert.equal(r.q('.forge-prompt-box-text').placeholder, 'Describe it…');
  assert.equal(r.q('.forge-prompt-box-text').getAttribute('aria-label') !== null, true);
});

test('typing shows "edited, not applied" (a class and the words) and enables Apply', () => {
  const r = rig();
  r.type(SENTENCE + ' Threshold 65 percent.');
  assert.equal(r.q('.forge-prompt-box').classList.contains('is-edited'), true);
  assert.equal(r.q('.forge-prompt-box-state').textContent, 'edited, not applied');
  assert.equal(r.q('.forge-prompt-box-apply').disabled, false);
});

test('Enter applies (and is not typed into the field); the box then shows what the note says now and is no longer edited', async () => {
  const r = rig(async (t) => { r.calls.push(t); return { ok: true, disk: 'CANONICAL ' + t }; });
  r.type('my sentence');
  const e = r.key('Enter');
  assert.equal(e.defaultPrevented, true, 'Enter does not add a line');
  await r.flush();
  assert.deepEqual(r.calls, ['my sentence']);
  assert.equal(r.q('.forge-prompt-box-text').value, 'CANONICAL my sentence');
  assert.equal(r.q('.forge-prompt-box').classList.contains('is-edited'), false);
});

test('Shift+Enter is a new line: nothing is applied and the default is left alone; so are Ctrl/Alt/Meta+Enter and Enter during IME composition', async () => {
  const r = rig();
  r.type('first line');
  for (const init of [{ shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }]) {
    const e = r.key('Enter', init);
    assert.equal(e.defaultPrevented, false, JSON.stringify(init));
  }
  await r.flush();
  assert.deepEqual(r.calls, []);
});

test('the Apply button applies the same way; with nothing edited neither it nor Enter applies anything', async () => {
  const r = rig();
  r.key('Enter'); r.q('.forge-prompt-box-apply').click(); await r.flush();
  assert.deepEqual(r.calls, [], 'nothing edited: nothing applied');
  r.type('changed');
  r.q('.forge-prompt-box-apply').click(); await r.flush();
  assert.deepEqual(r.calls, ['changed']);
});

test('an apply that did not go through keeps the text and the edited state, so the person can fix it', async () => {
  const r = rig(async (t) => { r.calls.push(t); return { ok: false }; });
  r.type('a sentence that does not parse');
  r.key('Enter'); await r.flush();
  assert.deepEqual(r.calls, ['a sentence that does not parse']);
  assert.equal(r.q('.forge-prompt-box-text').value, 'a sentence that does not parse');
  assert.equal(r.q('.forge-prompt-box').classList.contains('is-edited'), true);
  assert.equal(r.q('.forge-prompt-box-apply').disabled, false, 'it can be tried again');
});

test('a second Enter while the first apply is still running does not apply twice', async () => {
  let release!: () => void;
  const r = rig(async (t) => { r.calls.push(t); await new Promise<void>((res) => { release = res; }); return { ok: true, disk: t }; });
  r.type('slow one');
  r.key('Enter'); r.key('Enter'); await r.flush();
  assert.equal(r.calls.length, 1);
  assert.equal(r.q('.forge-prompt-box-apply').disabled, true);
  release(); await r.flush();
  assert.equal(r.calls.length, 1);
});

test('the Description changing on disk while the box is not edited updates the field; while the person has typed, the typing is NOT overwritten and the choice is offered', async () => {
  const r = rig();
  r.handle.setDisk('Mix [[bar_005]] and [[bar_006]], 35 percent [[bar_005]], as a vote.');
  assert.equal(r.q('.forge-prompt-box-text').value, 'Mix [[bar_005]] and [[bar_006]], 35 percent [[bar_005]], as a vote.');
  assert.equal(r.q('.forge-prompt-box-conflict').style.display, 'none');
  r.type('typed by hand');
  r.handle.setDisk('Mix [[bar_005]] and [[bar_006]], 20 percent [[bar_005]], as a vote.');
  assert.equal(r.q('.forge-prompt-box-text').value, 'typed by hand', 'not overwritten');
  assert.equal(r.q('.forge-prompt-box-conflict').style.display, '');
  assert.match(r.q('.forge-prompt-box-conflict').textContent, /controls changed the Description/);
  r.q('.forge-prompt-box-conflict [data-choice="use"]').click();
  assert.equal(r.q('.forge-prompt-box-text').value, 'Mix [[bar_005]] and [[bar_006]], 20 percent [[bar_005]], as a vote.');
  assert.equal(r.q('.forge-prompt-box-conflict').style.display, 'none');
  assert.equal(r.q('.forge-prompt-box').classList.contains('is-edited'), false);
});

test('"Keep my text" keeps the typing and still shows it as edited, not applied', () => {
  const r = rig();
  r.type('mine');
  r.handle.setDisk('changed elsewhere');
  r.q('.forge-prompt-box-conflict [data-choice="keep"]').click();
  assert.equal(r.q('.forge-prompt-box-text').value, 'mine');
  assert.equal(r.q('.forge-prompt-box-conflict').style.display, 'none');
  assert.equal(r.q('.forge-prompt-box-state').textContent, 'edited, not applied');
});

test('focus() puts the cursor in the field; dispose() removes the box', () => {
  const r = rig();
  r.handle.focus();
  assert.equal(r.win.document.activeElement, r.q('.forge-prompt-box-text'));
  r.handle.dispose();
  assert.equal(r.parent.querySelector('.forge-prompt-box'), null);
});

test('setBusy shows the message and holds Apply (the text stays editable); null puts it back; reset() shows what the note says now and drops the typing', async () => {
  const r = rig();
  r.type('free sentence');
  r.handle.setBusy('Asking the sentence service...');
  assert.equal(r.q('.forge-prompt-box-state').textContent, 'Asking the sentence service...');
  assert.equal(r.q('.forge-prompt-box-apply').disabled, true);
  r.key('Enter'); await r.flush();
  assert.deepEqual(r.calls, [], 'Enter does nothing while a request runs');
  r.type('free sentence, edited');
  assert.equal(r.q('.forge-prompt-box-text').value, 'free sentence, edited', 'still editable');
  r.handle.setBusy(null);
  assert.equal(r.q('.forge-prompt-box-state').textContent, 'edited, not applied');
  assert.equal(r.q('.forge-prompt-box-apply').disabled, false);
  r.handle.reset('CANONICAL');
  assert.equal(r.q('.forge-prompt-box-text').value, 'CANONICAL');
  assert.equal(r.q('.forge-prompt-box').classList.contains('is-edited'), false);
});
