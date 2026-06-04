// Pure-core tests for domain-activation-core.ts.
//
// v0.2.45 — bug fix: EditVaultDomainsModal.applyDiff updated forge.toml
// but never re-fired the domain-gated onload paths (moda command
// registration; forge-music bundled-vault extraction). User had to
// fully quit Obsidian + reopen to see the effect of their domain
// change. Surfaced by the mint-laptop V1 smoke (2026-06-03 evening).
//
// This pure-core helper decides which actions to fire when the active-
// domain set transitions from old → new, given the inventory of which
// domains require which onload-equivalent work (bundled-vault extract,
// command registration).
//
// Pure-core extraction No. 14 (v0.2.45). Removal-side is deferred per
// the modal's existing "files stay on disk" semantics for domain
// removals — that's documented in §2 of the feedback and reflected
// in the test cases below (case 4 + 5).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDomainActivationActions,
  type DomainInventoryEntry,
} from './domain-activation-core.ts';

const INVENTORY: DomainInventoryEntry[] = [
  { id: 'moda',  extractOnActivate: false, registerCommandsOnActivate: true  },
  { id: 'music', extractOnActivate: true,  registerCommandsOnActivate: true  },
];

test('computeDomainActivationActions: old=[], new=["moda"] → register-commands only (moda not bundled-gated)', () => {
  const actions = computeDomainActivationActions(new Set(), new Set(['moda']), INVENTORY);
  assert.deepEqual(actions, [
    { type: 'register-commands', domain: 'moda' },
  ]);
});

test('computeDomainActivationActions: old=[], new=["music"] → extract + register-commands (music is bundled-extracted)', () => {
  const actions = computeDomainActivationActions(new Set(), new Set(['music']), INVENTORY);
  assert.deepEqual(actions, [
    { type: 'extract', domain: 'music' },
    { type: 'register-commands', domain: 'music' },
  ]);
});

test('computeDomainActivationActions: old=["moda"], new=["moda","music"] → only the new music actions (moda already active)', () => {
  const actions = computeDomainActivationActions(
    new Set(['moda']),
    new Set(['moda', 'music']),
    INVENTORY,
  );
  assert.deepEqual(actions, [
    { type: 'extract', domain: 'music' },
    { type: 'register-commands', domain: 'music' },
  ]);
});

test('computeDomainActivationActions: old=["music"], new=[] → no actions (removal is deferred per modal semantics)', () => {
  // The modal already leaves extracted vault files on disk when a
  // domain is removed (per its current "files stay on disk"
  // semantics). The helper mirrors that — no unregister-commands
  // emitted either. Re-adding the domain in a future session
  // re-fires the activation actions, which is idempotent.
  const actions = computeDomainActivationActions(new Set(['music']), new Set(), INVENTORY);
  assert.deepEqual(actions, []);
});

test('computeDomainActivationActions: old=null (all-active), new=["moda"] → no actions (moda was already implicitly active)', () => {
  // null on the old side means "back-compat all-active" — every known
  // domain is treated as implicitly active. Transitioning to a
  // restricted set narrows the active set; no NEW activations fire.
  // The deferred-removal rule (case 4) covers the implicit
  // deactivations.
  const actions = computeDomainActivationActions(null, new Set(['moda']), INVENTORY);
  assert.deepEqual(actions, []);
});

test('computeDomainActivationActions: old=["moda"], new=null → register all remaining domains (back to all-active)', () => {
  // The inverse of case 5: transitioning from a restricted set to
  // null (no declaration / unreadable forge.toml) makes every
  // known domain newly-active. For each known domain not in old,
  // fire its activation actions.
  const actions = computeDomainActivationActions(new Set(['moda']), null, INVENTORY);
  assert.deepEqual(actions, [
    { type: 'extract', domain: 'music' },
    { type: 'register-commands', domain: 'music' },
  ]);
});

test('computeDomainActivationActions: old=null, new=null → no actions (no transition)', () => {
  // Both null = back-compat all-active on both sides; nothing
  // changed.
  const actions = computeDomainActivationActions(null, null, INVENTORY);
  assert.deepEqual(actions, []);
});

test('computeDomainActivationActions: order — extracts before register-commands for each newly-active domain', () => {
  // Natural dependency: bundled content must exist on disk before
  // commands that reference it can be registered. The helper
  // emits ALL extracts before ANY register-commands, not
  // interleaved per-domain.
  const actions = computeDomainActivationActions(
    new Set(),
    new Set(['moda', 'music']),
    INVENTORY,
  );
  // music extract first (music.extractOnActivate=true, moda's is false)
  // then both register-commands actions (declaration-order: moda first, music second).
  assert.deepEqual(actions, [
    { type: 'extract', domain: 'music' },
    { type: 'register-commands', domain: 'moda' },
    { type: 'register-commands', domain: 'music' },
  ]);
});

test('computeDomainActivationActions: idempotent — re-firing on same state yields no actions', () => {
  // No-op-should-remain-no-op per the cc-prompt-queue.md idempotent-
  // helper rider. If the modal happens to be re-opened and saved
  // without changes (or applyDiff is called twice for any reason),
  // no spurious actions should fire.
  const before = new Set(['moda', 'music']);
  const actions = computeDomainActivationActions(before, new Set(['moda', 'music']), INVENTORY);
  assert.deepEqual(actions, []);
});
