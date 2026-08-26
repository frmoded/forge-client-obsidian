// Drain 2026-08-26-1000 — the one-hop cycle belt.
//
// Red-first against the driver's exact live pair. `factorial.md` is
// Description-canonical; 2360 removed `factorial` from its own
// inventory, so the model reached for `[[show_factorial]]`, whose
// hand-authored Recipe calls `[[factorial]]` back with a hardcoded 5.
// The driver got `maximum recursion depth exceeded`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  collectOneHopCycles,
  matchesTarget,
  oneHopCycleRejectionMessage,
} from './one-hop-cycle-core.ts';

// The driver's exact pair, verbatim shapes.
const GENERATED_FACTORIAL = 'Let r = Call [[show_factorial]].\nReturn r.';
const SHOW_FACTORIAL_RECIPE = 'Let r = Call [[factorial]] with n=5.\nReturn r.';

/** Every callee is a vault note unless named here. */
function kinds(chips: readonly string[] = []) {
  return (name: string): 'note' | 'chip' | 'unknown' =>
    chips.includes(name) ? 'chip' : 'note';
}

function recipes(map: Record<string, string>) {
  return (name: string): string | null => map[name] ?? null;
}

// ---------------------------------------------------------------------
// The incident.
// ---------------------------------------------------------------------

test("the driver's exact pair is rejected", () => {
  const cycles = collectOneHopCycles(
    GENERATED_FACTORIAL,
    'factorial',
    kinds(),
    recipes({ show_factorial: SHOW_FACTORIAL_RECIPE }),
  );
  assert.deepEqual(cycles, [
    { callee: 'show_factorial', backReference: 'factorial' },
  ]);
});

test('the rejection names the cycle and points at the Recipe, not the Description', () => {
  const msg = oneHopCycleRejectionMessage(
    [{ callee: 'show_factorial', backReference: 'factorial' }],
    'factorial',
  );
  assert.match(msg, /\[\[show_factorial\]\]/);
  assert.match(msg, /recurse forever/);
  // The load-bearing half: the driver's Description DID describe
  // recursion ("a note that calls itself"), so "refine the Description"
  // alone would send them in a circle.
  assert.match(msg, /edit the Recipe directly/);
  assert.match(msg, /\[\[factorial\]\]/);
});

// ---------------------------------------------------------------------
// Non-vacuity — §2's four named cases.
// ---------------------------------------------------------------------

test('a sibling that does NOT call back passes', () => {
  const cycles = collectOneHopCycles(
    'Let g = Call [[greet]] with name="ada".\nReturn g.',
    'factorial',
    kinds(),
    recipes({ greet: 'Return "hello, " + name.' }),
  );
  assert.deepEqual(cycles, []);
});

test('engine chips are never registry-probed', () => {
  let probed: string[] = [];
  const cycles = collectOneHopCycles(
    'Let r = Call [[random_float]].\nReturn r.',
    'factorial',
    kinds(['random_float']),
    (name) => { probed.push(name); return null; },
  );
  assert.deepEqual(cycles, []);
  assert.deepEqual(probed, [], 'a chip has no Recipe and must not be looked up');
});

test('a direct self-call is left to drain 2360, not double-reported', () => {
  // 2360 owns the one-node cycle and its guidance is unchanged. If this
  // belt also reported it, the same defect would surface twice with
  // different wording.
  const cycles = collectOneHopCycles(
    'Return n * Call [[factorial]] with n=n - 1.',
    'factorial',
    kinds(),
    recipes({ factorial: 'Return n * Call [[factorial]] with n=n - 1.' }),
  );
  assert.deepEqual(cycles, []);
});

test('an unreadable callee Recipe degrades toward accepting', () => {
  // A false rejection blocks authoring; a false pass leaves the
  // pre-existing recursion error, which is where we already were.
  const cycles = collectOneHopCycles(
    GENERATED_FACTORIAL, 'factorial', kinds(), recipes({}),
  );
  assert.deepEqual(cycles, []);
});

// ---------------------------------------------------------------------
// 2360's matching rules, shared deliberately.
// ---------------------------------------------------------------------

test('matching is by id AND by basename, like 2360', () => {
  assert.ok(matchesTarget('factorial', 'factorial'));
  // The shape drain 2330 documented: snippetIdFromPath falls back to a
  // bare basename in a non-library subdir, so the two genuinely
  // disagree for the note the driver runs.
  assert.ok(matchesTarget('factorial', 'authoring/factorial'));
  assert.ok(matchesTarget('chapters/factorial', 'factorial'));
  assert.ok(!matchesTarget('factorial_helper', 'factorial'));
  assert.ok(!matchesTarget('', 'factorial'));
  assert.ok(!matchesTarget('factorial', ''));
});

test('a qualified callee whose Recipe calls the bare target is caught', () => {
  const cycles = collectOneHopCycles(
    'Let r = Call [[chapters/show_factorial]].\nReturn r.',
    'forge-tutorial/08-recursion/factorial',
    kinds(),
    recipes({ 'chapters/show_factorial': SHOW_FACTORIAL_RECIPE }),
  );
  assert.equal(cycles.length, 1, 'basename matching must cross the qualification');
  assert.equal(cycles[0].callee, 'chapters/show_factorial');
});

// ---------------------------------------------------------------------
// Shape.
// ---------------------------------------------------------------------

test('an empty target id belts nothing', () => {
  // Mirrors excludeSelf's stance: a missing id must not be read as
  // "matches everything", which would reject every generated Recipe.
  assert.deepEqual(
    collectOneHopCycles(GENERATED_FACTORIAL, '', kinds(),
      recipes({ show_factorial: SHOW_FACTORIAL_RECIPE })),
    [],
  );
});

test('a callee is probed once even when called repeatedly', () => {
  const probed: string[] = [];
  collectOneHopCycles(
    'Let a = Call [[show_factorial]].\nLet b = Call [[show_factorial]].\nReturn a.',
    'factorial',
    kinds(),
    (n) => { probed.push(n); return SHOW_FACTORIAL_RECIPE; },
  );
  assert.deepEqual(probed, ['show_factorial']);
});

test('several cycling callees are all reported', () => {
  const cycles = collectOneHopCycles(
    'Let a = Call [[show_factorial]].\nLet b = Call [[demo_factorial]].\nReturn a.',
    'factorial',
    kinds(),
    recipes({
      show_factorial: SHOW_FACTORIAL_RECIPE,
      demo_factorial: 'Return Call [[factorial]] with n=3.',
    }),
  );
  assert.deepEqual(cycles.map((c) => c.callee), ['show_factorial', 'demo_factorial']);
});

test('the message pluralises', () => {
  const msg = oneHopCycleRejectionMessage(
    [
      { callee: 'show_factorial', backReference: 'factorial' },
      { callee: 'demo_factorial', backReference: 'factorial' },
    ],
    'factorial',
  );
  assert.match(msg, /whose own Recipes call/);
});

// ---------------------------------------------------------------------
// Wiring + scope guards on the real source.
// ---------------------------------------------------------------------

function mainSrc(): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'src/main.ts'), 'utf8');
}

test('the belt runs at the same gate as the closure check and 2310 belt', () => {
  const main = mainSrc();
  assert.match(main, /collectOneHopCycles\(/, 'the belt is not wired');
  // Same `catalogReady` gate as its siblings: without the inventory,
  // `kindOf` cannot tell a note from a chip and the belt would probe
  // the registry for engine chips.
  const gate = main.slice(main.indexOf('const closure = catalogReady'));
  const window = gate.slice(0, 4000);
  assert.match(
    window, /catalogReady[\s\S]{0,400}collectOneHopCycles\(/,
    'the cycle belt must be gated on catalogReady like the closure check',
  );
});

test('the belt is checked on the sanitized text, not the raw output', () => {
  // Same discipline as 2310: what gets checked must be what would be
  // written to the note.
  const main = mainSrc();
  assert.ok(
    !/collectOneHopCycles\(llmRecipe/.test(main),
    'the belt must run on the sanitized Recipe',
  );
  assert.match(main, /collectOneHopCycles\(\s*sanitized/);
});

test('hand-authored Recipes are untouched — the belt is generation-only', () => {
  // The tutorial's own factorial.md self-call must stay legal. The belt
  // only ever sees freshly generated text, so the guard is that it is
  // called from the generate branch and nowhere else.
  const main = mainSrc();
  const calls = [...main.matchAll(/collectOneHopCycles\(/g)];
  assert.equal(calls.length, 1, `expected one call site, found ${calls.length}`);
});

// ---------------------------------------------------------------------
// The rejection UX: guidance, the no-retry decision, and the wire.
// ---------------------------------------------------------------------

import { deriveLlmRejectionGuidance } from './llm-rejection-guidance-core.ts';
import { shouldBlindRetry } from './blind-retry-core.ts';

test('cycle guidance leads with hand-authoring, not "refine the Description"', () => {
  const g = deriveLlmRejectionGuidance({
    failureMode: 'cycle-fail',
    unresolvedWikilinks: [],
    cyclicCallees: ['show_factorial'],
    descriptionBody: 'a note that calls itself until n reaches 1',
  });
  assert.match(g.likelyCause, /show_factorial/);
  assert.match(g.likelyCause, /maximum recursion depth exceeded/);
  // The driver's Description ALREADY described recursion correctly, so
  // leading with "refine the Description" sends that cohort in a circle.
  assert.match(g.fixOptions[0], /hand-author/i);
  assert.ok(g.fixOptions.every((o) => !/undefined/.test(o)), g.fixOptions.join('|'));
});

test('cycle guidance degrades safely with no callee names', () => {
  const g = deriveLlmRejectionGuidance({
    failureMode: 'cycle-fail',
    unresolvedWikilinks: [],
    descriptionBody: '',
  });
  assert.ok(!/undefined/.test(g.likelyCause), g.likelyCause);
  assert.ok(g.fixOptions.length > 0);
});

test('the other rejection modes keep their guidance', () => {
  // NON-VACUITY for the branch insertion: adding cycle-fail must not
  // shadow the modes that were already handled.
  for (const mode of ['closure-fail', 'sanitize-fail', 'free-variable-fail'] as const) {
    const g = deriveLlmRejectionGuidance({
      failureMode: mode,
      unresolvedWikilinks: ['ghost'],
      undeclaredNames: ['scale'],
      descriptionBody: 'x',
    });
    assert.ok(g.likelyCause.length > 0, mode);
    assert.ok(g.fixOptions.length > 0, mode);
  }
});

test('a cycle is NEVER blind-retried', () => {
  // The v0.2.370 lesson, applied deliberately: a blind replay sends the
  // identical payload and the identical inventory, so the nearest
  // callable is still the same sibling. Retrying spends a call to reach
  // the same cycle.
  assert.equal(shouldBlindRetry(1, 'cycle-fail'), false);
  assert.equal(shouldBlindRetry(2, 'cycle-fail'), false);
  // NON-VACUITY: the verdicts that DO wobble are still retried.
  assert.equal(shouldBlindRetry(1, 'free-variable-fail'), true);
  assert.equal(shouldBlindRetry(1, 'closure-fail'), true);
});

test('cyclicCallees is threaded from the panel into the guidance', () => {
  // Adding a field to the view's input type without passing it on is a
  // silent half-wire: the panel would render generic guidance while the
  // caller believed it had supplied the names. That happened during
  // this drain and this is the guard.
  const view = fs.readFileSync(
    path.resolve(process.cwd(), 'src/output-view.ts'), 'utf8');
  const call = view.slice(
    view.indexOf('deriveLlmRejectionGuidance({'),
    view.indexOf('deriveLlmRejectionGuidance({') + 400);
  assert.match(
    call, /cyclicCallees: input\.cyclicCallees/,
    'output-view accepts cyclicCallees but does not pass it to the guidance',
  );
});
