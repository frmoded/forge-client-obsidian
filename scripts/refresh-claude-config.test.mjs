// 2026-11-23-1028 - `--claude-config`: the two forge-mcp token copies in ~/.claude.json (a stdio entry of the wizard's project and a user-level HTTP entry), checked and fixed by the driver's own tool.
// Everything here runs on a THROW-AWAY HOME with FAKE secrets and a local stand-in for the service (accepts exactly one fake token with 422). The real ~/.claude.json is never read. What the file pins: the check says match or DIFFERENT
// with the first 8 hex of a SHA-256 and never a value; the fix changes exactly the two fields (every other BYTE kept), writes a mode-600 backup first, is atomic, refuses when the file changed under it, when it does not parse or when
// a field is missing, checks itself afterwards (and puts the old text back if it finds another key changed), and the default run never touches the file.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

import { refresh } from './refresh-token-copies-core.mjs';
import { claudeEntries, replaceFields, sameOutside, stringSpan } from './refresh-claude-config-core.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts/refresh-token-copies.mjs');
const NEW = 'fake-NEW-token-AbCdEf0123456789_xyz';
const OLD_STDIO = 'fake-OLD-stdio-aaaaaaaa1111111111';
const OLD_HTTP = 'fake-OLD-http-bbbbbbbb2222222222';
const OTHER_A = 'fake-other-server-key-cccccccc3333';
const OTHER_B = 'fake-account-token-dddddddd4444';
const OLD_SECOND = 'fake-OLD-second-project-eeeeeeee5555';
const OTHER_HTTP = 'fake-other-http-server-ffffffff6666';
const ALL = [NEW, OLD_STDIO, OLD_HTTP, OTHER_A, OTHER_B, OLD_SECOND, OTHER_HTTP];
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PNAME = (home, server = 'forge-mcp', key = `${home}/forge-wizard-work/forge-mcp`) => `project ${key} (server ${server}): env.FORGE_MCP_BEARER`;
const UNAME = (server = 'forge-mcp') => `user server ${server}: headers.Authorization`;
const sha8 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

function service() {
  const server = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.statusCode = req.headers.authorization === `Bearer ${NEW}` ? 422 : 401; res.setHeader('content-type', 'application/json'); res.end('{"detail":"x"}'); }); });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) })));
}
const exec = (argv, env) => new Promise((resolve) => {
  const c = spawn(process.execPath, argv, { env }); let stdout = '', stderr = '';
  c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; });
  const timer = setTimeout(() => c.kill('SIGKILL'), 60000);
  c.on('close', (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
});

/** The shape the driver's file has (key names only; every value is fake). `stdio` / `http` are the two entry values; null leaves the entry out. */
const claudeJson = (home, { stdio = OLD_STDIO, http: httpTok = `Bearer ${OLD_HTTP}`, indent = 2, trailing = '', projectKey = `${home}/forge-wizard-work/forge-mcp`, projectServer = 'forge-mcp', userKey = 'forge-mcp', userUrl = 'http://127.0.0.1:8765/mcp', second = null, stdioValue = undefined } = {}) => {
  const project = { allowedTools: [], mcpServers: stdio === null ? {} : { [projectServer]: { type: 'stdio', command: 'node', args: ['server.js'], env: { FORGE_MCP_BEARER: stdioValue !== undefined ? stdioValue : stdio, FORGE_TRANSPILE_URL: 'https://example.test', FORGE_VAULT_PATH: '/v' } } } };
  const doc = {
    numStartups: 41, theme: 'dark',
    oauthAccount: { emailAddress: 'fake@example.test', accessToken: OTHER_B },
    mcpServers: { other: { type: 'stdio', command: 'x', env: { API_KEY: OTHER_A } }, unrelated: { type: 'http', url: 'https://other.example/mcp', headers: { Authorization: `Bearer ${OTHER_HTTP}` } }, ...(httpTok === null ? {} : { [userKey]: { type: 'http', url: userUrl, headers: { Authorization: httpTok } } }) },
    projects: { [projectKey]: project, [`${home}/elsewhere`]: { mcpServers: {}, lastCost: 1.5 }, ...(second === null ? {} : { [`${home}/second-project`]: { mcpServers: { 'forge-mcp': { type: 'stdio', command: 'node', env: { FORGE_MCP_BEARER: second } } } } }) },
    tail: 1,
  };
  return JSON.stringify(doc, null, indent) + trailing;
};
function world(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-config-'));
  const put = (rel, text, mode = 0o644) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text, { mode }); fs.chmodSync(p, mode); return p; };
  const w = {
    dir, put,
    source: put('projects/music-playground/.obsidian/plugins/forge-actions/data.json', JSON.stringify({ transpileServiceToken: NEW }, null, 2)),
    claude: opts.noFile ? path.join(dir, '.claude.json') : put('.claude.json', opts.text ?? claudeJson(dir, opts), opts.mode ?? 0o600),
    plist: path.join(dir, 'Library/LaunchAgents/com.forge.mcp.plist'),
    read: (p) => fs.readFileSync(p, 'utf8'), mode: (p) => fs.statSync(p).mode & 0o777,
    backups: () => fs.readdirSync(dir).filter((f) => f.startsWith('.claude.json.forge-backup-')),
    leftovers: () => fs.readdirSync(dir).filter((f) => f.includes('.tmp-')),
    clean: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
  return w;
}
const run = (w, svc, extra = []) => exec([SCRIPT, '--source', w.source, '--vault', path.join(w.dir, 'no-vault'), '--no-plist', '--no-env', '--url', svc.url, '--no-restart', ...extra], { ...process.env, HOME: w.dir });
const noSecret = (r, what) => { for (const t of ALL) { assert.equal(r.stdout.includes(t), false, `${what}: stdout holds a secret`); assert.equal(r.stderr.includes(t), false, `${what}: stderr holds a secret`); } };

// ---- the pure pieces --------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('stringSpan / replaceFields: ONLY the two string values change; every other byte stays (odd spacing, tabs, escapes, numbers like 1.0 and 1e3, a duplicate-looking key elsewhere, no trailing newline)', () => {
  const text = '{\t"a" :  1.0,\n  "u": "caf\\u00e9 \\"q\\"",\n  "mcpServers": {"forge-mcp": {"headers": {"Authorization" : "Bearer OLD1"}}, "n": 1e3},\n "projects": {"/h/p": {"mcpServers": {"forge-mcp": {"env": {"FORGE_MCP_BEARER": "OLD2", "x": "OLD1"}}}}} }';
  const a = ['mcpServers', 'forge-mcp', 'headers', 'Authorization'], b = ['projects', '/h/p', 'mcpServers', 'forge-mcp', 'env', 'FORGE_MCP_BEARER'];
  assert.equal(text.slice(...Object.values(stringSpan(text, a)).slice(0, 2)), '"Bearer OLD1"');
  const r = replaceFields(text, [{ path: a, value: 'Bearer NEW' }, { path: b, value: 'NEW' }]);
  assert.equal(r.ok, true);
  assert.equal(r.text, text.replace('"Bearer OLD1"', '"Bearer NEW"').replace('"OLD2"', '"NEW"'));
  assert.equal(stringSpan(text, ['mcpServers', 'nope']), null);
  assert.equal(stringSpan(text, ['mcpServers', 'n']), null, 'a number is not a string field');
  assert.equal(replaceFields('not json {', [{ path: a, value: 'x' }]).ok, false);
  assert.equal(replaceFields(text, [{ path: ['nope'], value: 'x' }]).ok, false);
});

// 2026-11-23-1022zz (deliberate): the 1028 pin moved: a missing entry is skipped and the project entry is found by structure
test('claudeEntries finds the entries by STRUCTURE: every projects[*].mcpServers[*].env.FORGE_MCP_BEARER string, and a user-level HTTP entry with headers.Authorization that is recognised as forge-mcp (by its key or its url); it never takes another server\'s header', () => {
  const home = '/Users/x';
  const e = claudeEntries(JSON.parse(claudeJson(home)), home);
  assert.deepEqual(e.map((x) => [x.name, x.found, x.prefix]), [[PNAME(home), true, ''], [UNAME(), true, 'Bearer ']], 'the unrelated http server (its own Authorization) is not one of them');
  assert.equal(e[0].value, OLD_STDIO); assert.equal(e[1].value, OLD_HTTP, 'the Bearer prefix is not part of the secret');
  assert.deepEqual(claudeEntries({ mcpServers: {}, projects: {} }, home), [], 'nothing is guessed');
  const bare = claudeEntries({ mcpServers: { 'forge-mcp': { headers: { Authorization: 'no-prefix-here' } } } }, home);
  assert.equal(bare.length, 1); assert.equal(bare[0].found, true); assert.equal(bare[0].bearer, false, 'a value without the Bearer prefix is flagged');
  // another project path and another server key; two projects; a user key with a slash; a url that names the service (a key that does not)
  const two = claudeEntries(JSON.parse(claudeJson(home, { projectKey: `${home}/somewhere/else`, projectServer: 'wizard', second: OLD_SECOND, userKey: '/forge-mcp' })), home);
  assert.deepEqual(two.map((x) => x.name), [PNAME(home, 'wizard', `${home}/somewhere/else`), PNAME(home, 'forge-mcp', `${home}/second-project`), UNAME('/forge-mcp')]);
  const byUrl = claudeEntries(JSON.parse(claudeJson(home, { userKey: 'wizard-http', userUrl: 'http://127.0.0.1:8765/forge-mcp/mcp', stdio: null })), home);
  assert.deepEqual(byUrl.map((x) => x.name), [UNAME('wizard-http')], 'recognised by its url');
  const userStdio = claudeEntries({ mcpServers: { anyname: { command: 'node', env: { FORGE_MCP_BEARER: OLD_STDIO } } } }, home);
  assert.deepEqual(userStdio.map((x) => [x.name, x.value]), [['user server anyname: env.FORGE_MCP_BEARER', OLD_STDIO]], 'a user-level stdio server is found by its env var too');
  const mal = claudeEntries({ projects: { '/p': { mcpServers: { s: { env: { FORGE_MCP_BEARER: 7 } } } } } }, home);
  assert.equal(mal.length, 1); assert.equal(mal[0].malformed, true, 'an entry that is there but not a string is malformed (never guessed at)');
});

test('sameOutside is false when ANY other key differs (the deep compare), true when only the two fields differ, and ignores key order only where JSON does', () => {
  const home = '/Users/x'; const a = JSON.parse(claudeJson(home)); const entries = claudeEntries(a, home);
  const b = JSON.parse(JSON.stringify(a)); b.mcpServers['forge-mcp'].headers.Authorization = 'Bearer other'; b.projects[`${home}/forge-wizard-work/forge-mcp`].mcpServers['forge-mcp'].env.FORGE_MCP_BEARER = 'other';
  assert.equal(sameOutside(a, b, entries), true);
  const c = JSON.parse(JSON.stringify(b)); c.numStartups = 42; assert.equal(sameOutside(a, c, entries), false, 'a scalar changed');
  const d = JSON.parse(JSON.stringify(b)); d.mcpServers.other.env.API_KEY = 'x'; assert.equal(sameOutside(a, d, entries), false, 'another server changed');
  const e = JSON.parse(JSON.stringify(b)); delete e.tail; assert.equal(sameOutside(a, e, entries), false, 'a key vanished');
  const f = JSON.parse(JSON.stringify(b)); f.mcpServers['forge-mcp'].headers.Extra = 1; assert.equal(sameOutside(a, f, entries), false, 'a key appeared inside an entry');
});

// ---- the whole script, on a temp HOME -------------------------------------------------------------------------------------------------------------------------------------------------
test('--dry-run --claude-config: DIFFERENT for both entries with the first 8 hex of each SHA-256 (the entry\'s and the source\'s), nothing written, no backup, no secret in the output', async () => {
  const svc = await service(); const w = world();
  try {
    const before = w.read(w.claude); const m0 = fs.statSync(w.claude).mtimeMs;
    const r = await run(w, svc, ['--dry-run', '--claude-config']);
    assert.equal(r.status, 0, r.stdout + r.stderr); noSecret(r, 'dry run');
    assert.match(r.stdout, new RegExp(`${esc(PNAME(w.dir))}: DIFFERENT \\(entry ${sha8(OLD_STDIO)}, source ${sha8(NEW)}\\)`));
    assert.match(r.stdout, new RegExp(`${esc(UNAME())}: DIFFERENT \\(entry ${sha8(OLD_HTTP)}, source ${sha8(NEW)}\\)`));
    assert.match(r.stdout, /project entries found: 1/); assert.equal(r.stdout.includes(OTHER_HTTP), false, 'the other server\'s header is never read out');
    assert.match(r.stdout, /would change: ~\/\.claude\.json \(2 fields\)/);
    assert.equal(w.read(w.claude), before); assert.equal(fs.statSync(w.claude).mtimeMs, m0); assert.deepEqual(w.backups(), []);
  } finally { await svc.close(); w.clean(); }
});

test('the check says `match` for an entry that holds the source token, DIFFERENT for the other (a mixed file), and the Bearer prefix does not count in the hash', async () => {
  const svc = await service(); const w = world({ stdio: NEW, http: `Bearer ${OLD_HTTP}` });
  try {
    const r = await run(w, svc, ['--dry-run', '--claude-config']);
    assert.equal(r.status, 0, r.stdout + r.stderr); noSecret(r, 'mixed');
    assert.match(r.stdout, new RegExp(`${esc(PNAME(w.dir))}: match \\(${sha8(NEW)}\\)`));
    assert.match(r.stdout, /headers\.Authorization: DIFFERENT/);
    assert.match(r.stdout, /would change: ~\/\.claude\.json \(1 field\)/);
  } finally { await svc.close(); w.clean(); }
});

// 2026-11-23-1022zz (deliberate): the 1028 pin moved: a missing entry is skipped and the project entry is found by structure
test('a missing entry is said in words in the check (`project entries found: 0` / `no project entry holds a forge-mcp bearer`); a missing file is `not there, skipped`; neither is an error', async () => {
  const svc = await service();
  try {
    const w1 = world({ stdio: null }); const r1 = await run(w1, svc, ['--dry-run', '--claude-config']);
    assert.equal(r1.status, 0, r1.stdout + r1.stderr); assert.match(r1.stdout, /project entries found: 0/); assert.match(r1.stdout, /no project entry holds a forge-mcp bearer/); assert.match(r1.stdout, /headers\.Authorization: DIFFERENT/); assert.match(r1.stdout, /would change: ~\/\.claude\.json \(1 field\)/); w1.clean();
    const w2 = world({ noFile: true }); const r2 = await run(w2, svc, ['--dry-run', '--claude-config']);
    assert.equal(r2.status, 0, r2.stdout + r2.stderr); assert.match(r2.stdout, /~\/\.claude\.json: not there, skipped/); assert.equal(fs.existsSync(w2.claude), false, 'never created'); w2.clean();
  } finally { await svc.close(); }
});

test('the fix: ONLY the two fields change (every other byte, the key order, the indentation, the mode kept), the Bearer prefix kept, a mode-600 backup of the old file written first (its path said, never its content), atomic, the re-check answers 422, and the driver is told what to do next', async () => {
  const svc = await service(); const w = world({ trailing: '\n', mode: 0o600 });
  try {
    const before = w.read(w.claude);
    const r = await run(w, svc, ['--claude-config']);
    assert.equal(r.status, 0, r.stdout + r.stderr); noSecret(r, 'fix');
    const after = w.read(w.claude);
    assert.equal(after, before.replace(OLD_STDIO, NEW).replace(`Bearer ${OLD_HTTP}`, `Bearer ${NEW}`), 'every other byte kept');
    assert.equal(w.mode(w.claude), 0o600); assert.deepEqual(w.leftovers(), [], 'no temp file left');
    const [b] = w.backups(); assert.equal(w.backups().length, 1); assert.match(b, /^\.claude\.json\.forge-backup-\d{8}T\d{6}Z$/);
    assert.equal(w.read(path.join(w.dir, b)), before, 'the backup is the old file'); assert.equal(w.mode(path.join(w.dir, b)), 0o600);
    assert.match(r.stdout, /changed: ~\/\.claude\.json \(2 fields\)/); assert.ok(r.stdout.includes(`~/${b}`), 'the backup path is said');
    assert.match(r.stdout, /accepted/); assert.match(r.stdout, /end the wizard session and start a new one/i); assert.match(r.stdout, /forge_run_recipe/);
    const j = JSON.parse(after); assert.equal(j.mcpServers['forge-mcp'].headers.Authorization, `Bearer ${NEW}`);
    assert.equal(j.mcpServers.other.env.API_KEY, OTHER_A); assert.equal(j.oauthAccount.accessToken, OTHER_B);
  } finally { await svc.close(); w.clean(); }
});

test('a file with no trailing newline and four-space indentation keeps both; running the fix twice changes nothing the second time (no second backup)', async () => {
  const svc = await service(); const w = world({ indent: 4 });
  try {
    const before = w.read(w.claude); assert.equal(before.endsWith('\n'), false);
    assert.equal((await run(w, svc, ['--claude-config'])).status, 0);
    const once = w.read(w.claude); assert.equal(once, before.replace(OLD_STDIO, NEW).replace(`Bearer ${OLD_HTTP}`, `Bearer ${NEW}`));
    const r2 = await run(w, svc, ['--claude-config']); assert.equal(r2.status, 0, r2.stdout + r2.stderr);
    assert.equal(w.read(w.claude), once); assert.equal(w.backups().length, 1, 'no backup when nothing changed'); assert.match(r2.stdout, /already hold/);
  } finally { await svc.close(); w.clean(); }
});

// 2026-11-23-1022zz (deliberate): the 1028 pin moved: a missing entry is skipped and the project entry is found by structure
test('the fix refuses and writes nothing (no backup either) when there is NOTHING to change, when the JSON does not parse (without quoting the text), when an entry is malformed or an HTTP header has no Bearer', async () => {
  const svc = await service();
  try {
    const w1 = world({ http: null, stdio: null }); const b1 = w1.read(w1.claude); const r1 = await run(w1, svc, ['--claude-config']);
    assert.equal(r1.status, 1, r1.stdout + r1.stderr); assert.match(r1.stdout, /STOP: .*nothing to change/i); assert.match(r1.stdout, /no project entry holds a forge-mcp bearer/); assert.equal(w1.read(w1.claude), b1); assert.deepEqual(w1.backups(), []); noSecret(r1, 'nothing'); w1.clean();
    const w2 = world({ text: `{ "mcpServers": { "x": "${OTHER_A}" ` }); const b2 = w2.read(w2.claude); const r2 = await run(w2, svc, ['--claude-config']);
    assert.equal(r2.status, 1, r2.stdout + r2.stderr); assert.match(r2.stdout, /STOP: .*not valid JSON/); assert.equal(w2.read(w2.claude), b2); assert.deepEqual(w2.backups(), []); noSecret(r2, 'bad json'); w2.clean();
    const w3 = world({ http: 'no-bearer-prefix-here' }); const b3 = w3.read(w3.claude); const r3 = await run(w3, svc, ['--claude-config']);
    assert.equal(r3.status, 1, r3.stdout + r3.stderr); assert.match(r3.stdout, /STOP: .*Bearer/); assert.deepEqual(w3.backups(), []); assert.equal(w3.read(w3.claude), b3, 'the good entry is not changed either: a malformed one stops the whole fix'); w3.clean();
    const w4 = world({ stdioValue: 7 }); const b4 = w4.read(w4.claude); const r4 = await run(w4, svc, ['--claude-config']);
    assert.equal(r4.status, 1, r4.stdout + r4.stderr); assert.match(r4.stdout, /STOP: .*malformed/i); assert.equal(w4.read(w4.claude), b4); assert.deepEqual(w4.backups(), []); noSecret(r4, 'malformed'); w4.clean();
  } finally { await svc.close(); }
});

// ---- 2026-11-23-1022zz: the fix changes what is THERE (a missing entry is skipped), and the project entry is found by structure ------------------------------------------------------------------------------
test('1022zz only the USER entry is present and DIFFERENT (the driver\'s real file): the fix changes it, one backup, `(1 field)`, the other server\'s header and every other byte untouched, and the words say no project entry was found', async () => {
  const svc = await service(); const w = world({ stdio: null });
  try {
    const before = w.read(w.claude);
    const r = await run(w, svc, ['--claude-config']);
    assert.equal(r.status, 0, r.stdout + r.stderr); noSecret(r, 'user only');
    assert.equal(w.read(w.claude), before.replace(`Bearer ${OLD_HTTP}`, `Bearer ${NEW}`)); assert.equal(w.backups().length, 1);
    assert.match(r.stdout, /changed: ~\/\.claude\.json \(1 field\)/); assert.match(r.stdout, /project entries found: 0/); assert.match(r.stdout, /no project entry holds a forge-mcp bearer/);
  } finally { await svc.close(); w.clean(); }
});

test('1022zz only a PROJECT entry is present: it is fixed (the user-level one is said to be absent in words)', async () => {
  const svc = await service(); const w = world({ http: null });
  try {
    const before = w.read(w.claude); const r = await run(w, svc, ['--claude-config']);
    assert.equal(r.status, 0, r.stdout + r.stderr); noSecret(r, 'project only');
    assert.equal(w.read(w.claude), before.replace(OLD_STDIO, NEW)); assert.match(r.stdout, /changed: ~\/\.claude\.json \(1 field\)/); assert.match(r.stdout, /no user-level forge-mcp entry holds a token/);
  } finally { await svc.close(); w.clean(); }
});

test('1022zz the project entry is found by STRUCTURE: another folder, another server key; TWO projects each with an entry are both checked and fixed (the project KEYS are printed, the values never); an unrelated server\'s header is never touched', async () => {
  const svc = await service(); const w = world({ projectKey: '__DIR__/somewhere/else', projectServer: 'wizard-stdio', second: OLD_SECOND, userKey: '/forge-mcp' });
  try {
    const text = w.read(w.claude).replace('__DIR__', w.dir); fs.writeFileSync(w.claude, text);
    const d = await run(w, svc, ['--dry-run', '--claude-config']);
    assert.equal(d.status, 0, d.stdout + d.stderr); noSecret(d, 'check');
    assert.match(d.stdout, /project entries found: 2/);
    assert.ok(d.stdout.includes(`${PNAME(w.dir, 'wizard-stdio', `${w.dir}/somewhere/else`)}: DIFFERENT (entry ${sha8(OLD_STDIO)}, source ${sha8(NEW)})`), d.stdout);
    assert.ok(d.stdout.includes(`${PNAME(w.dir, 'forge-mcp', `${w.dir}/second-project`)}: DIFFERENT (entry ${sha8(OLD_SECOND)}, source ${sha8(NEW)})`), d.stdout);
    assert.ok(d.stdout.includes(`${UNAME('/forge-mcp')}: DIFFERENT`), 'the user entry under the key /forge-mcp'); assert.match(d.stdout, /would change: ~\/\.claude\.json \(3 fields\)/);
    const r = await run(w, svc, ['--claude-config']);
    assert.equal(r.status, 0, r.stdout + r.stderr); noSecret(r, 'fix'); assert.match(r.stdout, /changed: ~\/\.claude\.json \(3 fields\)/);
    const after = w.read(w.claude); assert.equal(after, text.replace(OLD_STDIO, NEW).replace(OLD_SECOND, NEW).replace(`Bearer ${OLD_HTTP}`, `Bearer ${NEW}`), 'exactly the three spans'); assert.ok(after.includes(OTHER_HTTP), 'the unrelated server keeps its header');
    const again = await run(w, svc, ['--dry-run', '--claude-config']); assert.equal((again.stdout.match(/: match \(/g) ?? []).length, 3);
  } finally { await svc.close(); w.clean(); }
});

test('the DEFAULT real run (no --claude-config) never touches ~/.claude.json: byte-identical, same mtime, no backup, and it does not even mention it', async () => {
  const svc = await service(); const w = world();
  try {
    const before = w.read(w.claude); const m0 = fs.statSync(w.claude).mtimeMs;
    const r = await run(w, svc);
    assert.equal(r.status, 0, r.stdout + r.stderr); noSecret(r, 'default');
    assert.equal(w.read(w.claude), before); assert.equal(fs.statSync(w.claude).mtimeMs, m0); assert.deepEqual(w.backups(), []); assert.equal(r.stdout.includes('.claude.json'), false);
    const d = await run(w, svc, ['--dry-run']); assert.equal(d.stdout.includes('.claude.json'), false);
  } finally { await svc.close(); w.clean(); }
});

// ---- the refusals that need a file that moves under the script: the core with in-memory dependencies ---------------------------------------------------------------------------------------
function memory({ text, stat = { mtimeMs: 1000, size: text.length } } = {}) {
  const files = new Map([['/s.json', JSON.stringify({ transpileServiceToken: NEW })], ['/home/.claude.json', text]]); const said = []; const writes = []; const backups = []; let statNow = stat;
  const deps = {
    readFile: (p) => files.get(p) ?? null,
    readClaude: (p) => (files.has(p) ? { text: files.get(p), mtimeMs: stat.mtimeMs, size: stat.size } : null),
    statClaude: () => statNow,
    writeBackup: (p, t) => { backups.push([p, t]); },
    writeFileAtomic: (p, t) => { writes.push([p, t]); files.set(p, t); },
    check: async (_u, tok) => (tok === NEW ? 422 : 401), restart: async () => ({ ok: true }), say: (l) => said.push(l), now: () => new Date('2026-11-23T10:20:30Z'),
  };
  return { deps, files, said, writes, backups, moveFile: (s) => { statNow = s; } };
}
const OPTS = (extra = {}) => ({ sourceFile: { name: '/s.json', path: '/s.json' }, targetFiles: [], plistFile: null, envFile: null, url: 'x', dryRun: false, claudeConfig: { name: '~/.claude.json', path: '/home/.claude.json', home: '/home' }, ...extra });

test('the file changed between the read and the write (mtime or size): refused, nothing written, the driver is told to retry', async () => {
  const text = claudeJson('/home'); const m = memory({ text });
  m.moveFile({ mtimeMs: 2000, size: text.length });
  const r = await refresh(m.deps, OPTS());
  assert.equal(r.code, 1); assert.deepEqual(m.writes, []); assert.equal(m.files.get('/home/.claude.json'), text);
  assert.ok(m.said.some((l) => /STOP: .*changed while/.test(l) && /try again|retry/i.test(l)), m.said.join('\n'));
  const m2 = memory({ text }); m2.moveFile({ mtimeMs: 1000, size: text.length + 5 });
  assert.equal((await refresh(m2.deps, OPTS())).code, 1); assert.deepEqual(m2.writes, []);
});

test('the deep compare: if the written file differs outside the two fields, the OLD text is put back, the run stops and says so', async () => {
  const text = claudeJson('/home'); const m = memory({ text });
  const real = m.deps.writeFileAtomic; let n = 0;
  m.deps.writeFileAtomic = (p, t) => { n++; real(p, n === 1 ? t.replace('"numStartups": 41', '"numStartups": 42') : t); };     // the first write is damaged: another key moves
  const r = await refresh(m.deps, OPTS());
  assert.equal(r.code, 1); assert.equal(n, 2, 'written once, then restored');
  assert.equal(m.files.get('/home/.claude.json'), text, 'the old text is back');
  assert.ok(m.said.some((l) => /STOP: .*another key/.test(l) && /put back|restored/i.test(l)), m.said.join('\n'));
  assert.equal(m.said.some((l) => l.includes(OLD_STDIO) || l.includes(NEW) || l.includes(OTHER_A)), false);
});

test('the backup is written BEFORE the file, with a UTC stamp in its name, and a backup that cannot be written stops the run before anything changes', async () => {
  const text = claudeJson('/home'); const m = memory({ text });
  const order = []; m.deps.writeBackup = (p, t) => { order.push('backup'); m.backups.push([p, t]); }; const w = m.deps.writeFileAtomic; m.deps.writeFileAtomic = (p, t) => { order.push('write'); w(p, t); };
  const r = await refresh(m.deps, OPTS()); assert.equal(r.code, 0, m.said.join('\n'));
  assert.deepEqual(order, ['backup', 'write']); assert.equal(m.backups[0][0], '/home/.claude.json.forge-backup-20261123T102030Z'); assert.equal(m.backups[0][1], text);
  const m2 = memory({ text }); m2.deps.writeBackup = () => { throw new Error(`boom ${OLD_STDIO}`); };
  const r2 = await refresh(m2.deps, OPTS()); assert.equal(r2.code, 1); assert.deepEqual(m2.writes, []); assert.ok(m2.said.some((l) => /STOP: .*backup/.test(l))); assert.equal(m2.said.some((l) => l.includes(OLD_STDIO)), false);
});

test('without the option the core never reads the Claude file (no readClaude call)', async () => {
  const m = memory({ text: claudeJson('/home') }); let reads = 0; m.deps.readClaude = () => { reads++; return null; };
  const r = await refresh(m.deps, OPTS({ claudeConfig: undefined })); assert.equal(r.code, 0); assert.equal(reads, 0);
});

// ---- the restart line (1028 item 5): launchctl's own error and the pid before and after --------------------------------------------------------------------------------------------------------
test('the restart says the pid before and after, or launchctl\'s own error text; a secret inside that text is scrubbed', async () => {
  const plist = `<?xml version="1.0"?>\n<plist><dict><key>FORGE_MCP_BEARER</key>\n<string>${OLD_STDIO}</string></dict></plist>\n`;
  const mk = (restart) => { const files = new Map([['/s.json', JSON.stringify({ transpileServiceToken: NEW })], ['/p.plist', plist]]); const said = []; return { said, deps: { readFile: (p) => files.get(p) ?? null, writeFileAtomic: (p, t) => files.set(p, t), check: async (_u, tok) => (tok === NEW ? 422 : 401), restart, say: (l) => said.push(l) } }; };
  const o = { sourceFile: { name: '/s.json', path: '/s.json' }, targetFiles: [], plistFile: { name: 'p.plist', path: '/p.plist' }, url: 'x', dryRun: false, restart: true };
  const a = mk(async () => ({ ok: true, pidBefore: 4242, pidAfter: 4343 })); await refresh(a.deps, o);
  assert.ok(a.said.some((l) => /forge-mcp restarted/.test(l) && /pid 4242 -> 4343/.test(l)), a.said.join('\n'));
  const b = mk(async () => ({ ok: false, error: `Could not find service "com.forge.mcp" in domain for user gui: 501 ${OLD_STDIO}`, pidBefore: null, pidAfter: null })); await refresh(b.deps, o);
  assert.ok(b.said.some((l) => /could not be restarted/.test(l) && /Could not find service/.test(l)), b.said.join('\n'));
  assert.equal(b.said.some((l) => l.includes(OLD_STDIO)), false, 'the error text is scrubbed');
  const c = mk(async () => ({ ok: true })); await refresh(c.deps, o); assert.ok(c.said.some((l) => /forge-mcp restarted/.test(l)), 'a restart without pids still says restarted');
});

test('the new core never prints a variable that holds a secret (a static check on the say() calls of refresh-claude-config-core.mjs)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/refresh-claude-config-core.mjs'), 'utf8'); let seen = 0;
  for (const m of src.matchAll(/\bsay\(([^\n]*)/g)) {
    for (const e of m[1].matchAll(/\$\{([^}]*)\}/g)) { seen++; assert.doesNotMatch(e[1], /\.value\b|\btoken\b|\bsecret|\bbearer\b|\.text\b|\bsettings\[/i, `an interpolated secret: \${${e[1]}} in ${m[0].slice(0, 90)}`); }
  }
  assert.ok(seen >= 4, 'non-vacuity: the check looked at the interpolations');
});
