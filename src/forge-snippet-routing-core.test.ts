// v0.2.123 — failing-first TDD tests for decideForgeRouting.
//
// Per the v0.2.123 prompt §2.2: 8 tests covering the routing
// matrix. If ANY test fails, the original inline routing logic in
// main.ts:forgeSnippet has drifted from the spec and that drift
// IS the simulation regression.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideForgeRouting,
  hasRoutingKeys,
  parseRoutingFrontmatter,
} from './forge-snippet-routing-core.ts';

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

// =================================================================
// v0.2.125 — hasRoutingKeys + parseRoutingFrontmatter tests.
//
// Closes the v0.2.124 fast-path gap surfaced by forge-core's
// 2026-06-10-2122 review: the previous check (`if (cachedFm)`) was
// permissive against a stale-non-null cache missing routing keys.
// Pure-core tests covering the structural guard + the inline YAML
// head parser used by `main.ts:readFrontmatterForRouting`.
// =================================================================

test('hasRoutingKeys: null frontmatter → false', () => {
  assert.equal(hasRoutingKeys(null), false);
});

test('hasRoutingKeys: undefined frontmatter → false', () => {
  assert.equal(hasRoutingKeys(undefined), false);
});

test('hasRoutingKeys: empty object → false (genuinely-no-routing-keys file)', () => {
  assert.equal(hasRoutingKeys({}), false);
});

test('hasRoutingKeys: stale cache with {type: action} → false (THE v0.2.124 GAP)', () => {
  // The exact shape forge-core's v0124 review identified as the
  // prime suspect for any post-v0.2.124 simulation regression:
  // a stale metadataCache returning frontmatter that's missing
  // the routing-relevant keys. Pre-v0.2.125 would have trusted
  // this and silently misrouted.
  assert.equal(hasRoutingKeys({ type: 'action' }), false);
});

test('hasRoutingKeys: { featured: true } → true', () => {
  assert.equal(hasRoutingKeys({ featured: true }), true);
});

test('hasRoutingKeys: { featured: false } → true (presence, not value)', () => {
  // The guard checks presence of the KEY, not truthiness of its
  // value. `featured: false` is still authoritative routing data.
  assert.equal(hasRoutingKeys({ featured: false }), true);
});

test('hasRoutingKeys: { edit_mode: "python" } → true', () => {
  assert.equal(hasRoutingKeys({ edit_mode: 'python' }), true);
});

test('hasRoutingKeys: { edit_mode: "english" } → true', () => {
  assert.equal(hasRoutingKeys({ edit_mode: 'english' }), true);
});

test('hasRoutingKeys: { type: action, featured: true } → true', () => {
  // The healthy steady-state shape for a featured moda snippet.
  assert.equal(hasRoutingKeys({ type: 'action', featured: true }), true);
});

test('parseRoutingFrontmatter: body without --- delimiter → null', () => {
  const result = parseRoutingFrontmatter('# English\n\nsome body');
  assert.equal(result, null);
});

test('parseRoutingFrontmatter: empty body → null', () => {
  const result = parseRoutingFrontmatter('');
  assert.equal(result, null);
});

test('parseRoutingFrontmatter: canonical simulation.md frontmatter', () => {
  const body = '---\ntype: action\nfeatured: true\n---\n# English\n\nbody';
  const result = parseRoutingFrontmatter(body);
  assert.deepEqual(result, { type: 'action', featured: true });
});

test('parseRoutingFrontmatter: featured: false coerces to boolean', () => {
  const body = '---\nfeatured: false\n---\n';
  const result = parseRoutingFrontmatter(body);
  assert.deepEqual(result, { featured: false });
});

test('parseRoutingFrontmatter: edit_mode: python stays a string', () => {
  const body = '---\nedit_mode: python\n---\n';
  const result = parseRoutingFrontmatter(body);
  assert.deepEqual(result, { edit_mode: 'python' });
});

test('parseRoutingFrontmatter: quoted values strip surrounding quotes', () => {
  const body = '---\nedit_mode: "python"\nname: \'foo\'\n---\n';
  const result = parseRoutingFrontmatter(body);
  assert.deepEqual(result, { edit_mode: 'python', name: 'foo' });
});

test('parseRoutingFrontmatter: empty --- block → {}', () => {
  const body = '---\n---\n# English\n';
  const result = parseRoutingFrontmatter(body);
  assert.deepEqual(result, {});
});

test('parseRoutingFrontmatter: lines without colon are skipped', () => {
  const body = '---\nfeatured: true\nbare-line-no-colon\n---\n';
  const result = parseRoutingFrontmatter(body);
  assert.deepEqual(result, { featured: true });
});

test('decideForgeRouting: hand-authored # Python without english_hash + featured:true → moda (v0.2.128 force regression guard)', () => {
  // v0.2.128 institutional regression guard: the routing decision
  // MUST still dispatch this snippet to moda even though it lacks
  // english_hash in frontmatter (the cohort-state shape). The
  // engine-side force flag handles cache invalidation; the routing
  // decision continues to treat the snippet as moda regardless.
  // Catches any future regression where someone adds an
  // english_hash precondition to the moda gate.
  const r = decideForgeRouting('forge-moda/simulation.md', {
    type: 'action',
    featured: true,
    // NO english_hash — cohort state.
  });
  assert.equal(r.kind, 'moda');
});

test('parseRoutingFrontmatter: featured: "true" (quoted) coerces to boolean after quote-strip', () => {
  // The parser strips surrounding quotes BEFORE the bareword
  // coercion fires. So `featured: "true"` strips to `true` which
  // then coerces to boolean true. This is a deliberate
  // permissive read — authors who quote their booleans still get
  // routed correctly through decideForgeRouting's strict ===
  // boolean check.
  const body = '---\nfeatured: "true"\n---\n';
  const result = parseRoutingFrontmatter(body);
  assert.deepEqual(result, { featured: true });
});
