// 2026-11-03-1155-9 - the Copy helper in a real DOM (happy-dom): the button is there while a message says something, beside the message and not inside it, copies exactly the message as it is at the click, says Copied for a moment and
// then Copy again, says so when the clipboard refuses, goes when the message goes, and does not pile up on a second message.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { COPIED_LABEL, COPIED_MS, COPY_CLASS, COPY_FAILED_LABEL, COPY_LABEL, copyableMessage, defaultCopyPorts, setCopyPortsForTest } from './copy-message-dom.ts';

const win: any = new Window({ url: 'http://localhost/' });
function rig(write: (t: string) => Promise<boolean> = async () => true) {
  const doc: Document = win.document;
  const parent = doc.createElement('div'); doc.body.appendChild(parent);
  const message = doc.createElement('span'); parent.appendChild(message);
  const written: string[] = [], timers: Array<{ fn: () => void; ms: number }> = [];
  setCopyPortsForTest({ write: async (t) => { written.push(t); return write(t); }, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {} });
  const button = (): HTMLButtonElement | null => parent.querySelector(`.${COPY_CLASS}`);
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  return { parent, message, written, timers, button, flush };
}

test('a message with text has a Copy button BESIDE it (a sibling, never inside: a triple-click selects the message alone); no text, no button; the text can change and there is still one button', () => {
  const r = rig();
  assert.equal(r.button(), null);
  copyableMessage(r.message, 'Not saved: the Recipe was edited by hand; press Update from Recipe first or revert it.');
  const b = r.button()!;
  assert.ok(b); assert.equal(b.textContent, COPY_LABEL); assert.equal(b.type, 'button');
  assert.equal(b.previousSibling, r.message, 'right after the message'); assert.equal(r.message.contains(b), false, 'not inside it');
  assert.equal(r.message.textContent, 'Not saved: the Recipe was edited by hand; press Update from Recipe first or revert it.');
  copyableMessage(r.message, 'another sentence');
  assert.equal(r.parent.querySelectorAll(`.${COPY_CLASS}`).length, 1, 'one button, not two');
  copyableMessage(r.message, '');
  assert.equal(r.button(), null); assert.equal(r.message.textContent, '');
  copyableMessage(r.message, '');
  assert.equal(r.button(), null, 'an empty message again is still no button');
});

test('the click copies the message AS IT IS then (not as it was when the button was made), says Copied, and says Copy again after the moment', async () => {
  const r = rig();
  copyableMessage(r.message, 'first');
  r.message.textContent = 'edited in place';                            // a surface that changes its own text
  r.button()!.click(); await r.flush();
  assert.deepEqual(r.written, ['edited in place']);
  assert.equal(r.button()!.textContent, COPIED_LABEL);
  assert.equal(r.timers.at(-1)!.ms, COPIED_MS);
  r.timers.at(-1)!.fn();
  assert.equal(r.button()!.textContent, COPY_LABEL);
});

test('a clipboard that refuses is SAID (Copy failed), not swallowed; a second click inside the moment restarts it', async () => {
  const r = rig(async () => false);
  copyableMessage(r.message, 'x');
  r.button()!.click(); await r.flush();
  assert.equal(r.button()!.textContent, COPY_FAILED_LABEL);
  r.button()!.click(); await r.flush();
  assert.equal(r.written.length, 2);
});

test('the host\'s own ports: the async clipboard when it is there; the textarea road when it refuses; false when neither works (never a throw)', async () => {
  setCopyPortsForTest(null);
  const doc: any = new Window({ url: 'http://localhost/' }).document;
  const ports = defaultCopyPorts(doc);
  const nav = doc.defaultView.navigator;
  const written: string[] = [];
  Object.defineProperty(nav, 'clipboard', { value: { writeText: async (t: string) => { written.push(t); } }, configurable: true });
  assert.equal(await ports.write('via api'), true); assert.deepEqual(written, ['via api']);
  Object.defineProperty(nav, 'clipboard', { value: { writeText: async () => { throw new Error('NotAllowedError'); } }, configurable: true });
  let copied = 0; doc.execCommand = (c: string) => { if (c === 'copy') { copied++; return true; } return false; };
  assert.equal(await ports.write('via textarea'), true); assert.equal(copied, 1);
  assert.equal(doc.querySelector('textarea'), null, 'the textarea is taken away');
  doc.execCommand = () => false;
  assert.equal(await ports.write('nothing works'), false);
  doc.execCommand = () => { throw new Error('gone'); };
  assert.equal(await ports.write('throws'), false);
});
