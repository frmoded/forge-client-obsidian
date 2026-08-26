// Drain 2026-08-24-2360's guards — SUCCEEDED by drain 2026-08-26-1020.
//
// This file used to test `excludeSelf`, which kept a note out of its own
// callable inventory so a generated Recipe could not call itself. That
// module is retired and this file now guards what replaced it, because
// the PROPERTY 2360 protected still matters — only the mechanism changed.
//
// THE ARC, for whoever reads this next:
//
//   2360  Removed the target from its own inventory. Stopped the mirror
//         (the model called self as if it were a different perfect
//         function, because the summary said so).
//   1000  The cost arrived: with self gone, the nearest callable was a
//         SIBLING that called back. factorial → show_factorial →
//         factorial. Belted by the one-hop cycle check (v0.2.373).
//   1020  The driver: "fix the process, not the specific note." The
//         target is back IN its own inventory, LABELED as itself, and
//         the mirror is held out by SHAPE — a self-call is accepted iff
//         it has a base case AND a progressing argument.
//
// So: 2360's exclusion is gone on purpose. What must stay true is that
// a MIRROR is still refused, which is `recursion-shape-core`'s job, and
// that the label is applied at the ONE producer, which is drain 1000's
// one-object discipline and the reason the payload, the closure check
// and 2310's belt cannot disagree about whether self is callable.
//
// The basename-matching rule 2360 reasoned out is not lost either — it
// lives on in `one-hop-cycle-core.matchesTarget`, which cites it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { labelSelfInInventory } from './callable-inventory-core.ts';
import { selfReferenceLabel } from './recursion-shape-core.ts';

const MAIN = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

const ENTRIES = [
  { name: 'factorial', inputs: ['n'], summary: 'Multiply n by every number below it.', kind: 'note' as const },
  { name: 'greet', inputs: ['name'], summary: 'Say hello.', kind: 'note' as const },
];

// --- the successor property -----------------------------------------

test('the target IS in its own inventory now, and is labeled', () => {
  const out = labelSelfInInventory(ENTRIES, 'factorial', selfReferenceLabel);
  assert.equal(out.length, 2, 'the target must not be dropped — 2360 is reversed');
  const self = out.find((e) => e.name === 'factorial')!;
  assert.match(self.summary, /THIS NOTE/);
  assert.match(self.summary, /Multiply n by every number below it\./,
    'the original summary must survive — the model still needs to know what it does');
});

test('only the target is labeled', () => {
  // NON-VACUITY: a labeller that marked everything would tell the model
  // every callable is itself.
  const out = labelSelfInInventory(ENTRIES, 'factorial', selfReferenceLabel);
  const other = out.find((e) => e.name === 'greet')!;
  assert.equal(other.summary, 'Say hello.');
});

test('a qualified target id still finds its entry', () => {
  const entries = [
    { name: 'factorial', qualified: 'forge-tutorial/08-recursion/factorial',
      inputs: ['n'], summary: 'x', kind: 'note' as const },
  ];
  const out = labelSelfInInventory(
    entries, 'forge-tutorial/08-recursion/factorial', selfReferenceLabel);
  assert.match(out[0].summary, /THIS NOTE/);
});

test('an absent target id labels nothing', () => {
  // Mirrors excludeSelf's old stance: a missing id must not be read as
  // "matches everything".
  const out = labelSelfInInventory(ENTRIES, undefined, selfReferenceLabel);
  assert.deepEqual(out, ENTRIES);
});

// --- the wiring, pinned at the source -------------------------------

test('labeling happens at the ONE producer', () => {
  assert.equal(
    MAIN.split('\n').filter((l) => l.includes('labelSelfInInventory(')).length,
    1,
    'exactly one labeling site, at the one producer — not per-consumer '
    + '(drain 1000: payload, closure accept-set and 2310 belt see one list)',
  );
});

test('both generate call sites still pass the target id', () => {
  // Unchanged from 2360: a call site that forgot the argument would
  // silently restore the bug on its own path only, which is the hardest
  // kind to notice. Still true — the id now drives labeling and the
  // shape gate instead of exclusion.
  assert.equal(
    MAIN.split('\n').filter((l) => l.includes('buildGenerateCallables(snippetId)')).length,
    2,
  );
});

test('the retired module is gone, not left unwired', () => {
  assert.ok(
    !MAIN.includes("from './exclude-self-from-inventory-core.ts'"),
    'main.ts still imports the retired exclusion module',
  );
});

test('the mirror is still refused — by shape, not by absence', () => {
  // The load-bearing continuity check. 2360 existed to stop the mirror;
  // if this drain removed the exclusion WITHOUT the shape gate landing,
  // the original defect would be back and every other test here would
  // still pass.
  assert.ok(MAIN.includes('checkRecursionShape('), 'the shape gate is not wired');
});
