import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSlotCacheMissFromPythonError } from './slot-cache-miss-python-error-core.ts';

// ---------------------------------------------------------------------
// Drain 2026-08-30-0945 — writeSourcePythonBack has no self-heal for
// SlotCacheMissError.
//
// The engine's SlotCacheMissError deliberately JSON-encodes its
// payload into the exception message BECAUSE Pyodide surfaces the
// str() of a Python exception as the JS Error's message
// (forge/core/slot_cache.py's own docstring: "Encode the missing list
// as JSON in the message so the Pyodide -> JS exception boundary
// preserves the structure"). Verified directly against the real
// exception in the engine's own venv:
//
//   str(SlotCacheMissError([...]))
//     == '{"slot_cache_miss": [{"slot_text": ..., "snippet_id": ...,
//         "surrounding_context": ...}]}'
//
// Pyodide's own PythonError wrapping additionally prefixes the
// qualified exception type name ("forge.core.slot_cache.
// SlotCacheMissError: ") and MAY prepend a Python traceback above
// that — confirmed by the driver's live trace showing exactly that
// shape. The parser below does not assume a fixed prefix; it finds
// the JSON payload wherever it sits in the message.

test('THE CASE: parses the exact shape from the driver\'s live trace', () => {
  const message = 'PythonError: forge.core.slot_cache.SlotCacheMissError: '
    + '{"slot_cache_miss": [{"slot_text": "a random fun fact about octopuses", '
    + '"snippet_id": "octopus_fact", "surrounding_context": ""}]}';
  const missing = parseSlotCacheMissFromPythonError(message);
  assert.deepEqual(missing, [
    { slot_text: 'a random fun fact about octopuses', snippet_id: 'octopus_fact', surrounding_context: '' },
  ]);
});

test('parses the exact string measured directly against the real engine exception', () => {
  // str(SlotCacheMissError(missing)) in forge's own venv, byte-for-byte.
  const message = '{"slot_cache_miss": [{"slot_text": "a random fun fact about octopuses", '
    + '"snippet_id": "octopus_fact", "surrounding_context": ""}]}';
  const missing = parseSlotCacheMissFromPythonError(message);
  assert.equal(missing?.length, 1);
  assert.equal(missing?.[0].slot_text, 'a random fun fact about octopuses');
});

test('multiple missing slots, in document order', () => {
  const message = 'SlotCacheMissError: {"slot_cache_miss": ['
    + '{"slot_text": "a", "snippet_id": "n", "surrounding_context": ""},'
    + '{"slot_text": "b", "snippet_id": "n", "surrounding_context": "ctx"}'
    + ']}';
  const missing = parseSlotCacheMissFromPythonError(message);
  assert.deepEqual(missing, [
    { slot_text: 'a', snippet_id: 'n', surrounding_context: '' },
    { slot_text: 'b', snippet_id: 'n', surrounding_context: 'ctx' },
  ]);
});

test('NON-VACUITY: a traceback WITH braces elsewhere but no slot_cache_miss key returns null', () => {
  const message = 'PythonError: some.other.Error: {"detail": "unrelated"}';
  assert.equal(parseSlotCacheMissFromPythonError(message), null);
});

test('NON-VACUITY: an ordinary error with no JSON at all returns null', () => {
  assert.equal(parseSlotCacheMissFromPythonError('PythonError: KeyError: \'missing\''), null);
});

test('NON-VACUITY: malformed/truncated JSON returns null rather than throwing', () => {
  const message = 'SlotCacheMissError: {"slot_cache_miss": [{"slot_text": "a"';
  assert.equal(parseSlotCacheMissFromPythonError(message), null);
});

test('empty missing list still parses (degenerate but valid shape)', () => {
  const message = '{"slot_cache_miss": []}';
  assert.deepEqual(parseSlotCacheMissFromPythonError(message), []);
});

test('a slot_cache_miss value that is not an array returns null', () => {
  const message = '{"slot_cache_miss": "not-a-list"}';
  assert.equal(parseSlotCacheMissFromPythonError(message), null);
});

test('handles a leading Python traceback before the exception line (realistic Pyodide shape)', () => {
  const message = [
    'Traceback (most recent call last):',
    '  File "<pyodide>", line 12, in _forge_resolve_action_code',
    '  File "executor.py", line 42, in resolve_action_code',
    'forge.core.slot_cache.SlotCacheMissError: {"slot_cache_miss": '
      + '[{"slot_text": "x", "snippet_id": "y", "surrounding_context": ""}]}',
  ].join('\n');
  const missing = parseSlotCacheMissFromPythonError(message);
  assert.equal(missing?.length, 1);
  assert.equal(missing?.[0].snippet_id, 'y');
});

test('null/undefined input returns null, does not throw', () => {
  assert.equal(parseSlotCacheMissFromPythonError(''), null);
});

// ---------------------------------------------------------------------
// WIRING — writeSourcePythonBack must actually self-heal, not just
// have a parser sitting unused. The pure-core parser above cannot see
// whether main.ts ever calls it; this test does.

import { readFileSync } from 'node:fs';

test('drain 0945 WIRED: writeSourcePythonBack catches, parses, resolves, and retries', () => {
  const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  const fnStart = main.indexOf('private async writeSourcePythonBack(');
  const fn = main.slice(
    fnStart,
    fnStart + main.slice(fnStart).indexOf('\n  }\n') + 4,
  );
  assert.match(fn, /parseSlotCacheMissFromPythonError\(/,
    'writeSourcePythonBack never attempts to parse a SlotCacheMissError from the caught failure');
  assert.match(fn, /this\.resolveMissingSlotsViaAlpha\(/,
    'writeSourcePythonBack never calls the shared slot-resolution helper — it would still swallow the miss');
  assert.match(fn, /slotResolutions/,
    'a retry is attempted but never passes the resolved slots back to resolveActionCode');
  // The retry must reach resolveActionCode a SECOND time (the first
  // call is the one that raised). Two occurrences confirms a retry
  // exists rather than only the original attempt.
  const callCount = [...fn.matchAll(/\.resolveActionCode\(/g)].length;
  assert.ok(callCount >= 2,
    `expected resolveActionCode called at least twice (original + retry), found ${callCount}`);
});
