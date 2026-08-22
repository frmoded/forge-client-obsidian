// TDD failing-test-first — drain 2026-08-23-0900.
//
// The `create_water_particles` production bug (simulation broken for
// every plugin user) is blocked on one datum: what the plugin's
// registry actually lists in a failing session. CCQA confirmed there is
// no eval surface to ask from DevTools (test-reports/
// 2026-08-22-1810-registry-probe-no-exec-surface.md), so the plugin has
// to be able to say it itself.
//
// This is the formatting half: the dump shape in, a report out. The
// question drain 1600 is stuck on is specifically "does a SNIPPET
// basename collide with an ENGINE CHIP name" — `_build_snippet_shims`
// installs one lambda per snippet basename and those are spread AFTER
// the domain globals, so a colliding snippet SHADOWS the engine chip.
// The chip set is passed in, derived at runtime from the engine's own
// _DOMAIN_GLOBALS; hand-listing it here would be a copy that goes stale
// the first time a chip is added.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  shimShadowCandidates,
  summarizeVaults,
  formatRegistryInventory,
  type RegistryInventoryDump,
} from './registry-inventory-core.ts';

const DUMP: RegistryInventoryDump = {
  snippets: {
    authoring: [
      { id: 'water/create_water_particles', type: 'action', inputs: [] },
      { id: 'mood', type: 'action', inputs: ['mood'] },
    ],
    builtin: [
      { id: 'forge-moda/setup', type: 'action', inputs: [] },
    ],
  },
  resolutionOrder: ['authoring', 'builtin'],
  vaultKeys: ['authoring', 'builtin'],
  chipNames: ['create_chamber', 'create_water_particles', 'nth'],
  domains: ['moda', 'music'],
};

test('a snippet whose basename is an engine chip name is flagged as a shim shadow', () => {
  const hits = shimShadowCandidates(DUMP);
  assert.deepEqual(hits, [
    { basename: 'create_water_particles', id: 'water/create_water_particles', vault: 'authoring' },
  ]);
});

test('the basename is the LAST path segment, which is what the shim is keyed by', () => {
  const hits = shimShadowCandidates({
    ...DUMP,
    snippets: { authoring: [{ id: 'a/b/c/nth', type: 'action', inputs: [] }] },
  });
  assert.deepEqual(hits.map(h => h.basename), ['nth']);
});

test('non-vacuity: an inventory that shadows nothing produces no hits', () => {
  // Without this, a detector that returned [] unconditionally would
  // pass every "no shadow found" reading in a real session — and that
  // reading is the one that would send drain 1600 down a wrong path.
  const hits = shimShadowCandidates({
    ...DUMP,
    snippets: { authoring: [{ id: 'water/spawn_particles', type: 'action', inputs: [] }] },
  });
  assert.deepEqual(hits, []);
});

test('non-vacuity: the chip set comes from the dump, not from a list in this file', () => {
  // Same inventory, different engine chip set => different verdict.
  // A hand-listed chip set would answer the same both times.
  const inventory = { authoring: [{ id: 'chamber/create_chamber', type: 'action', inputs: [] }] };
  assert.deepEqual(
    shimShadowCandidates({ ...DUMP, snippets: inventory, chipNames: [] }), []);
  assert.deepEqual(
    shimShadowCandidates({ ...DUMP, snippets: inventory, chipNames: ['create_chamber'] }).length, 1);

  const source = readFileSync(join(import.meta.dirname, 'registry-inventory-core.ts'), 'utf8');
  assert.doesNotMatch(source, /create_water_particles/,
    'the probe must not hard-code the name it is looking for');
  assert.doesNotMatch(source, /create_chamber/,
    'the probe must not carry a copy of the engine chip list');
});

test('vaults are summarized with a count and the full id list, in registry order', () => {
  const vaults = summarizeVaults(DUMP);
  assert.deepEqual(vaults, [
    { vault: 'authoring', count: 2, ids: ['mood', 'water/create_water_particles'] },
    { vault: 'builtin', count: 1, ids: ['forge-moda/setup'] },
  ]);
});

test('a vault the registry orders but never scanned still appears, with zero', () => {
  // L32: an empty set must be visible as empty, not absent. A vault in
  // the resolution order with no entries is exactly the finding the
  // forge-tutorial/`authoring` mounting question needs to be able to
  // show.
  const vaults = summarizeVaults({
    ...DUMP,
    resolutionOrder: ['authoring', 'forge-tutorial', 'builtin'],
    vaultKeys: ['authoring', 'forge-tutorial', 'builtin'],
    snippets: { authoring: [{ id: 'mood', type: 'action', inputs: [] }], builtin: [] },
  });
  assert.deepEqual(vaults.map(v => [v.vault, v.count]), [
    ['authoring', 1], ['forge-tutorial', 0], ['builtin', 0],
  ]);
});

test('the report states the resolution order and the vault keys the registry sees', () => {
  const text = formatRegistryInventory(DUMP);
  assert.match(text, /Resolution order: authoring → builtin/);
  assert.match(text, /Vault keys: authoring, builtin/);
  assert.match(text, /Active domains: moda, music/);
});

test('the report leads with the shadow section, naming each collision', () => {
  const text = formatRegistryInventory(DUMP);
  const shadowAt = text.indexOf('SHIM SHADOW');
  const vaultsAt = text.indexOf('authoring — 2 snippets');
  assert.ok(shadowAt >= 0, 'shadow section missing');
  assert.ok(shadowAt < vaultsAt, 'the answer to the open question must come first');
  assert.match(text, /create_water_particles/);
  assert.match(text, /water\/create_water_particles/);
  assert.match(text, /shadow/i);
});

test('with no collisions the report SAYS so rather than omitting the section', () => {
  // A missing section reads as "not checked". The probe exists to
  // settle a question; both answers have to be legible.
  const text = formatRegistryInventory({
    ...DUMP,
    snippets: { authoring: [{ id: 'mood', type: 'action', inputs: [] }] },
  });
  assert.match(text, /SHIM SHADOW/);
  assert.match(text, /none/i);
});

test('the report lists every snippet id, so the dump is a dump', () => {
  const text = formatRegistryInventory(DUMP);
  for (const id of ['mood', 'water/create_water_particles', 'forge-moda/setup']) {
    assert.ok(text.includes(id), `id '${id}' missing from the dump`);
  }
  assert.match(text, /3 snippets across 2 vaults/);
});

test('an empty registry is reported as empty, not as a blank report', () => {
  const text = formatRegistryInventory({
    snippets: {}, resolutionOrder: [], vaultKeys: [], chipNames: [], domains: [],
  });
  assert.match(text, /0 snippets across 0 vaults/);
  assert.match(text, /SHIM SHADOW/);
  // A registry with no chips at all is itself a finding worth seeing.
  assert.match(text, /chip names/i);
});
