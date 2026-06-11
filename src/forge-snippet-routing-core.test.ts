// v0.2.123 — failing-first TDD tests for decideForgeRouting.
//
// Per the v0.2.123 prompt §2.2: 8 tests covering the routing
// matrix. If ANY test fails, the original inline routing logic in
// main.ts:forgeSnippet has drifted from the spec and that drift
// IS the simulation regression.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideForgeRouting } from './forge-snippet-routing-core.ts';

test('decideForgeRouting: forge-moda/simulation.md with featured:true → moda', () => {
  const r = decideForgeRouting('forge-moda/simulation.md', {
    type: 'action',
    featured: true,
  });
  assert.equal(r.kind, 'moda');
});

test('decideForgeRouting: forge-moda/ leaf without featured → english-mode', () => {
  const r = decideForgeRouting('forge-moda/create_ink_particles.md', {
    type: 'action',
  });
  assert.equal(r.kind, 'english-mode');
});

test('decideForgeRouting: forge-tutorial/01-hello/hello_world.md → english-mode', () => {
  const r = decideForgeRouting('forge-tutorial/01-hello/hello_world.md', {
    type: 'action',
  });
  assert.equal(r.kind, 'english-mode');
});

test('decideForgeRouting: edit_mode:python → python-mode regardless of path', () => {
  const r = decideForgeRouting('forge-moda/simulation.md', {
    featured: true,
    edit_mode: 'python',
  });
  // Per the v0.2.123 prompt §2.2: moda branch fires FIRST in the
  // existing main.ts code, so featured:true + python should route
  // to moda. But the prompt's expected value is 'python-mode' —
  // implying the routing decision should be: python-mode takes
  // precedence. This is a SEMANTIC choice. The prompt explicitly
  // declared python-mode as the expected outcome here.
  //
  // Implementation: this means moda check must include `edit_mode
  // != python`. Verifying current pure-core spec.
  assert.equal(r.kind, 'python-mode');
});

test('decideForgeRouting: featured as string "true" does NOT match (strict boolean)', () => {
  const r = decideForgeRouting('forge-moda/simulation.md', {
    featured: 'true',
  });
  assert.equal(r.kind, 'english-mode');
});

test('decideForgeRouting: null frontmatter → english-mode', () => {
  const r = decideForgeRouting('forge-moda/simulation.md', null);
  assert.equal(r.kind, 'english-mode');
});

test('decideForgeRouting: undefined frontmatter → english-mode', () => {
  const r = decideForgeRouting('forge-moda/simulation.md', undefined);
  assert.equal(r.kind, 'english-mode');
});

test('decideForgeRouting: featured:true at non-forge-moda/ path → english-mode', () => {
  const r = decideForgeRouting('notes/foo.md', { featured: true });
  assert.equal(r.kind, 'english-mode');
});
