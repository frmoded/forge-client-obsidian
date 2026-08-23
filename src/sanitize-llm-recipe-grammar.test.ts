// Drain 2026-08-24-1600 — P1: generated Python missing the declared
// input parameters.
//
// CCQA v0.2.365 bundle, 4/4 fresh Description-canonical notes with an
// input: correct-looking Recipe, but Python of the form
//   def compute(context):
//     result = (100 / divisor)
// — the declared parameter absent from the signature → NameError on
// every run.
//
// ROOT CAUSE (proven below, not hypothesised): sanitizeLlmRecipe's
// line-shape gate is a hand-written whitelist that recognises only
// `Let`, `Return` and `[[shorthand]]`. It was written at v0.2.280
// (drain 2200) and the grammar grew past it — `Input` landed in drain
// 2026-08-10-2000. Every `Input divisor: float = 2.0.` line is
// silently DELETED before transpile, so the signature is built from a
// module with no InputStmt while the body statements survive.
//
// The whitelist fails CLOSED on unknown grammar, which is the wrong
// direction for a filter whose stated job is stripping PROSE: an
// unrecognised valid statement is deleted in silence, and the note
// runs wrong rather than failing loudly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { sanitizeLlmRecipe } from './sanitize-llm-recipe-core.ts';

const REPO = process.cwd();
const ENGINE = path.join(REPO, 'assets', 'engine');
const PARSER_PY = path.join(ENGINE, 'forge', 'recipe', 'parser.py');

function resolvePython(): string | null {
  for (const py of [path.resolve(REPO, '..', 'forge', '.venv', 'bin', 'python'), 'python3']) {
    if (spawnSync(py, ['-c', 'import yaml'], { encoding: 'utf8' }).status === 0) return py;
  }
  return null;
}

/** Transpile through the REAL engine, the same code the plugin bundles. */
function transpile(recipe: string): string {
  const python = resolvePython();
  assert.ok(python, 'no python with pyyaml found (expected ../forge/.venv/bin/python)');
  const script = `
import sys, json
sys.path.insert(0, ${JSON.stringify(ENGINE)})
from forge.recipe import parse, transpile
print(transpile(parse(json.loads(sys.stdin.read()))))
`;
  const run = spawnSync(python!, ['-'], { input: script.replace('sys.stdin.read()', JSON.stringify(JSON.stringify(recipe))), encoding: 'utf8' });
  assert.equal(run.status, 0, `transpile harness failed:\n${run.stderr}`);
  return run.stdout;
}

// The driver-facing repro, verbatim shape from the CCQA report.
const CCQA_RECIPE = [
  'Input divisor: float = 2.0.',
  'Let result = 100 / divisor.',
  'Return result.',
].join('\n');

test('P1: the declared input survives sanitize and reaches the signature', () => {
  const sanitized = sanitizeLlmRecipe(CCQA_RECIPE);
  assert.ok(sanitized !== null);
  assert.match(sanitized!, /^Input divisor: float = 2\.0\.$/m, sanitized!);
  const py = transpile(sanitized!);
  assert.match(py, /def compute\(context, divisor: float = 2\.0\):/, py);
  // The exact failure CCQA saw: body present, parameter absent.
  assert.ok(!/def compute\(context\):/.test(py), py);
});

test('P1 non-vacuity: the unsanitized Recipe already transpiles correctly', () => {
  // Proves the defect is the sanitizer, not the grammar or the
  // transpiler — the same text through the engine alone is fine.
  const py = transpile(CCQA_RECIPE);
  assert.match(py, /def compute\(context, divisor: float = 2\.0\):/, py);
});

test('every statement head the real grammar accepts survives the sanitizer', () => {
  // DERIVED, not restated: the keyword list comes out of the engine's
  // own parser, so a grammar that grows again cannot silently outrun
  // this filter a second time.
  const src = fs.readFileSync(PARSER_PY, 'utf8');
  const heads = [...src.matchAll(/head\.kind == "KEYWORD" and head\.value == "(\w+)"/g)]
    .map((m) => m[1]);
  assert.ok(heads.length >= 6, `parser head extraction found ${heads.length}: ${heads}`);

  const sample: Record<string, string> = {
    Let: 'Let x = 1.',
    Input: 'Input n: int = 3.',
    Return: 'Return x.',
    Call: 'Call [[go]] with state=state.',
    Repeat: 'Repeat 3 times:',
    For: 'For each t in items:',
    If: 'If x > 0:',
  };
  const missing: string[] = [];
  for (const head of new Set(heads)) {
    const line = sample[head];
    assert.ok(line, `no sample line for grammar head ${head} — extend this test`);
    if (sanitizeLlmRecipe(line) === null) missing.push(head);
  }
  assert.deepEqual(missing, [], `sanitizer deletes valid statements: ${missing}`);
});

test('indented block bodies survive', () => {
  const recipe = ['If x > 0:', '  Return 1.', 'Return 0.'].join('\n');
  assert.equal(sanitizeLlmRecipe(recipe), recipe);
});

test('prose and comments are still stripped', () => {
  // NON-VACUITY for the widening: drain 2200's whole purpose must
  // survive. A sanitizer that kept everything would pass every test
  // above and reintroduce the parse errors it exists to prevent.
  const recipe = [
    'Let me think about this problem.',
    '# missing chip: random_float — return a random float',
    'Input n: int = 3.',
    'Here the note computes the answer, roughly.',
    'Return n.',
  ].join('\n');
  const out = sanitizeLlmRecipe(recipe);
  assert.equal(out, 'Input n: int = 3.\nReturn n.', out);
});

test('pure prose still returns null', () => {
  // NON-VACUITY for the Sub-1 fallback contract.
  assert.equal(sanitizeLlmRecipe('I think the answer is 42.\nProbably.'), null);
});
