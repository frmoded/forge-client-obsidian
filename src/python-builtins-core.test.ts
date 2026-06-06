// Pure-core tests for the B7.2 Python-builtin recognition helper.
// Runs under `node --test` — no obsidian shim needed because
// python-builtins-core has no obsidian imports.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PYTHON_BUILTINS,
  isPythonBuiltin,
  bareWikilinkTarget,
} from './python-builtins-core.ts';

// --- isPythonBuiltin ---

test('isPythonBuiltin: print → true', () => {
  assert.equal(isPythonBuiltin('print'), true);
});

test('isPythonBuiltin: len → true', () => {
  assert.equal(isPythonBuiltin('len'), true);
});

test('isPythonBuiltin: my_snippet → false (not a recognized builtin)', () => {
  assert.equal(isPythonBuiltin('my_snippet'), false);
});

test('isPythonBuiltin: Print → false (case-sensitive, Python is case-sensitive)', () => {
  // Python's `Print` is NOT `print`. Don't normalize.
  assert.equal(isPythonBuiltin('Print'), false);
  assert.equal(isPythonBuiltin('LEN'), false);
  assert.equal(isPythonBuiltin('Str'), false);
});

test('isPythonBuiltin: empty string → false (defensive)', () => {
  assert.equal(isPythonBuiltin(''), false);
});

test('isPythonBuiltin: print#heading → false (caller must strip subpaths first)', () => {
  // The helper itself doesn't strip; bareWikilinkTarget is the
  // sanitize step. Document the contract.
  assert.equal(isPythonBuiltin('print#heading'), false);
});

test('isPythonBuiltin: idempotent (same input → same output)', () => {
  const a = isPythonBuiltin('print');
  const b = isPythonBuiltin('print');
  assert.equal(a, b);
});

test('PYTHON_BUILTINS is a Set (O(1) lookup, not array)', () => {
  assert.ok(PYTHON_BUILTINS instanceof Set);
});

// --- B7.2 constitution-verbatim coverage ---
// Each name from the constitution's B7.2 list gets an explicit
// assertion. Future amendments to B7.2 should add or remove cases
// here in lockstep with the Set in python-builtins-core.ts.

const B7_2_NAMES = [
  'print', 'input', 'open',
  'len', 'range', 'enumerate', 'zip', 'map', 'filter',
  'sorted', 'reversed', 'min', 'max', 'sum',
  'str', 'int', 'float', 'bool', 'list', 'dict', 'set', 'tuple',
  'type', 'isinstance', 'hasattr', 'getattr', 'setattr',
  'abs', 'round',
];

for (const name of B7_2_NAMES) {
  test(`isPythonBuiltin: B7.2 constitution name '${name}' → true`, () => {
    assert.equal(isPythonBuiltin(name), true,
      `'${name}' from constitution B7.2 missing from PYTHON_BUILTINS Set`);
  });
}

test('PYTHON_BUILTINS exhaustive count matches B7.2 (29)', () => {
  // If B7.2 grows, update this number + add the new name to
  // B7_2_NAMES above.
  assert.equal(PYTHON_BUILTINS.size, B7_2_NAMES.length);
  assert.equal(PYTHON_BUILTINS.size, 29);
});

// --- bareWikilinkTarget ---

test('bareWikilinkTarget: bare name passes through unchanged', () => {
  assert.equal(bareWikilinkTarget('print'), 'print');
});

test('bareWikilinkTarget: strips heading anchor', () => {
  assert.equal(bareWikilinkTarget('print#section'), 'print');
});

test('bareWikilinkTarget: strips display alias', () => {
  assert.equal(bareWikilinkTarget('print|the print builtin'), 'print');
});

test('bareWikilinkTarget: strips at first delimiter (heading wins over alias)', () => {
  assert.equal(bareWikilinkTarget('print#foo|bar'), 'print');
  assert.equal(bareWikilinkTarget('print|alias#foo'), 'print');
});

test('bareWikilinkTarget: trims whitespace around bare target', () => {
  assert.equal(bareWikilinkTarget('  print  '), 'print');
});

test('bareWikilinkTarget: empty input → empty string (defensive)', () => {
  assert.equal(bareWikilinkTarget(''), '');
});

test('bareWikilinkTarget + isPythonBuiltin: end-to-end check', () => {
  // The canonical caller pattern: extract from DOM, sanitize, check.
  const rawFromDom = 'print#docs';
  const target = bareWikilinkTarget(rawFromDom);
  assert.equal(target, 'print');
  assert.equal(isPythonBuiltin(target), true);
});
