// Drain 2026-08-24-1000 — the callable inventory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildCallableInventory,
  callableNamesFrom,
  firstSentence,
  renderCallableInventory,
  renderCallableLine,
} from './callable-inventory-core.ts';
import { DESCRIPTION_PLACEHOLDER } from './description-placeholder-core.ts';

const NOTES = [
  { id: 'greet', type: 'action', inputs: ['name'], summary: 'Say hello to someone. Then wave.' },
  { id: 'chapters/countdown', type: 'action', inputs: ['n'], summary: 'Count down from n.' },
  { id: 'colors', type: 'data', inputs: [], summary: 'A list of colors.' },
];
const CHIPS = [
  { name: 'random_float', inputs: [], description: 'Return a random number between 0 and 1.\n\nMore prose.' },
];

test('inventory lists action notes with signature and one-line summary', () => {
  const inv = buildCallableInventory(NOTES, CHIPS);
  const greet = inv.find((e) => e.name === 'greet');
  assert.deepEqual(greet?.inputs, ['name']);
  assert.equal(greet?.summary, 'Say hello to someone.');
  assert.equal(greet?.kind, 'note');
});

test('data notes are not callable and are excluded', () => {
  const inv = buildCallableInventory(NOTES, CHIPS);
  assert.equal(inv.find((e) => e.name === 'colors'), undefined);
});

test('a subdirectory note carries both spellings', () => {
  const inv = buildCallableInventory(NOTES, CHIPS);
  const cd = inv.find((e) => e.name === 'countdown');
  assert.equal(cd?.qualified, 'chapters/countdown');
  const names = callableNamesFrom(inv);
  assert.ok(names.has('countdown'));
  assert.ok(names.has('chapters/countdown'));
});

test('a vault note shadows a same-named engine chip', () => {
  const inv = buildCallableInventory(
    [{ id: 'random_float', type: 'action', inputs: [], summary: 'Mine.' }],
    CHIPS,
  );
  const hits = inv.filter((e) => e.name === 'random_float');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, 'note', 'the vault note must win, matching A4');
});

test('engine chips are listed too', () => {
  const inv = buildCallableInventory(NOTES, CHIPS);
  const chip = inv.find((e) => e.name === 'random_float');
  assert.equal(chip?.kind, 'chip');
  assert.equal(chip?.summary, 'Return a random number between 0 and 1.');
});

test('notes with no declared inputs still appear', () => {
  // §1d — a legacy note whose signature is empty is still callable.
  const inv = buildCallableInventory([{ id: 'plain', type: 'action' }]);
  assert.equal(inv.length, 1);
  assert.deepEqual(inv[0].inputs, []);
  assert.equal(renderCallableLine(inv[0]), '[[plain]]');
});

test('firstSentence cuts at the first terminator and caps length', () => {
  assert.equal(firstSentence('One. Two. Three.'), 'One.');
  assert.equal(firstSentence('No terminator here'), 'No terminator here');
  assert.equal(firstSentence(undefined), '');
  const long = firstSentence('x'.repeat(400));
  assert.ok(long.length <= 120, String(long.length));
  assert.ok(long.endsWith('…'));
});

test('the untouched Description placeholder never becomes a summary', () => {
  // Drain 2100's recognition, honoured here: the fresh-note hint is
  // instructions TO the author. Shipping it as a note's summary would
  // tell the model that "Describe what this note should do" is what
  // the note does.
  const inv = buildCallableInventory([
    { id: 'fresh', type: 'action', summary: '' },
  ]);
  assert.equal(inv[0].summary, '');
  assert.ok(!renderCallableInventory(inv).includes(DESCRIPTION_PLACEHOLDER));
});

// ---------------------------------------------------------------------
// §8 — ONE FACT, ONE DEFINITION. These are the tests the drain is for.
// ---------------------------------------------------------------------

test('the closure set is derived from the inventory, not recomputed', () => {
  // The contract stated as an assertion: every name the model is shown
  // is a name the closure check accepts, and nothing else is.
  const inv = buildCallableInventory(NOTES, CHIPS);
  const names = callableNamesFrom(inv);
  for (const entry of inv) {
    assert.ok(names.has(entry.name), `shown but not accepted: ${entry.name}`);
  }
  const shown = new Set(inv.flatMap((e) => [e.name, e.qualified].filter(Boolean) as string[]));
  assert.deepEqual([...names].sort(), [...shown].sort());
});

test('a name absent from the inventory is absent from the closure set', () => {
  // NON-VACUITY / PROVEN ABLE TO FAIL. If callableNamesFrom ever grew a
  // second source — a registry read, a hardcoded allowance — this goes
  // red, which is precisely the divergence §8 forbids.
  const inv = buildCallableInventory(NOTES, CHIPS);
  const names = callableNamesFrom(inv);
  assert.ok(!names.has('never_declared_anywhere'));
  assert.ok(!names.has('colors'), 'a data note must not be callable');
});

test('callableNamesFrom reads ONLY its argument', () => {
  // The structural half of the same guarantee: an empty inventory
  // yields an empty set. A function that consulted anything else could
  // not satisfy this.
  assert.equal(callableNamesFrom([]).size, 0);
});

test('the closure check has no second source in main.ts', () => {
  // §8 enforcement across the wiring, not just this module. The old
  // helper computed the set independently of the payload; if it comes
  // back, the two lists can disagree again and a closure failure stops
  // meaning what this drain makes it mean.
  const main = fs.readFileSync(path.resolve(process.cwd(), 'src/main.ts'), 'utf8');
  assert.ok(
    !main.includes('_collectKnownSnippetIds'),
    'the independent closure-set builder is back — see drain 2026-08-24-1000 §8',
  );
  assert.ok(
    main.includes('callableNamesFrom('),
    'the closure check must derive its set from the inventory',
  );
});

test('one line per callable, and the block is compact', () => {
  // §1c — size discipline. One line each, and a realistically-sized
  // vault stays well under the ~2K-token ceiling the drain names.
  const many = Array.from({ length: 60 }, (_, i) => ({
    id: `note_${i}`,
    type: 'action',
    inputs: ['a', 'b'],
    summary: 'Does a thing with a and b.',
  }));
  const block = renderCallableInventory(buildCallableInventory(many));
  assert.equal(block.split('\n').length, 60);
  // ~4 chars/token is the usual rough conversion; 60 notes must not
  // approach the cap.
  assert.ok(block.length / 4 < 2000, `~${Math.round(block.length / 4)} tokens`);
});

test('the payload omits callables when the chip catalog is not loaded', () => {
  // The guard that keeps "authoritative" safe. The service skips its
  // own engine-chip augmentation whenever the field is present, so a
  // list built before the catalog loaded would strip the model of
  // vocabulary it has always had. Omitting restores the pre-drain path
  // exactly — and the closure check skips in the same breath.
  const main = fs.readFileSync(path.resolve(process.cwd(), 'src/main.ts'), 'utf8');
  // Drain 2026-08-24-2360 — anchor widened from the exact zero-arg
  // signature to the name alone. The guard below is unchanged; what
  // moved is the signature, which grew a `targetSnippetId` parameter.
  // A test that breaks when its subject gains an argument is testing
  // the punctuation, not the guard.
  const fn = main.split('private async buildGenerateCallables(')[1] ?? '';
  assert.match(fn.slice(0, 1200), /if \(!this\._libraryCatalogLoaded\) return null;/);
});

test('a null inventory disables the closure check rather than failing open on an empty set', () => {
  // An empty Set would reject EVERY wikilink — the loudest possible
  // wrong answer. The wiring must treat "no inventory" as "cannot
  // check", matching how it already treats an unloaded catalog.
  const main = fs.readFileSync(path.resolve(process.cwd(), 'src/main.ts'), 'utf8');
  assert.ok(main.includes('this._libraryCatalogLoaded && shownCallables !== null'));
});
