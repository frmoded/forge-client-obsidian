import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';

// Drain 2026-08-26-1600 §2 — the `decideForgeClickAction` describe-block
// that lived here is RETIRED with the function. It pinned a MECHANISM
// with no production consumer; the PROPERTY it gestured at (a
// Description-canonical note forges without cohort intervention) is
// I1's, and I1's hook now asserts it against the live wiring in
// description-canonical-fixture-integration.test.ts.

// ---------------------------------------------------------------------
// Drain 2026-08-26-1500 — the re-roll gesture.
//
// PIN TYPE: these pin a PROPERTY (what the hammer derives), not a
// mechanism. The old `decideForgeClickAction` test above pins a
// MECHANISM that currently has no production consumer — if it goes red
// while `resolveForgeGesture`'s tests stay green, the mechanism moved
// and the property held. (Convention adopted 2026-08-26.)
// ---------------------------------------------------------------------

import {
  resolveForgeGesture,
  NOTHING_TO_DERIVE_NOTICE,
} from './source-aware-forge-click-core.ts';
import fs from 'node:fs';
import path from 'node:path';

test('THE RE-ROLL: a synced Description-canonical note derives AGAIN', () => {
  // The whole drain. Before it, this returned a transpile and the
  // cohort had to fake a Description edit to get a fresh roll.
  assert.equal(resolveForgeGesture('synced', 'description'), 'generate');
});

test('a synced Recipe-canonical note re-transpiles', () => {
  // Deterministic and cheap — effectively a no-op result-wise, but
  // honest to "forge = derive". Zero LLM unless slots miss.
  assert.equal(resolveForgeGesture('synced', 'recipe'), 'transpile');
});

test('a synced Python-canonical note answers instead of no-opping', () => {
  assert.equal(resolveForgeGesture('synced', 'python'), 'nothing_to_derive');
  assert.match(NOTHING_TO_DERIVE_NOTICE, /source/);
  assert.match(NOTHING_TO_DERIVE_NOTICE, /nothing to re-derive/);
});

test('a synced note with NO stored facet transpiles — no surprise LLM call', () => {
  // Conservative default. A note that never recorded a source_facet
  // must not start spending generations because it happens to be
  // in sync.
  assert.equal(resolveForgeGesture('synced', null), 'transpile');
});

test('STALE behaviour is byte-identical to today (non-vacuity)', () => {
  // §3 requires this explicitly: the drain must change ONLY the synced
  // case. `stored` is ignored whenever the probe names a drifted facet.
  for (const stored of ['description', 'recipe', 'python', 'synced', null] as const) {
    assert.equal(resolveForgeGesture('description', stored), 'generate', `desc/${stored}`);
    assert.equal(resolveForgeGesture('recipe', stored), 'transpile', `recipe/${stored}`);
    assert.equal(resolveForgeGesture('python', stored), 'nothing_to_derive', `python/${stored}`);
  }
});

test('a failed probe still transpiles — a hash bug cannot take Forge offline', () => {
  assert.equal(resolveForgeGesture(null, 'description'), 'transpile');
  assert.equal(resolveForgeGesture(null, null), 'transpile');
});

test('the synced short-circuit carries the do-not-revert note', () => {
  // §2: the next reader must not "fix" the re-roll back into a cache
  // check. Guard the PROPERTY that the reasoning is present and cites
  // this drain, not its exact wording.
  const src = fs.readFileSync(
    path.resolve(process.cwd(), 'src/source-aware-forge-click-core.ts'), 'utf8');
  assert.match(src, /2026-08-26-1500/);
  assert.match(src, /Run still never re-hits the LLM/);
  assert.match(src, /Do not re-add a freshness short-circuit/);
});

test('the gesture is WIRED — resolveForgeGesture reaches main.ts', () => {
  const main = fs.readFileSync(
    path.resolve(process.cwd(), 'src/main.ts'), 'utf8');
  assert.match(main, /resolveForgeGesture\(/,
    'the re-roll core is not wired — decideForgeClickAction sat unwired for '
    + 'releases, and an unwired decision module decides nothing');
});

test('the generate branch cannot double-fire: ONE call site inside forgeSnippet', () => {
  // §3 asks for "exactly one /generate call (count, don't infer)". A
  // runtime count needs the whole forge path mocked, which is the
  // driver's smoke — but the STRUCTURAL half is checkable and is the
  // half a refactor can break: there must be exactly one invocation of
  // the generate entrypoint inside forgeSnippet, so the re-roll cannot
  // turn one gesture into two rolls.
  const main = fs.readFileSync(
    path.resolve(process.cwd(), 'src/main.ts'), 'utf8');
  const body = main.slice(
    main.indexOf('private async forgeSnippet()'),
    main.indexOf('private async runSnippet('));
  assert.ok(body.length > 0, 'could not locate forgeSnippet');
  const calls = [...body.matchAll(/this\._llmGenerateRecipe\(/g)].length;
  assert.equal(calls, 1, `expected one generate call site, found ${calls}`);
});

test('the gesture is computed ONCE per click', () => {
  // Two resolutions could disagree if the body were re-read between
  // them — the one-object discipline, applied to a decision.
  const main = fs.readFileSync(
    path.resolve(process.cwd(), 'src/main.ts'), 'utf8');
  assert.equal([...main.matchAll(/resolveForgeGesture\(/g)].length, 1);
});
