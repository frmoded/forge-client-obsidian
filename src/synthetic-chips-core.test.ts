// Pure-core tests for synthetic-chips-core. Runs under `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSyntheticChips,
  mergeSyntheticChipsHigherWins,
  applyHideToSyntheticChips,
  DEFAULT_SYNTHETIC_GROUP,
  type SyntheticChip,
} from './synthetic-chips-core.ts';

// --- parseSyntheticChips ---

test('parseSyntheticChips: valid entries → returns list with defaults applied', () => {
  const out = parseSyntheticChips({
    synthetic_chips: [
      { label: 'print', insertion: 'Do [[print]]("<msg>").', group: 'Builtins', order: 1 },
      { label: 'Set', insertion: 'Set <var> to <value>.', group: 'Statements' },
      // Implicit defaults for group + order.
      { label: 'If', insertion: 'If <cond>:' },
    ],
  });
  assert.equal(out.length, 3);
  assert.equal(out[0].label, 'print');
  assert.equal(out[0].group, 'Builtins');
  assert.equal(out[0].order, 1);
  assert.equal(out[1].order, undefined);
  assert.equal(out[2].group, DEFAULT_SYNTHETIC_GROUP);
});

test('parseSyntheticChips: entry missing label → dropped, rest of file processed', () => {
  const out = parseSyntheticChips({
    synthetic_chips: [
      { label: 'good', insertion: 'X' },
      { insertion: 'Y' },              // missing label → drop
      { label: 'also-good', insertion: 'Z' },
    ],
  });
  assert.equal(out.length, 2);
  assert.deepEqual(out.map(c => c.label), ['good', 'also-good']);
});

test('parseSyntheticChips: entry missing insertion → dropped', () => {
  const out = parseSyntheticChips({
    synthetic_chips: [
      { label: 'good', insertion: 'X' },
      { label: 'no-insertion' },       // missing insertion → drop
    ],
  });
  assert.equal(out.length, 1);
});

test('parseSyntheticChips: multi-line insertion via YAML | → preserved verbatim', () => {
  // Caller hands us the already-decoded YAML; for `|` scalars the
  // string includes embedded newlines. Verify they pass through.
  const multiLine = 'If <cond>:\n    <body>';
  const out = parseSyntheticChips({
    synthetic_chips: [
      { label: 'If', insertion: multiLine, group: 'Statements' },
    ],
  });
  assert.equal(out[0].insertion, multiLine);
});

test('parseSyntheticChips: group defaults to "Synthetic" when absent', () => {
  const out = parseSyntheticChips({
    synthetic_chips: [{ label: 'x', insertion: 'y' }],
  });
  assert.equal(out[0].group, 'Synthetic');
});

test('parseSyntheticChips: order defaults to undefined (declaration order) when absent', () => {
  const out = parseSyntheticChips({
    synthetic_chips: [
      { label: 'a', insertion: 'A' },
      { label: 'b', insertion: 'B', order: 5 },
      { label: 'c', insertion: 'C' },
    ],
  });
  assert.equal(out[0].order, undefined);
  assert.equal(out[1].order, 5);
  assert.equal(out[2].order, undefined);
});

test('parseSyntheticChips: empty synthetic_chips array → []', () => {
  const out = parseSyntheticChips({ synthetic_chips: [] });
  assert.deepEqual(out, []);
});

test('parseSyntheticChips: missing synthetic_chips key → [] (v2 back-compat)', () => {
  const out = parseSyntheticChips({ schema_version: 2 });
  assert.deepEqual(out, []);
});

test('parseSyntheticChips: non-object input → [] (defensive)', () => {
  assert.deepEqual(parseSyntheticChips(null), []);
  assert.deepEqual(parseSyntheticChips('not an object'), []);
  assert.deepEqual(parseSyntheticChips(42), []);
});

test('parseSyntheticChips: non-array synthetic_chips → [] with warning', () => {
  const out = parseSyntheticChips({ synthetic_chips: 'not an array' });
  assert.deepEqual(out, []);
});

test('parseSyntheticChips: non-object entry dropped (e.g. string)', () => {
  const out = parseSyntheticChips({
    synthetic_chips: [
      { label: 'good', insertion: 'X' },
      'string',
      ['array'],
    ],
  });
  assert.equal(out.length, 1);
});

test('parseSyntheticChips: non-finite order ignored (falls back to declaration order)', () => {
  const out = parseSyntheticChips({
    synthetic_chips: [
      { label: 'a', insertion: 'X', order: Infinity },
      { label: 'b', insertion: 'Y', order: NaN },
      { label: 'c', insertion: 'Z', order: 'not a number' },
    ],
  });
  assert.equal(out[0].order, undefined);
  assert.equal(out[1].order, undefined);
  assert.equal(out[2].order, undefined);
});

// --- mergeSyntheticChipsHigherWins ---

test('mergeSyntheticChipsHigherWins: same-label higher-specificity wins (first wins)', () => {
  // Caller passes most-specific FIRST.
  const chapter1: SyntheticChip[] = [
    { label: 'print', insertion: 'CHAPTER 1 print', group: 'Builtins' },
  ];
  const vaultRoot: SyntheticChip[] = [
    { label: 'print', insertion: 'GLOBAL print', group: 'Builtins' },
    { label: 'Set', insertion: 'Set X.', group: 'Statements' },
  ];
  const merged = mergeSyntheticChipsHigherWins([chapter1, vaultRoot]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].insertion, 'CHAPTER 1 print');
  assert.equal(merged[1].label, 'Set');
});

test('mergeSyntheticChipsHigherWins: distinct labels accumulate across levels', () => {
  const a: SyntheticChip[] = [{ label: 'a', insertion: 'A', group: 'G' }];
  const b: SyntheticChip[] = [{ label: 'b', insertion: 'B', group: 'G' }];
  const c: SyntheticChip[] = [{ label: 'c', insertion: 'C', group: 'G' }];
  const merged = mergeSyntheticChipsHigherWins([a, b, c]);
  assert.deepEqual(merged.map(x => x.label), ['a', 'b', 'c']);
});

test('mergeSyntheticChipsHigherWins: empty levels handled gracefully', () => {
  const empty: SyntheticChip[] = [];
  const a: SyntheticChip[] = [{ label: 'a', insertion: 'A', group: 'G' }];
  const merged = mergeSyntheticChipsHigherWins([empty, a, empty]);
  assert.equal(merged.length, 1);
});

test('mergeSyntheticChipsHigherWins: idempotent', () => {
  const levels: SyntheticChip[][] = [
    [{ label: 'a', insertion: 'A', group: 'G' }],
    [{ label: 'b', insertion: 'B', group: 'G' }],
  ];
  const a = mergeSyntheticChipsHigherWins(levels);
  const b = mergeSyntheticChipsHigherWins(levels);
  assert.deepEqual(a, b);
});

// --- applyHideToSyntheticChips ---

test('applyHideToSyntheticChips: removes synthetic chips whose label is in hide[]', () => {
  const chips: SyntheticChip[] = [
    { label: 'print', insertion: 'X', group: 'G' },
    { label: 'Set', insertion: 'Y', group: 'G' },
    { label: 'If', insertion: 'Z', group: 'G' },
  ];
  const out = applyHideToSyntheticChips(chips, ['Set', 'If']);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, 'print');
});

test('applyHideToSyntheticChips: empty / undefined hide → returns shallow copy', () => {
  const chips: SyntheticChip[] = [{ label: 'x', insertion: 'X', group: 'G' }];
  const out1 = applyHideToSyntheticChips(chips, undefined);
  const out2 = applyHideToSyntheticChips(chips, []);
  assert.equal(out1.length, 1);
  assert.equal(out2.length, 1);
  assert.notEqual(out1, chips);  // copy, not original reference
});

test('DEFAULT_SYNTHETIC_GROUP exported as "Synthetic"', () => {
  assert.equal(DEFAULT_SYNTHETIC_GROUP, 'Synthetic');
});
