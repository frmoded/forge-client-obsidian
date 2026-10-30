// 2026-10-29-0910 (M10 slice 2): the row per kit above an arrangement's Score - Mute, Solo, a volume slider - in happy-dom, with a fake clock. The person never edits the Recipe text: a change goes out as ONE batch, after a quiet moment
// (debounced), through `commit`; the buttons show the new state at once; a redraw from the note never fights a change that has not been written yet. Pins the MECHANISM of the debounce (the controls batch and call commit once);
// if the design moves this SHOULD go red - reassess, don't just rewrite.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountArrangementControls, ARRANGEMENT_CONTROLS_DELAY_MS } from './arrangement-controls-dom.ts';
import type { ArrangementParams } from './arrangement-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const ARR: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009', mute: true, volume: 40 }] };

function rig() {
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const commits: Array<Array<[number, object]>> = []; const lines: string[] = [];
  let now = 0; const timers = new Map<number, { at: number; fn: () => void }>(); let nextId = 1;
  const handle = mountArrangementControls(parent, {
    commit: (patches) => { commits.push(patches.map(([i, p]) => [i, { ...p }])); },
    trace: (l) => lines.push(l),
    setTimer: (fn, ms) => { const id = nextId++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimer: (id) => { timers.delete(id as number); },
  });
  const advance = (ms: number) => { now += ms; for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); } };
  const q = (s: string) => parent.querySelector(s) as any; const qa = (s: string) => [...parent.querySelectorAll(s)] as any[];
  const rows = () => qa('.forge-arr-control');
  const click = (el: any) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const slide = (el: any, v: number) => { el.value = String(v); el.dispatchEvent(new win.Event('input', { bubbles: true })); };
  return { handle, parent, commits, lines, advance, q, qa, rows, click, slide, pending: () => timers.size };
}

test('nothing to show: no rows (a note that is not an arrangement, or no arrangement yet)', () => {
  const r = rig();
  assert.equal(r.rows().length, 0);
  r.handle.show(null);
  assert.equal(r.rows().length, 0);
});

test('one row per kit in track order, each with Mute, Solo (aria-pressed) and a 0 to 100 volume slider that reads its value; the state comes from the arrangement', () => {
  const r = rig();
  r.handle.show(ARR);
  assert.deepEqual(r.rows().map((row) => row.querySelector('.forge-arr-control-kit').textContent), ['rock', 'latin']);
  const [rock, latin] = r.rows();
  assert.deepEqual([rock, latin].map((row) => row.querySelector('.forge-arr-mute').getAttribute('aria-pressed')), ['false', 'true']);
  assert.deepEqual([rock, latin].map((row) => row.querySelector('.forge-arr-solo').getAttribute('aria-pressed')), ['false', 'false']);
  const sliders = [rock, latin].map((row) => row.querySelector('.forge-arr-volume'));
  assert.deepEqual(sliders.map((s) => [s.type, s.min, s.max, s.value]), [['range', '0', '100', '100'], ['range', '0', '100', '40']]);
  assert.deepEqual([rock, latin].map((row) => row.querySelector('.forge-arr-volume-value').textContent), ['100%', '40%']);
  assert.equal(sliders[0].getAttribute('aria-label'), 'Volume of rock');
  assert.equal(rock.querySelector('.forge-arr-mute').getAttribute('aria-label'), 'Mute rock');
});

test('a click on Mute shows the new state AT ONCE, and the change is committed once, after the quiet moment, not before', () => {
  const r = rig();
  r.handle.show(ARR);
  const mute = r.rows()[0].querySelector('.forge-arr-mute');
  r.click(mute);
  assert.equal(mute.getAttribute('aria-pressed'), 'true', 'at once');
  assert.deepEqual(r.commits, []);
  r.advance(ARRANGEMENT_CONTROLS_DELAY_MS - 1);
  assert.deepEqual(r.commits, [], 'not yet');
  r.advance(1);
  assert.deepEqual(r.commits, [[[0, { mute: true }]]]);
  assert.equal(r.pending(), 0);
});

test('dragging the slider is ONE commit with the last value; two kits changed inside the same quiet moment are one batch', () => {
  const r = rig();
  r.handle.show(ARR);
  const [rock, latin] = r.rows();
  for (const v of [90, 80, 70, 60]) { r.slide(rock.querySelector('.forge-arr-volume'), v); r.advance(50); }
  assert.deepEqual(r.commits, [], 'still dragging');
  assert.equal(rock.querySelector('.forge-arr-volume-value').textContent, '60%', 'the number follows the thumb');
  r.click(latin.querySelector('.forge-arr-solo'));
  r.advance(ARRANGEMENT_CONTROLS_DELAY_MS);
  assert.deepEqual(r.commits, [[[0, { volume: 60 }], [1, { solo: true }]]]);
});

test('a redraw from the note while a change is waiting does not undo it; after the commit the note\'s state is what the rows show', () => {
  const r = rig();
  r.handle.show(ARR);
  r.click(r.rows()[0].querySelector('.forge-arr-solo'));
  r.handle.show(ARR);                                                  // the note was redrawn (another note changed) before ours was written
  assert.equal(r.rows()[0].querySelector('.forge-arr-solo').getAttribute('aria-pressed'), 'true');
  r.advance(ARRANGEMENT_CONTROLS_DELAY_MS);
  r.handle.show({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003', solo: true }, ARR.tracks[1]] });
  assert.equal(r.rows()[0].querySelector('.forge-arr-solo').getAttribute('aria-pressed'), 'true');
  r.handle.show(ARR);                                                  // the note lost it (edited by hand): the rows follow the note
  assert.equal(r.rows()[0].querySelector('.forge-arr-solo').getAttribute('aria-pressed'), 'false');
});

test('every hand-off is one evidence line naming the kit and what changed (Info, permanent)', () => {
  const r = rig();
  r.handle.show(ARR);
  r.click(r.rows()[1].querySelector('.forge-arr-mute'));
  r.slide(r.rows()[0].querySelector('.forge-arr-volume'), 55);
  r.advance(ARRANGEMENT_CONTROLS_DELAY_MS);
  assert.deepEqual(r.lines, ['[forge-arrangement] controls: latin mute off', '[forge-arrangement] controls: rock volume 55', '[forge-arrangement] controls: wrote 2 change(s)']);
});

test('the kits of the note changed (a different arrangement shown): the rows are made again; dispose removes them and cancels a waiting commit', () => {
  const r = rig();
  r.handle.show(ARR);
  r.handle.show({ kind: 'arrangement', tracks: [{ kit: 'brush', phrase: 'phrase_001' }] });
  assert.deepEqual(r.rows().map((row) => row.querySelector('.forge-arr-control-kit').textContent), ['brush']);
  r.click(r.rows()[0].querySelector('.forge-arr-mute'));
  r.handle.dispose();
  r.advance(ARRANGEMENT_CONTROLS_DELAY_MS * 2);
  assert.deepEqual(r.commits, [], 'nothing is written after the tab is closed');
  assert.equal(r.qa('.forge-arr-controls').length, 0);
});

// ---- gaps the mutation pass found (2026-10-29-0910) --------------------------------------------------------------------------------------------------------------------------------------

test('the plain facts of the markup: a labelled group, real buttons with their words, a slider that steps by 1, the delay is 250 ms', () => {
  const r = rig();
  r.handle.show(ARR);
  assert.equal(ARRANGEMENT_CONTROLS_DELAY_MS, 250);
  const root = r.q('.forge-arr-controls');
  assert.deepEqual([root.getAttribute('role'), root.getAttribute('aria-label')], ['group', 'Kits']);
  const [rock] = r.rows();
  const [mute, solo] = [rock.querySelector('.forge-arr-mute'), rock.querySelector('.forge-arr-solo')];
  assert.deepEqual([mute.textContent, mute.type, solo.textContent, solo.type], ['Mute', 'button', 'Solo', 'button']);
  assert.equal(solo.getAttribute('aria-label'), 'Solo rock');
  assert.equal(rock.querySelector('.forge-arr-volume').step, '1');
});

test('a second change inside the quiet moment restarts it (the first timer is cleared), so one batch goes out 250 ms after the LAST change', () => {
  const r = rig();
  r.handle.show(ARR);
  r.click(r.rows()[0].querySelector('.forge-arr-mute'));
  r.advance(200);
  r.click(r.rows()[1].querySelector('.forge-arr-solo'));
  r.advance(200);
  assert.deepEqual(r.commits, [], '400 ms after the first, 200 after the last: still waiting');
  assert.equal(r.pending(), 1, 'exactly one timer is waiting, never two');
  r.advance(50);
  assert.deepEqual(r.commits, [[[0, { mute: true }], [1, { solo: true }]]]);
});

test('showing the same kits again keeps the very same rows (a slider being dragged is not rebuilt under the hand); other kits make new rows and drop what was waiting', () => {
  const r = rig();
  r.handle.show(ARR);
  const before = r.rows();
  r.handle.show({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009', solo: true }] });
  assert.ok(r.rows().every((row, i) => row === before[i]), 'same row objects');
  r.click(r.rows()[0].querySelector('.forge-arr-mute'));
  r.handle.show({ kind: 'arrangement', tracks: [{ kit: 'brush', phrase: 'phrase_001' }, { kit: 'latin', phrase: 'phrase_009' }] });
  assert.equal(r.pending(), 0, 'the waiting change belonged to another arrangement: its timer is cleared');
  r.advance(1000);
  assert.deepEqual(r.commits, [], 'and nothing is written for it');
});

test('show(null) clears the rows and forgets the kits (the next show builds them again)', () => {
  const r = rig();
  r.handle.show(ARR);
  r.handle.show(null);
  assert.equal(r.rows().length, 0);
  r.handle.show(ARR);
  assert.equal(r.rows().length, 2);
});

test('after dispose nothing happens: show draws nothing, a late timer commits nothing, a second dispose is harmless', () => {
  const r = rig();
  r.handle.show(ARR);
  r.click(r.rows()[0].querySelector('.forge-arr-mute'));
  r.handle.dispose();
  assert.equal(r.pending(), 0, 'its timer is cleared at dispose');
  r.handle.show(ARR);
  assert.equal(r.qa('.forge-arr-control').length, 0, 'show after dispose draws nothing');
  r.handle.dispose();
  r.advance(1000);
  assert.deepEqual(r.commits, []);
});

// ---- second round of the mutation pass (2026-10-29-0910) ----------------------------------------------------------------------------------------------------------------------------

test('the evidence line says the kit, the control and on/off in the same words for Mute and Solo, both ways', () => {
  const r = rig();
  r.handle.show(ARR);
  r.click(r.rows()[0].querySelector('.forge-arr-mute'));
  r.click(r.rows()[0].querySelector('.forge-arr-mute'));
  r.click(r.rows()[1].querySelector('.forge-arr-solo'));
  r.click(r.rows()[1].querySelector('.forge-arr-solo'));
  assert.deepEqual(r.lines, ['[forge-arrangement] controls: rock mute on', '[forge-arrangement] controls: rock mute off', '[forge-arrangement] controls: latin solo on', '[forge-arrangement] controls: latin solo off']);
  assert.equal(r.rows()[0].querySelector('.forge-arr-mute').getAttribute('aria-pressed'), 'false', 'two clicks = back where it was');
});

test('after dispose, show builds nothing in the (detached) container, not even if asked again', () => {
  const r = rig();
  const container = r.q('.forge-arr-controls');
  r.handle.show(ARR);
  assert.equal(container.children.length, 2);
  r.handle.dispose();
  r.handle.show({ kind: 'arrangement', tracks: [{ kit: 'brush', phrase: 'p' }] });
  assert.equal(container.children.length, 2, 'untouched after dispose (a disposed tab never draws)');
  assert.equal(container.parentNode, null, 'and it is out of the page');
});

test('a change still waiting for an arrangement is NOT carried into the next one: only what is changed afterwards goes out', () => {
  const r = rig();
  r.handle.show(ARR);
  r.click(r.rows()[1].querySelector('.forge-arr-solo'));                      // track 1 of the old arrangement
  r.handle.show({ kind: 'arrangement', tracks: [{ kit: 'brush', phrase: 'p' }, { kit: 'bells', phrase: 'q' }] });
  r.click(r.rows()[0].querySelector('.forge-arr-mute'));
  r.advance(ARRANGEMENT_CONTROLS_DELAY_MS);
  assert.deepEqual(r.commits, [[[0, { mute: true }]]], 'the old solo is gone');
});
