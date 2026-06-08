// v0.2.79 — build-time lint runner for backtick-in-embedded-Python
// traps. Invoked from package.json's `build` script before esbuild
// so the trap fails the build with a clear pointer instead of an
// opaque esbuild syntax error.
//
// Wraps the pure-core helper at src/backtick-trap-lint-core.ts —
// see that file for the lint rule + tests.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Re-implement the pure-core scan here as plain JS so this script
// can run without a TS compile step. The logic mirrors
// src/backtick-trap-lint-core.ts EXACTLY — if you change one, change
// the other (or extract a shared .mjs in a future drain).

function findBacktickTraps(source) {
  const traps = [];
  const lines = source.split('\n');
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inBlock) {
      const open = line.match(/\bpyodide\.runPython\(\s*`(.*)$/);
      if (!open) continue;
      const remainder = open[1];
      const close = matchClose(remainder);
      if (close.closed) {
        scanForUnescapedBacktick(close.body, i + 1, line, traps);
        continue;
      }
      scanForUnescapedBacktick(remainder, i + 1, line, traps);
      inBlock = true;
      continue;
    }
    const close = matchClose(line);
    if (close.closed) {
      scanForUnescapedBacktick(close.body, i + 1, line, traps);
      inBlock = false;
    } else {
      scanForUnescapedBacktick(line, i + 1, line, traps);
    }
  }
  return traps;
}

function matchClose(line) {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '`' && (i === 0 || line[i - 1] !== '\\')) {
      if (i + 1 < line.length && line[i + 1] === ')') {
        return { closed: true, body: line.slice(0, i) };
      }
    }
  }
  return { closed: false, body: line };
}

function scanForUnescapedBacktick(text, lineNum, fullLine, out) {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '`' && (i === 0 || text[i - 1] !== '\\')) {
      out.push({
        line: lineNum,
        context: fullLine.trim(),
      });
      return;
    }
  }
}

// --- main ---

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Scan all .ts files in src/ that might contain pyodide.runPython.
// Currently only pyodide-host.ts has them but the lint is run on
// every src/*.ts file for forward-coverage.
function* walkTs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      yield* walkTs(path.join(dir, entry.name));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      yield path.join(dir, entry.name);
    }
  }
}

let anyTraps = false;
for (const file of walkTs(path.join(ROOT, 'src'))) {
  const src = fs.readFileSync(file, 'utf8');
  if (!/\bpyodide\.runPython\b/.test(src)) continue;  // fast-path
  const traps = findBacktickTraps(src);
  if (traps.length === 0) continue;
  if (!anyTraps) {
    console.error('Backtick-trap lint FAILED:\n');
    anyTraps = true;
  }
  const rel = path.relative(ROOT, file);
  for (const t of traps) {
    console.error(`  ${rel}:${t.line}  ${t.context}`);
  }
}

if (anyTraps) {
  console.error(
    '\nUnescaped backticks inside `pyodide.runPython(\\`...\\`)` ' +
    'template literals prematurely terminate the outer JS template ' +
    'literal and produce confusing esbuild errors. Either escape the ' +
    'backtick as `\\\\\\`` or paraphrase the offending docstring/comment.',
  );
  console.error('See cc-prompt-queue.md §110 for the codification.');
  process.exit(1);
}

console.log('Backtick-trap lint: clean.');
