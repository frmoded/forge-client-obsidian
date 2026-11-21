// mutate-map: imports only (this file's fixtures quote file names)
// 2026-11-20-1004z (2) - the mutation runner's file -> tests map and the edition SEAM. Two things made it wrong for code reached through `list-model-selected`:
//   (a) the seam file is committed pointing at ONE implementation and the lean build redirects it to the other, so a mutant in EITHER implementation has to count the tests that reach the seam: an `X-selected.ts` has an edge to its `X.full.ts` and `X.lean.ts`;
//   (b) a source file that merely MENTIONS a test file's name in a comment (`phrase-core.ts` says "phrase-engine.test.ts") gave the test a dependency on it, and the test's closure then included an engine-booting test: every light wiring test was classified SLOW
//       (engine) and skipped for the mutants of the code it exercises (the false survivors seen in 1003 and 1004). A source file never depends on a test; names mentioned in a source's comments stay edges to SOURCES only.
// Written RED first.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMap, selectTests } from './dev/mutate-core.mjs';

const GLUE = /(pyodide-host|phrase-engine|real-rhythm-engine|engine-bundle)\.|^assets\/engine\//;
const texts = (o) => new Map(Object.entries(o));

test('(b) a source that mentions an ENGINE test\'s file name in a comment does not make the light tests that import it "engine": a mutant of that source still runs them', () => {
  const map = buildMap(texts({
    'src/core.ts': "// the engine half is pinned in engine-thing.test.ts\nexport const c = 1;",
    'src/light.test.ts': "import { c } from './core.ts'; test('x', () => c);",
    'src/engine-thing.test.ts': "import { c } from './core.ts'; await loadPyodide({}); test('y', () => c);",
  }));
  assert.equal(map.tests.get('src/light.test.ts').engine, false, 'the light test is not an engine test');
  const sel = selectTests(map, 'src/core.ts', GLUE);
  assert.ok(sel.run.includes('src/light.test.ts'), 'a mutant of core.ts runs the light test');
});

test('(c) a source that mentions the ENGINE HOST by name in a comment does not make the light tests that import it engine tests; a test that IMPORTS the host (or the real-plugin bundler) still is one', () => {
  const map = buildMap(texts({
    'src/core.ts': "// the engine host is src/pyodide-host.ts\nexport const c = 1;", 'src/pyodide-host.ts': 'export const boot = () => loadPyodide({});',
    'src/light.test.ts': "import { c } from './core.ts'; test('x', () => c);", 'src/boots.test.ts': "import { boot } from './pyodide-host.ts'; import { c } from './core.ts'; test('y', () => [boot, c]);",
    'src/bundles.test.ts': "import { c } from './core.ts'; const r = await bundleRealPlugin('.', 'music'); test('z', () => [r, c]);",
  }));
  assert.equal(map.tests.get('src/light.test.ts').engine, false); assert.equal(map.tests.get('src/boots.test.ts').engine, true); assert.equal(map.tests.get('src/bundles.test.ts').engine, true);
  assert.deepEqual(selectTests(map, 'src/core.ts', GLUE).run.sort(), ['src/boots.test.ts', 'src/bundles.test.ts', 'src/light.test.ts'], 'all three import core.ts themselves, so all run');
  const viaLight = buildMap(texts({ 'src/core.ts': "// see src/pyodide-host.ts\nexport const c = 1;", 'src/pyodide-host.ts': 'loadPyodide({})', 'src/mid.ts': "import { c } from './core.ts'; export const m = c;", 'src/t.test.ts': "import { m } from './mid.ts'; test('x', () => m);" }));
  assert.deepEqual(selectTests(viaLight, 'src/core.ts', GLUE).run, ['src/t.test.ts'], 'a light test that reaches core.ts through another source is run (it would have been skipped as an engine test)');
});

test('(b) names mentioned in a SOURCE still make edges to other SOURCES (an fs.readFileSync of a source file is a dependency), and a TEST that names a test (fixtures) keeps its edge', () => {
  const map = buildMap(texts({
    'src/a.ts': "export const a = readFileSync('b-thing.ts');", 'src/b-thing.ts': 'export const b = 1;',
    'src/a.test.ts': "import { a } from './a.ts'; test('x', () => a);", 'src/uses.test.ts': "// reads other-case.test.ts as a fixture\nimport './a.ts';", 'src/other-case.test.ts': 'test("z", () => 1);',
  }));
  assert.ok(map.deps.get('src/a.ts').has('src/b-thing.ts')); assert.ok(map.deps.get('src/uses.test.ts').has('src/other-case.test.ts'));
  assert.ok(!map.deps.get('src/a.ts').has('src/a.test.ts'));
});

test('(a) an `X-selected.ts` reaches BOTH `X.full.ts` and `X.lean.ts`: a mutant in the lean stub runs the tests that reach the seam, and so does a mutant in the full model', () => {
  const map = buildMap(texts({
    'src/list-model-selected.ts': "export { listModel } from './list-model.full.ts';", 'src/list-model.full.ts': "import { core } from './core.ts'; export const listModel = { core };", 'src/list-model.lean.ts': 'export const listModel = {};',
    'src/core.ts': 'export const core = 1;', 'src/wiring.test.ts': "import { listModel } from './list-model-selected.ts'; test('x', () => listModel);",
  }));
  for (const f of ['src/list-model.lean.ts', 'src/list-model.full.ts', 'src/core.ts']) assert.ok(selectTests(map, f, GLUE).run.includes('src/wiring.test.ts'), f);
  assert.ok(map.tests.get('src/wiring.test.ts').closure.has('src/list-model.lean.ts'));
});

test('(a) no harm: a file called `-selected` with no siblings, and a plain file, get no invented edges', () => {
  const map = buildMap(texts({ 'src/foo-selected.ts': "export * from './foo.ts';", 'src/foo.ts': 'export const f = 1;', 'src/bar.ts': 'export const b = 1;', 'src/x.test.ts': "import './foo-selected.ts';" }));
  assert.deepEqual([...map.deps.get('src/foo-selected.ts')], ['src/foo.ts']); assert.deepEqual([...map.deps.get('src/bar.ts')], []);
});
