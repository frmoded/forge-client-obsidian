// Drain 2026-08-24-2310 — the enforcement belt: a GENERATED Recipe with
// undeclared free variables is rejected like a closure failure.
//
// Driver's v0.2.366 repro: the Description said "an input var scale" and
// the model wrote `scale` free, with no `Input scale` declaration — the
// second time in three live runs. Drain 2000 measured Input adherence at
// 3/3 and Return adherence at 1/3 in the same session: adherence
// wobbles, so prompt guidance alone cannot be the guarantee. Same
// conclusion drain 0900 reached about the duplicated Return.
//
// Third enforcement layer: the prompt mandates Input, the sanitizer can
// no longer eat it (drain 1600), and now the generator cannot omit it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectFreeIdentifiers } from './free-identifiers-core.ts';

const CALLABLES = new Set(['greet', 'random_float', 'go', 'chapters/countdown']);

test('the driver\'s exact output reports scale', () => {
  const recipe = [
    'Let raw = {{ a random float between 0 and 1 }}.',
    'Let scaled = raw * 2.',
    'Let result = scaled * scale.',
    'Return result.',
  ].join('\n');
  assert.deepEqual(collectFreeIdentifiers(recipe, CALLABLES), ['scale']);
});

test('a declared Input is not free', () => {
  // NON-VACUITY: the belt must pass the correct Recipe, or it rejects
  // every note and the cohort cannot author at all.
  const recipe = [
    'Input scale: float = 1.0.',
    'Let rand = Call [[random_float]].',
    'Let result = rand * scale.',
    'Return result.',
  ].join('\n');
  assert.deepEqual(collectFreeIdentifiers(recipe, CALLABLES), []);
});

test('Let-bound names are not free', () => {
  assert.deepEqual(
    collectFreeIdentifiers('Let x = 1.\nLet y = x + 1.\nReturn y.', CALLABLES),
    [],
  );
});

test('slot-internal words are not identifiers', () => {
  // The slot's prose is a request to an LLM, not code. Flagging "random"
  // or "between" would reject every slot-bearing Recipe.
  assert.deepEqual(
    collectFreeIdentifiers('Let raw = {{ a random float between 0 and 1 }}.\nReturn raw.', CALLABLES),
    [],
  );
});

test('callables from the inventory are not free', () => {
  assert.deepEqual(
    collectFreeIdentifiers('Let g = Call [[greet]] with name="ada".\nReturn g.', CALLABLES),
    [],
  );
});

test('a For-each loop variable is bound by its own loop', () => {
  const recipe = ['Let items = [1, 2].', 'For each n in items:', '  Return n.', 'Return 0.'].join('\n');
  assert.deepEqual(collectFreeIdentifiers(recipe, CALLABLES), []);
});

test('kwarg NAMES are not references', () => {
  // `with state=state` — the left side is a parameter name on the
  // callee, the right side is the reference. Only the right side can be
  // free.
  const recipe = 'Let s = Call [[go]] with state=start.\nReturn s.';
  assert.deepEqual(collectFreeIdentifiers(recipe, CALLABLES), ['start']);
});

test('string and numeric literals are not identifiers', () => {
  assert.deepEqual(
    collectFreeIdentifiers('Let s = "hello world".\nLet n = 42.\nReturn s.', CALLABLES),
    [],
  );
});

test('keywords and booleans are not identifiers', () => {
  assert.deepEqual(
    collectFreeIdentifiers('Let flag = True.\nIf flag > 0:\n  Return None.\nReturn False.', CALLABLES),
    [],
  );
});

test('an Input type annotation is not a reference', () => {
  // `Input mode: 'major' | 'minor' = "major".` — the type is not a name
  // the Recipe references.
  assert.deepEqual(
    collectFreeIdentifiers("Input mode: 'major' | 'minor' = \"major\".\nReturn mode.", CALLABLES),
    [],
  );
  assert.deepEqual(
    collectFreeIdentifiers('Input n: int = 3.\nReturn n.', CALLABLES),
    [],
  );
});

test('multiple undeclared names are all reported, de-duplicated and ordered', () => {
  const recipe = 'Let a = width * height.\nLet b = width + 1.\nReturn a.';
  assert.deepEqual(collectFreeIdentifiers(recipe, CALLABLES), ['height', 'width']);
});

test('an empty Recipe has no free identifiers', () => {
  assert.deepEqual(collectFreeIdentifiers('', CALLABLES), []);
  assert.deepEqual(collectFreeIdentifiers('   \n\n', CALLABLES), []);
});

// ---------------------------------------------------------------------
// Wiring + rejection UX. §(a) requires the belt to validate against the
// SAME inventory the closure check uses, and §8 forbids half-duplicating
// the check on the other side.
// ---------------------------------------------------------------------

import fsMod from 'node:fs';
import pathMod from 'node:path';
import { deriveLlmRejectionGuidance } from './llm-rejection-guidance-core.ts';
import { freeIdentifierRejectionMessage } from './free-identifiers-core.ts';

function mainSrc(): string {
  return fsMod.readFileSync(pathMod.resolve(process.cwd(), 'src/main.ts'), 'utf8');
}

test('the belt validates against the closure check inventory', () => {
  // ONE FACT: `knownIds` is derived from the payload's callable array
  // (drain 1000). Passing anything else would let the belt and the
  // closure check disagree about what is callable — the divergence §8
  // forbids.
  assert.match(mainSrc(), /collectFreeIdentifiers\(sanitized, knownIds\)/);
});

test('the belt is checked on the sanitized text, not the raw output', () => {
  // The sanitized string is what would be written to the note, so it is
  // what must be closed. Checking the raw output would flag prose words.
  assert.ok(!/collectFreeIdentifiers\(llmRecipe/.test(mainSrc()));
});

test('the belt is gated on catalogReady like the closure check', () => {
  // NON-VACUITY of the safety valve: with no inventory every callable
  // reads as an undeclared free variable, and the belt would reject
  // every Recipe rather than none.
  assert.match(mainSrc(), /catalogReady && sanitized !== null/);
});

test('rejection guidance names the undeclared identifiers', () => {
  const g = deriveLlmRejectionGuidance({
    failureMode: 'free-variable-fail',
    unresolvedWikilinks: [],
    undeclaredNames: ['scale'],
    descriptionBody: 'Print a random number multiplied by an input var scale',
  });
  assert.match(g.likelyCause, /`scale`/);
  assert.ok(
    g.fixOptions.some((o) => /Input scale: <type> = <default>\./.test(o)),
    g.fixOptions.join('|'),
  );
});

test('rejection guidance degrades safely with no names', () => {
  // NON-VACUITY: `undeclaredNames` is optional on the shared input type,
  // so a caller that forgets it must not render "undefined" at the
  // cohort.
  const g = deriveLlmRejectionGuidance({
    failureMode: 'free-variable-fail',
    unresolvedWikilinks: [],
    descriptionBody: '',
  });
  assert.ok(!/undefined/.test(g.likelyCause), g.likelyCause);
  assert.ok(g.fixOptions.every((o) => !/undefined/.test(o)), g.fixOptions.join('|'));
});

test('the cohort message names the expected declaration', () => {
  const msg = freeIdentifierRejectionMessage(['scale']);
  assert.match(msg, /Input scale: <type> = <default>\./);
  assert.match(msg, /preserved/);
});

test('the other rejection modes keep their guidance', () => {
  // §8 — the belt adds a mode, it does not disturb the existing two.
  const closure = deriveLlmRejectionGuidance({
    failureMode: 'closure-fail',
    unresolvedWikilinks: ['nope'],
    descriptionBody: 'x',
  });
  assert.match(closure.likelyCause, /\[\[nope\]\]/);
  const sanitize = deriveLlmRejectionGuidance({
    failureMode: 'sanitize-fail',
    unresolvedWikilinks: [],
    descriptionBody: 'x',
  });
  assert.match(sanitize.likelyCause, /prose or commentary/);
});
