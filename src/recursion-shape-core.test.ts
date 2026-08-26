// Drain 2026-08-26-1020 — generated self-recursion WORKS; mirroring does not.
//
// The driver's directive: "I want to fix the process, not the specific
// note." 373's belt stops the crash; this makes the honest case succeed.
//
// The semantic cases live in test/fixtures/recursion-shape-cases.json
// because the SERVICE mirrors this gate and reads the same file — the
// mirror-with-drift-test arrangement drain 1900 established.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  checkRecursionShape,
  hasBaseCase,
  selfCallArguments,
  selfCallProgresses,
  selfReferenceLabel,
  recursionShapeRejectionMessage,
} from './recursion-shape-core.ts';

function src(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
}

const CORPUS = JSON.parse(src('test/fixtures/recursion-shape-cases.json')) as {
  cases: Array<{
    name: string; target: string; recipe: string;
    callsSelf: boolean; hasBaseCase: boolean; progresses: boolean;
    ok: boolean; failure?: string;
  }>;
};

// ---------------------------------------------------------------------
// The shared cases — the same file forge-transpile's suite reads.
// ---------------------------------------------------------------------

for (const c of CORPUS.cases) {
  test(`shared case: ${c.name}`, () => {
    const v = checkRecursionShape(c.recipe, c.target);
    assert.equal(v.callsSelf, c.callsSelf, 'callsSelf');
    assert.equal(v.ok, c.ok, 'ok');
    if (c.callsSelf) {
      assert.equal(v.hasBaseCase, c.hasBaseCase, 'hasBaseCase');
      assert.equal(v.progresses, c.progresses, 'progresses');
    }
    if (c.failure) assert.equal(v.failure, c.failure, 'failure');
  });
}

test('the corpus would notice a stub', () => {
  // NON-VACUITY. A gate that always accepts, or always rejects, must
  // fail at least one case each way.
  assert.ok(CORPUS.cases.some((c) => c.ok), 'no accepting case');
  assert.ok(CORPUS.cases.some((c) => !c.ok), 'no rejecting case');
  assert.ok(CORPUS.cases.some((c) => c.callsSelf), 'no self-calling case');
  assert.ok(CORPUS.cases.some((c) => !c.callsSelf), 'no non-self-calling case');
});

// ---------------------------------------------------------------------
// The two halves, separately.
// ---------------------------------------------------------------------

test('base case: the final unconditional Return never counts', () => {
  // If it did, every Recipe would have a "base case" and the check
  // would be vacuous — which is the whole point of §2(a)'s "distinct
  // from the final one".
  assert.equal(hasBaseCase('Return 1.'), false);
  assert.equal(hasBaseCase('Let x = 1.\nReturn x.'), false);
});

test('base case: an If-guarded Return counts, indented or inline', () => {
  assert.equal(hasBaseCase('If n <= 1:\n  Return 1.\nReturn 2.'), true);
  assert.equal(hasBaseCase('If n <= 1: Return 1.\nReturn 2.'), true);
  assert.equal(hasBaseCase('Otherwise:\n  Return 0.'), true);
});

test('base case: a Return dedented back out of the If does not count', () => {
  // The guard closed; this is the final unconditional Return wearing a
  // conditional's clothes.
  assert.equal(
    hasBaseCase('If n <= 1:\n  Let x = 1.\nReturn x.'),
    false,
  );
});

test('self-call arguments are extracted, including the absent case', () => {
  assert.deepEqual(
    selfCallArguments('Let r = Call [[factorial]] with n=n - 1.', 'factorial'),
    ['n=n - 1.'],
  );
  assert.deepEqual(
    selfCallArguments('Let r = Call [[factorial]].', 'factorial'),
    [''],
  );
  assert.deepEqual(
    selfCallArguments('Let r = Call [[other]] with n=1.', 'factorial'),
    [],
  );
});

test('progress: a bare unchanged Input name is the mirror', () => {
  const mirror = 'Input n: int = 5.\nLet r = Call [[factorial]] with n=n.\nReturn r.';
  assert.equal(selfCallProgresses(mirror, 'factorial'), false);
});

test('progress: a derived argument moves', () => {
  const good = 'Input n: int = 5.\nLet r = Call [[factorial]] with n=n - 1.\nReturn r.';
  assert.equal(selfCallProgresses(good, 'factorial'), true);
});

test('progress: an undeclared name is NOT treated as an unchanged Input', () => {
  // `tail` is not declared as an Input, so passing it is progress — the
  // scanner must not assume every bare name echoes a parameter.
  const good = 'Input items: list = [].\nLet r = Call [[walk]] with items=tail.\nReturn r.';
  assert.equal(selfCallProgresses(good, 'walk'), true);
});

test('progress: an unparseable argument fragment is accepted', () => {
  // Conservative in the accepting direction, per the module note: a
  // false rejection blocks authoring.
  assert.equal(
    selfCallProgresses('Let r = Call [[f]] with weird.\nReturn r.', 'f'),
    true,
  );
});

// ---------------------------------------------------------------------
// §1 — the label.
// ---------------------------------------------------------------------

test('the self label names THIS NOTE and the only legitimate use', () => {
  const l = selfReferenceLabel('Multiply n by every number below it.');
  assert.match(l, /THIS NOTE/);
  assert.match(l, /recurse/);
  assert.match(l, /base case/);
  // 2360's mirror happened because the summary read like a different
  // perfect function; the original summary must survive so the model
  // still knows what the note does.
  assert.match(l, /Multiply n by every number below it\./);
});

test('the self label degrades with an empty summary', () => {
  const l = selfReferenceLabel('');
  assert.match(l, /THIS NOTE/);
  assert.ok(!/undefined/.test(l), l);
});

// ---------------------------------------------------------------------
// The rejection wording — 2360's UX, smarter criterion.
// ---------------------------------------------------------------------

test('each failure mode gets its own actionable wording', () => {
  const base = recursionShapeRejectionMessage(
    { callsSelf: true, hasBaseCase: false, progresses: true, ok: false, failure: 'no-base-case' },
    'factorial');
  assert.match(base, /base case/);
  assert.match(base, /If n <= 1/);

  const prog = recursionShapeRejectionMessage(
    { callsSelf: true, hasBaseCase: true, progresses: false, ok: false, failure: 'no-progress' },
    'factorial');
  assert.match(prog, /changed argument/);
  assert.match(prog, /n=n - 1/);

  const both = recursionShapeRejectionMessage(
    { callsSelf: true, hasBaseCase: false, progresses: false, ok: false, failure: 'both' },
    'factorial');
  assert.match(both, /mirror, not recursion/);

  for (const m of [base, prog, both]) {
    assert.match(m, /\[\[factorial\]\]/);
    assert.ok(!/undefined/.test(m), m);
  }
});

// ---------------------------------------------------------------------
// Wiring guards on the real source.
// ---------------------------------------------------------------------

test('the target is re-included in its own inventory, labeled', () => {
  const main = src('src/main.ts');
  assert.ok(
    !/buildCallableInventory\(excludeSelf\(/.test(main),
    'the target is still EXCLUDED from its own inventory — §1 re-includes it',
  );
  assert.match(main, /labelSelfInInventory\(/, 'the self-label is not wired');
});

test('excludeSelf is retired, not left dangling', () => {
  const main = src('src/main.ts');
  const uses = [...main.matchAll(/\bexcludeSelf\b/g)].length;
  assert.equal(uses, 0, `excludeSelf still referenced ${uses}x in main.ts`);
});

test('the shape gate replaced the 2360 flat self-call rejection', () => {
  const main = src('src/main.ts');
  assert.match(main, /checkRecursionShape\(/, 'the shape gate is not wired');
  const calls = [...main.matchAll(/checkRecursionShape\(/g)].length;
  assert.equal(calls, 1, `expected one gate call site, found ${calls}`);
});

test('the 373 sibling-cycle belt is untouched', () => {
  // §3: "The 373 cycle belt's tests stay green." Guard the wiring too,
  // so a refactor of this gate cannot quietly absorb it.
  const main = src('src/main.ts');
  assert.equal([...main.matchAll(/collectOneHopCycles\(/g)].length, 1);
});
