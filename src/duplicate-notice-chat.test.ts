// 2026-11-19-0992a (part 3, and 0992b) - THE NOTICE OF A COPY: what the driver pasted was "Created , a copy of ." in build 9ae606d. FOUND: the two names ARE drawn (the Chrome shots and the real-plugin test show them), but each is a <button>
// and Obsidian's own app.css says `button { user-select: none }` (and `body { user-select: none }`): text of a button is skipped by a selection copy, and our `.forge-chat-link` rule never said otherwise; the same sheet's
// `button:not(.clickable-icon)` (more specific than a class) gives the link Obsidian's grey button background, box shadow and text colour. So now: the notice reads "Created bar_010, a copy of bar_007." with each name as plain visible text INSIDE
// an underlined link button, the stored entry text is the whole plain sentence (a copy of the dialog is the sentence), the stylesheet makes the link selectable and beats Obsidian's button rules, and a NEW line of the dialog is always scrolled
// into view (the old rule left the log where it was when it was not at the end: a line made by the person's own action could be below the fold). Written RED first. A DOM element is never an assert operand.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountChatPanel } from './chat-panel-dom.ts';
import { append, fromOutcome, memoryStore, sanitizeLoaded } from './dialog-core.ts';
import { createdLine } from './duplicate-note-core.ts';
import { dialogEntries } from './test-support/dialog-view.ts';

const win: any = new Window({ url: 'http://localhost/' });
const BOX = { preview: async () => ({ ok: false as const, message: 'x' }), apply: async () => ({ ok: false }) };
const SENTENCE = 'Created bar_010, a copy of bar_007.';
const LINKS = [{ name: 'bar_010', id: 'bars/bar_010' }, { name: 'bar_007', id: 'bars/bar_007' }];
const CSS = fs.readFileSync(path.join(import.meta.dirname, '..', 'styles.css'), 'utf8');

function panel(opts: { openNote?: (id: string) => void } = {}) {
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const handle = mountChatPanel(host, { box: BOX, store: memoryStore(), ...(opts.openNote ? { openNote: opts.openNote } : {}) }, '');
  return { host, handle, links: () => [...host.querySelectorAll('.forge-chat-link')] as HTMLElement[], line: () => (host.querySelector('.forge-chat-msg .forge-chat-text')?.textContent ?? '').replace(/^✓\s*/, '') };
}
const created = (text = SENTENCE, links = LINKS) => append([], fromOutcome({ type: 'created', text, links }), 1_700_000_000_000);

test('the sentence of a copy is plain: "Created bar_010, a copy of bar_007." (no brackets), and the event keeps it as the entry\'s text', () => {
  assert.equal(createdLine({ name: 'bar_010', sourceName: 'bar_007' }), SENTENCE);
  const [e] = created(); assert.equal(e.text, SENTENCE); assert.deepEqual(e.links, LINKS); assert.equal(e.kind, 'applied');
});

test('the panel draws each NAME as visible text inside a link button; the words of the line are exactly the sentence (a selection copy of the line is the sentence); a click opens that note', () => {
  const opened: string[] = []; const p = panel({ openNote: (id) => { opened.push(id); } });
  p.handle.render(created(), '');
  assert.equal(p.line(), SENTENCE);
  assert.deepEqual(p.links().map((b) => b.textContent), ['bar_010', 'bar_007']);
  assert.deepEqual(p.links().map((b) => b.getAttribute('data-note')), ['bars/bar_010', 'bars/bar_007']);
  assert.ok(p.links().every((b) => b.tagName === 'BUTTON' && b.getAttribute('type') === 'button' && !b.hasAttribute('title') && b.classList.contains('forge-chat-link')));
  p.links()[0].click(); p.links()[1].click(); assert.deepEqual(opened, ['bars/bar_010', 'bars/bar_007']);
  assert.equal(dialogEntries(p.host)[0].text.replace(/^✓\s*/, ''), SENTENCE);
  p.handle.dispose();
});

test('a name that is the start of another ("bar_01" inside "bar_010") is not cut out of it; each link is found in order', () => {
  const p = panel({ openNote: () => {} });
  p.handle.render(created('Created bar_010, a copy of bar_01.', [{ name: 'bar_010', id: 'bars/bar_010' }, { name: 'bar_01', id: 'bars/bar_01' }]), '');
  assert.equal(p.line(), 'Created bar_010, a copy of bar_01.'); assert.deepEqual(p.links().map((b) => b.textContent), ['bar_010', 'bar_01']);
  p.handle.dispose();
});

test('no way to open a note (no openNote port): the words are drawn, no buttons that would do nothing; the line is still the sentence', () => {
  const p = panel(); p.handle.render(created(), '');
  assert.deepEqual(p.links(), []); assert.equal(p.line(), SENTENCE);
  p.handle.dispose();
});

test('an entry saved by 0992 ("Created [[bar_010]], a copy of [[bar_007]]." with its links) still draws its two buttons and still reads as it was stored', () => {
  const p = panel({ openNote: () => {} });
  p.handle.render(created('Created [[bar_010]], a copy of [[bar_007]].'), '');
  assert.equal(p.line(), 'Created [[bar_010]], a copy of [[bar_007]].'); assert.deepEqual(p.links().map((b) => b.textContent), ['[[bar_010]]', '[[bar_007]]']);
  p.handle.dispose();
});

test('the entry survives data.json with its links (sanitize) and draws the same', () => {
  const back = sanitizeLoaded(JSON.parse(JSON.stringify(created())));
  const p = panel({ openNote: () => {} }); p.handle.render(back, ''); assert.equal(p.line(), SENTENCE); assert.equal(p.links().length, 2);
  p.handle.dispose();
});

// ---- the stylesheet: the link is selectable and Obsidian's button rules do not win ------------------------------------------------------------------------------------------------------------------------
const rulesFor = (selector: RegExp): string[] => [...CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => selector.test(m[1].trim())).map((m) => m[2]);
test('styles.css: the link button is SELECTABLE text (user-select: text beats Obsidian\'s `button { user-select: none }`: a copy of the dialog keeps the names)', () => {
  const body = rulesFor(/(^|,)\s*button\.forge-chat-link\s*(,|$)/).join(' ');
  assert.match(body, /user-select:\s*text/); assert.match(body, /-webkit-user-select:\s*text/);
});

test('styles.css: the link beats Obsidian\'s `button:not(.clickable-icon)` and `button:hover` (both 0,1,1): a rule MORE specific than both (button.forge-chat-link:not(.clickable-icon), 0,2,1) gives no grey background, no box shadow, the accent colour, underlined; and the sheet has no :hover rule of its own for it', () => {
  const rest = rulesFor(/button\.forge-chat-link:not\(\.clickable-icon\)/).join(' ');
  assert.match(rest, /background(-color)?:\s*(none|transparent)/); assert.match(rest, /box-shadow:\s*none/); assert.match(rest, /color:\s*var\(--text-accent/); assert.match(rest, /text-decoration:\s*underline/);
  assert.equal(rulesFor(/forge-chat-link:hover/).length, 0, 'no :hover selector (src/no-hover-behavior.test.ts)');
  assert.ok(!/(^|[^-\w])color:\s*(red|#f00)/i.test(rest), 'not red (the music tabs have no red)');
});

// ---- a NEW line is shown ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function scrolling(p: ReturnType<typeof panel>) {
  const log = p.host.querySelector('.forge-chat-log') as any; let top = 0; let height = 1000;
  Object.defineProperty(log, 'scrollHeight', { get: () => height, configurable: true }); Object.defineProperty(log, 'clientHeight', { get: () => 100, configurable: true });
  Object.defineProperty(log, 'scrollTop', { get: () => top, set: (v: number) => { top = v; }, configurable: true });
  return { top: () => top, set: (n: number) => { top = n; }, grow: (n: number) => { height = n; } };
}
test('a NEW entry scrolls the dialog to the end even when the person had left it somewhere else (their own action just made it); a redraw with NOTHING new keeps the place', () => {
  const p = panel(); const s = scrolling(p);
  let list = append([], fromOutcome({ type: 'notice', message: 'one' }), 1); list = append(list, fromOutcome({ type: 'notice', message: 'two' }), 2);
  p.handle.render(list, ''); s.set(0);                                                // the person scrolled to the top (or the log was never at the end)
  p.handle.render(list, ''); assert.equal(s.top(), 0, 'the same entries again: the place is kept');
  s.grow(1400); list = append(list, fromOutcome({ type: 'created', text: SENTENCE, links: LINKS }), 3);
  p.handle.render(list, ''); assert.equal(s.top(), 1400, 'the new line is scrolled into view');
  p.handle.dispose();
});

test('the first draw of a tab with an old history shows the NEWEST end', () => {
  const p = panel(); const s = scrolling(p);
  let list = append([], fromOutcome({ type: 'notice', message: 'one' }), 1); list = append(list, fromOutcome({ type: 'notice', message: 'two' }), 2);
  p.handle.render(list, ''); assert.equal(s.top(), 1000);
  p.handle.dispose();
});
