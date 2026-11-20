// 2026-11-19-0992 - THE DIALOG LINE of a copy: "Created [[bar_010]], a copy of [[bar_007]]." with LINKS (a dialog entry may carry the notes it names; the chat panel draws each `[[name]]` as a quiet link button that opens that note through
// the panel's `openNote` port), the entry survives the data.json round trip (sanitize), nothing is a tooltip, nothing is red; the composer's Proposal may be an ACTION (never auto-applied) and the box can be SUBMITTED from outside (the
// click's "usual preview"). Written RED first. The panel and the box are the real ones in happy-dom; a DOM element is never an assert operand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountChatPanel } from './chat-panel-dom.ts';
import { append, fromOutcome, memoryStore, sanitizeLoaded } from './dialog-core.ts';
import { initComposer, step, type Proposal } from './composer-core.ts';
import { dialogEntries } from './test-support/dialog-view.ts';

const win: any = new Window({ url: 'http://localhost/' });
const BOX = { preview: async () => ({ ok: false as const, message: 'x' }), apply: async () => ({ ok: false }) };
const LINKS = [{ name: 'bar_010', id: 'bars/bar_010' }, { name: 'bar_007', id: 'bars/bar_007' }];

function panel(opts: { openNote?: (id: string) => void } = {}) {
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const handle = mountChatPanel(host, { box: BOX, store: memoryStore(), ...(opts.openNote ? { openNote: opts.openNote } : {}) }, '');
  const draw = (entries: ReturnType<typeof append>) => handle.render(entries, '');
  return { host, handle, draw, links: () => [...host.querySelectorAll('.forge-chat-link')] as HTMLElement[] };
}
const created = () => append([], fromOutcome({ type: 'created', text: 'Created [[bar_010]], a copy of [[bar_007]].', links: LINKS }), 1_700_000_000_000);

test('the event makes an APPLIED entry (it carries the check mark like every applied line) whose text is the sentence, with the notes it names', () => {
  const [e] = created();
  assert.equal(e.kind, 'applied'); assert.equal(e.text, 'Created [[bar_010]], a copy of [[bar_007]].'); assert.deepEqual(e.links, LINKS);
});

test('the panel draws each [[name]] of such an entry as a link button; the words are exactly the sentence; a click opens that note\'s id; no title attribute (no tooltip)', () => {
  const opened: string[] = []; const p = panel({ openNote: (id) => { opened.push(id); } });
  p.draw(created());
  assert.equal(dialogEntries(p.host)[0].text.replace(/^✓\s*/, ''), 'Created [[bar_010]], a copy of [[bar_007]].');
  assert.deepEqual(p.links().map((b) => b.textContent), ['[[bar_010]]', '[[bar_007]]']);
  assert.deepEqual(p.links().map((b) => b.getAttribute('data-note')), ['bars/bar_010', 'bars/bar_007']);
  assert.ok(p.links().every((b) => b.tagName === 'BUTTON' && b.getAttribute('type') === 'button' && !b.hasAttribute('title')));
  p.links()[0].click(); p.links()[1].click(); assert.deepEqual(opened, ['bars/bar_010', 'bars/bar_007']);
  p.handle.dispose();
});

test('an entry without links is drawn as it always was (text only: [[bar_007]] in an ordinary line stays plain text); a panel with no openNote port draws the words and no dead buttons', () => {
  const p = panel();
  p.draw(append(append([], fromOutcome({ type: 'notice', message: 'Look at [[bar_007]].' }), 1), fromOutcome({ type: 'applied', change: '8 -> 6 bars', description: 'Extend [[bar_005]] to 6 bars.' }), 2));
  assert.deepEqual(p.links(), []); assert.equal(dialogEntries(p.host)[0].text, 'Look at [[bar_007]].');
  p.draw(created()); assert.deepEqual(p.links(), [], 'no way to open a note: no buttons that do nothing'); assert.equal(dialogEntries(p.host)[0].text.replace(/^✓\s*/, ''), 'Created [[bar_010]], a copy of [[bar_007]].');
  p.handle.dispose();
});

test('the links survive the round trip through data.json (sanitizeLoaded keeps well-formed ones, drops anything else, caps nothing it should not)', () => {
  const [e] = created();
  const back = sanitizeLoaded(JSON.parse(JSON.stringify([e])));
  assert.deepEqual(back[0].links, LINKS);
  const bad = sanitizeLoaded([{ ...e, links: [{ name: 'ok', id: 'bars/ok' }, { name: 5, id: 'x' }, { name: 'a', id: '' }, 'junk', null] }]);
  assert.deepEqual(bad[0].links, [{ name: 'ok', id: 'bars/ok' }]);
  assert.equal(sanitizeLoaded([{ ...e, links: 'nope' }])[0].links, undefined);
});

// 2026-11-20-1002 (deliberate): an ACTION proposal was never auto-applied (the preview of a copy was always seen); the copy is undone by the trash since 0992a, so it applies at once with auto-apply on (the default now); with the switch off the preview is still seen
test('2026-11-20-1002 (deliberate): an ACTION proposal is auto-applied with the switch on (was: never) and previewed with it off; a sentence proposal is as before', () => {
  const working = { phase: 'working' as const, text: 'Duplicate [[bar_007]].', seq: 1 };
  const action: Proposal = { description: 'Copy [[bar_007]] to a new bar.', via: 'grammar', action: true };
  const r = step(working, { type: 'resolved', seq: 1, proposal: action, autoApply: true });
  assert.equal(r.state.phase, 'applying'); assert.equal(r.effect.do, 'apply');
  const off = step(working, { type: 'resolved', seq: 1, proposal: action }); assert.equal(off.state.phase, 'previewing'); assert.equal(off.effect.do, 'none');
  const plain: Proposal = { description: 'Extend [[bar_005]] to 4 bars.', via: 'grammar' };
  assert.equal(step(working, { type: 'resolved', seq: 1, proposal: plain, autoApply: true }).state.phase, 'applying', 'a recipe sentence is auto-applied when the switch is on, as before');
  assert.equal(initComposer('x').phase, 'idle');
});

test('the box can be submitted from outside (the copy click\'s first Enter): same state machine as the key; nothing typed = nothing asked', async () => {
  const asked: string[] = [];
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const h = mountChatPanel(host, { box: { preview: async (t: string) => { asked.push(t); return { ok: true as const, proposal: { description: 'x', via: 'grammar' as const } }; }, apply: async () => ({ ok: false }) }, store: memoryStore() }, '');
  h.box.submit(); for (let i = 0; i < 20; i++) await Promise.resolve(); assert.deepEqual(asked, [], 'an empty box asks nothing');
  h.box.suggest('Duplicate [[bar_007]].'); h.box.submit(); for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.deepEqual(asked, ['Duplicate [[bar_007]].']); assert.equal(h.box.composer().phase, 'previewing');
  assert.ok(win.document.activeElement === (host.querySelector('.forge-prompt-box-text') as unknown), 'suggest returns focus to the field');
  h.dispose();
});
