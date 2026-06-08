// v0.2.79 — tests for the backtick-in-embedded-Python build-time lint.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findBacktickTraps } from './backtick-trap-lint-core.ts';

test('lint passes on clean single-line runPython', () => {
  const src = 'this.pyodide.runPython(`_forge_list_snippets()`);';
  assert.deepEqual(findBacktickTraps(src), []);
});

test('lint passes on clean multi-line runPython', () => {
  const src = [
    'pyodide.runPython(`',
    'def compute(context):',
    '    return 42',
    '`);',
  ].join('\n');
  assert.deepEqual(findBacktickTraps(src), []);
});

test('lint catches bare backtick inside multi-line runPython', () => {
  // Author wrote `something` in a Python docstring; the unescaped
  // backtick prematurely terminates the JS template literal.
  const src = [
    'pyodide.runPython(`',
    'def compute(context):',
    '    """Use `print` for output."""  // trap',
    '    pass',
    '`);',
  ].join('\n');
  const traps = findBacktickTraps(src);
  assert.equal(traps.length >= 1, true,
    `Expected at least one trap; got ${traps.length}.`);
  assert.equal(traps[0].line, 3);
  assert.match(traps[0].message, /backtick/i);
});

test('lint passes on backtick that IS escaped', () => {
  const src = [
    'pyodide.runPython(`',
    'def compute(context):',
    '    """Use \\`print\\` for output."""  // escaped — OK',
    '    pass',
    '`);',
  ].join('\n');
  assert.deepEqual(findBacktickTraps(src), []);
});

test('lint reports useful context: line + trimmed line text', () => {
  const src = [
    'pyodide.runPython(`',
    '    # Banner: `here` is the trap line',
    '`);',
  ].join('\n');
  const traps = findBacktickTraps(src);
  assert.equal(traps[0].line, 2);
  assert.match(traps[0].context, /here/);
});

test('lint catches single-line runPython trap', () => {
  // Even on a single line, an unescaped backtick mid-body is a trap.
  // (Hypothetical — real code would fail to parse — but the lint
  // should still classify it as an unescaped backtick.)
  // This case mostly exists to lock in the single-line scan path.
  const src = "pyodide.runPython(`def f(): \"\"\"`bad`\"\"\"`);";
  const traps = findBacktickTraps(src);
  assert.equal(traps.length >= 1, true);
});

test('lint integration: pyodide-host.ts is currently clean', () => {
  // Regression guard: the real source-of-truth file must NOT contain
  // the trap as of v0.2.79 ship. If this fails, either:
  //  - someone introduced a new trap (fix before merging), or
  //  - the lint over-fires on benign syntax (refine the lint).
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const filepath = path.join(__dirname, 'pyodide-host.ts');
  const src = fs.readFileSync(filepath, 'utf8');
  const traps = findBacktickTraps(src);
  assert.equal(
    traps.length, 0,
    `pyodide-host.ts contains ${traps.length} backtick trap(s):\n` +
    traps.map(t => `  line ${t.line}: ${t.context}`).join('\n'),
  );
});

test('lint integration: detects an injected trap in pyodide-host', () => {
  // Synthetic injection: take the real file, splice a backtick into
  // a multi-line runPython block, verify the lint catches it.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const filepath = path.join(__dirname, 'pyodide-host.ts');
  const src = fs.readFileSync(filepath, 'utf8');
  const lines = src.split('\n');
  // Find the FIRST multi-line runPython opening.
  let openIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/pyodide\.runPython\(\s*`\s*$/.test(lines[i])) {
      openIdx = i;
      break;
    }
  }
  if (openIdx === -1) {
    // No multi-line runPython block at all in current source — skip.
    return;
  }
  // Inject `INJECTED_TRAP_FOR_LINT_TEST` on the next line.
  lines.splice(openIdx + 1, 0,
    '    # Description: `unbalanced` trap injected by test');
  const injected = lines.join('\n');
  const traps = findBacktickTraps(injected);
  assert.equal(traps.length >= 1, true,
    `Lint missed the injected trap. Got: ${JSON.stringify(traps)}`);
});
