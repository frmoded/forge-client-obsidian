// v0.2.200 — Regression guard for v0.2.197's
// `ReferenceError: extractRecipeSection is not defined` (driver smoke
// against v0.2.199 hit it via the "Forge: Show canonical layer" command).
//
// main.ts uses extractRecipeSection as a helper passed into
// `whichLayerIsCanonical` from facet-hash-core but pre-v0.2.200 didn't
// import it. esbuild bundled `main.ts` without that symbol; at runtime
// the helper closure resolved against the global scope and threw.
//
// This test reads main.ts as source text and asserts the import name is
// present. It's a `tsc`-equivalent contract check that survives a build-
// step swap (esbuild + tsc both flag missing imports if strict, but the
// existing project config does NOT enable strict mode, so the only signal
// is the runtime ReferenceError. This file pins the contract.)

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_TS = fs.readFileSync(
  path.join(__dirname, 'main.ts'),
  'utf8',
);

describe('main.ts top-level imports', () => {
  test('extractRecipeSection imported from v2-note-core', () => {
    // Match either single-line or multi-line import group; the symbol
    // must appear inside an import block that targets v2-note-core.
    const importBlocks = MAIN_TS.match(
      /import\s*{[^}]*}\s*from\s*['"]\.\/v2-note-core(?:\.ts)?['"]/g,
    );
    assert.ok(
      importBlocks && importBlocks.length > 0,
      'main.ts must import from ./v2-note-core',
    );
    const joined = importBlocks!.join('\n');
    assert.match(
      joined,
      /\bextractRecipeSection\b/,
      'extractRecipeSection must appear in a v2-note-core import block. '
        + 'Pre-v0.2.200 it was used at call sites but never imported, '
        + 'and the bundled plugin threw ReferenceError at runtime when '
        + '"Forge: Show canonical layer" fired.',
    );
  });

  test('extractPythonSection imported from v2-note-core (sibling helper)', () => {
    // Pair guard: showCanonicalLayer + forgeSnippet both pass
    // extractPythonSection alongside extractRecipeSection. If one is
    // missing the bug pattern recurs symmetrically.
    const importBlocks = MAIN_TS.match(
      /import\s*{[^}]*}\s*from\s*['"]\.\/v2-note-core(?:\.ts)?['"]/g,
    );
    const joined = (importBlocks ?? []).join('\n');
    assert.match(joined, /\bextractPythonSection\b/);
  });
});
