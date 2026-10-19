// Drain 2026-10-18-1800 §5 — per-ring controls in the circle toolbar, for the SELECTED ring (the one whose shape is shown; the ring legend picks it):
//   Rotate this ring one step earlier / later   — only that channel; every other channel stays byte-identical
//   Move this ring outward / inward              — changes the ring's place in the ring order, which IS the order of the note's `channels` keys
// Both are ordinary data edits through commitChange() (a save in a note, local `edited` in a playground). Circle view only: the grid has no
// "selected row", so there is nothing to apply the actions to there. Real notes from the shipped library, not look-alikes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { loadWidget, skip, widgetScript, type Harness } from './test-support/rhythm-widget-harness.ts';
import { readVaultFile } from './test-support/vault-source.ts';
import { formatRhythmJson, readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';

function pureCore(): any {
  const mod: { exports: any } = { exports: {} };
  new Function('module', widgetScript)(mod);
  return mod.exports;
}
const noteData = (name: string): RhythmData => {
  const text = readVaultFile('music-theory', `rhythm_data/${name}.md`);          // sibling or bundle; both present and different THROWS, naming both (vault-source.ts)
  assert.ok(text !== null, `${name}: neither the sibling vault nor the bundle has it`);
  const r = readRhythmNote(text!);
  assert.ok(r.ok, name);
  return (r as { ok: true; value: { data: RhythmData } }).value.data;
};
const ROCK = noteData('rhythm_pattern_straight_rock');          // kick, snare, hihat — 4/4, 16 steps
const TABLA = noteData('rhythm_pattern_tha_dhi_gi_na_thom');     // conga_high, conga_low — 5/4, 20 steps
const HEMIOLA = noteData('rhythm_pattern_hemiola');              // kick, hihat — 3/4, 12 steps
const BELL = noteData('rhythm_pattern_bell_12_8');               // bell only
const load = (d: unknown, mode?: string) => ({ type: 'forge-rhythm-load', data: d, noteName: 'rhythm_pattern_test', ...(mode ? { mode } : {}) });
const types = (h: Harness, t: string) => h.posted.filter((m) => m && m.type === t);
const lastSave = (h: Harness) => types(h, 'forge-rhythm-save').at(-1)?.data as RhythmData | undefined;
const tick = () => new Promise((r) => setTimeout(r, 5));
const order = (d: { channels: object }) => Object.keys(d.channels);
const legend = (h: Harness) => [...h.doc.querySelectorAll('#ringLegend .ring-pick')].map((b: any) => b.getAttribute('data-ring'));
const pressed = (h: Harness) => [...h.doc.querySelectorAll('#ringLegend .ring-pick')].filter((b: any) => b.getAttribute('aria-pressed') === 'true').map((b: any) => b.getAttribute('data-ring'));
async function circle(d: unknown, mode?: string): Promise<Harness> {
  const h = await loadWidget(true);
  await h.send(load(d, mode));
  h.el('bViewCircle').click(); await tick();
  return h;
}
async function pick(h: Harness, ch: string) { h.doc.querySelector(`#ringLegend .ring-pick[data-ring="${ch}"]`).click(); await tick(); }
const press = async (h: Harness, id: string) => { h.el(id).click(); await tick(); };
/** Is the element on screen: no ancestor (or itself) carries `hidden`. */
const shown = (el: any): boolean => { for (let e = el; e && e.tagName !== 'BODY'; e = e.parentElement) if (e.hidden) return false; return true; };

// ---- the pure core -------------------------------------------------------------------------------------------------------------

test('moveRing: swaps the ring with its neighbour (-1 outward = earlier, +1 inward = later); at an end, or for a non-row, nothing; a copy', { skip }, () => {
  const { moveRing } = pureCore();
  const rows = ['kick', 'snare', 'hihat'];
  assert.deepEqual(moveRing(rows, 'snare', -1), ['snare', 'kick', 'hihat']);
  assert.deepEqual(moveRing(rows, 'snare', 1), ['kick', 'hihat', 'snare']);
  assert.deepEqual(moveRing(rows, 'kick', -1), rows, 'outermost cannot go further out');
  assert.deepEqual(moveRing(rows, 'hihat', 1), rows, 'innermost cannot go further in');
  assert.deepEqual(moveRing(rows, 'bell', 1), rows, 'not a row of the note');
  assert.deepEqual(moveRing(['kick'], 'kick', 1), ['kick']);
  assert.deepEqual(rows, ['kick', 'snare', 'hihat'], 'the input is left alone');
  assert.notEqual(moveRing(rows, 'kick', -1), rows, 'a copy even when nothing moves');
  assert.deepEqual(moveRing(moveRing(rows, 'snare', 1), 'snare', -1), rows, 'move in then out: the original order');
});

test('rotating ONE channel with rotatePattern(pattern, [ch], ...) leaves the others byte-identical (the whole-pattern rotate stays on rows)', { skip }, () => {
  const { rotatePattern } = pureCore();
  const p = JSON.parse(JSON.stringify(ROCK.channels));
  const r = rotatePattern(p, ['snare'], 16, 1);
  assert.deepEqual(r.kick, p.kick); assert.deepEqual(r.hihat, p.hihat);
  assert.deepEqual(r.snare, [p.snare[15], ...p.snare.slice(0, 15)]);
});

// ---- the buttons: labels, enabled state ------------------------------------------------------------------------------------------

// Drain 2026-10-20-0900: the two Rotate buttons are in the toolbar BOTH views share (the grid has a selected row now: click its name); Move ring out / in
// stay circle-only extras, after the five. All four are icons whose tooltip and aria-label NAME the selected instrument.
test('the Rotate buttons are in the shared toolbar (both views); Move ring out / in are circle-only extras; all four are icons that NAME the selected instrument', { skip }, async () => {
  const h = await circle(ROCK);
  for (const id of ['bRingRotLeft', 'bRingRotRight', 'bRingOut', 'bRingIn']) {
    const b = h.el(id);
    assert.ok(b, id);
    assert.ok(h.el('rhythmTools').contains(b), `${id} rides in the one toolbar row`);
    assert.ok(b.getAttribute('title') && b.getAttribute('aria-label'), id);
    assert.ok(b.textContent.trim().length <= 2, `${id} is an icon, not a word`);
    assert.ok(shown(b), `${id} is on screen in Circle`);
  }
  assert.match(h.el('bRingRotLeft').getAttribute('aria-label'), /Kick/, 'the default selection is the first ring');
  assert.match(h.el('bRingOut').getAttribute('title'), /Kick/);
  await pick(h, 'hihat');
  for (const id of ['bRingRotLeft', 'bRingRotRight', 'bRingOut', 'bRingIn']) {
    assert.match(h.el(id).getAttribute('aria-label'), /Hi-hat/, `${id} now names the Hi-hat ring`);
    assert.match(h.el(id).getAttribute('title'), /Hi-hat/);
  }
  h.el('bViewGrid').click(); await tick();
  assert.ok(shown(h.el('bRingRotLeft')) && shown(h.el('bRingRotRight')), 'Rotate is in Grid too (the grid selects a row by its name)');
  assert.equal(shown(h.el('bRingOut')) || shown(h.el('bRingIn')), false, 'Move ring out / in is circle-only: nothing to move in a grid');
});

test('Move is disabled where it cannot move: the outermost ring cannot go out, the innermost cannot go in, a single ring can do neither', { skip }, async () => {
  const h = await circle(ROCK);
  assert.equal(h.el('bRingOut').disabled, true, 'kick is outermost');
  assert.equal(h.el('bRingIn').disabled, false);
  await pick(h, 'snare');
  assert.equal(h.el('bRingOut').disabled, false); assert.equal(h.el('bRingIn').disabled, false);
  await pick(h, 'hihat');
  assert.equal(h.el('bRingOut').disabled, false); assert.equal(h.el('bRingIn').disabled, true, 'hihat is innermost');
  const one = await circle(BELL);
  assert.equal(one.el('bRingOut').disabled, true); assert.equal(one.el('bRingIn').disabled, true);
  assert.equal(one.el('bRingRotLeft').disabled, false, 'a lone ring can still turn');
  assert.equal(one.el('bRingRotRight').disabled, false);
});

test('a disabled Move does nothing when pressed — no save, no reorder', { skip }, async () => {
  const h = await circle(ROCK);
  await press(h, 'bRingOut');                       // kick is already outermost
  assert.equal(types(h, 'forge-rhythm-save').length, 0);
  assert.deepEqual(legend(h), ['kick', 'snare', 'hihat']);
  const one = await circle(BELL);
  await press(one, 'bRingIn');
  assert.equal(types(one, 'forge-rhythm-save').length, 0);
});

// ---- Rotate this ring ------------------------------------------------------------------------------------------------------------

test('Rotate this ring: only the SELECTED channel turns (right = one step later, wrapping); every other channel is byte-identical; one save', { skip }, async () => {
  const h = await circle(ROCK);
  await pick(h, 'snare');
  await press(h, 'bRingRotRight');
  const saved = lastSave(h)!;
  assert.equal(types(h, 'forge-rhythm-save').length, 1, 'one press, one save (autosave, no confirm bar)');
  const snare = ROCK.channels.snare as unknown[];
  assert.deepEqual(saved.channels.snare, [snare[15], ...snare.slice(0, 15)], 'a hit moved one step later; the last wrapped to the first');
  assert.deepEqual(saved.channels.kick, ROCK.channels.kick);
  assert.deepEqual(saved.channels.hihat, ROCK.channels.hihat);
  assert.deepEqual(order(saved), order(ROCK), 'rotating never reorders');
  assert.equal(saved.time_signature, ROCK.time_signature); assert.equal(saved.tempo_bpm, ROCK.tempo_bpm); assert.equal(saved.steps, ROCK.steps);
  assert.equal(h.el('confirmBar').hidden, true, 'a ring edit is a normal edit, not a whole-pattern question');
});

test('Rotate this ring, a real 5/4 two-channel note: turning conga_low leaves conga_high byte-for-byte alone; left then right is the original', { skip }, async () => {
  const h = await circle(TABLA);
  await pick(h, 'conga_low');
  await press(h, 'bRingRotLeft');
  const left = lastSave(h)!;
  const low = TABLA.channels.conga_low as unknown[];
  assert.deepEqual(left.channels.conga_low, [...low.slice(1), low[0]]);
  assert.equal(JSON.stringify(left.channels.conga_high), JSON.stringify(TABLA.channels.conga_high), 'the other channel, byte-identical');
  await press(h, 'bRingRotRight');
  assert.equal(formatRhythmJson(lastSave(h)!), formatRhythmJson(TABLA), 'left then right: the original BYTES');
});

test('Rotate this ring keeps velocities (a 110 stays a 110) and a full lap of N presses is the original', { skip }, async () => {
  const hats = HEMIOLA.channels.hihat as unknown[];
  const firstHit = hats.findIndex((v) => v);
  assert.ok(firstHit >= 0, 'the real hemiola hi-hat has hits');
  const withVel: RhythmData = { ...HEMIOLA, channels: { ...HEMIOLA.channels, hihat: hats.map((v, i) => (i === firstHit ? 110 : v)) } };
  const h = await circle(withVel);
  await pick(h, 'hihat');
  await press(h, 'bRingRotRight');
  const once = lastSave(h)!.channels.hihat as unknown[];
  assert.ok(once.includes(110), 'the accented hit survived the turn');
  assert.equal(once.filter((v) => v === 110).length, 1, 'exactly one, not copied or flattened');
  for (let i = 0; i < withVel.steps - 1; i++) await press(h, 'bRingRotRight');
  assert.equal(formatRhythmJson(lastSave(h)!), formatRhythmJson(withVel), '12 steps of a 12-step ring: a full lap');
});

test('the whole-pattern ‹ › still turns EVERY ring (the per-ring buttons did not replace it)', { skip }, async () => {
  const h = await circle(ROCK);
  await press(h, 'bRotRight');
  const saved = lastSave(h)!;
  for (const ch of order(ROCK)) {
    const row = ROCK.channels[ch] as unknown[];
    assert.deepEqual(saved.channels[ch], [row[15], ...row.slice(0, 15)], ch);
  }
});

// ---- Move this ring --------------------------------------------------------------------------------------------------------------

test('Move inward / outward rewrites the channel ORDER in the saved data (ring order = key order), and nothing else', { skip }, async () => {
  const h = await circle(ROCK);
  await pick(h, 'snare');
  await press(h, 'bRingOut');
  const out = lastSave(h)!;
  assert.deepEqual(order(out), ['snare', 'kick', 'hihat']);
  for (const ch of order(ROCK)) assert.deepEqual(out.channels[ch], ROCK.channels[ch], `${ch}: the hits are untouched`);
  assert.equal(out.tempo_bpm, ROCK.tempo_bpm); assert.equal(out.time_signature, ROCK.time_signature);
  assert.equal(types(h, 'forge-rhythm-save').length, 1);
  assert.deepEqual(legend(h), ['snare', 'kick', 'hihat'], 'the legend follows the new order');
  assert.deepEqual(pressed(h), ['snare'], 'the moved ring STAYS selected');
  await press(h, 'bRingIn'); await press(h, 'bRingIn');
  assert.deepEqual(order(lastSave(h)!), ['kick', 'hihat', 'snare']);
});

test('Move with the DEFAULT selection (no ring was ever clicked): the moved ring stays the selected one', { skip }, async () => {
  const h = await circle(ROCK);
  assert.deepEqual(pressed(h), ['kick'], 'the first ring is selected by default');
  await press(h, 'bRingIn');
  assert.deepEqual(legend(h), ['snare', 'kick', 'hihat']);
  assert.deepEqual(pressed(h), ['kick'], 'Kick moved in and is still the selected ring (the selection is a channel, not a position)');
  assert.match(h.el('bRingIn').getAttribute('aria-label'), /Kick/);
});

test('Move twice (in, then out) returns the original order — and with it the original BYTES of the note\'s JSON', { skip }, async () => {
  const h = await circle(ROCK);
  await pick(h, 'kick');
  await press(h, 'bRingIn'); await press(h, 'bRingOut');
  assert.deepEqual(order(lastSave(h)!), order(ROCK));
  assert.equal(formatRhythmJson(lastSave(h)!), formatRhythmJson(ROCK));
});

test('the git diff of a move is two swapped lines: only the order of the "channels" lines differs', { skip }, async () => {
  const h = await circle(ROCK);
  await pick(h, 'snare');
  await press(h, 'bRingOut');
  const a = formatRhythmJson(ROCK).split('\n'), b = formatRhythmJson(lastSave(h)!).split('\n');
  assert.equal(a.length, b.length);
  const changed = a.map((l, i) => (l === b[i] ? -1 : i)).filter((i) => i >= 0);
  assert.equal(changed.length, 2, 'two lines differ');
  assert.equal(a[changed[0]], b[changed[1]].replace(/,$/, '') + (a[changed[0]].endsWith(',') ? ',' : ''), 'and they are each other\'s content (one line per channel)');
});

test('a move keeps mute / solo with the channel it belongs to, and the grid rows follow the new order', { skip }, async () => {
  const h = await circle(ROCK);
  h.doc.querySelector('[data-mute-btn-kick] .mini-btn.mute').click(); await tick();
  await pick(h, 'snare');
  await press(h, 'bRingOut');
  h.el('bViewGrid').click(); await tick();
  const names = [...h.doc.querySelectorAll('#grid .channel-label .name')].map((e: any) => e.textContent.trim());
  assert.deepEqual(names, ['Snare', 'Kick', 'Hi-hat'], 'the grid rows follow the ring order');
  assert.equal(h.doc.querySelector('[data-mute-btn-kick] .mini-btn.mute').getAttribute('aria-pressed'), 'true', 'Kick is still muted');
  assert.equal(h.doc.querySelector('[data-mute-btn-snare] .mini-btn.mute').getAttribute('aria-pressed'), 'false');
});

test('in a PLAYGROUND (the embed) both kinds of ring edit stay local: an `edited` message, never a save', { skip }, async () => {
  const h = await circle(ROCK, 'playground');
  await pick(h, 'snare');
  await press(h, 'bRingRotRight');
  await press(h, 'bRingOut');
  assert.equal(types(h, 'forge-rhythm-save').length, 0);
  assert.equal(types(h, 'forge-rhythm-edited').length, 2);
  assert.deepEqual(legend(h), ['snare', 'kick', 'hihat'], 'and the playground did reorder, locally');
});

test('standalone (no note loaded) the ring buttons work on the three default rows and post nothing', { skip }, async () => {
  const h = await loadWidget(false);
  h.el('bViewCircle').click(); await tick();
  await pick(h, 'snare');
  await press(h, 'bRingOut');
  assert.deepEqual(legend(h).slice(0, 2), ['snare', 'kick']);
  assert.equal(h.posted.length, 0);
});

// Pins the MECHANISM (Rotate is a generated TRANSFORM_TOOLS button -> runTransform -> applyTransform with [selected] -> commitChange; Move is wired by hand
// through moveRing); if the paths move this SHOULD go red — reassess, don't just rewrite.
test('mechanism pin: Rotate goes through runTransform (the one data path) and turns only the selected channel; Move reorders via moveRing', { skip }, () => {
  assert.match(widgetScript, /function runTransform\(id\) \{[\s\S]*?applyTransform\(id, patterns\[bank\], rows, steps, selectedRow\(\)\)[\s\S]*?commitChange\(\);/);
  assert.match(widgetScript, /return rotatePattern\(pattern, \[selected\], steps, id === "rotateCw" \? 1 : -1\);/);
  assert.match(widgetScript, /function moveSelectedRing\(dir\) \{[\s\S]*?moveRing\(rows, ch, dir\)[\s\S]*?commitChange\(\);/);
  assert.match(widgetScript, /\$\("bRingOut"\)\.addEventListener\("click", function \(\) \{ moveSelectedRing\(-1\); \}\)/);
  assert.match(widgetScript, /\$\("bRingIn"\)\.addEventListener\("click", function \(\) \{ moveSelectedRing\(1\); \}\)/);
  assert.doesNotMatch(widgetScript, /function rotateRing\(/, 'no second Rotate path beside runTransform');
});
