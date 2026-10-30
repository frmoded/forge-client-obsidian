// 2026-10-30-1040 - the driver's walk (step 10): arrangement of phrase_006 on rock and phrase_010 on latin; Solo on latin on; Solo on latin off; Mute on rock; Mute on latin. The REAL controls module and the REAL note round trip
// (applySettingsPatches, the write the tab does), the note read after every click. Expected after the last click: both Mute buttons pressed, neither Solo, and the note's text BYTE-EQUAL to an arrangement made by hand with both
// `mute: true` and no `solo`. (The Score's "Every kit is muted" sentence for the same note is proven against the real engine in arrangement-engine tests; real Chrome is scripts/dev/measure-arrangement-controls.ts.)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountArrangementControls } from './arrangement-controls-dom.ts';
import { applySettingsPatches, newArrangementNote, readArrangementNote, type ArrangementParams } from './arrangement-core.ts';

const TRACKS: ArrangementParams['tracks'] = [{ kit: 'rock', phrase: 'phrase_006' }, { kit: 'latin', phrase: 'phrase_010' }];
const note = (tracks: ArrangementParams['tracks']): string => newArrangementNote('arr_001', { kind: 'arrangement', tracks });

function walk() {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  let text = note(TRACKS);
  const timers: Array<() => void> = [];
  const show = () => { const r = readArrangementNote(text); controls.show(r.ok ? r.value : null); };
  const controls = mountArrangementControls(parent, {
    commit: (patches) => { const w = applySettingsPatches(text, 'arr_001', patches); assert.ok(w.ok); if (w.ok && w.changed) text = w.text; show(); },        // the tab's write, then its redraw from the note
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: (h) => { timers[(h as number) - 1] = () => {}; },
  });
  show();
  const buttons = () => [...parent.querySelectorAll('.forge-arr-control')].map((row: any) => ({ kit: row.querySelector('.forge-arr-control-kit').textContent, mute: row.querySelector('.forge-arr-mute').getAttribute('aria-pressed'), solo: row.querySelector('.forge-arr-solo').getAttribute('aria-pressed') }));
  const click = (kit: number, which: 'mute' | 'solo') => { (parent.querySelectorAll('.forge-arr-control')[kit].querySelector(`.forge-arr-${which}`) as any).click(); const waiting = timers.splice(0); for (const f of waiting) f(); };   // a quiet moment passes after each click
  return { click, buttons, text: () => text };
}

test('THE WALK: solo latin on, solo latin off, mute rock, mute latin -> both Mute pressed, no Solo pressed, and the note is the one made by hand with both mute: true (byte for byte)', () => {
  const w = walk();
  w.click(1, 'solo');
  assert.deepEqual(w.buttons(), [{ kit: 'rock', mute: 'false', solo: 'false' }, { kit: 'latin', mute: 'false', solo: 'true' }]);
  assert.equal(w.text(), note([TRACKS[0], { ...TRACKS[1], solo: true }]), 'solo on: the note of an arrangement made with solo on latin');
  w.click(1, 'solo');
  assert.equal(w.text(), note(TRACKS), 'solo off: the note is the note it was (no `solo: false` left behind)');
  w.click(0, 'mute');
  assert.deepEqual(w.buttons(), [{ kit: 'rock', mute: 'true', solo: 'false' }, { kit: 'latin', mute: 'false', solo: 'false' }]);
  w.click(1, 'mute');
  assert.deepEqual(w.buttons(), [{ kit: 'rock', mute: 'true', solo: 'false' }, { kit: 'latin', mute: 'true', solo: 'false' }]);
  assert.equal(w.text(), note([{ ...TRACKS[0], mute: true }, { ...TRACKS[1], mute: true }]));
  assert.ok(!/"solo"/.test(w.text().split('# Description')[0] + (/```json[\s\S]*?```/.exec(w.text())?.[0] ?? '')), 'no solo in the json');
});

test('the same walk, every pair of clicks that could leave a stale solo: solo on/off/on/off on both kits, then mute both: the note never holds `solo`, and the buttons agree with it', () => {
  const w = walk();
  for (const kit of [0, 1, 0, 1]) { w.click(kit, 'solo'); w.click(kit, 'solo'); }
  w.click(0, 'solo'); w.click(1, 'solo'); w.click(0, 'solo'); w.click(1, 'solo');
  assert.equal(w.text(), note(TRACKS));
  w.click(0, 'mute'); w.click(1, 'mute');
  assert.equal(w.text(), note([{ ...TRACKS[0], mute: true }, { ...TRACKS[1], mute: true }]));
  assert.deepEqual(w.buttons().map((b) => b.solo), ['false', 'false']);
  w.click(0, 'mute'); w.click(1, 'mute');
  assert.equal(w.text(), note(TRACKS), 'unmuting both is the note it started as');
});
