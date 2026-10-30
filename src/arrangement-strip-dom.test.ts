// 2026-10-29-0830 (M10 slice 1 polish) - the strip above an ARRANGEMENT's Score on its own (happy-dom): one button per phrase and per kit the note reads, in the order of its Recipe, no arrows; a click goes to the notes pane of the pair
// and, when there is no pair (or the pane could not be asked), to the note itself; an unreadable or refused note has no strip; a redraw keeps nothing of the old chips; it sits where the owner puts it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { newArrangementNote } from './arrangement-core.ts';
import { mountArrangementStrip } from './arrangement-strip-dom.ts';

const win: any = new Window({ url: 'http://localhost/' });
const TWO = newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_006' }] });

function rig(goto: (id: string) => Promise<boolean> = async () => true) {
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const calls: string[] = [];
  const s = mountArrangementStrip(parent, { goto: async (id) => { calls.push(`goto ${id}`); return goto(id); }, openNote: (id) => { calls.push(`open ${id}`); } });
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  return { parent, s, calls, flush, buttons: () => [...s.el.querySelectorAll('button')] as any[] };
}

test('an arrangement note: a button per phrase and per kit in the order of its Recipe, no arrow and no label between them; the accessible names say what a click opens; 2026-10-30-1000: with more than one kit each track is its own ROW (its phrase, then its kit)', () => {
  const r = rig();
  r.s.show(TWO);
  assert.deepEqual([...r.s.el.children].map((c: any) => c.className), ['forge-structure-row', 'forge-structure-row'], 'one block per kit');
  assert.deepEqual([...r.s.el.children].map((row: any) => [...row.children].map((c: any) => c.textContent)), [['phrase_003', 'rock kit'], ['phrase_006', 'latin kit']]);
  assert.deepEqual([...r.s.el.querySelectorAll('button')].map((c: any) => c.textContent), ['phrase_003', 'rock kit', 'phrase_006', 'latin kit'], 'still in the order of the Recipe');
  assert.deepEqual(r.buttons().map((b) => b.getAttribute('aria-label')), ['Open phrase_003', 'Open rock', 'Open phrase_006', 'Open latin']);
  assert.deepEqual(r.buttons().map((b) => b.dataset.note), ['phrases/phrase_003', 'kits/rock', 'phrases/phrase_006', 'kits/latin']);
  assert.equal(r.s.el.style.display, '');
});

test('a click asks the pair first: handled = nothing else happens; not handled (no pair) = the note is opened; a pane that throws counts as not handled', async () => {
  const handled = rig(async () => true);
  handled.s.show(TWO); handled.buttons()[1].click(); await handled.flush();
  assert.deepEqual(handled.calls, ['goto kits/rock']);
  const none = rig(async () => false);
  none.s.show(TWO); none.buttons()[0].click(); await none.flush();
  assert.deepEqual(none.calls, ['goto phrases/phrase_003', 'open phrases/phrase_003']);
  const broken = rig(async () => { throw new Error('the pane is gone'); });
  broken.s.show(TWO); broken.buttons()[3].click(); await broken.flush();
  assert.deepEqual(broken.calls, ['goto kits/latin', 'open kits/latin']);
});

test('an unreadable note, a refused note and text with no json have NO strip (hidden, not an empty bar); a good note after them brings it back; a redraw keeps nothing of the old chips', () => {
  const r = rig();
  r.s.show(TWO); assert.equal(r.buttons().length, 4);
  r.s.show({ unreadable: 'File not found' }); assert.equal(r.buttons().length, 0); assert.equal(r.s.el.style.display, 'none');
  r.s.show(TWO); assert.equal(r.buttons().length, 4);
  r.s.show('# not an arrangement\n'); assert.equal(r.buttons().length, 0); assert.equal(r.s.el.style.display, 'none');
  r.s.show(newArrangementNote('arr_002', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_006' }] }));
  assert.deepEqual(r.buttons().map((b) => b.textContent), ['phrase_006', 'rock kit'], 'the old chips are gone');
});

test('it is mounted where the owner asks (before the given element) and dispose removes it', () => {
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const area = win.document.createElement('div'); parent.appendChild(area);
  const s = mountArrangementStrip(parent, { goto: async () => true, openNote: () => {} }, area);
  assert.equal(parent.firstElementChild, s.el, 'above the Score area');
  s.dispose();
  assert.equal(parent.children.length, 1);
});


// ---- 2026-10-30-1000 (M10 slice 3): hover lights the rows of a kit or phrase; the pinned row's chips are emphasised ----------------------------------------------------------------------------

test('hover and focus on a chip tell the owner which chip (so the Score can light the rows of that kit or phrase), leaving tells null; without an owner that listens nothing happens', () => {
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const seen: Array<string | null> = [];
  const s = mountArrangementStrip(parent, { goto: async () => true, openNote: () => {}, onHover: (chip) => seen.push(chip ? `${chip.kind}:${chip.noteId}` : null) });
  s.show(TWO);
  const b = [...s.el.querySelectorAll('button')] as any[];
  b[1].dispatchEvent(new win.Event('mouseenter')); b[1].dispatchEvent(new win.Event('mouseleave'));
  b[2].dispatchEvent(new win.Event('focus')); b[2].dispatchEvent(new win.Event('blur'));
  assert.deepEqual(seen, ['kit:kits/rock', null, 'phrase:phrases/phrase_006', null]);
  const quiet = rig(); quiet.s.show(TWO);
  quiet.buttons()[0].dispatchEvent(new win.Event('mouseenter'));        // no onHover given: nothing to call, nothing thrown
  assert.equal(quiet.buttons().length, 4);
});

test('emphasise marks the chips of the notes it is given (the phrase and kit of a pinned row) and clears with null; a redraw of the same note keeps it', () => {
  const r = rig(); r.s.show(TWO);
  const on = () => r.buttons().filter((b) => b.classList.contains('forge-structure-chip-on')).map((b) => b.dataset.note);
  r.s.emphasise(['phrases/phrase_006', 'kits/latin']);
  assert.deepEqual(on(), ['phrases/phrase_006', 'kits/latin']);
  r.s.show(TWO); assert.deepEqual(on(), ['phrases/phrase_006', 'kits/latin']);
  r.s.emphasise(null); assert.deepEqual(on(), []);
});
