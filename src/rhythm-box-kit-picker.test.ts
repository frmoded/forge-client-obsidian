// 2026-11-05-1181 (score_first M10c, design 4.10 slice 4) - the Beat Box widget picks a KIT when adding an instrument. The REAL widget page in happy-dom, the pure functions from its own pure-core block (the code the page runs).
//   * a load WITHOUT `kits` (every vault but a score-first one, an older plugin): no kit dropdown, "Add instrument" offers every channel not shown, exactly as before (the P3 control);
//   * a load WITH `kits`: a kit dropdown (the host's order, the first kit selected), and "Add instrument" offers THAT kit's channels not shown yet;
//   * picking a channel adds the row; the bar note keeps the same JSON (channels by name) and the kit is NOT in it (a bar has channels, a kit is how an arrangement plays them).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadWidget, skip, widgetScript, type Harness } from './test-support/rhythm-widget-harness.ts';
import type { RhythmData } from './rhythm-edit-core.ts';

function pureCore(): any {
  const mod: { exports: any } = { exports: {} };
  new Function('module', widgetScript)(mod);
  return mod.exports;
}
const row = () => new Array(16).fill(false);
const bar = (...channels: string[]): RhythmData => ({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: Object.fromEntries(channels.map((c) => [c, row()])) } as unknown as RhythmData);
const ROCK_BAR = bar('kick', 'snare', 'hihat');
const KITS = [{ name: 'rock', channels: ['kick', 'snare', 'hihat'] }, { name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] }];
const tick = () => new Promise((r) => setTimeout(r, 5));
const load = (d: unknown, extra: Record<string, unknown> = {}) => ({ type: 'forge-rhythm-load', data: d, noteName: 'bar_001', ...extra });
async function loaded(d: unknown, extra: Record<string, unknown> = {}): Promise<Harness> {
  const h = await loadWidget(true);
  await h.send(load(d, extra));
  return h;
}
const shown = (el: any): boolean => { for (let e = el; e && e.tagName !== 'BODY'; e = e.parentElement) if (e.hidden) return false; return true; };
const values = (h: Harness, id: string): string[] => [...h.el(id).options].map((o: any) => o.value);
const pick = async (h: Harness, id: string, value: string) => { const s = h.el(id); s.value = value; s.dispatchEvent(new h.win.Event('change')); await tick(); };
const saves = (h: Harness) => h.posted.filter((m) => m && m.type === 'forge-rhythm-save');

// ---- the pure functions ---------------------------------------------------------------------------------------------------------------------------------------

test('cleanKits: only well-formed kits survive, each with its KNOWN channels in the engine order, once; an unusable list is no kits', { skip }, () => {
  const { cleanKits } = pureCore();
  assert.deepEqual(cleanKits(KITS), KITS);
  assert.deepEqual(cleanKits([{ name: 'latin', channels: ['conga_low', 'bell', 'bell', 'cowbell', 'claves'] }]), [{ name: 'latin', channels: ['bell', 'claves', 'conga_low'] }], 'engine order, no repeats, unknown channels dropped');
  assert.deepEqual(cleanKits([{ name: 'rock', channels: ['kick'] }, { name: 'rock', channels: ['snare'] }]), [{ name: 'rock', channels: ['kick'] }], 'a name once (the first)');
  for (const bad of [undefined, null, 'rock', 7, {}, [], [null], [{}], [{ name: '', channels: ['kick'] }], [{ name: 3, channels: ['kick'] }], [{ name: 'x', channels: 'kick' }], [{ name: 'x', channels: [] }], [{ name: 'x', channels: ['cowbell'] }]]) {
    assert.deepEqual(cleanKits(bad), [], `${JSON.stringify(bad)} offers no kit`);
  }
  assert.deepEqual(cleanKits([{ name: 'x', channels: ['cowbell'] }, ...KITS]), KITS, 'one unusable kit does not hide the others');
});

test('channelsToOffer (the kit-to-channels function): with a kit, ITS channels not shown yet; with none, every channel not shown - the engine order either way', { skip }, () => {
  const { channelsToOffer, CHANNELS } = pureCore();
  assert.deepEqual(channelsToOffer(KITS[1], ['kick', 'snare', 'hihat']), ['bell', 'claves', 'conga_high', 'conga_low']);
  assert.deepEqual(channelsToOffer(KITS[1], ['kick', 'bell', 'conga_low']), ['claves', 'conga_high']);
  assert.deepEqual(channelsToOffer(KITS[0], ['kick', 'snare', 'hihat']), [], 'a kit whose channels are all shown offers nothing');
  assert.deepEqual(channelsToOffer(KITS[0], ['snare']), ['kick', 'hihat']);
  assert.deepEqual(channelsToOffer(null, ['kick', 'snare', 'hihat']), ['bell', 'claves', 'conga_high', 'conga_low'], 'no kit = as before');
  assert.deepEqual(channelsToOffer(null, []), CHANNELS);
  assert.deepEqual(channelsToOffer(undefined, ['bell']), CHANNELS.filter((c: string) => c !== 'bell'));
});

// ---- the page --------------------------------------------------------------------------------------------------------------------------------------------------

test('P3 control: a load with no `kits` has no kit dropdown, and "Add instrument" offers every channel not shown, as it always did', { skip }, async () => {
  const h = await loaded(ROCK_BAR);
  assert.ok(h.el('kitPick'), 'the (hidden) control exists in the page');
  assert.equal(shown(h.el('kitPick')), false);
  assert.deepEqual(values(h, 'addInstrument'), ['', 'bell', 'claves', 'conga_high', 'conga_low']);
  assert.equal(h.el('addInstrument').getAttribute('title'), 'Add a row for another instrument (bell, claves, congas)', 'the tooltip is the one it always had');
  for (const kits of [undefined, [], [{ name: 'x', channels: ['cowbell'] }], 'rock']) {
    const g = await loaded(ROCK_BAR, kits === undefined ? {} : { kits });
    assert.equal(shown(g.el('kitPick')), false, `kits ${JSON.stringify(kits)}: no dropdown`);
    assert.deepEqual(values(g, 'addInstrument'), ['', 'bell', 'claves', 'conga_high', 'conga_low']);
  }
});

test('a load with `kits`: the dropdown lists the kits in the host\'s order with the first selected; a rock bar has nothing left to add from rock, so "Add instrument" is hidden until another kit is picked', { skip }, async () => {
  const h = await loaded(ROCK_BAR, { kits: KITS });
  assert.equal(shown(h.el('kitPick')), true);
  assert.deepEqual(values(h, 'kitPick'), ['rock', 'latin']);
  assert.equal(h.el('kitPick').value, 'rock');
  assert.equal(shown(h.el('addInstrument')), false, 'the rock kit\'s three channels are all rows already');
  await pick(h, 'kitPick', 'latin');
  assert.equal(shown(h.el('addInstrument')), true);
  assert.deepEqual(values(h, 'addInstrument'), ['', 'bell', 'claves', 'conga_high', 'conga_low'], 'latin shows its four percussion channels');
  assert.equal(h.el('addInstrument').getAttribute('title'), 'Add a row for another instrument of the latin kit', 'the tooltip names the kit');
  await pick(h, 'kitPick', 'rock');
  assert.equal(shown(h.el('addInstrument')), false);
  assert.equal(saves(h).length, 0, 'choosing a kit is not a data change: nothing is saved');
});

test('picking a channel of the latin kit adds that row with the channel name, saves ONE note with it, and the kit is nowhere in the saved JSON', { skip }, async () => {
  const h = await loaded(ROCK_BAR, { kits: KITS });
  await pick(h, 'kitPick', 'latin');
  await pick(h, 'addInstrument', 'conga_high');
  assert.equal(saves(h).length, 1);
  const data = saves(h)[0].data;
  assert.deepEqual(Object.keys(data.channels), ['kick', 'snare', 'hihat', 'conga_high']);
  assert.deepEqual(data.channels.conga_high, row());
  assert.ok(h.doc.querySelector('.channel-row [data-channel="conga_high"]'), 'the row is on screen');
  assert.doesNotMatch(JSON.stringify(data), /latin|rock|kit/i, 'a bar has channels; the kit is not stored in it');
  assert.deepEqual(Object.keys(data).sort(), Object.keys(loadedPlainSave(await loaded(ROCK_BAR))).sort(), 'the same keys a picker-less widget writes');
  assert.deepEqual(values(h, 'addInstrument'), ['', 'bell', 'claves', 'conga_low'], 'and the menu offers what the kit still has');
  assert.equal(h.el('kitPick').value, 'latin', 'the kit stays picked for the next one');
});

test('the saved note is byte-for-byte what a widget with no kit picker saves for the same click (the kit is only a way to choose the channel)', { skip }, async () => {
  const a = await loaded(ROCK_BAR, { kits: KITS });
  await pick(a, 'kitPick', 'latin'); await pick(a, 'addInstrument', 'bell');
  const b = await loaded(ROCK_BAR);
  await pick(b, 'addInstrument', 'bell');
  assert.deepEqual(saves(a).at(-1).data, saves(b).at(-1).data);
});

test('all four latin channels can be added one after another; after the last, "Add instrument" goes away (the kit has nothing left) and the kit dropdown stays', { skip }, async () => {
  const h = await loaded(ROCK_BAR, { kits: KITS });
  await pick(h, 'kitPick', 'latin');
  for (const ch of ['bell', 'claves', 'conga_high', 'conga_low']) await pick(h, 'addInstrument', ch);
  assert.deepEqual(Object.keys(saves(h).at(-1).data.channels), ['kick', 'snare', 'hihat', 'bell', 'claves', 'conga_high', 'conga_low']);
  assert.equal(shown(h.el('addInstrument')), false);
  assert.equal(shown(h.el('kitPick')), true);
});

test('a kit-less bar (a latin bar) offers rock\'s channels when rock is picked: the kit is a menu, not a filter on the bar', { skip }, async () => {
  const h = await loaded(bar('bell', 'claves'), { kits: KITS });
  assert.deepEqual(values(h, 'addInstrument'), ['', 'kick', 'snare', 'hihat'], 'rock first: its three channels, none of them a row yet');
  await pick(h, 'addInstrument', 'snare');
  assert.deepEqual(Object.keys(saves(h).at(-1).data.channels), ['bell', 'claves', 'snare']);
});

test('a reload keeps the kit the person picked while it is still offered, and falls back to the first kit when it is gone; a reload without kits takes the dropdown away', { skip }, async () => {
  const h = await loaded(ROCK_BAR, { kits: KITS });
  await pick(h, 'kitPick', 'latin');
  await h.send(load(ROCK_BAR, { kits: KITS }));
  assert.equal(h.el('kitPick').value, 'latin');
  await h.send(load(ROCK_BAR, { kits: [KITS[0]] }));
  assert.equal(h.el('kitPick').value, 'rock');
  await h.send(load(ROCK_BAR));
  assert.equal(shown(h.el('kitPick')), false);
  assert.deepEqual(values(h, 'addInstrument'), ['', 'bell', 'claves', 'conga_high', 'conga_low']);
});

test('the circle keeps its four-ring limit with a kit: "Add instrument" is disabled there with the reason, enabled in the grid', { skip }, async () => {
  const h = await loaded(bar('kick', 'snare', 'hihat', 'bell'), { kits: KITS });
  await pick(h, 'kitPick', 'latin');
  h.el('bViewCircle').click(); await tick();
  assert.equal(h.el('addInstrument').disabled, true);
  assert.match(h.el('addInstrument').getAttribute('title'), /up to 4 instruments/i);
  h.el('bViewGrid').click(); await tick();
  assert.equal(h.el('addInstrument').disabled, false);
});

test('a playground (the embed) with kits gets the same dropdown and still never saves', { skip }, async () => {
  const h = await loaded(ROCK_BAR, { kits: KITS, mode: 'playground' });
  await pick(h, 'kitPick', 'latin'); await pick(h, 'addInstrument', 'claves');
  assert.equal(saves(h).length, 0);
  assert.ok(h.doc.querySelector('.channel-row [data-channel="claves"]'));
});

function loadedPlainSave(h: Harness): Record<string, unknown> {
  h.el('addInstrument').value = 'bell'; h.el('addInstrument').dispatchEvent(new h.win.Event('change'));
  return saves(h).at(-1).data as Record<string, unknown>;
}
