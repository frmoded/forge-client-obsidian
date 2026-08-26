// Drain 2026-08-26-2300 — chapter 2's Description must name its literal.
//
// WHY THIS TEST EXISTS. Drain 2000 measured six wordings of `greeting`'s
// Description through live /generate: 6/6 belt-clean, 6/6 produced a
// greeting, 0/6 reproduced `Hello, Ada`. The shipped Description
// regenerated into a program that calls a random-name generator twice.
// Chapter 2's whole lesson is `Let name = "Ada"`, so a learner who
// presses the hammer loses the chapter. Gate I option B, adopted by the
// driver, says a note whose lesson IS a specific literal must name that
// literal in its Description.
//
// WHAT THIS TEST CAN AND CANNOT DO. The real proof is a live /generate
// re-derivation, which is not a unit test: it needs the network, a
// secret, and a model whose output is not byte-stable. So this pins the
// PRECONDITION that makes the re-derivation possible — the literals are
// present in the Description the model is handed — and the drain's
// FEEDBACK carries the measured re-derivation itself.
//
// PROOF THAT IT CAN FAIL: it was written before the fix and failed
// against the then-current bundle, whose Description read
// "Chapter 2 — Variables. Names two values and joins them into a
// greeting." — no "Ada", no "Hello, ".
//
// SCOPED DELIBERATELY TO ONE NOTE. Option B was adopted for notes where
// a specific literal is the lesson, NOT as a house style. Do not
// generalise this to the other chapter 1-3 notes; drain 2000 §3 and the
// 2300 prompt both say so.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractDescription, extractRecipeSection } from './v2-note-core.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOTE = path.resolve(
  __dirname, '..', 'assets', 'vaults', 'forge-tutorial',
  '02-variables', 'greeting.md',
);

test('greeting: the Description names the literals its Recipe depends on', () => {
  const t = fs.readFileSync(NOTE, 'utf8');
  const description = extractDescription(t);
  const recipe = extractRecipeSection(t) ?? '';

  // Derive the expectation FROM THE RECIPE rather than hard-coding it,
  // so renaming the greeting in the Recipe cannot leave this test
  // asserting a literal the note no longer uses.
  const literals = [...recipe.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(
    literals.length >= 2,
    `expected the Recipe to carry literals to check; got ${JSON.stringify(literals)}`,
  );

  const missing = literals.filter((lit) => !description.includes(lit));
  assert.deepEqual(
    missing, [],
    `greeting's Description omits ${JSON.stringify(missing)}, which its Recipe `
    + 'depends on. A re-derivation from this Description cannot reproduce the '
    + 'Recipe, and chapter 2\'s lesson is that specific literal. See drain '
    + '2026-08-26-2300 (gate I option B).',
  );
});

test('greeting: the Description carries no navigation prose', () => {
  // Drain 2100 removed `**What's next:**` from every Description because
  // the Description is /generate's input. Rewriting the Description is
  // exactly when it could come back.
  const description = extractDescription(fs.readFileSync(NOTE, 'utf8'));
  assert.ok(
    !description.includes("What's next"),
    'navigation prose is back inside a source facet — see drain 2100',
  );
});
