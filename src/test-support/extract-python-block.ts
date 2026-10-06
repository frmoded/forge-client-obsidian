// src/test-support/extract-python-block.ts
//
// Drain 2026-08-16-1310 — one place that knows how to lift the production
// inline Python out of src/pyodide-host.ts.
//
// The fixture-drift HARD RULE says a test that needs the inlined Python
// must read it from the source at test time rather than carry a copy.
// Six test files had each grown their own identical copy of the regex and
// the unescaping, which is the same duplication one level up: a change to
// the block's markers or escaping would have to be found in six places.
//
// NOT a `.test.ts` file, so `node --test src/*.test.ts` does not run it as
// a suite; it is imported by the files that do.

import fs from 'node:fs';
import path from 'node:path';
import { EDITION_PYTHON_LIBRARIES } from '../edition-core.ts';
import { EDITION } from '../edition-selected.ts';

const BLOCK_RE =
  /\/\/ _PYTHON_BLOCK_BEGIN[\s\S]*?pyodide\.runPython\(`([\s\S]*?)`\);\s*\/\/ _PYTHON_BLOCK_END/;

/**
 * The production Python block, ready to hand to `pyodide.runPython`.
 *
 * The block lives in the source as ES-template-literal text, so the
 * escapes V8 would resolve at runtime have to be resolved here:
 *   `\\`   (source) -> `\`   (Python sees)
 *   `\${`  (source) -> `${`  (pass-through interpolation)
 * Those are the only two ESCAPES the block uses; keep this minimal so a
 * new escape fails loudly rather than being silently mangled.
 *
 * The block has exactly TWO real (unescaped) interpolations: since music-edition
 * Phase 2 `${JSON.stringify(EDITION_PYTHON_LIBRARIES[EDITION])}` (the Python library
 * resolution order), and since drain 2026-10-05-2330 `${JSON.stringify(EDITION)}`
 * (the FORGE_EDITION flag the engine reads for its lean-edition message). Each is resolved here from the SAME
 * production constants the plugin evaluates — never a hand-copied value — and
 * ANY other unresolved interpolation throws, for the same reason a new escape
 * does.
 *
 * Throws when the markers are missing — never returns empty. A test that
 * silently executed no production code would be the exact failure this
 * whole pattern exists to prevent.
 */
export function extractProductionPythonBlock(
  hostSourcePath = path.resolve(process.cwd(), 'src/pyodide-host.ts'),
): string {
  const source = fs.readFileSync(hostSourcePath, 'utf-8');
  const match = source.match(BLOCK_RE);
  if (!match) {
    throw new Error(
      `Could not locate the _PYTHON_BLOCK in ${hostSourcePath} — the `
      + `BEGIN/END markers are missing or the inline runPython( shape changed.`,
    );
  }
  const LIBRARIES_INTERPOLATION = '${JSON.stringify(EDITION_PYTHON_LIBRARIES[EDITION])}';
  const EDITION_INTERPOLATION = '${JSON.stringify(EDITION)}';
  const resolved = match[1]
    .split(LIBRARIES_INTERPOLATION).join(JSON.stringify(EDITION_PYTHON_LIBRARIES[EDITION]))
    .split(EDITION_INTERPOLATION).join(JSON.stringify(EDITION));
  // Any `${` still present that is not an escaped pass-through (`\${`) is an interpolation this
  // helper does not know how to resolve — fail loudly instead of handing Python a literal `${...}`.
  const unresolved = resolved.match(/(?<!\\)\$\{[^}]*\}/g);
  if (unresolved) {
    throw new Error(
      `Unresolved template interpolation(s) in the production Python block: ${unresolved.join(', ')}. `
      + 'Teach extract-python-block.ts to resolve them from the production constants.',
    );
  }
  return resolved.replace(/\\\\/g, '\\').replace(/\\\$\{/g, '${');
}
