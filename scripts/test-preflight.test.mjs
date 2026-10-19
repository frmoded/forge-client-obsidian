// Drain 2026-10-20-1100 §5 — `npm test` on a bare clone must say ONE clear thing, not fail dozens of test files with import errors.
//
// A fresh clone has no `src/*.generated.ts` (they are gitignored; `npm run build` writes them). Without them 28 tests / 6 files failed with
// ERR_MODULE_NOT_FOUND — Iteration 86's NONE state — each message naming a module, none naming the step that produces it. `pretest` now checks the
// generated modules exist and, if any is missing, prints one message that names them and the commands, and stops. The list of generated modules is READ FROM
// .gitignore (the file that defines what is generated), not copied: a new generated module is covered by adding it there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { generatedModulesFromGitignore, preflightMessage, preflightProblems } from './test-preflight-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GITIGNORE = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');

test('the generated modules are read from .gitignore: the four src/*.generated.ts, nothing else', () => {
  assert.deepEqual(generatedModulesFromGitignore(GITIGNORE).sort(), [
    'src/asset-manifest.generated.ts', 'src/build-stamp.generated.ts', 'src/bundled-assets.generated.ts', 'src/version-constant.generated.ts',
  ]);
  assert.deepEqual(generatedModulesFromGitignore('node_modules/\nmain.js\n# src/x.generated.ts\n'), [], 'a comment is not an entry; non-generated ignores are not modules');
  assert.deepEqual(generatedModulesFromGitignore('src/a.generated.ts\r\nsrc/b.generated.ts\r\n').sort(), ['src/a.generated.ts', 'src/b.generated.ts'], 'CRLF is fine');
});

test('nothing missing -> no problem, no message; one missing -> exactly that one is named', () => {
  const all = generatedModulesFromGitignore(GITIGNORE);
  assert.deepEqual(preflightProblems({ gitignore: GITIGNORE, exists: () => true }), { missing: [], message: null });
  const r = preflightProblems({ gitignore: GITIGNORE, exists: (f) => f !== all[1] });
  assert.deepEqual(r.missing, [all[1]]);
  assert.ok(r.message && r.message.includes(all[1]));
  for (const other of all.filter((f) => f !== all[1])) assert.ok(!r.message.includes(other), `${other} exists and is not named`);
});

test('the message is ONE message: names every missing module once, says the step, in the order that works (sync, then build), and the way round it', () => {
  const m = preflightMessage(['src/bundled-assets.generated.ts', 'src/build-stamp.generated.ts']);
  assert.equal(m.split('\n').filter((l) => /^npm test needs/.test(l)).length, 1, 'one headline');
  for (const f of ['src/bundled-assets.generated.ts', 'src/build-stamp.generated.ts']) assert.equal(m.split(f).length - 1, 1, `${f} named once`);
  assert.match(m, /FORGE_EDITION=music npm run build/);
  assert.match(m, /FORGE_EDITION=lean npm run build/);
  assert.ok(m.indexOf('sync-bundled-vault.mjs') < m.indexOf('npm run build'), 'sync first, then build (the build\'s own gates fail on a stale bundle)');
  assert.match(m, /FORGE_TEST_PREFLIGHT=off/);
  assert.ok(m.split('\n').length <= 14, 'short enough to read');
});

// ---- the command line, against a bare tree and a complete one -----------------------------------------------------------------------------

function tree(withGenerated) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-'));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, '.gitignore'), GITIGNORE);
  for (const f of ['test-preflight.mjs', 'test-preflight-core.mjs']) fs.copyFileSync(path.join(__dirname, f), path.join(root, 'scripts', f));
  if (withGenerated) for (const f of generatedModulesFromGitignore(GITIGNORE)) fs.writeFileSync(path.join(root, f), '// generated\n');
  return root;
}
const run = (root, env = {}) => spawnSync(process.execPath, ['--no-warnings', path.join(root, 'scripts', 'test-preflight.mjs')], { encoding: 'utf8', env: { ...process.env, FORGE_TEST_PREFLIGHT: '', ...env } });

test('CLI on a BARE tree: exit 1, the message on stderr, and it names all four modules; on a complete tree: exit 0 and silent', () => {
  const bare = run(tree(false));
  assert.equal(bare.status, 1, bare.stdout + bare.stderr);
  for (const f of generatedModulesFromGitignore(GITIGNORE)) assert.ok(bare.stderr.includes(f), f);
  assert.equal(bare.stdout, '');
  const ok = run(tree(true));
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout + ok.stderr, '', 'silent when there is nothing to say');
});

test('FORGE_TEST_PREFLIGHT=off runs the tests anyway (exit 0, silent) — only the exact value "off"', () => {
  assert.equal(run(tree(false), { FORGE_TEST_PREFLIGHT: 'off' }).status, 0);
  assert.equal(run(tree(false), { FORGE_TEST_PREFLIGHT: '0' }).status, 1, 'only "off" switches it off');
  assert.equal(run(tree(false), { FORGE_TEST_PREFLIGHT: 'OFF' }).status, 1);
});

test('wiring: `npm test` runs the preflight first (pretest), and the test script itself is unchanged', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.pretest, 'node scripts/test-preflight.mjs');
  assert.equal(pkg.scripts.test, 'node --test src/*.test.ts scripts/*.test.mjs');
});

test('this very tree passes its own preflight (or the suite could not be running: the generated modules exist when this test does, unless it was run by hand on a bare tree)', () => {
  const r = preflightProblems({ gitignore: GITIGNORE, exists: (f) => fs.existsSync(path.join(ROOT, f)) });
  if (r.missing.length) assert.ok(r.message, 'missing modules always come with a message');
  else assert.equal(r.message, null);
});
