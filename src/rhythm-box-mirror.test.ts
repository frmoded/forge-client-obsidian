// Drain 2026-10-18-1800 §4 — Mirror: reverse the rhythm in time within the bar (step i -> N-1-i), replacing the two rotate-by-a-beat buttons.
//
// Same single data path as every other edit (commitChange: a save in a note, local `edited` in a playground), every shown channel at once,
// velocities kept, and its own inverse. Real data from the shipped rhythm notes, not hand-built look-alikes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { loadWidget, skip, widgetHtml, widgetScript, type Harness } from './test-support/rhythm-widget-harness.ts';
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
const K = (hits: number[], n: number) => Array.from({ length: n }, (_, i) => hits.includes(i));
const hitsOf = (row: unknown[]) => row.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
const SON = noteData('rhythm_pattern_clave_son_3_2');
const BELL = noteData('rhythm_pattern_bell_12_8');
const TABLA = noteData('rhythm_pattern_tha_dhi_gi_na_thom');
const RUMBA: RhythmData = { ...SON, channels: { claves: K([0, 3, 7, 10, 12], 16) } };      // rhythm_pattern_clave_rumba_3_2's hits
const ROCK: RhythmData = {
  time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100,
  channels: { kick: K([0, 8], 16), snare: K([4, 12], 16), hihat: K([0, 2, 4, 6, 8, 10, 12, 14], 16) },
};
const load = (d: unknown, mode?: string) => ({ type: 'forge-rhythm-load', data: d, noteName: 'rhythm_pattern_test', ...(mode ? { mode } : {}) });
const types = (h: Harness, t: string) => h.posted.filter((m) => m && m.type === t);
const lastSave = (h: Harness) => types(h, 'forge-rhythm-save').at(-1)?.data;
async function editing(d: unknown, view?: 'circle'): Promise<Harness> {
  const h = await loadWidget(true);
  await h.send(load(d));
  if (view) { h.el('bViewCircle').click(); await new Promise((r) => setTimeout(r, 5)); }
  return h;
}
// Drain 2026-10-20-0900: ONE Mirror button, in the toolbar both views share (it used to be two: the circle's and one beside the grid's Add instrument).
const mirrorBtn = (_view: 'grid' | 'circle') => 'bMirror';
const reversed = (d: RhythmData): RhythmData => ({
  ...d, channels: Object.fromEntries(Object.entries(d.channels).map(([ch, row]) => [ch, [...(row as unknown[])].reverse()])),
});

// ---- the pure core -------------------------------------------------------------------------------------------------------------

test('mirrorPattern: every shown channel reversed in time (i -> N-1-i), velocities and rests kept, the input left alone', { skip }, () => {
  const w = pureCore();
  assert.equal(typeof w.mirrorPattern, 'function');
  const p = { kick: [true, false, 110, false, 64, false], bell: [false, true, false, false, false, true] };
  const before = JSON.parse(JSON.stringify(p));
  const m = w.mirrorPattern(p, ['kick', 'bell'], 6);
  assert.deepEqual(m.kick, [false, 64, false, 110, false, true]);
  assert.deepEqual(m.bell, [true, false, false, false, true, false]);
  assert.deepEqual(p, before, 'non-mutating');
  assert.notEqual(m.kick, p.kick, 'and shares no array with the input');
  assert.deepEqual(w.mirrorPattern(m, ['kick', 'bell'], 6), before, 'its own inverse');
});

test('mirrorPattern: channels that are not rows of the note are carried through untouched; a short row is padded with rests', { skip }, () => {
  const w = pureCore();
  const m = w.mirrorPattern({ kick: [true, false, false], snare: [true, true, false] }, ['kick'], 3);
  assert.deepEqual(m.kick, [false, false, true]);
  assert.deepEqual(m.snare, [true, true, false], 'snare is not a row: not touched');
  assert.deepEqual(w.mirrorPattern({ kick: [true] }, ['kick'], 4).kick, [false, false, false, true], 'a short row is read as rests past its end');
});

// ---- the buttons ---------------------------------------------------------------------------------------------------------------

for (const view of ['grid', 'circle'] as const) {
  test(`Mirror in ${view} view: son clave 3-2 (hits 0,3,6,10,12) becomes hits 3,5,9,12,15 — one save, no confirm bar, and twice is the original BYTES`, { skip }, async () => {
    const h = await editing(SON, view === 'circle' ? 'circle' : undefined);
    h.el(mirrorBtn(view)).click();
    assert.deepEqual(hitsOf(lastSave(h).channels.claves), [3, 5, 9, 12, 15]);
    assert.equal(types(h, 'forge-rhythm-save').length, 1, 'ONE save — the single data path');
    assert.equal(h.el('confirmBar').hidden, true, 'a mirror is a normal edit, not a whole-pattern question');
    h.el(mirrorBtn(view)).click();
    assert.equal(formatRhythmJson(lastSave(h)), formatRhythmJson(SON), 'two mirrors give back the original, byte for byte');
  });
}

test('Mirror works on real data of every shape: rumba clave, the 12/8 bell, the 5/4 (20-step) tabla phrase, an 8-step 4/4 note', { skip }, async () => {
  const eight: RhythmData = { time_signature: '4/4', steps: 8, group_size: 2, swing_pct: 0, tempo_bpm: 100, channels: { kick: K([0, 3, 6], 8) } };
  for (const [name, data] of [['rumba', RUMBA], ['bell 12/8', BELL], ['tha dhi 5/4', TABLA], ['8-step 4/4', eight]] as const) {
    for (const view of ['grid', 'circle'] as const) {
      const h = await editing(data, view === 'circle' ? 'circle' : undefined);
      h.el(mirrorBtn(view)).click();
      assert.deepEqual(lastSave(h).channels, reversed(data).channels, `${name} (${view}): every channel reversed`);
      assert.equal(lastSave(h).steps, data.steps);
      assert.equal(lastSave(h).time_signature, data.time_signature, 'nothing but the hits changed');
      h.el(mirrorBtn(view)).click();
      assert.equal(formatRhythmJson(lastSave(h)), formatRhythmJson(data), `${name} (${view}): twice is the original bytes`);
    }
  }
  assert.deepEqual(hitsOf(reversed(RUMBA).channels.claves as unknown[]), [3, 5, 8, 12, 15], 'the rumba, by hand');
  assert.deepEqual(hitsOf(reversed(BELL).channels.bell as unknown[]), [0, 2, 4, 6, 7, 9, 11].filter((i) => (reversed(BELL).channels.bell as boolean[])[i]), 'the bell, mirrored');
});

test('Mirror turns EVERY shown channel together and keeps a velocity with its hit', { skip }, async () => {
  const rock = JSON.parse(JSON.stringify(ROCK)) as RhythmData;
  (rock.channels.snare as unknown[])[4] = 110;
  const h = await editing(rock);
  h.el('bMirror').click();
  const saved = lastSave(h);
  assert.deepEqual(hitsOf(saved.channels.kick), [7, 15]);
  assert.deepEqual(hitsOf(saved.channels.snare), [3, 11]);
  assert.equal(saved.channels.snare[11], 110, 'the accent moved with its hit (step 4 -> 11)');
  assert.deepEqual(hitsOf(saved.channels.hihat), [1, 3, 5, 7, 9, 11, 13, 15]);
});

test('Mirror in a playground is local: `edited`, never a save', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send(load(SON, 'playground'));
  h.el('bMirror').click();
  assert.equal(types(h, 'forge-rhythm-save').length, 0);
  assert.equal(types(h, 'forge-rhythm-edited').length, 1);
});

test('the Mirror button is labelled and focusable, in the toolbar both views share; the two rotate-by-a-beat buttons are GONE; the one-step shifts stay', { skip }, async () => {
  const h = await editing(SON, 'circle');
  const el = h.el('bMirror');
  assert.equal(el.tagName, 'BUTTON');
  assert.equal(el.getAttribute('aria-label'), 'Mirror (reverse the rhythm in time)');
  assert.match(el.title, /Mirror/);
  assert.match(el.title, /reverse the rhythm in time/i);
  assert.ok(el.tabIndex >= 0 && !el.disabled);
  assert.ok(el.textContent.trim().length <= 3, 'bMirror: an icon, not a word');
  assert.ok(h.el('rhythmTools').contains(el), 'in the shared toolbar (so in Grid and in Circle)');
  assert.ok(h.el('bMirrorGrid') === null, 'the second, grid-only copy is gone');
  assert.ok(h.doc.getElementById('bBeatLeft') === null);
  assert.ok(h.doc.getElementById('bBeatRight') === null);
  assert.equal(/Right a beat|Left a beat|rotate.*by a beat/i.test(widgetHtml), false, 'no trace of the beat buttons in the widget');
  assert.ok(h.el('bRotLeft') && h.el('bRotRight'), 'the one-step shift is still there');
});

// Pins the MECHANISM (the generated Mirror button -> runTransform -> applyTransform('mirror') -> mirrorPattern, ending in commitChange); if the
// transform path moves this SHOULD go red — reassess, don't just rewrite.
test('Mirror is source-pinned to the one data path: the generated button calls runTransform, which uses mirrorPattern and ends in commitChange()', { skip }, () => {
  assert.match(widgetScript, /function runTransform\(id\)[\s\S]*?applyTransform\(id, patterns\[bank\], rows, steps, selectedRow\(\)\)[\s\S]*?commitChange\(\)/);
  assert.match(widgetScript, /if \(id === "mirror"\) return mirrorPattern\(pattern, rows, steps\);/);
  assert.match(widgetScript, /b\.addEventListener\("click", function \(\) \{ runTransform\(t\.id\); \}\)/);
  assert.equal((widgetScript.match(/mirrorPattern\(/g) ?? []).length, 2, 'defined once, called once (no second Mirror path)');
});
