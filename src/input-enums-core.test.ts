import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInputEnums, initialEnumValue } from './input-enums-core.ts';

// drain 2026-07-31-1120 — enumerable run-inputs.

test('drain-1120: reads a well-formed input_enums map', () => {
  const fm = {
    inputs: ['tonic', 'quality'],
    input_enums: { quality: ['major', 'minor', 'diminished'] },
  };
  assert.deepEqual(parseInputEnums(fm), {
    quality: ['major', 'minor', 'diminished'],
  });
});

test('drain-1120: absent key means no enums, not an error', () => {
  assert.deepEqual(parseInputEnums({ inputs: ['tonic'] }), {});
  assert.deepEqual(parseInputEnums({}), {});
  assert.deepEqual(parseInputEnums(null), {});
  assert.deepEqual(parseInputEnums(undefined), {});
});

test('drain-1120: malformed input_enums degrades to no enums', () => {
  // Cohort-authored YAML; every one of these is reachable and none of
  // them should throw or produce a broken dropdown.
  assert.deepEqual(parseInputEnums({ input_enums: 'major' }), {});
  assert.deepEqual(parseInputEnums({ input_enums: ['major'] }), {});
  assert.deepEqual(parseInputEnums({ input_enums: { q: 'major' } }), {});
  assert.deepEqual(parseInputEnums({ input_enums: { q: 42 } }), {});
});

test('drain-1120: an EMPTY enum list falls back to a text box', () => {
  // A dropdown with no options is a dead end — the cohort would have
  // no way to enter a value at all. Dropping the entry means the input
  // renders as free text, which is strictly better than unusable.
  assert.deepEqual(parseInputEnums({ input_enums: { quality: [] } }), {});
});

test('drain-1120: non-string members are coerced, duplicates dropped', () => {
  // YAML turns bare 1/true into number/boolean; the run modal deals in
  // strings, and the JSON.parse in submit() turns "1" back into 1.
  assert.deepEqual(
    parseInputEnums({ input_enums: { n: [1, 2, 2, true, null] } }),
    { n: ['1', '2', 'true'] },
  );
});

test('drain-1120: partial adoption — some inputs enumerated, some not', () => {
  const fm = {
    inputs: ['tonic', 'quality'],
    input_enums: { quality: ['major', 'minor'] },
  };
  const enums = parseInputEnums(fm);
  assert.ok('quality' in enums);
  assert.ok(!('tonic' in enums), 'tonic must stay free-text');
});

test('drain-1120: cached value is preserved when still valid', () => {
  assert.equal(initialEnumValue('minor', ['major', 'minor']), 'minor');
});

test('drain-1120: cached value NOT in the enum falls back to first option', () => {
  // The author edited the enum after a cohort last ran the note.
  // Preserving the stale value would submit something the enum calls
  // invalid — the exact failure this feature exists to prevent.
  assert.equal(initialEnumValue('lydian', ['major', 'minor']), 'major');
  assert.equal(initialEnumValue(undefined, ['major', 'minor']), 'major');
  assert.equal(initialEnumValue('', ['major', 'minor']), 'major');
});

test('drain-1120: enum entries for unknown inputs are harmless', () => {
  // Author lists an enum for an input they later renamed. The modal
  // only looks up names it is rendering, so a stray entry is inert —
  // pinned so nobody "fixes" it into a hard error later.
  const enums = parseInputEnums({
    inputs: ['tonic'],
    input_enums: { quality: ['major'] },
  });
  assert.deepEqual(enums, { quality: ['major'] });
});
