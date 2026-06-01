// TDD failing-test-first for v0.2.24 frontmatter-inputs reconciliation.
//
// Bug: after /generate writes a new Python facet, the frontmatter
// `inputs:` field stays in whatever shape the user authored —
// usually empty. A Greet.md with `inputs:` empty + `def compute(
// context, name)` is functionally correct (v0.2.20's
// _forge_get_input_names parses the signature at runtime), but the
// file looks self-contradictory to a student reader.
//
// Fix shape: after writeGeneratedCode lands the Python, plugin
// calls `_forge_get_input_names` for the canonical list and writes
// it back into the frontmatter `inputs:` via processFrontMatter.
// Idempotent on no-op (don't churn unchanged files).
//
// Per cc-prompt-queue.md §57-78 TDD hard rule: failing tests added
// BEFORE the fix. Pure-core extraction per §80 + the established
// pattern (9th extraction in the v0.2.x arc).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileInputs,
  type InputsReconcileAdapter,
} from './frontmatter-inputs-reconcile.ts';

function makeAdapter(opts: {
  inferred: string[] | (() => Promise<string[]>);
  current: string[];
}): {
  adapter: InputsReconcileAdapter;
  state: { written: string[] | null; writeCalls: number };
} {
  const state = { written: null as string[] | null, writeCalls: 0 };
  const adapter: InputsReconcileAdapter = {
    getInferredInputs: async () =>
      typeof opts.inferred === 'function' ? opts.inferred() : opts.inferred,
    readCurrentInputs: () => opts.current,
    writeInputs: async (next) => {
      state.written = next;
      state.writeCalls++;
    },
  };
  return { adapter, state };
}

// (1) Existence sanity check — fails until the file is created.
test('reconcile-inputs: reconcileInputs is callable + exports the adapter type', async () => {
  assert.equal(typeof reconcileInputs, 'function');
});

// (2) The Greet case: empty current + inferred ['name'] → writes ['name'].
test('reconcile-inputs: empty current + inferred ["name"] writes ["name"]', async () => {
  const { adapter, state } = makeAdapter({
    inferred: ['name'],
    current: [],
  });
  const result = await reconcileInputs('Greet', adapter);
  assert.equal(result.status, 'wrote');
  assert.deepEqual(result.inputs, ['name']);
  assert.deepEqual(state.written, ['name']);
  assert.equal(state.writeCalls, 1);
});

// (3) Idempotent: current already matches inferred → no-op, no write.
test('reconcile-inputs: matching current + inferred is a no-op', async () => {
  const { adapter, state } = makeAdapter({
    inferred: ['name'],
    current: ['name'],
  });
  const result = await reconcileInputs('Greet', adapter);
  assert.equal(result.status, 'no-op');
  assert.deepEqual(result.inputs, ['name']);
  assert.equal(state.writeCalls, 0);
  assert.equal(state.written, null);
});

// (4) Union semantics: current declared list ['name'] + inferred adds
// ['name', 'age'] → writes ['name', 'age']. Declared-first ordering
// preserved (which is what _forge_get_input_names produces).
test('reconcile-inputs: declared-plus-extras writes the union', async () => {
  const { adapter, state } = makeAdapter({
    inferred: ['name', 'age'],
    current: ['name'],
  });
  const result = await reconcileInputs('Greet', adapter);
  assert.equal(result.status, 'wrote');
  assert.deepEqual(result.inputs, ['name', 'age']);
  assert.deepEqual(state.written, ['name', 'age']);
});

// (5) Defensive: getInferredInputs throwing → skipped, no write.
// The reconciliation is best-effort; a Pyodide host failure
// shouldn't crash the post-/generate path.
test('reconcile-inputs: getInferredInputs throw is skipped, not propagated', async () => {
  const { adapter, state } = makeAdapter({
    inferred: async () => {
      throw new Error('Pyodide host not wired');
    },
    current: ['name'],
  });
  const result = await reconcileInputs('Greet', adapter);
  assert.equal(result.status, 'skipped');
  assert.deepEqual(result.inputs, []);
  assert.equal(state.writeCalls, 0);
});
