// Drain 2026-10-15-2100 §1 — `effectiveSourceFacet`: the one definition of "which facet this note derives from" when the hash probe
// answers `synced`. Property-pins; the wiring pins at the bottom pin the MECHANISM (the stamper and the panel call it) — if either
// call moves, reassess rather than rewrite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { effectiveSourceFacet } from './effective-source-core.ts';

test('a drift verdict (description / recipe / python) wins over the stored value — the field may be behind an edit', () => {
  for (const v of ['description', 'recipe', 'python'] as const) {
    for (const stored of [null, 'description', 'recipe', 'python', 'synced']) {
      assert.equal(effectiveSourceFacet(v, stored), v, `${v} vs stored ${stored}`);
    }
  }
});

test('a `synced` verdict defers to a concrete stored source_facet', () => {
  assert.equal(effectiveSourceFacet('synced', 'recipe'), 'recipe');
  assert.equal(effectiveSourceFacet('synced', 'description'), 'description');
  assert.equal(effectiveSourceFacet('synced', 'python'), 'python');
});

test('a `synced` verdict with nothing usable stored stays `synced` (consumers keep the v11.4.1 handling)', () => {
  assert.equal(effectiveSourceFacet('synced', null), 'synced');
  assert.equal(effectiveSourceFacet('synced', 'synced'), 'synced');
  assert.equal(effectiveSourceFacet('synced', 'bogus'), 'synced');
  assert.equal(effectiveSourceFacet(null, 'recipe'), null, 'no verdict is no verdict');
});

const read = (f: string) => fs.readFileSync(path.resolve(import.meta.dirname, f), 'utf8');

test('wiring (pins the MECHANISM): the lineage stamper and the facet panel both resolve through effectiveSourceFacet', () => {
  assert.match(read('python-write-back-core.ts'), /effectiveSourceFacet\(input\.sourceLayer, stored\)/);
  assert.match(read('stale-facet-view-plugin.ts'), /effectiveSourceFacet\(canonical, /);
});

test('wiring (pins the MECHANISM): Run/transpile write-back goes through planPythonWriteBack with the library flag, and skips the file when told not to write', () => {
  const main = read('main.ts');
  assert.match(main, /planPythonWriteBack\(/);
  assert.match(main, /library: isInBundledLibraryDir\(file\.path, this\.libraryDirNames\(\)\)/);
  assert.ok(!/vault\.process\(file, \(content\) => applyPythonWriteBack\(/.test(main), 'the unconditional apply is gone');
});
