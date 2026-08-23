// Drain 2026-08-24-2360 — a note must not appear in its own callable
// inventory.
//
// CCQA's finding (2026-08-24-1220 v0366 retest): a brand-new note
// `ccqa_random_r2` with the Description "Print a random number between
// 0 and 1 multpiied by an input var scale" generated
// `Let rand = Call ccqa_random_r2 with scale=1.0.` — calling ITSELF —
// and the run hit `maximum recursion depth exceeded`.
//
// MECHANISM, confirmed by probe before this file was written, over a
// real registry on CCQA's vault shape:
//
//   callables array the model would be shown, generating FOR ccqa_random_r2:
//     [[ccqa_random_r2]] with scale
//         Print a random number between 0 and 1 multpiied by an input var scale  <-- THE TARGET ITSELF
//     [[greet]] with (no inputs)
//         Greet somebody by name.
//   TARGET PRESENT IN ITS OWN INVENTORY: True
//   SUMMARY == the Description being transpiled: True
//
// So the model is handed a callable whose one-line description is,
// word for word, the request it was just asked to implement. It did
// not hallucinate a chip — it found a perfect match that happens to be
// a mirror. That makes this STRUCTURAL: every generation is exposed,
// and "random"-flavoured phrasing is the trigger's costume, not the
// mechanism.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { excludeSelf } from './exclude-self-from-inventory-core.ts';
import { buildCallableInventory, callableNamesFrom } from './callable-inventory-core.ts';

const NOTES = [
  { id: 'ccqa_random_r2', type: 'action', inputs: ['scale'], summary: 'Print a random number…' },
  { id: 'greet', type: 'action', inputs: [], summary: 'Greet somebody by name.' },
  { id: 'authoring/random_note', type: 'action', inputs: ['scale'], summary: 'A random number.' },
];

test("CCQA's exact repro: the target is gone from its own inventory", () => {
  const out = excludeSelf(NOTES, 'ccqa_random_r2');
  assert.deepEqual(out.map((n) => n.id), ['greet', 'authoring/random_note']);
});

test('every other note survives — the inventory is not emptied', () => {
  // NON-VACUITY, and the one that matters most: an exclusion that took
  // out too much would silently shrink the model's vocabulary on every
  // generation, and the symptom would be `# missing chip:` lines
  // rather than a crash.
  assert.equal(excludeSelf(NOTES, 'greet').length, NOTES.length - 1);
  assert.equal(excludeSelf(NOTES, 'nothing_named_this').length, NOTES.length);
});

test('a bare target id still excludes its nested-path entry', () => {
  // The miss mode drain 2330 documented: `snippetIdFromPath` falls
  // back to the basename for a note in a non-library subdirectory, so
  // the target id can be `random_note` while the registry calls it
  // `authoring/random_note`. Exact-id matching alone would let the
  // note back into its own inventory for exactly the shape the driver
  // has been running all week.
  const out = excludeSelf(NOTES, 'random_note');
  assert.deepEqual(out.map((n) => n.id), ['ccqa_random_r2', 'greet']);
});

test('a qualified target id still excludes a bare entry', () => {
  // The mirror image, for a registry that indexed the note bare.
  const notes = [{ id: 'random_note', type: 'action', inputs: [], summary: 'x' }];
  assert.deepEqual(excludeSelf(notes, 'authoring/random_note'), []);
});

test('an empty or absent target excludes nothing', () => {
  // A missing id must never be read as "matches everything". That
  // would hand /generate an empty inventory and the service would
  // treat it as authoritative (drain 1000), stripping the engine
  // chips too.
  assert.equal(excludeSelf(NOTES, '').length, NOTES.length);
  assert.equal(excludeSelf(NOTES, undefined).length, NOTES.length);
});

test('the name is gone from the closure-check set as well', () => {
  // §1's one-object discipline. The inventory feeds BOTH the prompt
  // and `callableNamesFrom`, so excluding at the build point means the
  // closure check stops accepting the self-call in the same motion —
  // which is what turns a silent recursion into a rejection.
  const names = callableNamesFrom(
    buildCallableInventory(excludeSelf(NOTES, 'ccqa_random_r2')),
  );
  assert.equal(names.has('ccqa_random_r2'), false);
  assert.equal(names.has('greet'), true);
});

// --- the wiring, pinned at the source -------------------------------

const MAIN = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

test('the single build point applies the exclusion', () => {
  assert.equal(
    MAIN.split('\n').filter((l) => l.includes('excludeSelf(')).length,
    1,
    'exactly one exclusion, at the one producer — not per-consumer',
  );
});

test('both generate call sites pass the target id', () => {
  // A call site that forgot the argument would silently restore the
  // bug on its own path only, which is the hardest kind to notice.
  assert.equal(
    MAIN.split('\n').filter((l) => l.includes('buildGenerateCallables(snippetId)')).length,
    2,
  );
  assert.equal(
    MAIN.split('\n').filter((l) => /buildGenerateCallables\(\s*\)/.test(l)).length,
    0,
  );
});
