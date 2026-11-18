// 2026-11-19-0850 (part B) - `install-local.sh` and every script that imports a plugin .ts file printed Node's MODULE_TYPELESS_PACKAGE_JSON warning ("Module type of file:///.../src/facet-hash-core.ts is not specified and it doesn't parse as CommonJS ... Reparsing as ES module ... add \"type\": \"module\"")
// for facet-hash-core.ts and engine-bundle-drift-core.ts (FCH's install report): no package.json above src/ says what a .ts file is, so Node guesses by parsing it twice. The proper fix is the field, in the narrowest package.json that is right: src/package.json
// ({"type": "module"}: everything under src/ is an ES module). This pins the MECHANISM (importing a plugin source file from a script is silent on stderr) on the two files the report named and on every other file a script under scripts/ imports from src/, not the spelling of the field.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const imported = new Set(['facet-hash-core.ts', 'engine-bundle-drift-core.ts']);
for (const f of fs.readdirSync(path.join(ROOT, 'scripts'))) if (/\.mjs$/.test(f)) for (const m of fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8').matchAll(/from\s+['"]\.\.\/src\/([\w.-]+\.ts)['"]/g)) imported.add(m[1]);

test('importing a plugin .ts file from a script prints no MODULE_TYPELESS_PACKAGE_JSON warning (the two files FCH named, and every src file a script imports)', () => {
  const real = [...imported].filter((f) => fs.existsSync(path.join(ROOT, 'src', f)));          // a fixture string in a script test may name a file that is not there
  assert.ok(real.length >= 4, `non-vacuity: ${real.length} files`);
  for (const f of real) {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify('./src/' + f)});`], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr.slice(0, 300)}`);
    assert.doesNotMatch(r.stderr, /MODULE_TYPELESS_PACKAGE_JSON|Module type of file/, `${f}: Node still guesses the module type`);
  }
});

test('the field is in the right place: src/package.json says "module" and nothing else, so nothing outside src/ changes meaning (the repo root keeps no type: its .cjs and generated files are untouched)', () => {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/package.json'), 'utf8')); assert.deepEqual(p, { type: 'module' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).type, undefined);
});
