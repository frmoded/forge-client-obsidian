// 2026-11-04-1174 (A): scripts/dev/lean-leg-files.mjs, the COMPUTED rule for which test files the lean leg of the matrix runs. A synthetic repo proves each branch of the rule (a transitive import of a selector or a generated module; the built main.js; the real-plugin
// bundle; a build step; a shell script; a cycle that touches nothing; a comment that only MENTIONS main.js; and the two cases where the scan cannot tell: a non-literal dynamic import and an import that does not resolve: those STAY in the lean leg).
// The real repo is checked against a STATED set (known lean-sensitive files in, known pure files out), against the matrix's own wiring (the list is printed, --full-lean exists, the music leg is never narrowed), and for completeness (every test file the
// suite runs is classified exactly once).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { SEAM_PATHS, scanEditionSensitivity } from './dev/lean-leg-files.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

function repo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-scan-'));
  for (const [f, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), text); }
  return dir;
}
const classify = (files) => {
  const dir = repo(files);
  try { const r = scanEditionSensitivity({ root: dir }); return Object.fromEntries(r.all.map((x) => [x.file, x])); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

test('the rule on a synthetic repo: every branch, each file classified once', () => {
  const c = classify({
    'src/music-edition-selected.ts': 'export const musicEdition = {};\n',
    'src/mid.ts': "import { musicEdition } from './music-edition-selected.ts';\nexport const m = musicEdition;\n",
    'src/leaf.ts': "import { m } from './mid.ts';\nexport const l = m;\n",
    'src/pure.ts': 'export const p = 1;\n',
    'src/cycle-a.ts': "import { b } from './cycle-b.ts';\nexport const a = 1 + b;\n",
    'src/cycle-b.ts': "import { a } from './cycle-a.ts';\nexport const b = 1;\nexport const useA = () => a;\n",
    'src/assets.generated.ts': 'export const ASSETS = {};\n',
    'src/a.test.ts': "import { l } from './leaf.ts';\nimport { test } from 'node:test';\ntest('x', () => l);\n",                       // two hops to the selector
    'src/b.test.ts': "import { p } from './pure.ts';\nimport { test } from 'node:test';\ntest('x', () => p);\n",                        // nothing
    'src/c.test.ts': "import fs from 'node:fs';\nfs.readFileSync('main.js');\n",                                                      // the built bundle
    'src/d.test.ts': 'const name = process.argv[2];\nawait import(name);\n',                                                          // the scan cannot tell
    'src/e.test.ts': "import { x } from './missing.ts';\nexport { x };\n",                                                            // does not resolve: cannot tell
    'src/f.test.ts': "import { bundleRealPlugin } from './test-support/bundle-real-plugin.ts';\nvoid bundleRealPlugin;\n",           // the real-plugin bundle
    'src/test-support/bundle-real-plugin.ts': 'export const bundleRealPlugin = 1;\n',
    'src/g.test.ts': "import { a } from './cycle-a.ts';\nvoid a;\n",                                                                    // a cycle that touches nothing
    'src/h.test.ts': "import { spawnSync } from 'node:child_process';\nspawnSync('bash', ['run-it.sh']);\n",                         // a shell script
    'src/i.test.ts': "// this test never reads main.js, it only says so in a comment\n/* FORGE_EDITION is not used either */\nexport const i = 1;\n", // comments only
    'src/j.test.ts': "import { ASSETS } from './assets.generated.ts';\nvoid ASSETS;\n",                                                // a generated module
    'scripts/k.test.mjs': "import { execFileSync } from 'node:child_process';\nexecFileSync('npm', ['run', 'build']);\n",                // a build step
    'scripts/l.test.mjs': "import { l } from '../src/leaf.ts';\nvoid l;\n",                                                         // across directories
    'scripts/m.test.mjs': "import { p } from '../src/pure.ts';\nvoid p;\n",
    'scripts/n.test.mjs': "import { spawnSync } from 'node:child_process';\nspawnSync(process.execPath, [new URL('./tool.mjs', import.meta.url).pathname, './tool.mjs']);\n",
    'scripts/tool.mjs': "import { musicEdition } from '../src/music-edition-selected.ts';\nvoid musicEdition;\n",                         // a script named by a path literal reaches the selector
  });
  const sens = (f) => c[f].sensitive;
  assert.equal(sens('src/a.test.ts'), true); assert.match(c['src/a.test.ts'].why, /module the build makes per edition \(through src\/leaf\.ts -> src\/mid\.ts -> src\/music-edition-selected\.ts|through/);
  assert.equal(sens('src/b.test.ts'), false);
  assert.equal(sens('src/c.test.ts'), true); assert.match(c['src/c.test.ts'].why, /main\.js/);
  assert.equal(sens('src/d.test.ts'), true); assert.match(c['src/d.test.ts'].why, /cannot tell.*non-literal/);
  assert.equal(sens('src/e.test.ts'), true); assert.match(c['src/e.test.ts'].why, /cannot tell.*missing\.ts does not resolve/);
  assert.equal(sens('src/f.test.ts'), true); assert.match(c['src/f.test.ts'].why, /bundleRealPlugin/);
  assert.equal(sens('src/g.test.ts'), false, 'a cycle that touches no seam is independent (and the scan terminates)');
  assert.equal(sens('src/h.test.ts'), true); assert.match(c['src/h.test.ts'].why, /\.sh/);
  assert.equal(sens('src/i.test.ts'), false, 'a comment that only mentions main.js and FORGE_EDITION is not a reader of them');
  assert.equal(sens('src/j.test.ts'), true); assert.match(c['src/j.test.ts'].why, /generated/);
  assert.equal(sens('scripts/k.test.mjs'), true); assert.match(c['scripts/k.test.mjs'].why, /npm/);
  assert.equal(sens('scripts/l.test.mjs'), true, 'across directories');
  assert.equal(sens('scripts/m.test.mjs'), false);
  assert.equal(sens('scripts/n.test.mjs'), true, 'a script named by a path literal is followed: it reaches the selector'); assert.match(c['scripts/n.test.mjs'].why, /through scripts\/tool\.mjs/);
  assert.equal(Object.keys(c).length, 14, 'only the .test files are classified (the helpers and modules are walked, not listed)');
});

test('CONTROL: a pure file turns sensitive the moment it imports a selector (the scan can fail); and "cannot tell" is the SAFE side: an unreadable file is never dropped', () => {
  const pure = classify({ 'src/p.ts': 'export const p = 1;\n', 'src/x.test.ts': "import { p } from './p.ts';\nvoid p;\n" });
  assert.equal(pure['src/x.test.ts'].sensitive, false);
  const touched = classify({ 'src/p.ts': "import './music-edition-selected.ts';\nexport const p = 1;\n", 'src/music-edition-selected.ts': 'export const e = 1;\n', 'src/x.test.ts': "import { p } from './p.ts';\nvoid p;\n" });
  assert.equal(touched['src/x.test.ts'].sensitive, true);
  const unsure = classify({ 'src/x.test.ts': "export const load = (n) => require(n);\nconst y = await import(`./${'a'}.ts`);\n" });
  assert.equal(unsure['src/x.test.ts'].sensitive, true, 'a dynamic import it cannot read stays in the lean leg');
});

test('the selector and generated modules are recognised by path', () => {
  for (const f of ['src/music-edition-selected.ts', 'src/edition-selected.ts', 'src/edition-selected.music.ts', 'src/bundled-assets.generated.ts', 'src/asset-manifest.generated.ts']) assert.ok(SEAM_PATHS.some((re) => re.test(f)), f);
  for (const f of ['src/music-edition.lean.ts', 'src/music-edition.full.ts', 'src/edition-core.ts']) assert.ok(!SEAM_PATHS.some((re) => re.test(f)), `${f} is an ordinary module (reached explicitly, the same in both legs)`);
});

test('THE REAL REPO: a stated set. Known lean-sensitive files are in the lean leg, known pure files are not, every test file is classified exactly once', () => {
  const r = scanEditionSensitivity({ root: ROOT });
  const sensitive = new Set(r.sensitive.map((x) => x.file));
  const independent = new Set(r.independent.map((x) => x.file));
  for (const f of ['src/music-edition-lean.test.ts', 'src/lean-edition-music-message.test.ts', 'scripts/build-main.test.mjs', 'src/scale-explorer-registration.test.ts', 'src/phrase-registration.test.ts', 'scripts/edition-assets.test.mjs', 'scripts/installable-build.test.mjs', 'scripts/reap-fixtures.test.mjs']) assert.ok(sensitive.has(f), `${f} must stay in the lean leg`);
  for (const f of ['src/free-mode-core.test.ts', 'src/guitar-core.test.ts', 'src/chord-names-core.test.ts', 'src/diatonic-chords-core.test.ts', 'src/scale-explorer-core.test.ts', 'src/sibling-pin.test.ts', 'src/selectable-messages-css.test.ts'].filter((f) => fs.existsSync(path.join(ROOT, f)))) assert.ok(independent.has(f), `${f} is pure: the lean leg need not run it`);
  const listed = fs.readdirSync(path.join(ROOT, 'src')).filter((n) => n.endsWith('.test.ts')).length + fs.readdirSync(path.join(ROOT, 'scripts')).filter((n) => n.endsWith('.test.mjs')).length;
  assert.equal(r.all.length, listed, 'every file `npm test` runs is classified');
  assert.equal(new Set(r.all.map((x) => x.file)).size, r.all.length);
  assert.equal(sensitive.size + independent.size, r.all.length);
  assert.ok(r.independent.length > 100 && r.sensitive.length > 50, `non-vacuity: ${r.sensitive.length} sensitive, ${r.independent.length} independent`);
});

test('the matrix\'s wiring: the lean leg uses the scan (not a hand list), prints how many files it ran and which, --full-lean restores the whole suite, and the music leg is never narrowed', () => {
  const m = fs.readFileSync(path.join(ROOT, 'scripts/drain-matrix.sh'), 'utf8');
  assert.match(m, /lean-leg-files\.mjs/);
  assert.match(m, /--full-lean\) LEAN_FULL=1/);
  assert.match(m, /"\$ed" = lean \] && \[ "\$LEAN_FULL" != "1"/, 'only the lean leg, and only without --full-lean');
  assert.match(m, /the lean leg ran these files:/);
  assert.match(m, /npm test -- --test-concurrency/, 'the whole suite is still what the music leg (and a lean leg with no scan) runs');
  assert.doesNotMatch(m, /\[ "\$ed" = music \][^\n]*SUBSET|music[^\n]*lean-leg-files/i, 'no narrowing of the music leg');
  assert.ok(!/^LEAN_FILES=\(/m.test(m) && !/lean_files=\(/i.test(m), 'no hand-written list of files in the matrix');
});

test('the CLI: --files prints one file per line, --report prints the count and both lists, --root scans another tree', () => {
  const dir = repo({ 'src/a.test.ts': "import './music-edition-selected.ts';\n", 'src/music-edition-selected.ts': 'export {};\n', 'src/b.test.ts': 'export const b = 1;\n' });
  try {
    const files = spawnSync(process.execPath, [path.join(ROOT, 'scripts/dev/lean-leg-files.mjs'), '--root', dir, '--files'], { encoding: 'utf8' });
    assert.equal(files.stdout, 'src/a.test.ts\n');
    const rep = spawnSync(process.execPath, [path.join(ROOT, 'scripts/dev/lean-leg-files.mjs'), '--root', dir, '--report'], { encoding: 'utf8' }).stdout.split('\n');
    assert.match(rep[0], /^lean leg: 1 of 2 test files \(the 1 edition-independent files run in the music leg only/);
    assert.equal(rep[1], 'lean leg runs: src/a.test.ts');
    assert.equal(rep[2], 'music leg only (edition-independent): src/b.test.ts');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
