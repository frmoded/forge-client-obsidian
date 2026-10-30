// 2026-10-27-0715: the stub projects the matrix tests run the real scripts/drain-matrix.sh against - seven tiny git repos whose forge-client-obsidian is a stub (its sync, gates, build and test steps are small node scripts that sleep and
// write timestamps) - moved here from drain-matrix-parallel.test.mjs so the interruption test (drain-matrix-interrupt.test.mjs) uses the very same fixture. Behaviour unchanged.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const SCRIPT = path.resolve(import.meta.dirname, '..', 'drain-matrix.sh');
export const REAL_VENV = path.join(os.homedir(), 'projects', 'forge', '.venv');
export const skip = fs.existsSync(path.join(REAL_VENV, 'bin', 'python')) ? false : 'forge/.venv is not there (the matrix needs the engine\'s Python env)';

export const REPOS = ['forge-client-obsidian', 'music-theory', 'forge-tutorial', 'forge-moda', 'music-core', 'forge', 'music-playground'];

export const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
};
export const write = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };

// the stubs: what the matrix runs in a client worktree, reduced to its observable shape
export const STUBS = {
  'package.json': JSON.stringify({ name: 'fake-client', scripts: { prebuild: 'node scripts/gates.mjs', build: 'node scripts/build.mjs', test: 'node scripts/test.mjs' } }),
  '.gitignore': 'node_modules\nassets/wheels\n.edition\n',
  'scripts/sync-bundled-vault.mjs': [
    "import fs from 'node:fs';",
    "if (process.env.LAG_BUNDLE) { fs.mkdirSync('assets/vaults/x', { recursive: true }); fs.writeFileSync('assets/vaults/x/n.md', 'the source vault moved on'); }",   // the sync CHANGES the committed bundle = the bundle lags the sources
  ].join('\n') + '\n',
  'scripts/sync-engine-bundle.mjs': 'process.exit(0);\n',
  'scripts/check-engine-fixtures.mjs': [
    "if (process.env.STALE_FIXTURES) { console.error('STALE: shipped-notes.json: recorded against another engine bundle'); console.error('check-engine-fixtures: 1 pinned engine fixture(s) stale. Fix: npm run rerecord-engine-fixtures'); process.exit(1); }",
    "console.log('check-engine-fixtures: ok (stub)');",
  ].join('\n') + '\n',
  'scripts/check-bundled-vault-bump.mjs': "console.log('✓ Bundled-vault bump check passed (stub)');\n",
  'scripts/gates.mjs': [
    "if (process.env.FAIL_STEP === 'gates') { console.error('the gates are red on purpose'); process.exit(1); }",
    "console.log('Engine-bundle drift check: clean (stub)'); console.log('check-bundled-description-hashes: ok'); console.log('check-open-time-writes: ok');",
  ].join('\n'),
  'scripts/build.mjs': [
    "import fs from 'node:fs';",
    "const ed = process.env.FORGE_EDITION;",
    "if (process.env.FAIL_BUILD === ed) { console.error(`the ${ed} build is red on purpose`); process.exit(1); }",
    "fs.writeFileSync('.edition', ed);",
  ].join('\n'),
  'scripts/test.mjs': [
    "import fs from 'node:fs';",
    "const ed = fs.readFileSync('.edition', 'utf8').trim();",
    "const start = Date.now();",
    "await new Promise((r) => setTimeout(r, Number(process.env.TEST_MS ?? 1500)));",
    "fs.writeFileSync(`${process.env.MARKS}/${ed}.json`, JSON.stringify({ start, end: Date.now() }));",
    "const fail = process.env.FAIL_TESTS === ed ? 1 : 0, skipped = process.env.SKIP_TESTS === ed ? 1 : 0;",
    "console.log(`ℹ tests 3\\nℹ suites 0\\nℹ pass ${3 - fail - skipped}\\nℹ fail ${fail}\\nℹ cancelled 0\\nℹ skipped ${skipped}`);",
    "if (fail) { console.log('✖ the test that is broken on purpose'); process.exit(1); }",
  ].join('\n'),
};
export const FORGE_TEST = [
  'import json, os, time',
  'def test_a():',
  '    start = time.time() * 1000',
  "    time.sleep(float(os.environ.get('FORGE_TEST_SLEEP', '1.5')))",
  "    open(os.path.join(os.environ['MARKS'], 'forge.json'), 'w').write(json.dumps({'start': start, 'end': time.time() * 1000}))",
].join('\n') + '\n';

export function projects() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-parallel-'));
  const marks = path.join(dir, 'marks');
  fs.mkdirSync(marks);
  for (const r of REPOS) {
    const root = path.join(dir, r);
    fs.mkdirSync(root);
    git(root, 'init', '-q', '-b', 'main');
    write(root, 'README.md', `# ${r}\n`);
    if (r === 'forge') { write(root, 'forge/__init__.py', ''); write(root, 'tests/music/test_a.py', FORGE_TEST); write(root, '.gitignore', '.venv\n'); }
    if (r === 'forge-client-obsidian') for (const [f, t] of Object.entries(STUBS)) write(root, f, t);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'init');
  }
  const client = path.join(dir, 'forge-client-obsidian');
  fs.mkdirSync(path.join(client, 'node_modules'));                              // untracked: the matrix links them into its worktrees
  fs.mkdirSync(path.join(client, 'assets', 'wheels'), { recursive: true });
  for (let i = 0; i < 11; i++) fs.writeFileSync(path.join(client, 'assets', 'wheels', `w${i}.whl`), '');
  fs.symlinkSync(REAL_VENV, path.join(dir, 'forge', '.venv'));
  return { dir, marks, client, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

export function matrix(p, args = [], env = {}) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8', timeout: 240_000,
    env: { ...process.env, PROJECTS: p.dir, TMPDIR: p.dir, LOGKEEP: p.dir, MARKS: p.marks, ...env },
  });
  const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
  return { status: r.status, out: strip(r.stdout ?? ''), err: strip(r.stderr ?? '') };
}
