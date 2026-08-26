import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  decideForgeClickAction,
} from './source-aware-forge-click-core.ts';

describe('decideForgeClickAction (v0.2.201 Phase 2 §3.1)', () => {
  test('python-canonical → run_python_directly (Path Y closure)', () => {
    // Hand-edited Python facet. The whole point of Phase 2: don't
    // re-transpile; preserve cohort edits. Mirrors V1's
    // `edit_mode: python` workaround but driven by hash mismatch.
    assert.equal(
      decideForgeClickAction('python'),
      'run_python_directly',
    );
  });

  test('description-canonical → auto_generate_then_run (v0.2.254)', () => {
    // Description hand-edited since last /generate. Recipe + Python
    // are stale. Pre-v0.2.254 this aborted with a notice pointing
    // cohort at a retired command. Post-v0.2.254 Forge-click auto-
    // runs the full pipeline: /generate (Description → Recipe +
    // Python) → execute the fresh Python.
    assert.equal(
      decideForgeClickAction('description'),
      'auto_generate_then_run',
    );
  });

  test('recipe-canonical → standard_transpile', () => {
    // Recipe hand-edited since last Python regen. Standard path:
    // re-transpile Recipe → Python. Phase 1 already does this.
    assert.equal(
      decideForgeClickAction('recipe'),
      'standard_transpile',
    );
  });

  test('synced → standard_transpile', () => {
    // No hand-edits anywhere; all three facets match their stored
    // hashes. Safe to re-transpile (idempotent for a synced note).
    assert.equal(
      decideForgeClickAction('synced'),
      'standard_transpile',
    );
  });

  test('null (probe failed) → standard_transpile (preserves Phase 1 behavior)', () => {
    // If whichLayerIsSource threw, fall through to standard
    // transpile. Without this fallback a hash-helper bug could take
    // Forge-click offline for the whole cohort.
    assert.equal(
      decideForgeClickAction(null),
      'standard_transpile',
    );
  });

  test('decision table is exhaustive (one action per layer)', () => {
    // Belt-and-braces: every layer maps to exactly one of the three
    // documented actions. If a future drain adds a new canonical
    // value, the type system catches the missing branch at compile
    // time AND this test ensures the existing four don't drift.
    const layers = ['description', 'recipe', 'python', 'synced'] as const;
    const actions = new Set(layers.map(decideForgeClickAction));
    assert.deepEqual(
      [...actions].sort(),
      ['auto_generate_then_run', 'run_python_directly', 'standard_transpile'].sort(),
    );
  });
});

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
