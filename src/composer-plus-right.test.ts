// 2026-11-19-0950 (item 2) - the "+" of the composer moved from the LEFT of the card's bottom row to the RIGHT group, immediately left of the Send button; the status text ("Working... Esc cancels", the sentence
// waiting) takes the left. Plain DOM (happy-dom) for what the DOM can say: the ORDER of the row, the Tab order (text area, "+", Send), the menu living INSIDE the "+"'s own wrapper (so it is anchored to the "+" and
// can only open away from it), the keyboard of the menu (Enter / Space open it because it is a native button, arrows, Escape returns focus to the "+", Tab leaves), the menu staying inside the chat PANEL (never
// the scrolling body that clips, never the divider), the same order in the two layouts. The stylesheet is read as text for the properties the layout depends on (the "+" group pushed right, the menu right-aligned and
// capped to the panel, Send no longer the one that pushes). WHERE things land in pixels (the menu inside the tab at 360 and 800 px, clear of the divider, light and dark) is real Chrome: scripts/dev/measure-composer-plus-right.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountChatPanel } from './chat-panel-dom.ts';
import { memoryStore } from './dialog-core.ts';
import { mountPromptBox, type PromptBoxPorts } from './prompt-box-dom.ts';
import { accessibleName } from './test-support/accessible-name.ts';

const CSS = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'styles.css'), 'utf8');
const MENU = { items: [{ id: 'new-phrase', label: 'New phrase' }, { id: 'new-arr', label: 'New arrangement' }], run: () => {}, pickNote: async () => null };
const PORTS: PromptBoxPorts = { placeholder: '', preview: async () => ({ ok: false, message: 'x' }), apply: async () => ({ ok: false }), menu: MENU };

function card(ports: PromptBoxPorts = PORTS) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const handle = mountPromptBox(parent, ports, 'x');
  const q = (sel: string) => parent.querySelector(sel) as any;
  return { win, parent, handle, q, doc: win.document };
}
/** The elements of `root` a Tab key would stop at, in document order: not disabled, not hidden (itself or an ancestor: `hidden` or `display: none`), tabindex not negative. */
function tabbables(root: Element): Element[] {
  const hiddenUp = (el: Element | null): boolean => { for (let e = el; e && e !== root.parentElement; e = e.parentElement) { if ((e as HTMLElement).hidden || (e as HTMLElement).style?.display === 'none') return true; } return false; };
  return Array.from(root.querySelectorAll('button, textarea, input, select, [tabindex]')).filter((e: any) => !e.disabled && !hiddenUp(e) && (e.getAttribute('tabindex') ?? '0') !== '-1' && !e.classList.contains('forge-sr-only'));
}
const kindOf = (e: Element): string => (e.classList.contains('forge-prompt-box-text') ? 'text' : e.classList.contains('forge-composer-plus') ? 'plus' : e.classList.contains('forge-composer-send') ? 'send' : e.classList.contains('forge-composer-menuitem') ? 'menuitem' : e.classList.contains('forge-prompt-box-state') ? 'state' : `other:${e.className}`);
const before = (a: Element, b: Element): boolean => !!(a.compareDocumentPosition(b) & 4);       // DOCUMENT_POSITION_FOLLOWING: b comes after a

/** The declaration block of the FIRST rule whose selector list is exactly `selector` (comments removed). */
function rule(selector: string): string {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  assert.ok(m, `styles.css has a rule for ${selector}`);
  return m![1];
}
const declares = (block: string, prop: string, value?: RegExp): boolean => new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*${value ? value.source : ''}`, 'm').test(block);

test('THE ORDER of the bottom row: the status text first (the left), then the "+", then Send last (the right); the "+" is immediately left of Send, nothing but the menu between them', () => {
  const r = card();
  const bar = r.q('.forge-composer-bar'); const state = r.q('.forge-prompt-box-state'); const plus = r.q('.forge-composer-plus'); const send = r.q('.forge-composer-send'); const menu = r.q('.forge-composer-menu');
  assert.ok(before(state, plus) && before(plus, send), 'document order: status, "+", Send');
  assert.ok(bar.lastElementChild === send, 'Send is the last thing in the row (the far right)');
  assert.ok(bar.firstElementChild === state, 'the status text is the first thing in the row (the left)');
  // the elements between "+" and Send in document order: only the menu (the "+"'s own popup) and the menu's items, nothing visible
  const between = Array.from(bar.querySelectorAll('*')).filter((e: any) => before(plus, e) && before(e, send) && !plus.contains(e));
  assert.ok(between.every((e: any) => menu.contains(e) || e === menu), `only the menu is between "+" and Send: ${between.map((e: any) => e.className).join(', ')}`);
});

test('TAB ORDER of the card: the text area, then "+", then Send (the keep / use choice only when it is showing); with no menu the "+" is out and the order is text area, Send', () => {
  const r = card();
  assert.deepEqual(tabbables(r.q('.forge-prompt-box')).map(kindOf), ['text', 'plus', 'send']);
  const none = card({ ...PORTS, menu: undefined });
  assert.deepEqual(tabbables(none.q('.forge-prompt-box')).map(kindOf), ['text', 'send']);
});

test('THE MENU is anchored to the "+": it lives in the same wrapper as the "+" (so it opens from it, right-aligned to it), not in the row, and not under Send', () => {
  const r = card();
  const plus = r.q('.forge-composer-plus'); const menu = r.q('.forge-composer-menu'); const wrap = plus.parentElement;
  assert.ok(wrap && wrap.classList.contains('forge-composer-plus-wrap'), 'the "+" has its own wrapper');
  assert.ok(wrap.contains(menu), 'the menu is inside the wrapper of the "+"');
  assert.ok(!wrap.contains(r.q('.forge-composer-send')), 'Send is not in it');
  assert.equal(menu.hidden, true);
  plus.click();
  assert.equal(menu.hidden, false); assert.equal(plus.getAttribute('aria-expanded'), 'true');
  assert.ok(menu.closest('.forge-prompt-box'), 'inside the card');
});

test('THE KEYBOARD of the menu is as it was: a native button (Enter and Space open it), arrows move and wrap, Escape closes it and returns focus to the "+", Tab leaves it, an item runs and closes', () => {
  const ran: string[] = [];
  const r = card({ ...PORTS, menu: { ...MENU, run: (id) => { ran.push(id); } } });
  const plus = r.q('.forge-composer-plus');
  assert.equal(plus.tagName, 'BUTTON'); assert.equal(plus.type, 'button'); assert.equal(plus.disabled, false, 'a native, enabled button: Enter and Space activate it');
  assert.ok(accessibleName(plus).length > 2, 'it keeps its accessible name');
  assert.equal(plus.getAttribute('aria-haspopup'), 'menu');
  const key = (el: any, k: string) => { const e = new r.win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e; };
  plus.focus(); plus.click();                                             // what Enter / Space on a focused button does
  const items = [...r.parent.querySelectorAll('.forge-composer-menuitem')] as any[];
  assert.ok(r.doc.activeElement === items[0], 'the first item has the focus');
  key(items[0], 'ArrowDown'); assert.ok(r.doc.activeElement === items[1], "focus");
  key(items[1], 'ArrowDown'); assert.ok(r.doc.activeElement === items[2], 'the link item is the third');
  key(items[2], 'ArrowDown'); assert.ok(r.doc.activeElement === items[0], 'wraps');
  key(items[0], 'ArrowUp'); assert.ok(r.doc.activeElement === items[2], 'wraps up');
  key(items[2], 'Escape'); assert.equal(r.q('.forge-composer-menu').hidden, true); assert.ok(r.doc.activeElement === plus, 'Escape returns the focus to the "+"');
  plus.click(); key([...r.parent.querySelectorAll('.forge-composer-menuitem')][0], 'Tab'); assert.equal(r.q('.forge-composer-menu').hidden, true, 'Tab leaves and closes it');
  plus.click(); (r.parent.querySelectorAll('.forge-composer-menuitem')[1] as any).click();
  assert.deepEqual(ran, ['new-arr']); assert.equal(r.q('.forge-composer-menu').hidden, true);
});

test('BOTH LAYOUTS, the same card: in the stacked layout and in the two-column layout the row is status, "+", Send; the card and its menu are inside the chat PANEL (which does not scroll), never inside the scrolling body, and the divider is not an ancestor of them', () => {
  for (const cls of ['forge-chat-stacked', 'forge-chat-wide']) {
    const win: any = new Window({ url: 'http://localhost/' });
    const host = win.document.createElement('div'); win.document.body.appendChild(host);
    const score = win.document.createElement('div'); score.className = 'forge-rhythm-edit-score'; host.appendChild(score);
    const panel = mountChatPanel(host, { store: memoryStore(), box: PORTS }, 'x');
    host.classList.remove('forge-chat-stacked', 'forge-chat-wide'); host.classList.add(cls);
    const bar = host.querySelector('.forge-composer-bar') as HTMLElement;
    const order = Array.from(bar.querySelectorAll('.forge-prompt-box-state, .forge-composer-plus, .forge-composer-send')).map(kindOf);
    assert.deepEqual(order, ['state', 'plus', 'send'], cls);
    assert.ok(host.querySelector('.forge-chat-panel .forge-composer-menu'), `${cls}: the menu is inside the panel`);
    assert.ok(host.querySelector('.forge-chat-body .forge-composer-menu') === null, `${cls}: not inside the scrolling body`);
    assert.ok(host.querySelector('.forge-chat-resizer .forge-composer-menu') === null);
    assert.deepEqual(tabbables(host.querySelector('.forge-prompt-box')!).map(kindOf), ['text', 'plus', 'send'], `${cls}: Tab order`);
    panel.dispose();
  }
});

test('THE STYLESHEET: the "+" group is pushed to the right and Send is not the one that pushes; the menu is right-aligned to the "+" (right: 0, no left) and capped to the panel; no `order` reshuffles the row; the status text still takes the left', () => {
  const wrap = rule('.forge-prompt-box .forge-composer-plus-wrap');
  assert.ok(declares(wrap, 'position', /relative/), 'the wrapper is the menu\'s containing block');
  assert.ok(declares(wrap, 'margin-left', /auto/), 'the wrapper pushes "+" and Send to the right');
  const menu = rule('.forge-composer-menu');
  assert.ok(declares(menu, 'right', /0/), 'the menu is right-aligned to the "+"');
  assert.ok(!declares(menu, 'left'), 'and has no `left` of its own');
  assert.ok(declares(menu, 'max-width'), 'the menu is capped (to the panel) so it cannot reach past the left edge of a narrow tab');
  assert.ok(declares(rule('.forge-prompt-box .forge-composer-plus-wrap[hidden] + .forge-composer-send'), 'margin-left', /auto/), 'with no menu there is no "+": Send pushes itself to the right');
  const send = rule('.forge-prompt-box .forge-composer-send');
  assert.ok(!declares(send, 'margin-left'), 'Send does not push any more (the "+" group does)');
  assert.ok(!/\.forge-composer-(?:plus|send|bar|menu)[^{]*\{[^}]*\border\s*:/.test(CSS.replace(/\/\*[\s\S]*?\*\//g, '')), 'no CSS `order` reshuffles the row: the DOM order IS the visual order');
  assert.ok(declares(rule('.forge-prompt-box-state'), 'flex', /1 1 auto/), 'the status text takes the room that is left, on the left');
});

test('P3: NOTHING OUTSIDE THE MUSIC TABS CHANGED - the card, the "+" wrapper and the bracket-free phrase tab reach a person only through the music tabs\' description controller: no other module imports the card or the panel, and no other module draws a .forge-composer-* / .forge-prompt-box element', () => {
  const src = path.resolve(import.meta.dirname);
  const files = fs.readdirSync(src).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f) && !/\.generated\.ts$/.test(f));
  assert.ok(files.length > 300, `non-vacuity: walked ${files.length} files`);
  const importers = (mod: string): string[] => files.filter((f) => new RegExp(`^\\s*(?:import|export)[^;]*from\\s+'\\./${mod}\\.ts'`, 'm').test(fs.readFileSync(path.join(src, f), 'utf8'))).sort();
  assert.deepEqual(importers('prompt-box-dom'), ['chat-panel-dom.ts', 'description-apply.ts'], 'the card is mounted by the panel (and typed by the controller) only');
  assert.deepEqual(importers('chat-panel-dom'), ['description-apply.ts'], 'the panel is mounted by the music tabs\' description controller only');
  const drawers = files.filter((f) => /forge-composer-|forge-prompt-box/.test(fs.readFileSync(path.join(src, f), 'utf8'))).sort();
  assert.deepEqual(drawers, ['chat-panel-dom.ts', 'prompt-box-dom.ts'], 'no other module names the card\'s classes');
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const sel of css.split('}').map((b) => b.split('{')[0]).filter((x) => /forge-composer-plus-wrap/.test(x))) assert.ok(/\.forge-prompt-box|\.forge-composer-plus-wrap/.test(sel) && !/(?:^|[\s,>+~])(?:body|html|\*)\s*$/.test(sel.trim()), `the new rules are scoped to the card: ${sel.trim()}`);
});
