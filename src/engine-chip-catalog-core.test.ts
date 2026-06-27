// v0.2.206 — pure-core tests for the engine-chip catalog parser.

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';

import {
  parseEngineLib,
  synthesizeRecipeSignature,
  buildEngineChipIndex,
  findEngineChip,
} from './engine-chip-catalog-core.ts';

const SAMPLE_LIB = `from music21 import note

def kick():
  """Kick drum (bass drum). GM note 36 (Bass Drum 1)."""
  return 1

def _private_helper(x):
  """Should be filtered out."""
  return x

def play_at_beats(instrument, beats):
  """Build a music21 Part with one quarter-note hit per beat position.
  \`beats\` is 1-INDEXED (beat 1 = first beat of the bar = offset 0.0).

  Args:
    instrument: ...
    beats: ...

  Returns:
    music21.stream.Part
  """
  return None

def variadic_only(*items):
  """Should be filtered — V2 Recipe can't pass *args."""
  return list(items)

def mixed_positional(state, *more, count=10):
  """Mixed shape — kept (state + count are kwarg-callable)."""
  return state
`;

describe('parseEngineLib', () => {
  test('discovers public top-level defs', () => {
    const chips = parseEngineLib(SAMPLE_LIB);
    const names = chips.map(c => c.name);
    assert.ok(names.includes('kick'));
    assert.ok(names.includes('play_at_beats'));
  });

  test('filters underscore-prefix private names', () => {
    const chips = parseEngineLib(SAMPLE_LIB);
    const names = chips.map(c => c.name);
    assert.ok(!names.includes('_private_helper'));
  });

  test('filters bare *args-only callables', () => {
    const chips = parseEngineLib(SAMPLE_LIB);
    const names = chips.map(c => c.name);
    assert.ok(!names.includes('variadic_only'));
  });

  test('keeps mixed-shape callables (positional + *args + kwonly)', () => {
    const chips = parseEngineLib(SAMPLE_LIB);
    const names = chips.map(c => c.name);
    // Note: parser currently keeps these because they have at least
    // one named param; service AST also keeps them.
    assert.ok(names.includes('mixed_positional'));
  });

  test('extracts first-paragraph docstring with collapsed whitespace', () => {
    const chips = parseEngineLib(SAMPLE_LIB);
    const pab = chips.find(c => c.name === 'play_at_beats')!;
    assert.match(pab.description, /quarter-note hit per beat position/);
    assert.match(pab.description, /1-INDEXED/);
    // Multi-line internal whitespace collapses to single spaces.
    assert.ok(!pab.description.includes('\n'));
  });

  test('extracts parameter names', () => {
    const chips = parseEngineLib(SAMPLE_LIB);
    const pab = chips.find(c => c.name === 'play_at_beats')!;
    assert.deepEqual(pab.inputs, ['instrument', 'beats']);
    const k = chips.find(c => c.name === 'kick')!;
    assert.deepEqual(k.inputs, []);
  });

  test('extracts full def-block source', () => {
    const chips = parseEngineLib(SAMPLE_LIB);
    const k = chips.find(c => c.name === 'kick')!;
    assert.match(k.pythonSource, /^def kick\(\):/);
    assert.match(k.pythonSource, /return 1/);
  });

  test('strips param type annotations', () => {
    const src = `def f(x: int, y: str = "a"):\n  """doc"""\n  return None\n`;
    const chips = parseEngineLib(src);
    assert.deepEqual(chips[0].inputs, ['x', 'y']);
  });

  test('handles multi-line def signature', () => {
    const src = `def f(\n    a,\n    b=2,\n    c=3,\n):\n  """multi-line def"""\n  return None\n`;
    const chips = parseEngineLib(src);
    assert.equal(chips.length, 1);
    assert.deepEqual(chips[0].inputs, ['a', 'b', 'c']);
  });

  test('no docstring → empty description', () => {
    const src = `def f():\n  return None\n`;
    const chips = parseEngineLib(src);
    assert.equal(chips[0].description, '');
  });
});

describe('synthesizeRecipeSignature', () => {
  test('zero-arg chip → shorthand .', () => {
    const chip = { name: 'kick', description: '', inputs: [], pythonSource: '' };
    assert.equal(synthesizeRecipeSignature(chip), '[[kick]].');
  });

  test('positional chip → kwarg call', () => {
    const chip = {
      name: 'play_at_beats',
      description: '',
      inputs: ['instrument', 'beats'],
      pythonSource: '',
    };
    assert.equal(
      synthesizeRecipeSignature(chip),
      'Call [[play_at_beats]] with instrument=<instrument>, beats=<beats>.',
    );
  });

  test('print is special-cased as statement shorthand', () => {
    // Per v0.2.200's print(text=) crash investigation: the catalog
    // must teach the statement form, NOT the kwarg form.
    const chip = { name: 'print', description: '', inputs: [], pythonSource: '' };
    const sig = synthesizeRecipeSignature(chip);
    assert.match(sig, /\[\[print\]\] <expr>\./);
  });
});

describe('buildEngineChipIndex + findEngineChip', () => {
  test('builds name → chip map across domains', () => {
    const music = parseEngineLib(SAMPLE_LIB);
    const index = buildEngineChipIndex({ music });
    assert.ok(findEngineChip(index, 'kick'));
    assert.ok(findEngineChip(index, 'play_at_beats'));
    assert.equal(findEngineChip(index, 'nonexistent'), null);
  });

  test('collision: later domain wins', () => {
    const a: any = { name: 'foo', description: 'A', inputs: [], pythonSource: '' };
    const b: any = { name: 'foo', description: 'B', inputs: [], pythonSource: '' };
    const index = buildEngineChipIndex({ first: [a], second: [b] });
    assert.equal(findEngineChip(index, 'foo')?.description, 'B');
  });
});

describe('integration: real engine bundle parses cleanly', () => {
  // Spot-check that the actual vendored engine source parses without
  // errors and produces sensible chips. If the engine changes shape
  // (e.g. switches to decorators), this catches the regression.

  test('forge.music.lib has kick + play_at_beats + play_at_offsets', () => {
    const path = 'assets/engine/forge/music/lib.py';
    if (!fs.existsSync(path)) {
      // Test runs from worktree root; CI may differ.
      return;
    }
    const src = fs.readFileSync(path, 'utf8');
    const chips = parseEngineLib(src);
    const names = chips.map(c => c.name);
    assert.ok(names.includes('kick'), `chips: ${names.join(', ')}`);
    assert.ok(names.includes('play_at_beats'));
    assert.ok(names.includes('play_at_offsets'));
  });

  test('forge.music.lib play_at_beats description carries 1-INDEXED', () => {
    const path = 'assets/engine/forge/music/lib.py';
    if (!fs.existsSync(path)) return;
    const src = fs.readFileSync(path, 'utf8');
    const chips = parseEngineLib(src);
    const pab = chips.find(c => c.name === 'play_at_beats');
    if (!pab) return;
    // Pairs with the v0.2.200 first-paragraph-must-mention-1-indexed
    // guard in tests/music/test_play_at_beats.py.
    assert.match(pab.description, /1-INDEXED/i);
  });
});
