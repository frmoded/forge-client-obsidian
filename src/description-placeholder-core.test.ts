// Drain 2026-08-23-2100 — the fresh-note Description placeholder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  DESCRIPTION_PLACEHOLDER,
  isDescriptionPlaceholder,
} from './description-placeholder-core.ts';
import { actionTemplate } from './modal-templates-core.ts';

test('placeholder says what to write AND prompts naming inputs', () => {
  // The two things §1 requires of it. Asserted on meaning-bearing
  // fragments rather than the whole string so wordsmithing stays cheap
  // but neither half can quietly fall out.
  assert.match(DESCRIPTION_PLACEHOLDER, /plain English/);
  assert.match(DESCRIPTION_PLACEHOLDER, /inputs it takes/);
});

test('placeholder is at most three lines', () => {
  assert.ok(
    DESCRIPTION_PLACEHOLDER.split('\n').length <= 3,
    DESCRIPTION_PLACEHOLDER,
  );
});

test('placeholder contains no backtick', () => {
  // It is interpolated into the JS template literal carrying
  // pyodide-host.ts's embedded Python. A backtick terminates that
  // literal mid-Python — the trap this repo has hit twice.
  assert.ok(!DESCRIPTION_PLACEHOLDER.includes('`'), DESCRIPTION_PLACEHOLDER);
});

test('the untouched placeholder is recognised, with surrounding whitespace', () => {
  assert.equal(isDescriptionPlaceholder(DESCRIPTION_PLACEHOLDER), true);
  assert.equal(isDescriptionPlaceholder(`\n\n${DESCRIPTION_PLACEHOLDER}\n `), true);
});

test('an edited placeholder is NOT the placeholder', () => {
  // NON-VACUITY. If this returned true the guard would suppress real
  // cohort intent — the failure that matters, and the silent one.
  assert.equal(
    isDescriptionPlaceholder(DESCRIPTION_PLACEHOLDER + ' Multiply by scale.'),
    false,
  );
  assert.equal(
    isDescriptionPlaceholder('Print a random number multiplied by scale'),
    false,
  );
  assert.equal(isDescriptionPlaceholder(''), false);
});

test('actionTemplate seeds the Description with the placeholder', async () => {
  const note = await actionTemplate('demo');
  assert.ok(note.includes(DESCRIPTION_PLACEHOLDER), note);
});

test('actionTemplate declares NO Input line and keeps the stub Python', async () => {
  // §8: a concrete Input in the template lies about the interface and,
  // under all-or-nothing, suppresses promotion of the real variables
  // written next. §6: the Recipe/Python stub is unchanged.
  const note = await actionTemplate('demo');
  assert.ok(!/^Input\s+\w+\s*:/m.test(note), note);
  assert.ok(!/^inputs:/m.test(note), note);
  assert.ok(note.includes('def compute(context):'), note);
  assert.ok(note.includes('return None'), note);
});

function pythonPlaceholderLines(): string[] {
  // Extract the literal line list from the embedded Python block.
  const src = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pyodide-host.ts'), 'utf8');
  const start = src.indexOf('_FORGE_DESCRIPTION_PLACEHOLDER = ');
  assert.ok(start >= 0, 'the Python constant is gone from pyodide-host.ts');
  const block = src.slice(start, src.indexOf('])', start));
  return [...block.matchAll(/^\s*'(.*)',$/gm)].map((m) => m[1]);
}

test('the embedded Python copy has not drifted from the TS definition', () => {
  // The Python side is a LITERAL copy, not an interpolation: several
  // tests regex this block out of the source and hand the raw text to
  // Pyodide, where an unexpanded template placeholder is a SyntaxError.
  // So drift is prevented the protocol's other sanctioned way — an
  // explicit comparison that fails fast. Drift here fails OPEN (the
  // hint reaches the LLM as intent), which is exactly the direction
  // that needs a mechanical check rather than a comment.
  assert.deepEqual(
    pythonPlaceholderLines(),
    DESCRIPTION_PLACEHOLDER.split('\n'),
  );
});

test('the drift extractor actually finds lines', () => {
  // NON-VACUITY for the test above: an extractor that silently returned
  // [] would make the comparison pass only when the TS constant was
  // also empty, and green for the wrong reason otherwise.
  assert.ok(pythonPlaceholderLines().length >= 2, 'extractor found nothing');
});

test('the generate-inventory path consults the placeholder guard', () => {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pyodide-host.ts'), 'utf8');
  assert.ok(src.includes('_forge_is_description_placeholder(description)'));
});

test('the generate guard does not fall through to the YAML description', () => {
  // The elif is load-bearing: on a dialog-created note the YAML holds
  // the title, so falling through would swap one wrong intent for
  // another (the v0.2.329 defect). Pinned as source shape because the
  // branch lives inside the embedded Python.
  const src = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pyodide-host.ts'), 'utf8');
  const block = src.split('_forge_is_description_placeholder(description)')[1] ?? '';
  const head = block.slice(0, 200);
  assert.match(head, /description = ""/);
  assert.match(head, /elif not description:/);
});
