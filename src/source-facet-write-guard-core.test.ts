// Drain 2026-08-26-1620 — the P1: a hand edit survived exactly one run.
//
// PIN TYPE: PROPERTY (a source facet is read-only to machinery),
// asserted at the guard and at its wiring.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  mayMachineWriteFacet,
  sourceFacetWriteRefusal,
} from './source-facet-write-guard-core.ts';

function src(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
}

// ---------- the P1 itself ----------------------------------------

test('THE P1: a python-canonical note refuses a machine Python write', () => {
  assert.equal(mayMachineWriteFacet('python', 'python'), false);
});

test('the hand edit survives N runs, not one', () => {
  // The bug was that run ONE honoured the edit and then overwrote it.
  // The guard's answer must be stable across repeated asking — a guard
  // that flipped after the first call would reproduce the bug exactly.
  for (let run = 1; run <= 5; run++) {
    assert.equal(
      mayMachineWriteFacet('python', 'python'), false,
      `run ${run} would have overwritten the hand edit`,
    );
  }
});

// ---------- non-vacuity: the 2530 refresh still works -------------

test('a recipe-canonical note STILL refreshes its derived Python', () => {
  // §2's non-vacuity. Drain 2530's refresh is correct here — Python is
  // derived, and keeping it consistent with what ran is the point. A
  // guard that refused this would break the D → R → P chain.
  assert.equal(mayMachineWriteFacet('python', 'recipe'), true);
});

test('a description-canonical note still refreshes Python', () => {
  assert.equal(mayMachineWriteFacet('python', 'description'), true);
});

test('a note with no stored source facet still refreshes', () => {
  // Pre-drain-1200 state. Refusing here would freeze those notes'
  // derived facets forever, and without a stored source there is no
  // hand-edit claim to protect.
  assert.equal(mayMachineWriteFacet('python', null), true);
  assert.equal(mayMachineWriteFacet('python', undefined), true);
  assert.equal(mayMachineWriteFacet('python', ''), true);
});

// ---------- §3: the property, generally ---------------------------

test('§3: the guard protects EVERY source facet, not just python', () => {
  for (const facet of ['description', 'recipe', 'python'] as const) {
    assert.equal(
      mayMachineWriteFacet(facet, facet), false,
      `${facet} is unprotected when it is the source`,
    );
  }
});

test('§3 non-vacuity: a non-source facet is always writable', () => {
  const facets = ['description', 'recipe', 'python'] as const;
  for (const facet of facets) {
    for (const source of facets) {
      if (facet === source) continue;
      assert.equal(
        mayMachineWriteFacet(facet, source), true,
        `${facet} wrongly refused on a ${source}-canonical note`,
      );
    }
  }
});

test('the refusal names the note and the facet', () => {
  const msg = sourceFacetWriteRefusal('python', 'chapters/hello.md');
  assert.match(msg, /chapters\/hello\.md/);
  assert.match(msg, /# Python/);
  assert.match(msg, /source facet/);
  assert.ok(!/undefined/.test(msg), msg);
});

// ---------- wiring ------------------------------------------------

test('the guard is wired into the Python write site', () => {
  const main = src('src/main.ts');
  assert.match(main, /mayMachineWriteFacet\(/, 'the guard is not wired');
  const body = main.slice(
    main.indexOf('private async writeSourcePythonBack'),
    main.indexOf('private async writeSourcePythonBack') + 4000);
  assert.match(
    body, /mayMachineWriteFacet\(\s*'python'/,
    'writeSourcePythonBack must ask before writing',
  );
});

test('the guard sits at the WRITER, not at each caller', () => {
  // §3 asked for one guard. A per-caller check is the shape that lets
  // the next caller forget — which is how 2530's refresh reached a
  // source facet in the first place.
  const main = src('src/main.ts');
  assert.equal(
    [...main.matchAll(/mayMachineWriteFacet\(/g)].length, 1,
    'more than one guard site — the property should be asserted once, '
    + 'at the write, so no caller can forget it',
  );
});
