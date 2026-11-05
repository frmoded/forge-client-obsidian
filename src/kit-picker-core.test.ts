// 2026-11-05-1181 (M10c) - the pure half of the Beat Box kit picker: which notes are kits, the order the dropdown lists them in, and the `kits` field of the load message. Real kit notes (made by kit-core.ts's own
// writer, the shape the playground vault ships), not look-alikes.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FIRST_KIT, kitChoices } from './kit-picker-core.ts';
import { KIT_PRESETS, newKitNote } from './kit-core.ts';
import { MSG_LOAD, buildLoadMessage, type RhythmData } from './rhythm-edit-core.ts';

const note = (name: string, channels: string[]) => ({ path: `kits/${name}.md`, text: newKitNote({ kind: 'kit', name, channels: channels as never }) });
const ROCK = note('rock', ['kick', 'snare', 'hihat']);
const LATIN = note('latin', ['conga_high', 'conga_low', 'claves', 'bell']);

test('kitChoices: the two starter kits, rock first, each with its channels in the engine order (latin = bell, claves, conga_high, conga_low)', () => {
  const kits = kitChoices([LATIN, ROCK]);
  assert.deepEqual(kits, [
    { name: 'rock', channels: ['kick', 'snare', 'hihat'] },
    { name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] },
  ]);
  assert.deepEqual(kits.map((k) => k.name), KIT_PRESETS.map((p) => p.name).sort((a, b) => (a === FIRST_KIT ? -1 : b === FIRST_KIT ? 1 : 0)));
});

test('kitChoices: a stable order whatever order the vault lists the notes in - rock, then the rest by name', () => {
  const funk = note('funk', ['kick', 'snare']); const afro = note('afro', ['bell']); const zed = note('zed', ['claves']);
  const expected = ['rock', 'afro', 'funk', 'latin', 'zed'];
  for (const order of [[ROCK, LATIN, funk, afro, zed], [zed, afro, funk, LATIN, ROCK], [funk, ROCK, zed, LATIN, afro]]) {
    assert.deepEqual(kitChoices(order).map((k) => k.name), expected);
  }
});

test('kitChoices: no kit notes = no kits (the widget then shows no dropdown and behaves as before); a vault without a rock kit starts on its first by name', () => {
  assert.deepEqual(kitChoices([]), []);
  assert.deepEqual(kitChoices([LATIN, note('afro', ['bell'])]).map((k) => k.name), ['afro', 'latin']);
});

test('kitChoices: what is not a kit is left out - README, a note outside kits/, a note with no valid json block - and one broken kit never hides the others', () => {
  const readme = { path: 'kits/README.md', text: '# Kits\n\nWhat a kit is.\n' };
  const elsewhere = { path: 'notes/rock.md', text: ROCK.text };
  const broken = { path: 'kits/broken.md', text: '---\ntype: data\n---\n\n```json\n{ not json\n```\n' };
  const unknownChannel = { path: 'kits/odd.md', text: ROCK.text.replace('"hihat"', '"cowbell"').replace(/'hihat'/g, "'cowbell'") };
  assert.deepEqual(kitChoices([readme, elsewhere, broken, unknownChannel, LATIN]).map((k) => k.name), ['latin']);
});

test('kitChoices: a kit is named by its FILE (kits/<name>.md), the way the arrangement dialog names it, and listed once', () => {
  const renamed = { path: 'kits/groove.md', text: note('other', ['kick']).text };       // the json says "other"; the note on disk is "groove"
  assert.deepEqual(kitChoices([renamed, renamed]).map((k) => k.name), ['groove']);
});

test('kitChoices: the same file listed twice with different text keeps the FIRST (a vault lists a path once; the order the vault gave is the tie-break, not the content)', () => {
  const first = { path: 'kits/rock.md', text: ROCK.text };
  const second = { path: 'kits/rock.md', text: note('rock', ['bell']).text };
  assert.deepEqual(kitChoices([first, second]), [{ name: 'rock', channels: ['kick', 'snare', 'hihat'] }]);
  assert.deepEqual(kitChoices([second, first]), [{ name: 'rock', channels: ['bell'] }]);
});

const DATA: RhythmData = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: new Array(16).fill(false) } } as unknown as RhythmData;
const KITS = kitChoices([ROCK, LATIN]);

test('the load message carries the kit list only when there is one - the older shapes (no kits, an empty list) are byte-identical', () => {
  const plain = buildLoadMessage(DATA, 'bar_001', 'edit', null, true, false, true);
  assert.equal('kits' in plain, false);
  assert.deepEqual(buildLoadMessage(DATA, 'bar_001', 'edit', null, true, false, true, []), plain, 'an empty list adds nothing');
  const withKits = buildLoadMessage(DATA, 'bar_001', 'edit', null, true, false, true, KITS) as Record<string, unknown>;
  assert.deepEqual(withKits.kits, KITS);
  assert.deepEqual({ ...withKits, kits: undefined }, { ...plain, kits: undefined }, 'and nothing else about the message changes');
  assert.equal(withKits.type, MSG_LOAD);
});

test('the message holds its own copy of each kit: a later change to the list the host keeps does not reach a message already built', () => {
  const mine = [{ name: 'rock', channels: ['kick'] }];
  const m = buildLoadMessage(DATA, 'bar_001', 'edit', null, false, false, false, mine) as { kits: Array<{ name: string; channels: string[] }> };
  mine[0].channels.push('snare');
  assert.deepEqual(m.kits, [{ name: 'rock', channels: ['kick'] }]);
});

test('the kit list rides every mode of the load message the same way (it is JSON: a round trip keeps it)', () => {
  const m = buildLoadMessage(DATA, 'bar_001', 'edit', null, false, false, false, KITS);
  assert.deepEqual(JSON.parse(JSON.stringify(m)).kits, KITS);
});
