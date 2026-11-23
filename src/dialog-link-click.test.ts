// 2026-11-23-1018 PART C: the click on a link of the dialog (`Created bar_010, a copy of bar_007`) opened the note even while the person was typing in the composer. Now: when the composer HAD FOCUS AND HOLDS TEXT at the mouse-down, the click writes
// `[[bar_007]]` into the composer at the caret (focus stays there, nothing opens); with an empty composer, or the focus elsewhere, the click opens the note as ever; a panel with no `insertLink` port (lean, a tab that has no composer for lists) is unchanged.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountChatPanel } from './chat-panel-dom.ts';
import { memoryStore, type DialogEntry } from './dialog-core.ts';
import { linkInsertion } from './duplicate-sentence-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const ENTRY: DialogEntry = { id: 1, at: 0, kind: 'applied', text: 'Created bar_010, a copy of bar_007.', links: [{ name: 'bar_010', id: 'bars/bar_010' }, { name: 'bar_007', id: 'bars/bar_007' }] } as DialogEntry;

function mount(withInsert: boolean) {
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const opened: string[] = []; const inserted: string[] = [];
  const chat = mountChatPanel(host, {
    box: { preview: async () => ({ kind: 'none' } as never), apply: async () => ({ ok: true }) },
    store: memoryStore(), openNote: (id) => { opened.push(id); },
    ...(withInsert ? { insertLink: (name: string) => { inserted.push(name); chat.box.insertAtCaret((before) => linkInsertion(before, name)); } } : {}),
  }, '');
  chat.render([ENTRY], '');
  const text = host.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const link = (name: string) => [...host.querySelectorAll('.forge-chat-link')].find((b: any) => b.textContent === name) as HTMLElement;
  const click = (el: HTMLElement) => { el.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true })); el.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); };
  return { host, chat, opened, inserted, text, link, click };
}

test('C1 typing in the composer, a click on a link of the dialog writes [[name]] at the caret, keeps the focus in the composer and opens nothing', () => {
  const m = mount(true);
  m.text.focus(); m.text.value = 'Move'; m.text.dispatchEvent(new win.Event('input', { bubbles: true }));
  m.click(m.link('bar_007'));
  assert.deepEqual(m.opened, [], 'the note was not opened'); assert.deepEqual(m.inserted, ['bar_007']);
  assert.equal(m.text.value, 'Move [[bar_007]]');
  m.click(m.link('bar_010')); assert.equal(m.text.value, 'Move [[bar_007]] [[bar_010]]');
});

test('C2 with an EMPTY composer, or the focus elsewhere, a click on the link opens the note as it did', () => {
  const m = mount(true);
  m.text.focus(); m.click(m.link('bar_007'));
  assert.deepEqual(m.opened, ['bars/bar_007']); assert.deepEqual(m.inserted, []);
  m.text.value = 'Move'; m.text.dispatchEvent(new win.Event('input', { bubbles: true })); (m.link('bar_010') as HTMLElement).focus();         // the text is there, the focus is on something else
  m.click(m.link('bar_010')); assert.deepEqual(m.opened, ['bars/bar_007', 'bars/bar_010']); assert.equal(m.text.value, 'Move');
});

test('C3 a panel with no insertLink port (lean; a tab with no list composer) is unchanged: the click opens the note even while typing', () => {
  const m = mount(false);
  m.text.focus(); m.text.value = 'Move'; m.text.dispatchEvent(new win.Event('input', { bubbles: true }));
  m.click(m.link('bar_007'));
  assert.deepEqual(m.opened, ['bars/bar_007']); assert.equal(m.text.value, 'Move');
});

// ---- what the mutation pass of 1018 found unguarded --------------------------------------------------------------------------------------------------------------------------------------------------------------
test('C4 the typing mark is spent by the click: a later click with NO mouse-down (the keyboard) opens the note; the focus is back in the composer after a link was written', () => {
  const m = mount(true);
  m.text.focus(); m.text.value = 'Move'; m.text.dispatchEvent(new win.Event('input', { bubbles: true }));
  m.click(m.link('bar_007'));
  assert.equal(win.document.activeElement, m.text, 'the focus is in the composer');
  m.link('bar_007').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));          // Enter or Space on the button: a click with no mouse-down
  assert.deepEqual(m.opened, ['bars/bar_007'], 'the mark did not outlive the click that used it');
});

test('C5 a failing insertLink or a failing opener is logged (with the words the console shows) and never breaks the panel; a failed insert opens nothing', () => {
  const logged: string[] = []; const saved = console.error; console.error = (...a: unknown[]) => { logged.push(String(a[0])); };
  try {
    const host = win.document.createElement('div'); win.document.body.appendChild(host);
    const opened: string[] = [];
    const chat = mountChatPanel(host, { box: { preview: async () => ({ kind: 'none' } as never), apply: async () => ({ ok: true }) }, store: memoryStore(), openNote: (id) => { opened.push(id); throw new Error('no such note'); }, insertLink: () => { throw new Error('no caret'); } }, '');
    chat.render([ENTRY], '');
    const text = host.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement; const link = [...host.querySelectorAll('.forge-chat-link')][0] as HTMLElement;
    text.focus(); text.value = 'Move'; text.dispatchEvent(new win.Event('input', { bubbles: true }));
    link.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true })); link.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(opened, [], 'a failed insert opens nothing'); assert.deepEqual(logged, ['[forge-chat] could not write a link into the composer']);
    text.value = ''; text.dispatchEvent(new win.Event('input', { bubbles: true })); link.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(opened, ['bars/bar_010']); assert.deepEqual(logged, ['[forge-chat] could not write a link into the composer', '[forge-chat] could not open a note from the dialog']);
  } finally { console.error = saved; }
});

test('C6 the panel puts the focus back in the composer itself after a link was written (whatever the port did); a click that OPENED a note leaves no typing mark behind (a later keyboard click, with text now in the composer, still opens)', () => {
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const opened: string[] = []; const inserted: string[] = [];
  const chat = mountChatPanel(host, { box: { preview: async () => ({ kind: 'none' } as never), apply: async () => ({ ok: true }) }, store: memoryStore(), openNote: (id) => { opened.push(id); }, insertLink: (name) => { inserted.push(name); } }, '');          // a port that writes nothing and focuses nothing
  chat.render([ENTRY], '');
  const text = host.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement; const link = [...host.querySelectorAll('.forge-chat-link')][0] as HTMLElement;
  const typeWords = () => { text.focus(); text.value = 'Move'; text.dispatchEvent(new win.Event('input', { bubbles: true })); };
  const down = () => link.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true })), click = () => link.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  text.value = ''; text.focus(); down(); click();                                   // empty composer: opens
  assert.deepEqual(opened, ['bars/bar_010']);
  typeWords(); click();                                                              // a click with no mouse-down, text now there: still opens (no mark was left)
  assert.deepEqual(opened, ['bars/bar_010', 'bars/bar_010']); assert.deepEqual(inserted, []);
  typeWords(); down(); link.focus(); click();                                // typing: the mouse-down found the composer focused, the press then moved the focus to the button (as a browser does); the port is asked and the panel gives the focus back
  assert.deepEqual(inserted, ['bar_010']); assert.equal(win.document.activeElement, text);
});
