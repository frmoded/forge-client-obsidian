// 2026-10-29-0820 (M10 slice 1): the dialog of "New kit" (2026-11-19-0960: "New arrangement" has no dialog any more, it makes an empty note; plain DOM, no obsidian import) in happy-dom, with the real EVENT ORDER of a person: click a preset (or type a name and tick boxes), press Create; a refusal is one sentence
// and the dialog stays open; success closes it; a second click while the first is pending does nothing. The channel boxes are the engine's vocabulary; the kit lists of the track rows follow "a kit plays one phrase".
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { RHYTHM_CHANNELS } from './rhythm-edit-core.ts';
import { mountKitDialog } from './kit-dom.ts';
import type { CreateResult } from './kit-arrangement-flow-core.ts';
import { accessibleName, visibleText } from './test-support/accessible-name.ts';

const win: any = new Window({ url: 'http://localhost/' });
const flush = () => new Promise((r) => setImmediate(r));
const click = (e: any) => e.dispatchEvent(new win.Event('click', { bubbles: true }));
const change = (e: any) => e.dispatchEvent(new win.Event('change', { bubbles: true }));

function kitRig(answer: () => Promise<CreateResult> = async () => ({ ok: true, path: 'kits/x.md' })) {
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const asked: Array<{ name: string; channels: string[] }> = [];
  let closed = 0;
  mountKitDialog(parent, { create: (c) => { asked.push(c); return answer(); }, close: () => { closed++; } });
  const q = (s: string) => parent.querySelector(s) as any;
  const qa = (s: string): any[] => [...parent.querySelectorAll(s)];
  return { parent, asked, q, qa, closed: () => closed, create: () => q('.forge-kit-create'), msg: () => q('.forge-kit-message').textContent, ticked: () => qa('.forge-kit-channel-box').filter((b) => b.checked).map((b) => b.getAttribute('data-channel')) };
}

test('New kit: what the dialog shows - the title, two presets, a name box, one box per channel of the engine\'s vocabulary (in its order, words not codes), Create and Cancel', () => {
  const r = kitRig();
  assert.equal(r.q('h3').textContent, 'New kit');
  assert.deepEqual(r.qa('.forge-kit-preset').map((b) => b.textContent), ['Rock kit', 'Latin kit']);
  assert.deepEqual(r.qa('.forge-kit-channel-box').map((b) => b.getAttribute('data-channel')), [...RHYTHM_CHANNELS]);
  assert.deepEqual(r.qa('.forge-kit-channel').map((l) => l.textContent.trim()), ['kick', 'snare', 'hi-hat', 'bell', 'claves', 'high conga', 'low conga']);
  assert.equal(accessibleName(r.q('.forge-kit-name')), 'Kit name'); assert.equal(r.q('.forge-kit-name').hasAttribute('aria-label'), false);
  assert.equal(r.create().textContent, 'Create');
  assert.equal(r.q('.forge-kit-cancel').textContent, 'Cancel');
  assert.deepEqual(r.ticked(), [], 'nothing ticked until a choice');
});

test('New kit: a preset fills the name and ticks exactly its channels; a second preset replaces them; Create hands the name and the ticked channels to the flow and, on success, closes the dialog', async () => {
  const r = kitRig();
  click(r.q('[data-preset="rock"]'));
  assert.equal(r.q('.forge-kit-name').value, 'rock');
  assert.deepEqual(r.ticked(), ['kick', 'snare', 'hihat']);
  click(r.q('[data-preset="latin"]'));
  assert.equal(r.q('.forge-kit-name').value, 'latin');
  assert.deepEqual(r.ticked(), ['bell', 'claves', 'conga_high', 'conga_low']);
  click(r.create()); await flush();
  assert.deepEqual(r.asked, [{ name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] }]);
  assert.equal(r.closed(), 1);
});

test('New kit: a hand-made kit (typed name, ticked boxes) works; Enter in the name box is Create; a refusal is shown as one sentence, the dialog stays open and Create works again', async () => {
  let answers: CreateResult[] = [{ ok: false, message: 'New kit: A kit needs at least one channel.' }, { ok: true, path: 'kits/mine.md' }];
  const r = kitRig(async () => answers.shift()!);
  const name = r.q('.forge-kit-name'); name.value = 'mine';
  name.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await flush();
  assert.equal(r.msg(), 'New kit: A kit needs at least one channel.');
  assert.equal(r.closed(), 0, 'a refusal does not close the dialog');
  assert.equal(r.create().disabled, false);
  const box = r.q('[data-channel="claves"]'); box.checked = true;
  click(r.create()); await flush();
  assert.deepEqual(r.asked[1], { name: 'mine', channels: ['claves'] });
  assert.equal(r.closed(), 1);
  assert.equal(r.msg(), '', 'the old sentence is gone once it worked');
});

test('New kit: Create while the first is still pending asks once; a flow that throws is a sentence, not a crash; Cancel closes without asking', async () => {
  let release!: (v: CreateResult) => void;
  const r = kitRig(() => new Promise((res) => { release = res; }));
  r.q('.forge-kit-name').value = 'x'; r.q('[data-channel="kick"]').checked = true;
  click(r.create()); click(r.create());
  assert.equal(r.asked.length, 1);
  assert.equal(r.create().disabled, true);
  release({ ok: true, path: 'kits/x.md' }); await flush();
  assert.equal(r.create().disabled, false);
  const boom = kitRig(async () => { throw new Error('vault gone'); });
  click(boom.create()); await flush();
  assert.equal(boom.msg(), 'New kit failed: vault gone');
  const c = kitRig(); click(c.q('.forge-kit-cancel'));
  assert.equal(c.closed(), 1); assert.equal(c.asked.length, 0);
});
