// 2026-10-31-1120 (M15c): the bar's DOM, in happy-dom: the code the panes run. One sentence, the buttons that answer it in the order given, a click reports the action once, a busy bar disables its buttons, the preview shows Description and Recipe as text
// (never as markup), the bar is the FIRST child of its pane, and it can be shown again (no duplicates) and taken away.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { BAR_LABELS, mountDescriptionBar, type BarAction } from './description-bar-dom.ts';

const win: any = new Window({ url: 'http://localhost/' });
const pane = () => { const el = win.document.createElement('div'); el.appendChild(win.document.createElement('p')); win.document.body.appendChild(el); return el as HTMLElement; };

test('the bar is the first child of its pane, carries the sentence in a status region and one labelled button per action, in the order given', () => {
  const p = pane(); const heard: BarAction[] = [];
  const bar = mountDescriptionBar(p, (a) => heard.push(a));
  assert.equal(p.firstElementChild, bar.el); assert.equal(p.children.length, 2);
  bar.show({ message: 'Description, line 1, column 28: expected "bars" after the number.', actions: ['revert', 'ask'] });
  assert.equal(bar.el.getAttribute('role'), 'status');
  assert.equal(bar.el.querySelector('.forge-description-message')!.textContent, 'Description, line 1, column 28: expected "bars" after the number.');
  assert.deepEqual([...bar.el.querySelectorAll('button')].map((b: any) => [b.getAttribute('data-action'), b.textContent]), [['revert', 'Revert'], ['ask', 'Ask the sentence service']]);
  (bar.el.querySelector('[data-action="ask"]') as any).click(); (bar.el.querySelector('[data-action="revert"]') as any).click();
  assert.deepEqual(heard, ['ask', 'revert']);
  assert.deepEqual(Object.keys(BAR_LABELS).sort(), ['apply-preview', 'ask', 'cancel-preview', 'revert', 'update', 'update-recipe']);
});

test('showing again replaces the content (no duplicate message or buttons); a busy bar says so and its buttons do nothing', () => {
  const p = pane(); const heard: BarAction[] = [];
  const bar = mountDescriptionBar(p, (a) => heard.push(a));
  bar.show({ message: 'one', actions: ['update', 'revert'] }); bar.show({ message: 'two', actions: ['revert'], busy: true });
  assert.equal(bar.el.querySelectorAll('.forge-description-message').length, 1); assert.equal(bar.el.querySelector('.forge-description-message')!.textContent, 'two');
  assert.equal(bar.el.getAttribute('aria-busy'), 'true');
  const b = bar.el.querySelector('button') as any; assert.equal(b.disabled, true); b.click(); assert.deepEqual(heard, []);
  bar.show({ message: 'three', actions: ['revert'] }); assert.equal(bar.el.getAttribute('aria-busy'), 'false'); (bar.el.querySelector('button') as any).click(); assert.deepEqual(heard, ['revert']);
});

test('the service\'s preview is two blocks of TEXT (markup in a sentence is not interpreted), with Apply and Cancel; dispose takes the bar out of the pane', () => {
  const p = pane();
  const bar = mountDescriptionBar(p, () => {});
  bar.show({ message: 'm', actions: ['apply-preview', 'cancel-preview'], preview: { description: 'Extend <b>[[bar_007]]</b> to 12 bars.', recipe: 'Take [[bar_007]].\nRepeat it for 12 bars.' } });
  assert.equal(bar.el.querySelector('.forge-description-preview-description')!.textContent, 'Extend <b>[[bar_007]]</b> to 12 bars.'); assert.equal(bar.el.querySelector('.forge-description-preview b'), null);
  assert.equal(bar.el.querySelector('.forge-description-preview-recipe')!.textContent, 'Take [[bar_007]].\nRepeat it for 12 bars.');
  bar.show({ message: 'm', actions: ['revert'] }); assert.equal(bar.el.querySelector('.forge-description-preview'), null, 'a bar without a preview has none');
  bar.dispose(); assert.equal(p.querySelector('.forge-description-bar'), null); assert.equal(p.children.length, 1);
});

test('the DOM contract the stylesheet and the panes rely on: class names, the polite status region, button types and the label of every action', () => {
  const p = pane();
  const bar = mountDescriptionBar(p, () => {});
  assert.equal(bar.el.className, 'forge-description-bar'); assert.equal(bar.el.getAttribute('aria-live'), 'polite');
  bar.show({ message: 'm', actions: ['update', 'revert', 'ask', 'apply-preview', 'cancel-preview'], preview: { description: 'd', recipe: 'r' } });
  assert.equal((bar.el.querySelector('.forge-description-preview') as HTMLElement).className, 'forge-description-preview');
  assert.equal((bar.el.querySelector('.forge-description-buttons') as HTMLElement).className, 'forge-description-buttons');
  const buttons = [...bar.el.querySelectorAll('button')] as any[];
  assert.deepEqual(buttons.map((b) => b.textContent), ['Update from Description', 'Revert', 'Ask the sentence service', 'Apply', 'Cancel']);
  for (const b of buttons) { assert.equal(b.getAttribute('type'), 'button'); assert.equal(b.className, 'forge-description-button'); }
  assert.deepEqual(BAR_LABELS, { update: 'Update from Description', 'update-recipe': 'Update from Recipe', revert: 'Revert', ask: 'Ask the sentence service', 'apply-preview': 'Apply', 'cancel-preview': 'Cancel' });
});
