// 2026-11-03-1160 (c) - the shared helper that switches a tab's controls off for a CUSTOM note: disabled, with the banner's sentence as tooltip; back on it restores only what it switched off. Plain DOM (happy-dom).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { CUSTOM_OFF_ATTR, setControlsOff } from './custom-controls-off-dom.ts';
import { CUSTOM_BANNER } from './phrase-notes-core.ts';

const TIP = 'Custom Python: the controls are off for this note.';
function strip() {
  const win: any = new Window({ url: 'http://localhost/' });
  const root = win.document.createElement('div');
  root.innerHTML = '<button class="a">Mute</button><input class="b" type="range"><select class="c"><option>x</option></select><span class="note">label</span><button class="own" disabled>kept off</button>';
  win.document.body.appendChild(root);
  return root as HTMLElement;
}
const q = (root: HTMLElement, sel: string) => root.querySelector(sel) as HTMLButtonElement;

test('the sentence is the banner\'s own, word for word', () => { assert.equal(CUSTOM_BANNER, TIP); });

test('off: every button, input and select is disabled with the tooltip; the root says it too; text is left alone', () => {
  const root = strip();
  setControlsOff(root, true);
  for (const sel of ['.a', '.b', '.c', '.own']) { assert.equal(q(root, sel).disabled, true, sel); assert.equal(q(root, sel).getAttribute('title'), TIP, sel); }
  assert.equal(root.getAttribute('aria-disabled'), 'true'); assert.equal(root.getAttribute('title'), TIP);
  assert.equal(q(root, '.note').hasAttribute('title'), false, 'a label is not a control');
  assert.equal(q(root, '.a').hasAttribute(CUSTOM_OFF_ATTR), true); assert.equal(q(root, '.own').hasAttribute(CUSTOM_OFF_ATTR), false, 'a control the tab itself keeps disabled is not marked as ours');
});

test('on again: only what the helper switched off comes back, the tooltips go, and a control the tab keeps disabled stays disabled; calling it twice changes nothing', () => {
  const root = strip();
  setControlsOff(root, true); setControlsOff(root, true);
  setControlsOff(root, false);
  for (const sel of ['.a', '.b', '.c']) { assert.equal(q(root, sel).disabled, false, sel); assert.equal(q(root, sel).hasAttribute('title'), false, sel); }
  assert.equal(q(root, '.own').disabled, true, 'the tab\'s own disabled control stays');
  assert.equal(q(root, '.own').hasAttribute('title'), false);
  assert.equal(root.hasAttribute('aria-disabled'), false); assert.equal(root.hasAttribute('title'), false);
  const before = root.outerHTML; setControlsOff(root, false); assert.equal(root.outerHTML, before, 'off(false) on a quiet root is a no-op');
});

test('a title the tab set itself is not touched when switching on', () => {
  const root = strip();
  q(root, '.a').setAttribute('title', 'Mute the kit');
  setControlsOff(root, false);
  assert.equal(q(root, '.a').getAttribute('title'), 'Mute the kit');
});
