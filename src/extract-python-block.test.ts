// Music-edition Phase 2: the production Python block now carries one real interpolation (the library
// resolution order). The shared extractor must resolve it from the production constants and refuse any
// other unresolved interpolation — otherwise ~44 Pyodide-driven tests would run a literal `${...}`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { extractProductionPythonBlock } from './test-support/extract-python-block.ts';

test('the real block resolves the library order to a plain Python list (lean edition)', () => {
  const py = extractProductionPythonBlock();
  assert.match(py, /^_BUNDLED_LIBRARIES_V1 = \["forge-moda"\]$/m);
  assert.equal(py.includes('${'), false, 'an unresolved interpolation reached Python');
});

test('an unknown interpolation in the block is REJECTED, not passed through to Python', () => {
  const real = fs.readFileSync(path.resolve(process.cwd(), 'src/pyodide-host.ts'), 'utf-8');
  const poisoned = real.replace(
    '_BUNDLED_LIBRARIES_V1 = ${JSON.stringify(EDITION_PYTHON_LIBRARIES[EDITION])}',
    '_BUNDLED_LIBRARIES_V1 = ${somethingElse}',
  );
  assert.notEqual(poisoned, real, 'fixture did not change — the block moved');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-pyblock-')), 'host.ts');
  fs.writeFileSync(f, poisoned);
  assert.throws(() => extractProductionPythonBlock(f), /Unresolved template interpolation/);
});

test('escaped pass-throughs (backslash-dollar-brace) are still unescaped, not rejected', () => {
  const real = fs.readFileSync(path.resolve(process.cwd(), 'src/pyodide-host.ts'), 'utf-8');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-pyblock-')), 'host.ts');
  fs.writeFileSync(f, real);
  assert.doesNotThrow(() => extractProductionPythonBlock(f));
});
