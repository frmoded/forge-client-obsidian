// 2026-11-17-2000 (token refresh) - scripts/refresh-token-copies.mjs on a THROW-AWAY directory with FAKE tokens and a local stand-in for the service (accepts exactly one fake token with 422, refuses every other with 401, like
// the real /generate does for an empty body). The real token files are never read: every run points at the temp directory, and HOME is the temp directory too, so even a default path lands there. The point of the file:
// the right copies change and nothing else does, a token the service refuses is not copied, and NOTHING the script prints (stdout, stderr) contains any token, fake or stale.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { envSecret, plistBearer, refresh, scrub, setEnvSecret, setPlistBearer, setTokenInJson, tokenOf } from './refresh-token-copies-core.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts/refresh-token-copies.mjs');
const NEW = 'fake-NEW-token-AbCdEf0123456789_xyz';
const STALE_A = 'fake-STALE-token-aaaaaaaa1111111111';
const STALE_B = 'fake-STALE-token-bbbbbbbb2222222222';
const STALE_PLIST = 'fake-STALE-bearer-cccccccc3333333333';
const BAD = 'fake-REJECTED-token-dddddddd4444444444';
const STALE_ENV = 'fake-STALE-envsecret-eeeeeeee5555555555';
const PREVIOUS_ENV = 'fake-PREVIOUS-secret-ffffffff6666666666';
const ANTHROPIC = 'fake-anthropic-key-gggggggg7777777777';
const ALL = [NEW, STALE_A, STALE_B, STALE_PLIST, BAD, STALE_ENV, PREVIOUS_ENV, ANTHROPIC];

function service() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      calls.push({ url: req.url, method: req.method, body });
      res.statusCode = req.headers.authorization === `Bearer ${NEW}` ? 422 : 401; res.setHeader('content-type', 'application/json'); res.end('{"detail":"x"}');
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, calls, close: () => new Promise((r) => server.close(r)) })));
}

const PLIST = (bearer) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.forge.mcp</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>FORGE_MCP_BEARER</key>
    <string>${bearer}</string>
    <key>FORGE_MCP_PORT</key>
    <string>8765</string>
  </dict>
  <key>KeepAlive</key><true/>
</dict>
</plist>
`;
const dataJson = (token, extra = {}) => JSON.stringify({ transpileServiceUrl: 'https://example.test', transpileServiceToken: token, showBarNumbers: true, dialogHistory: { a: [1, 2] }, ...extra }, null, 2);

const ENV_TEXT = (secret) => `# the service's own settings\nANTHROPIC_API_KEY=${ANTHROPIC}\nFORGE_TRANSPILE_SECRET=${secret}\nFORGE_TRANSPILE_SECRET_PREVIOUS=${PREVIOUS_ENV}\nPORT=8000\n`;
function world({ sourceToken = NEW, qa = true, qaForge = true, sandbox = false, plist = true, env = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-tokens-'));
  const put = (rel, text, mode = 0o644) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text, { mode }); fs.chmodSync(p, mode); return p; };
  const w = {
    dir, put,
    source: put('projects/music-playground/.obsidian/plugins/forge-actions/data.json', dataJson(sourceToken)),
    qaActions: qa ? put('forge-vaults/ClaudeQA/.obsidian/plugins/forge-actions/data.json', dataJson(STALE_A), 0o644) : null,
    qaForge: qaForge ? put('forge-vaults/ClaudeQA/.obsidian/plugins/forge/data.json', dataJson(STALE_B, { dialogDock: 'right' }), 0o600) : null,
    sandbox: sandbox ? put('forge-vaults/music-sandbox/.obsidian/plugins/forge-actions/data.json', dataJson(STALE_A)) : null,
    plist: plist ? put('Library/LaunchAgents/com.forge.mcp.plist', PLIST(STALE_PLIST), 0o600) : path.join(dir, 'Library/LaunchAgents/com.forge.mcp.plist'),
    env: env ? put('projects/forge-transpile/.env', ENV_TEXT(STALE_ENV), 0o600) : path.join(dir, 'projects/forge-transpile/.env'),
    vaults: [path.join(dir, 'forge-vaults/ClaudeQA'), path.join(dir, 'forge-vaults/music-sandbox')],
    read: (p) => fs.readFileSync(p, 'utf8'),
    mode: (p) => fs.statSync(p).mode & 0o777,
    clean: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
  return w;
}
// async on purpose: the stand-in service lives in THIS process, so a blocking spawn would never let it answer
const exec = (argv, env) => new Promise((resolve) => {
  const c = spawn(process.execPath, argv, { env }); let stdout = '', stderr = '';
  c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; });
  const timer = setTimeout(() => c.kill('SIGKILL'), 60000);
  c.on('close', (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
});
const run = (w, svc, extra = []) => exec([SCRIPT, '--source', w.source, ...w.vaults.flatMap((v) => ['--vault', v]), '--plist', w.plist, '--url', svc.url, '--no-restart', ...extra], { ...process.env, HOME: w.dir });
const noToken = (r, what) => { for (const t of ALL) { assert.equal(r.stdout.includes(t), false, `${what}: stdout holds a token`); assert.equal(r.stderr.includes(t), false, `${what}: stderr holds a token`); } };

// ---- the pure pieces --------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('scrub replaces every secret it was told about, and leaves short strings alone (they would eat ordinary words)', () => {
  assert.equal(scrub(`a ${NEW} b ${NEW} c ${STALE_A}`, [NEW, STALE_A]), 'a <redacted> b <redacted> c <redacted>');
  assert.equal(scrub('the cat sat', ['cat']), 'the cat sat');
});

test('setTokenInJson changes ONE key: every other key, the order, the indentation and a missing trailing newline are kept; a file that already holds it is unchanged; a file without the key is refused', () => {
  const text = dataJson(STALE_A);
  const r = setTokenInJson(text, NEW);
  assert.equal(r.ok && r.changed, true);
  assert.deepEqual(JSON.parse(r.text), { ...JSON.parse(text), transpileServiceToken: NEW });
  assert.deepEqual(Object.keys(JSON.parse(r.text)), Object.keys(JSON.parse(text)));
  assert.equal(r.text.endsWith('\n'), false); assert.match(r.text, /^\{\n {2}"transpileServiceUrl"/);
  const tabbed = JSON.stringify({ transpileServiceToken: STALE_A, x: 1 }, null, '\t') + '\n';
  const t = setTokenInJson(tabbed, NEW); assert.match(t.text, /^\{\n\t"transpileServiceToken"/); assert.equal(t.text.endsWith('\n'), true);
  assert.deepEqual(setTokenInJson(r.text, NEW), { ok: true, changed: false, text: r.text });
  assert.equal(setTokenInJson(JSON.stringify({ a: 1 }), NEW).ok, false);
  assert.equal(setTokenInJson('not json {', NEW).ok, false);
});

test('tokenOf says why there is no token (a reason, never a value)', () => {
  assert.equal(tokenOf({ transpileServiceToken: NEW }).token, NEW);
  for (const bad of [null, [], {}, { transpileServiceToken: '' }, { transpileServiceToken: '  ' }, { transpileServiceToken: 7 }]) { const r = tokenOf(bad); assert.equal(r.ok, false); assert.equal(typeof r.why, 'string'); }
});

test('the launchd file: only the bearer string changes (byte for byte elsewhere), XML special characters are escaped, an empty <string/> is filled, a file without the entry is refused', () => {
  const text = PLIST(STALE_PLIST);
  assert.deepEqual(plistBearer(text), { found: true, value: STALE_PLIST });
  const r = setPlistBearer(text, NEW);
  assert.equal(r.changed, true); assert.equal(r.text, text.replace(STALE_PLIST, NEW));
  assert.equal(setPlistBearer(r.text, NEW).changed, false);
  assert.equal(plistBearer(setPlistBearer(text, 'a&b<c>d-token-12345').text).value, 'a&b<c>d-token-12345');
  assert.match(setPlistBearer(text, 'a&b<c>d-token-12345').text, /a&amp;b&lt;c&gt;d-token-12345/);
  const empty = text.replace(`<string>${STALE_PLIST}</string>`, '<string/>'); assert.equal(plistBearer(empty).value, ''); assert.match(setPlistBearer(empty, NEW).text, new RegExp(`<string>${NEW}</string>`));
  assert.equal(setPlistBearer('<plist><dict></dict></plist>', NEW).ok, false);
});

// ---- the whole script, on a temp directory -----------------------------------------------------------------------------------------------------------------------------------------
test('the run: the service accepts the source token, every plugin data file that has the key gets it (other keys, formatting and mode kept), the launchd bearer too, the source is untouched, the re-check says 422 for each', async () => {
  const svc = await service(); const w = world({ sandbox: true, env: false });          // 2026-11-22-1017: the default .env target is its own tests' business (a world with no .env: the count of files below is the old one)
  try {
    const before = { source: w.read(w.source), plistOther: w.read(w.plist).replace(STALE_PLIST, '@@') };
    const r = await run(w, svc);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    for (const p of [w.qaActions, w.qaForge, w.sandbox]) assert.equal(JSON.parse(w.read(p)).transpileServiceToken, NEW, p);
    assert.equal(plistBearer(w.read(w.plist)).value, NEW);
    assert.deepEqual(JSON.parse(w.read(w.qaForge)), { ...JSON.parse(dataJson(STALE_B, { dialogDock: 'right' })), transpileServiceToken: NEW }, 'every other key kept');
    assert.equal(w.read(w.plist).replace(NEW, '@@'), before.plistOther, 'the launchd file differs only in the bearer');
    assert.equal(w.read(w.source), before.source, 'the source file is not touched');
    assert.equal(w.mode(w.qaForge), 0o600); assert.equal(w.mode(w.qaActions), 0o644); assert.equal(w.mode(w.plist), 0o600);
    assert.equal(fs.readdirSync(path.dirname(w.qaForge)).filter((f) => f.includes('.tmp-')).length, 0, 'no temp file left');
    for (const name of ['forge-actions/data.json', 'forge/data.json', 'com.forge.mcp.plist']) assert.match(r.stdout, new RegExp(`changed: .*${name.replace('.', '\\.')}`));
    assert.match(r.stdout, /the service answers 422 \(accepted\)/); assert.match(r.stdout, /done: 4 file\(s\) changed, every copy is accepted/);
    assert.match(r.stdout, /forge-mcp NOT restarted \(--no-restart\)/);
    assert.match(r.stdout, new RegExp(`token of length ${NEW.length}`));
    noToken(r, 'happy path');
    // the check is the documented one: POST /generate with an empty body {}
    assert.ok(svc.calls.length >= 5 && svc.calls.every((c) => c.method === 'POST' && c.url === '/generate' && c.body === '{}'));
  } finally { await svc.close(); w.clean(); }
});

test('a second run changes nothing: the copies already hold it, nothing is rewritten', async () => {
  const svc = await service(); const w = world();
  try {
    assert.equal((await run(w, svc)).status, 0);
    const snap = [w.qaActions, w.qaForge, w.plist].map((p) => [w.read(p), fs.statSync(p).mtimeMs]);
    const r = await run(w, svc);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual([w.qaActions, w.qaForge, w.plist].map((p) => [w.read(p), fs.statSync(p).mtimeMs]), snap);
    assert.match(r.stdout, /already holds it/); assert.match(r.stdout, /done: 0 file\(s\) changed, every copy is accepted/);
    noToken(r, 'second run');
  } finally { await svc.close(); w.clean(); }
});

test('a token the service REJECTS is not copied anywhere: exit 1, every file is byte for byte what it was, and the words say so', async () => {
  const svc = await service(); const w = world({ sourceToken: BAD });
  try {
    const files = [w.qaActions, w.qaForge, w.plist]; const before = files.map((p) => w.read(p));
    const r = await run(w, svc);
    assert.equal(r.status, 1); assert.match(r.stdout, /REJECTS the source token \(401\)/); assert.match(r.stdout, /Nothing was changed/);
    assert.deepEqual(files.map((p) => w.read(p)), before);
    noToken(r, 'rejected');
  } finally { await svc.close(); w.clean(); }
});

test('the service not answering at all: stop, nothing changed, no token in the words', async () => {
  const svc = await service(); const dead = { ...svc, url: 'http://127.0.0.1:1' }; const w = world();
  try {
    const before = [w.qaActions, w.plist].map((p) => w.read(p));
    const r = await run(w, dead);
    assert.equal(r.status, 1); assert.match(r.stdout, /no answer/); assert.deepEqual([w.qaActions, w.plist].map((p) => w.read(p)), before);
    noToken(r, 'no answer');
  } finally { await svc.close(); w.clean(); }
});

test('a source without a token (missing key, empty, missing file) stops with the reason and changes nothing', async () => {
  const svc = await service(); const w = world();
  try {
    const before = w.read(w.qaActions);
    fs.writeFileSync(w.source, JSON.stringify({ transpileServiceUrl: 'x' })); let r = await run(w, svc);
    assert.equal(r.status, 1); assert.match(r.stdout, /has no transpileServiceToken key/);
    fs.writeFileSync(w.source, JSON.stringify({ transpileServiceToken: '' })); r = await run(w, svc); assert.equal(r.status, 1); assert.match(r.stdout, /is empty/);
    fs.rmSync(w.source); r = await run(w, svc); assert.equal(r.status, 1); assert.match(r.stdout, /no source data file/);
    assert.equal(w.read(w.qaActions), before);
  } finally { await svc.close(); w.clean(); }
});

test('files that are not there are skipped; a data file WITHOUT the key is left alone (the script adds no token where there never was one)', async () => {
  const svc = await service(); const w = world({ qaForge: false });
  try {
    fs.writeFileSync(w.qaActions, JSON.stringify({ transpileServiceUrl: 'x', other: 1 }, null, 2)); const keyless = w.read(w.qaActions);
    const r = await run(w, svc);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(w.read(w.qaActions), keyless); assert.match(r.stdout, /forge-actions\/data\.json: has no transpileServiceToken key, left alone/);
    assert.match(r.stdout, /forge\/data\.json: not there, skipped/); assert.match(r.stdout, /music-sandbox.*not there, skipped/);
    noToken(r, 'skips');
  } finally { await svc.close(); w.clean(); }
});

test('a launchd file with NO FORGE_MCP_BEARER entry is a human choice: the run stops and says so, and the data files were not changed either', async () => {
  const svc = await service(); const w = world();
  try {
    fs.writeFileSync(w.plist, PLIST(STALE_PLIST).replace(/<key>FORGE_MCP_BEARER<\/key>\s*<string>[^<]*<\/string>/, ''));
    const before = w.read(w.qaActions);
    const r = await run(w, svc);
    assert.equal(r.status, 1); assert.match(r.stdout, /has no FORGE_MCP_BEARER entry.*human choice/); assert.equal(w.read(w.qaActions), before);
    noToken(r, 'no bearer entry');
  } finally { await svc.close(); w.clean(); }
});

test('a file that cannot be written (a protected location) stops the run and names the file as a human choice, without printing a token', async (t) => {
  if (typeof process.getuid === 'function' && process.getuid() === 0) return t.skip('root can write anywhere');
  const svc = await service(); const w = world({ qaForge: false });
  const dir = path.dirname(w.qaActions);
  try {
    fs.chmodSync(dir, 0o555);                                                       // the rename of the temp file into this folder is refused
    const r = await run(w, svc);
    assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stdout, /forge-actions\/data\.json could not be written.*human choice/);
    assert.equal(JSON.parse(w.read(w.qaActions)).transpileServiceToken, STALE_A);
    noToken(r, 'unwritable');
  } finally { fs.chmodSync(dir, 0o755); await svc.close(); w.clean(); }
});

test('--dry-run verifies the source and says which files would change, and writes nothing', async () => {
  const svc = await service(); const w = world();
  try {
    const files = [w.qaActions, w.qaForge, w.plist]; const before = files.map((p) => w.read(p));
    const r = await run(w, svc, ['--dry-run']);
    assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /would change: .*forge-actions\/data\.json/); assert.match(r.stdout, /dry run: nothing written, nothing restarted/);
    assert.deepEqual(files.map((p) => w.read(p)), before);
    noToken(r, 'dry run');
  } finally { await svc.close(); w.clean(); }
});

test('with HOME on a temp directory and no flags the script looks only there: it cannot reach the real files (it stops: no source)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-home-'));
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--no-restart'], { encoding: 'utf8', env: { ...process.env, HOME: dir }, timeout: 60000 });
    assert.equal(r.status, 1); assert.match(r.stdout, /no source data file at ~\/projects\/music-playground/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('bad usage is refused (exit 64) and says the usage, with no stack trace', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--bogus'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 64); assert.match(r.stderr, /^usage: /);
});

// ---- the core with a dependency that LEAKS: the scrub is the last line of defence --------------------------------------------------------------------------------------------------
test('even when a dependency would put a token in a line, nothing printed holds it (every token ever held is scrubbed)', async () => {
  const said = [];
  const files = new Map([['/s.json', dataJson(NEW)], ['/t.json', dataJson(STALE_A)]]);
  const deps = {
    readFile: (p) => files.get(p) ?? null, writeFileAtomic: (p, t) => { files.set(p, t); },
    check: async (_u, tok) => (tok === NEW ? 422 : 401), restart: async () => ({ ok: true }),
    say: (l) => said.push(l),
  };
  const r = await refresh(deps, { sourceFile: { name: `/s.json holding ${NEW}`, path: '/s.json' }, targetFiles: [{ name: `/t.json (was ${STALE_A})`, path: '/t.json' }], plistFile: null, url: 'x', dryRun: false });
  assert.equal(r.code, 0);
  for (const l of [...said, ...r.lines]) for (const t of [NEW, STALE_A]) assert.equal(l.includes(t), false, l);
  assert.ok(said.some((l) => l.includes('<redacted>')), 'the leak was caught and replaced');
});

test('the script file itself never prints a variable that holds a token (a static check: in every console call and say(), each ${...} is a name, a length or a status, never a token variable)', () => {
  const core = fs.readFileSync(path.join(ROOT, 'scripts/refresh-token-copies-core.mjs'), 'utf8');
  const cli = fs.readFileSync(path.join(ROOT, 'scripts/refresh-token-copies.mjs'), 'utf8');
  let seen = 0;
  for (const [name, src] of [['core', core], ['cli', cli]]) {
    for (const m of src.matchAll(/(?:\bsay|console\.(?:log|error|warn|info))\(([^\n]*)/g)) {
      for (const e of m[1].matchAll(/\$\{([^}]*)\}/g)) { seen++; assert.doesNotMatch(e[1], /^\s*(?:token|now\.token|src\.token|cur\.value|b\.value|first)\s*$|\.value\b|\bsettings\[/, `${name}: an interpolated token: \${${e[1]}} in ${m[0].slice(0, 80)}`); }
      assert.doesNotMatch(m[1].replace(/`[^`]*`|'[^']*'|"[^"]*"/g, ''), /\b(?:token|secrets?)\b/, `${name}: a bare token argument: ${m[0].slice(0, 80)}`);
    }
  }
  assert.ok(seen > 10, 'non-vacuity: the check looked at the interpolations');
});

// ---- 2026-11-22-1017: the forge-transpile .env is a target too (its FORGE_TRANSPILE_SECRET line only) ----------------------------------------------------------------------------------------------------------------
test('1017 the .env pieces: envSecret reads the FORGE_TRANSPILE_SECRET line only (never _PREVIOUS); setEnvSecret changes that ONE line and keeps every other line byte for byte, a quote style and an `export` prefix; the same value is no change; no line is no change and says so', () => {
  assert.deepEqual(envSecret(ENV_TEXT(STALE_ENV)), { found: true, value: STALE_ENV });
  assert.deepEqual(envSecret(`FORGE_TRANSPILE_SECRET_PREVIOUS=${PREVIOUS_ENV}\n`), { found: false }, 'the previous-secret line is not the secret');
  assert.deepEqual(envSecret('ANTHROPIC_API_KEY=x\n'), { found: false });
  const next = setEnvSecret(ENV_TEXT(STALE_ENV), NEW);
  assert.equal(next.ok, true); assert.equal(next.changed, true);
  assert.equal(next.text, ENV_TEXT(NEW), 'only that line differs');
  assert.equal(setEnvSecret(ENV_TEXT(NEW), NEW).changed, false);
  assert.equal(setEnvSecret('export FORGE_TRANSPILE_SECRET="old-quoted-value-1234"\nX=1\n', NEW).text, `export FORGE_TRANSPILE_SECRET="${NEW}"\nX=1\n`, 'export prefix and quotes kept');
  assert.equal(setEnvSecret('X=1', NEW).ok, false); assert.equal(setEnvSecret('FORGE_TRANSPILE_SECRET=old-1234567', NEW).text, `FORGE_TRANSPILE_SECRET=${NEW}`, 'no trailing newline added');
});

test('1017 the run writes the .env: the mismatched secret line is replaced, every other line and the mode (600) are kept, no temp file is left, the re-check says 422 for the .env too, and NOTHING printed holds any of the fake secrets (the old .env secret, the previous one, the Anthropic key included)', async () => {
  const svc = await service(); const w = world();
  try {
    const r = await run(w, svc, ['--env', w.env]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(w.read(w.env), ENV_TEXT(NEW)); assert.equal(w.mode(w.env), 0o600);
    assert.equal(fs.readdirSync(path.dirname(w.env)).filter((f) => f.includes('.tmp-')).length, 0);
    assert.match(r.stdout, /changed: .*forge-transpile\/\.env/); assert.match(r.stdout, /\.env: the service answers 422 \(accepted\)/);
    noToken(r, '.env run');
  } finally { await svc.close(); w.clean(); }
});

test('1017 the DEFAULT target is ~/projects/forge-transpile/.env (HOME on a temp directory): no flag needed; --no-env leaves it alone', async () => {
  const svc = await service(); const w = world();
  try {
    const off = await run(w, svc, ['--no-env']);
    assert.equal(off.status, 0, off.stdout + off.stderr); assert.equal(w.read(w.env), ENV_TEXT(STALE_ENV), '--no-env: untouched');
    const on = await run(w, svc);
    assert.equal(on.status, 0, on.stdout + on.stderr); assert.equal(w.read(w.env), ENV_TEXT(NEW), 'the default path is the forge-transpile .env');
    noToken(off, '--no-env'); noToken(on, 'default');
  } finally { await svc.close(); w.clean(); }
});

test('1017 --dry-run says `would change` for a mismatched .env and `already holds it` for a matching one, shows no value, and writes nothing', async () => {
  const svc = await service(); const w = world();
  try {
    const before = w.read(w.env);
    const r = await run(w, svc, ['--env', w.env, '--dry-run']);
    assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /would change: .*forge-transpile\/\.env/); assert.equal(w.read(w.env), before); noToken(r, 'dry run');
    fs.writeFileSync(w.env, ENV_TEXT(NEW));
    const same = await run(w, svc, ['--env', w.env, '--dry-run']);
    assert.match(same.stdout, /forge-transpile\/\.env: FORGE_TRANSPILE_SECRET already holds it/); assert.doesNotMatch(same.stdout, /would change: .*\.env/); noToken(same, 'dry run, same');
  } finally { await svc.close(); w.clean(); }
});

test('1017 a missing .env is skipped with a plain message and NEVER created; a .env with no FORGE_TRANSPILE_SECRET= line is left alone and the line is never added', async () => {
  const svc = await service(); const w = world({ env: false });
  try {
    const r = await run(w, svc, ['--env', w.env]);
    assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /forge-transpile\/\.env: not there, skipped/); assert.equal(fs.existsSync(w.env), false, 'not created');
    const text = 'ANTHROPIC_API_KEY=' + ANTHROPIC + '\nFORGE_TRANSPILE_SECRET_PREVIOUS=' + PREVIOUS_ENV + '\n'; fs.mkdirSync(path.dirname(w.env), { recursive: true }); fs.writeFileSync(w.env, text, { mode: 0o600 });
    const r2 = await run(w, svc, ['--env', w.env]);
    assert.equal(r2.status, 0, r2.stdout + r2.stderr); assert.match(r2.stdout, /forge-transpile\/\.env: has no FORGE_TRANSPILE_SECRET= line, left alone/); assert.equal(w.read(w.env), text, 'byte for byte');
    noToken(r, 'missing'); noToken(r2, 'no line');
  } finally { await svc.close(); w.clean(); }
});
