// 2026-11-24-1039 Part B (driver: the grammar's long refusal under the composer, `The grammar did not accept this sentence (line 1, column 1: ...)`, "I could not select or copy it, so I do not know its words"). FOUND: that line is `.forge-composer-error`
// (prompt-box-dom.ts, the muted line under the card; its twin `.forge-prompt-box-state` is the busy line). Obsidian's leaf chrome is `user-select: none` and styles.css opted in every other message (1155-9) but NOT these two, so a drag selected nothing and
// Cmd+C copied nothing; the dialog above holds the same sentence cut at 600 characters (redact), the line under the card holds all of it. Also, every repaint (a key typed, a state change) set `textContent` again: a new text node each time, which
// ends a selection that was made. FIX: both opt in (styles.css), the repaint writes only when the words changed, and the dialog has ONE `Copy` button (`forge-chat-copy`: not the retired per-message `forge-copy-button`) that puts the whole dialog and the
// line under the card on the clipboard. Written BEFORE the code, seen red (the four tests below). A DOM element is never an assert operand.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountChatPanel } from './chat-panel-dom.ts';
import { append, fromOutcome, memoryStore, type DialogEntry } from './dialog-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const BOX = { preview: async () => ({ ok: false as const, message: 'x' }), apply: async () => ({ ok: false }) };
const CSS = fs.readFileSync(path.join(import.meta.dirname, '..', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const RULES = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1].split(',').map((x) => x.trim()).filter(Boolean), body: m[2] }));
const LONG = `The grammar did not accept this sentence (line 2, column 1: Expected "Then play [[a note]] for N bars.", "For N bars play [[a note]]." or "Repeat that N more times.", but found "then".).`;

function panel(entries: DialogEntry[] = []) {
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const handle = mountChatPanel(host, { box: BOX, store: memoryStore() }, '');
  handle.render(entries, '');
  return { host: host as HTMLElement, handle, under: () => host.querySelector('.forge-composer-error') as HTMLElement, copy: () => host.querySelector('.forge-chat-copy') as HTMLButtonElement | null };
}
const said = (): DialogEntry[] => {
  let l: DialogEntry[] = [];
  l = append(l, fromOutcome({ type: 'you', text: 'Play [[phrase_101]]. then Then play [[phrase_001]] for 2 bars' }), 1_700_000_000_000);
  l = append(l, fromOutcome({ type: 'rejected', line: 2, column: 1, message: 'Expected "Then play [[a note]] for N bars.", "For N bars play [[a note]]." or "Repeat that N more times.", but found "then".' }), 1_700_000_000_001);
  l = append(l, fromOutcome({ type: 'notice', message: 'The sentence service is not set up: add its URL and token in Settings → Forge Actions (Beta).' }), 1_700_000_000_002);
  return l;
};
const fakeClipboard = () => { const w: string[] = []; Object.defineProperty(win.navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => { w.push(t); } } }); return w; };
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('the line under the composer and the busy line are opted in to selection in styles.css, and nothing above them (the panel, the host, the card) says `user-select: none`', () => {
  const ok = (sel: string): boolean => RULES.some((r) => r.selectors.includes(sel) && /(?<![-\w])user-select:\s*text/.test(r.body));
  assert.ok(ok('.forge-composer-error'), '.forge-composer-error is selectable');
  assert.ok(ok('.forge-prompt-box-state'), '.forge-prompt-box-state is selectable');
  const none = RULES.filter((r) => /(?<![-\w])user-select:\s*none/.test(r.body)).flatMap((r) => r.selectors);
  const p = panel(said()); p.handle.box.setNote(LONG);
  for (let e: Element | null = p.under(); e !== null; e = e.parentElement) {
    assert.doesNotMatch(e.getAttribute('style') ?? '', /user-select:\s*none/i, `an inline user-select: none on <${e.tagName.toLowerCase()} class="${e.className}">`);
    for (const s of none) { let hit = false; try { hit = e.matches(s); } catch { /* a selector this DOM does not parse */ } assert.equal(hit, false, `${s} (user-select: none) matches <${e.tagName.toLowerCase()} class="${e.className}">`); }
  }
  p.handle.dispose();
});

test('a repaint with the same words leaves the line under the card as it is (the same text node: a selection made in it is not ended by a key typed in the card)', () => {
  const p = panel(said()); p.handle.box.setNote(LONG);
  const node = p.under().firstChild;
  assert.equal(p.under().textContent, LONG); assert.ok(node !== null);
  const field = p.host.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  field.value = 'x'; field.dispatchEvent(new win.Event('input', { bubbles: true }));               // a paint
  assert.equal(p.under().textContent, '');                                                       // (typing clears the note, as ever)
  p.handle.box.setNote(LONG); const again = p.under().firstChild; p.handle.box.setNote(LONG);
  assert.ok(p.under().firstChild === again, 'the same words are not written again');
  p.handle.dispose();
});

test('the dialog has ONE `Copy` button (hidden while the dialog is empty); a click puts the whole dialog on the clipboard, the person\'s sentence and Forge\'s words in order, and the line under the card when the dialog holds only a cut of it', async () => {
  const written = fakeClipboard();
  const empty = panel(); assert.ok(empty.copy() === null || empty.copy()!.hidden === true, 'nothing to copy yet'); empty.handle.dispose();
  const p = panel(said());
  assert.equal(p.host.querySelectorAll('.forge-chat-copy').length, 1); assert.equal(p.copy()!.textContent, 'Copy'); assert.equal(p.copy()!.hidden, false);
  assert.equal(p.copy()!.tagName, 'BUTTON'); assert.equal(p.copy()!.getAttribute('type'), 'button'); assert.equal(p.copy()!.hasAttribute('title'), false, 'no tooltip');
  p.handle.box.setNote(LONG);                                                                    // the same words as the dialog's rejected line: not said twice
  p.copy()!.click(); await settle();
  const dialog = [
    'You: Play [[phrase_101]]. then Then play [[phrase_001]] for 2 bars',
    `Forge: ${LONG}`,
    'Forge: The sentence service is not set up: add its URL and token in Settings → Forge Actions (Beta).',
  ].join('\n');
  assert.deepEqual(written, [dialog]);
  assert.equal(p.copy()!.textContent, 'Copied');
  const longer = `${LONG} ${'More words of the explanation. '.repeat(30)}`.trim();         // a line under the card that the dialog (cut at 600) does not hold whole
  p.handle.box.setNote(longer); p.copy()!.click(); await settle();
  assert.deepEqual(written.at(-1), `${dialog}\nUnder the box: ${longer}`);
  p.handle.dispose();
});

test('no clipboard to write to: the button says so and nothing throws', async () => {
  Object.defineProperty(win.navigator, 'clipboard', { configurable: true, value: undefined });
  const p = panel(said()); p.copy()!.click(); await settle();
  assert.equal(p.copy()!.textContent, 'Could not copy'); p.handle.dispose();
});
