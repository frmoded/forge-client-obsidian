// 2026-11-17-2000 - the Score's one gentle row, the DOM part (happy-dom): labels, focus order, the Play / Pause toggle, Reset, the tempo field (click to type, Enter applies, Esc cancels, both ends), the Export menu, no progress or time element.
// The player is a fake with the surface the row uses (playing, start, stop, reset, setTempo, a state-change event); the real element is html-midi-player's, driven through the adapter in music-edition.full.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { disposeScoreTransports, mountScoreTransport, type TransportPlayer } from './score-transport-dom.ts';
import { exportItems } from './score-transport-core.ts';

function setup(opts: { mac?: boolean; tempo?: number } = {}) {
  const win: any = new Window({ url: 'http://localhost/' }); const doc = win.document; const toolbar = doc.createElement('div'); doc.body.appendChild(toolbar);
  const calls: string[] = []; const listeners: ((p: boolean) => void)[] = []; let playing = false;
  const player: TransportPlayer = {
    get playing() { return playing; }, start() { calls.push('start'); playing = true; listeners.forEach((l) => l(true)); }, stop() { calls.push('stop'); playing = false; listeners.forEach((l) => l(false)); },
    reset() { calls.push('reset'); playing = false; listeners.forEach((l) => l(false)); }, setTempo(pct: number) { calls.push(`tempo ${pct}`); }, onStateChange(fn: (p: boolean) => void) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
  };
  const exported: string[] = [];
  const row = mountScoreTransport(toolbar, { player, exportItems: exportItems({ macDesktop: opts.mac === true }), runExport: (id) => { exported.push(id); }, initialTempo: opts.tempo });
  const q = (sel: string): any => toolbar.querySelector(sel); const click = (el: any) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const key = (el: any, k: string, extra: object = {}) => el.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
  const stop = () => { playing = false; listeners.forEach((l) => l(false)); };
  return { win, doc, toolbar, row, player, calls, exported, q, click, key, finishPlaying: stop };
}

test('the row: one toolbar with a name, the controls in the order Play, Back to the start, Slower, the tempo value, Faster, Export; every one labelled in plain words (aria-label) with NO native tooltip and no extra description (2026-11-19-0800: nothing appears because the pointer rests); each is a real button', () => {
  const t = setup();
  assert.equal(t.q('.forge-score-transport').getAttribute('role'), 'toolbar'); assert.equal(t.q('.forge-score-transport').getAttribute('aria-label'), 'Score controls');
  const buttons = [...t.toolbar.querySelectorAll('.forge-score-transport button')].filter((b: any) => !b.closest('.forge-tp-menu'));
  assert.deepEqual(buttons.map((b: any) => b.getAttribute('aria-label')), ['Play', 'Back to the start', 'Slower', 'Tempo, click to type a percent', 'Faster', 'Export']);
  for (const b of buttons as any[]) { assert.equal(b.tagName, 'BUTTON'); assert.equal(b.getAttribute('type'), 'button'); assert.ok(b.getAttribute('aria-label'), 'a plain-word label'); assert.equal(b.hasAttribute('title'), false, 'no native tooltip'); assert.equal(b.hasAttribute('aria-description'), false, 'the description would only repeat the label'); }
  const icons = t.toolbar.querySelectorAll('.forge-score-transport svg'); assert.equal(icons.length, 5, 'five 16 px icons (the tempo value is text)');
  for (const svg of icons as any[]) { assert.equal(svg.getAttribute('viewBox'), '0 0 100 100'); assert.equal(svg.getAttribute('width'), '16'); assert.equal(svg.getAttribute('aria-hidden'), 'true'); }
  assert.equal(t.q('.forge-tp-tempo').textContent.trim(), '100%');
});

test('no progress bar, no time readout, no slider and no elapsed text anywhere in the row', () => {
  const t = setup(); const row = t.q('.forge-score-transport');
  assert.equal(row.querySelectorAll('input[type="range"], progress, meter, [role="slider"], [role="progressbar"], [class*="progress"], [class*="seek"], [class*="elapsed"], [class*="time"]').length, 0);
  assert.doesNotMatch(row.textContent, /\d+:\d\d|elapsed|remaining/i); assert.equal(row.querySelectorAll('input').length, 0, 'the tempo field is a button until clicked');
});

test('Play toggles to Pause and back: the label (and never a title), the icon and a gentle "is-playing" tint follow the player (also when the player stops by itself at the end), Reset stops and goes back to the start', () => {
  const t = setup(); const play = t.q('.forge-tp-play'); const iconBefore = play.innerHTML;
  assert.equal(play.getAttribute('aria-pressed'), 'false'); t.click(play); assert.deepEqual(t.calls, ['start']);
  assert.equal(play.getAttribute('aria-label'), 'Pause'); assert.equal(play.hasAttribute('title'), false, 'no native tooltip while playing either'); assert.equal(play.getAttribute('aria-pressed'), 'true'); assert.ok(play.classList.contains('is-playing')); assert.notEqual(play.innerHTML, iconBefore, 'the icon swapped to pause');
  t.click(play); assert.deepEqual(t.calls, ['start', 'stop']); assert.equal(play.getAttribute('aria-label'), 'Play'); assert.ok(!play.classList.contains('is-playing')); assert.equal(play.innerHTML, iconBefore);
  t.click(play); t.finishPlaying(); assert.equal(play.getAttribute('aria-label'), 'Play', 'the end of the score returns the button to Play'); assert.ok(!play.classList.contains('is-playing'));
  t.click(play); t.click(t.q('.forge-tp-reset')); assert.equal(t.calls[t.calls.length - 1], 'reset'); assert.equal(play.getAttribute('aria-label'), 'Play');
});

test('tempo buttons: Faster and Slower go in steps of 5 percent, the value shows it, both stop at the ends and say so (disabled), and the player is told every change', () => {
  const t = setup(); const value = t.q('.forge-tp-tempo'); t.click(t.q('.forge-tp-faster')); assert.equal(value.textContent.trim(), '105%'); t.click(t.q('.forge-tp-slower')); t.click(t.q('.forge-tp-slower')); assert.equal(value.textContent.trim(), '95%');
  assert.deepEqual(t.calls, ['tempo 105', 'tempo 100', 'tempo 95']);
  for (let i = 0; i < 20; i++) t.click(t.q('.forge-tp-slower')); assert.equal(value.textContent.trim(), '50%'); assert.equal(t.q('.forge-tp-slower').disabled, true); assert.equal(t.q('.forge-tp-faster').disabled, false);
  for (let i = 0; i < 40; i++) t.click(t.q('.forge-tp-faster')); assert.equal(value.textContent.trim(), '200%'); assert.equal(t.q('.forge-tp-faster').disabled, true); assert.equal(t.q('.forge-tp-slower').disabled, false);
  assert.equal(t.calls.filter((c) => c === 'tempo 50').length, 1, 'a click on a disabled button changes nothing and does not call the player again');
});

test('tempo field: a click on the value opens a field with the number selected; Enter applies (and gives the focus back), Esc cancels, a number outside the range is clamped, text that is not a number is refused and the old value stays', () => {
  const t = setup(); const open = () => { t.click(t.q('.forge-tp-tempo')); return t.q('.forge-tp-tempo-input'); };
  let input = open(); assert.ok(input, 'a field'); assert.equal(input.value, '100'); assert.equal(input.getAttribute('aria-label'), 'Tempo, percent'); assert.equal(input.getAttribute('inputmode'), 'numeric'); assert.equal(t.q('.forge-tp-tempo'), null, 'the value button is replaced while typing');
  assert.equal(t.doc.activeElement, input);
  input.value = '120'; t.key(input, 'Enter'); assert.equal(t.q('.forge-tp-tempo-input'), null); assert.equal(t.q('.forge-tp-tempo').textContent.trim(), '120%'); assert.equal(t.calls[t.calls.length - 1], 'tempo 120'); assert.equal(t.doc.activeElement, t.q('.forge-tp-tempo'), 'the focus is back on the value');
  input = open(); input.value = '300'; t.key(input, 'Enter'); assert.equal(t.q('.forge-tp-tempo').textContent.trim(), '200%'); assert.equal(t.calls[t.calls.length - 1], 'tempo 200');
  input = open(); input.value = '80'; t.key(input, 'Escape'); assert.equal(t.q('.forge-tp-tempo-input'), null); assert.equal(t.q('.forge-tp-tempo').textContent.trim(), '200%', 'Esc cancels'); assert.equal(t.calls[t.calls.length - 1], 'tempo 200');
  const before = t.calls.length; input = open(); input.value = 'fast'; t.key(input, 'Enter'); assert.equal(t.q('.forge-tp-tempo').textContent.trim(), '200%', 'not a number: the old value stays'); assert.equal(t.calls.length, before, 'and the player is not told');
  input = open(); input.value = '90'; input.dispatchEvent(new t.win.FocusEvent('blur')); assert.equal(t.q('.forge-tp-tempo-input'), null, 'leaving the field closes it'); assert.equal(t.q('.forge-tp-tempo').textContent.trim(), '200%', 'and does not apply (only Enter does)');
  t.click(t.q('.forge-tp-slower')); assert.equal(t.q('.forge-tp-tempo').textContent.trim(), '195%', 'the buttons step from what was applied');
});

test('Export: one icon button with a menu; it lists MusicXML and MIDI (GarageBand only on a Mac desktop); a choice runs that export and closes the menu with the focus back on the icon; Esc and a click outside close it', () => {
  const t = setup(); const btn = t.q('.forge-tp-export-btn'); const menu = t.q('.forge-tp-menu');
  assert.equal(btn.getAttribute('aria-haspopup'), 'menu'); assert.equal(btn.getAttribute('aria-expanded'), 'false'); assert.equal(menu.hidden, true); assert.equal(menu.getAttribute('role'), 'menu');
  t.click(btn); assert.equal(menu.hidden, false); assert.equal(btn.getAttribute('aria-expanded'), 'true'); const items = [...menu.querySelectorAll('[role="menuitem"]')]; assert.deepEqual(items.map((i: any) => i.textContent.trim()), ['MusicXML', 'MIDI']); assert.equal(t.doc.activeElement, items[0], 'focus goes to the first item');
  t.key(items[0], 'ArrowDown'); assert.equal(t.doc.activeElement, items[1]); t.key(items[1], 'ArrowDown'); assert.equal(t.doc.activeElement, items[0], 'wraps'); t.key(items[0], 'ArrowUp'); assert.equal(t.doc.activeElement, items[1]);
  t.click(items[1]); assert.deepEqual(t.exported, ['midi']); assert.equal(menu.hidden, true); assert.equal(btn.getAttribute('aria-expanded'), 'false'); assert.equal(t.doc.activeElement, btn);
  t.click(btn); t.key(t.q('[role="menuitem"]'), 'Escape'); assert.equal(menu.hidden, true); assert.equal(t.doc.activeElement, btn);
  t.click(btn); t.doc.body.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true })); assert.equal(menu.hidden, true, 'a click outside closes it');
  t.click(btn); t.click(btn); assert.equal(menu.hidden, true, 'the icon toggles it');
  const mac = setup({ mac: true }); mac.click(mac.q('.forge-tp-export-btn')); assert.deepEqual([...mac.toolbar.querySelectorAll('[role="menuitem"]')].map((i: any) => i.textContent.trim()), ['MusicXML', 'MIDI', 'Open in GarageBand']);
  mac.click(mac.toolbar.querySelectorAll('[role="menuitem"]')[2]); assert.deepEqual(mac.exported, ['garageband']);
});

test('dispose: the row and its listeners go away, and a later player event does nothing (no error)', () => {
  const t = setup(); t.row.dispose(); assert.equal(t.q('.forge-score-transport'), null); assert.doesNotThrow(() => t.finishPlaying());
});

test('a row mounted with a tempo (a tab that remembers it) shows it and its buttons step from it', () => {
  const t = setup({ tempo: 150 }); assert.equal(t.q('.forge-tp-tempo').textContent.trim(), '150%'); t.click(t.q('.forge-tp-faster')); assert.equal(t.q('.forge-tp-tempo').textContent.trim(), '155%');
});

test('a Score that has no sound (the player failed to mount) still has the Export menu: Play, Back to the start and the tempo are not shown', () => {
  const win: any = new Window({ url: 'http://localhost/' }); const toolbar = win.document.createElement('div'); win.document.body.appendChild(toolbar);
  const dead: TransportPlayer = { playing: false, start() { throw new Error('no sound'); }, stop() {}, reset() {}, setTempo() {}, onStateChange() { return () => {}; } };
  mountScoreTransport(toolbar, { player: dead, exportItems: exportItems({ macDesktop: false }), runExport: () => {}, playable: false });
  const visible = [...toolbar.querySelectorAll('button')].filter((b: any) => !b.hidden && !b.closest('[hidden]') && b.getAttribute('role') !== 'menuitem').map((b: any) => b.getAttribute('aria-label'));
  assert.deepEqual(visible, ['Export']);
});

test('disposeScoreTransports: every row under a root goes, with its listener on the document (a re-render of the Score replaces the row without leaving a listener behind)', () => {
  const t = setup(); const again = mountScoreTransport(t.toolbar, { player: t.player, exportItems: exportItems({ macDesktop: false }), runExport: () => {} });
  assert.equal(t.toolbar.querySelectorAll('.forge-score-transport').length, 2); assert.ok(again.el);
  disposeScoreTransports(t.toolbar); assert.equal(t.toolbar.querySelectorAll('.forge-score-transport').length, 0);
  const before = t.calls.length; t.finishPlaying(); assert.equal(t.calls.length, before);
});

test('real Chrome fires `blur` while the focused tempo field is being replaced: that must not undo the Enter that is closing it (found in the real-Chrome measure; this mimics the order)', () => {
  const t = setup(); t.click(t.q('.forge-tp-tempo')); const input = t.q('.forge-tp-tempo-input'); const original = input.replaceWith.bind(input);
  input.replaceWith = (node: any) => { input.dispatchEvent(new t.win.FocusEvent('blur')); original(node); };
  input.value = '120'; t.key(input, 'Enter');
  assert.equal(t.q('.forge-tp-tempo').textContent.trim(), '120%'); assert.equal(t.calls[t.calls.length - 1], 'tempo 120'); assert.equal(t.toolbar.querySelectorAll('.forge-tp-tempo').length, 1, 'one value button, not two');
});

test('Back to the start shows Play even when the player says nothing about it (a player that stops without an event)', () => {
  const win: any = new Window({ url: 'http://localhost/' }); const toolbar = win.document.createElement('div'); win.document.body.appendChild(toolbar);
  let playing = false; const quiet: TransportPlayer = { get playing() { return playing; }, start() { playing = true; }, stop() { playing = false; }, reset() { playing = false; }, setTempo() {}, onStateChange() { return () => {}; } };
  mountScoreTransport(toolbar, { player: quiet, exportItems: exportItems({ macDesktop: false }), runExport: () => {} });
  const click = (e: any) => e.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); const play = toolbar.querySelector('.forge-tp-play') as any;
  click(play); assert.equal(play.getAttribute('aria-label'), 'Pause'); click(toolbar.querySelector('.forge-tp-reset')); assert.equal(play.getAttribute('aria-label'), 'Play'); assert.ok(!play.classList.contains('is-playing'));
});
