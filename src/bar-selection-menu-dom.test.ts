// 2026-11-16-1000 - the selection menu's DOM: what it shows, what a click on each entry hands the caller, the greyed entries and their reasons, the clear button, and that its clicks do not leave it (they are not clicks on the Score).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountSelectionMenu, SELECTION_MENU_CLASS, type SelectionMenuView } from './bar-selection-menu-dom.ts';
import { SELECTION_MENU, type SelectionAction } from './bar-selection-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const NONE: Record<SelectionAction, string | null> = { 'new-phrase': null, copy: null, delete: null, 'move-left': null, 'move-right': null };
function rig() {
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const log: string[] = []; const above: string[] = [];
  host.addEventListener('click', () => above.push('click'));
  host.addEventListener('mousedown', () => above.push('mousedown'));
  const menu = mountSelectionMenu(host, { onAction: (a) => log.push(a), onClear: () => log.push('clear') });
  return { host, menu, log, above };
}
const view = (over: Partial<SelectionMenuView> = {}): SelectionMenuView => ({ text: '3 bars selected: bars 3 to 5', disabled: { ...NONE }, ...over });

test('hidden until shown; shows the count, the five entries in order with their descriptions (aria-description, never a native title: 2026-11-19-0800), and a clear button', () => {
  const r = rig();
  assert.equal(r.menu.visible(), false);
  assert.equal(r.menu.el.style.display, 'none');
  assert.equal(r.menu.el.className, SELECTION_MENU_CLASS);
  assert.equal(r.menu.el.getAttribute('role'), 'toolbar');
  r.menu.show(view());
  assert.equal(r.menu.visible(), true);
  assert.equal(r.menu.el.style.display, '');
  assert.equal(r.menu.el.querySelector('.forge-bar-selection-count')!.textContent, '3 bars selected: bars 3 to 5');
  const acts = [...r.menu.el.querySelectorAll('.forge-bar-selection-action')] as any[];
  assert.deepEqual(acts.map((b) => b.textContent), SELECTION_MENU.map((m) => m.label));
  assert.deepEqual(acts.map((b) => b.getAttribute('data-action')), SELECTION_MENU.map((m) => m.id));
  assert.deepEqual(acts.map((b) => b.getAttribute('aria-description')), SELECTION_MENU.map((m) => m.title));
  assert.ok(acts.every((b) => !b.hasAttribute('title')), 'no native tooltip on an action');
  assert.ok(acts.every((b) => !b.disabled));
  const clear = r.menu.el.querySelector('.forge-bar-selection-clear')!;
  assert.equal(clear.getAttribute('aria-label'), 'Clear the selection'); assert.equal(clear.getAttribute('aria-description'), 'Clear the selection (Esc)'); assert.equal(clear.hasAttribute('title'), false, 'no native tooltip on the clear button');
  r.menu.hide();
  assert.equal(r.menu.visible(), false);
  assert.equal(r.menu.el.style.display, 'none');
});

test('a note is a line of its own under the entries, shown only when there is one', () => {
  const r = rig();
  r.menu.show(view());
  const note = r.menu.el.querySelector('.forge-bar-selection-note') as any;
  assert.equal(note.style.display, 'none');
  r.menu.show(view({ note: '"Delete bar 2." is in the prompt box: press Apply to do it.' }));
  assert.equal(note.style.display, ''); assert.equal(note.textContent, '"Delete bar 2." is in the prompt box: press Apply to do it.');
  assert.equal(r.menu.el.querySelector('.forge-bar-selection-count')!.textContent, '3 bars selected: bars 3 to 5', 'the count does not carry it');
  r.menu.show(view({ note: null }));
  assert.equal(note.style.display, 'none');
});

test('a click on an entry hands the caller its action, once; the clear button says clear', () => {
  const r = rig();
  r.menu.show(view());
  for (const m of SELECTION_MENU) (r.menu.el.querySelector(`[data-action="${m.id}"]`) as any).click();
  assert.deepEqual(r.log, ['new-phrase', 'copy', 'delete', 'move-left', 'move-right']);
  (r.menu.el.querySelector('.forge-bar-selection-clear') as any).click();
  assert.deepEqual(r.log.slice(-1), ['clear']);
});

test('a greyed entry is disabled, says why in its aria-description (no native title, 2026-11-19-0800), and does nothing when clicked; it is enabled and has its own description again after', () => {
  const r = rig();
  r.menu.show(view({ disabled: { ...NONE, 'move-left': 'Bar 1 cannot move left.', delete: 'That would leave no bars.' } }));
  const left = r.menu.el.querySelector('[data-action="move-left"]') as any;
  assert.ok(left.disabled); assert.equal(left.getAttribute('aria-description'), 'Bar 1 cannot move left.'); assert.equal(left.hasAttribute('title'), false); assert.ok(left.classList.contains('is-disabled'));
  left.click();
  (r.menu.el.querySelector('[data-action="delete"]') as any).click();
  assert.deepEqual(r.log, []);
  r.menu.show(view());
  assert.ok(!left.disabled); assert.equal(left.getAttribute('aria-description'), SELECTION_MENU.find((m) => m.id === 'move-left')!.title); assert.equal(left.hasAttribute('title'), false);
});

test('its presses and clicks stay inside it: they are not clicks on the Score (the host above never hears them)', () => {
  const r = rig();
  r.menu.show(view());
  const b = r.menu.el.querySelector('[data-action="copy"]') as any;
  b.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true })); b.click();
  r.menu.el.querySelector('.forge-bar-selection-count')!.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(r.above, []);
});

test('placement: above the selected bars; below them when there is no room above; at the top left without an anchor; dispose takes it away', () => {
  const r = rig();
  Object.defineProperty(r.menu.el, 'offsetHeight', { value: 30 }); Object.defineProperty(r.menu.el, 'offsetWidth', { value: 200 });
  Object.defineProperty(r.host, 'clientWidth', { value: 600 });
  r.menu.show(view({ anchor: { left: 150, top: 100, right: 300, bottom: 160 } }));
  assert.deepEqual([r.menu.el.style.left, r.menu.el.style.top], ['150px', '64px']);
  r.menu.show(view({ anchor: { left: 150, top: 10, right: 300, bottom: 70 } }));
  assert.deepEqual([r.menu.el.style.left, r.menu.el.style.top], ['150px', '76px']);
  r.menu.show(view({ anchor: { left: 560, top: 100, right: 590, bottom: 160 } }));
  assert.equal(r.menu.el.style.left, '400px');                                              // clamped so it stays inside the host
  r.menu.show(view());
  assert.deepEqual([r.menu.el.style.left, r.menu.el.style.top], ['0px', '0px']);
  r.menu.dispose();
  assert.equal(r.host.querySelector(`.${SELECTION_MENU_CLASS}`), null);
});
