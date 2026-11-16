// 2026-11-16-1201 - the helper that shows one named, non-secret plugin setting and refuses secrets: on a data file full of FAKE secrets, run as the person runs it (the real script, a child process), and nothing it prints, on any path, contains one of them.
// NON-VACUITY: the fake secrets ARE in the file (a plain read shows them), and a control checks the scan would catch one.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { SECRET_KEY, looksLikeSecret, listSettings, shownAs, showSetting } from './show-plugin-setting-core.mjs';

const SCRIPT = path.resolve(import.meta.dirname, 'show-plugin-setting.mjs');
const FAKES = ['FAKE-token-0123456789abcdefghijklmnop', 'FAKE-own-anthropic-key-9876543210zyxwvutsrq', 'FAKE-nested-secret-aaaa1111bbbb2222cccc', 'FAKE-innocent-name-value-abcdef0123456789xyz', 'FAKE-history-token-qqqq5555wwww6666eeee'];
const DATA = {
  serverUrl: 'http://localhost:8000', transpileServiceUrl: 'https://forge.thecodingarena.com', transpileServiceToken: FAKES[0], useOwnAnthropicKey: true, ownAnthropicKey: FAKES[1],
  seenWelcome: true, panelStripFraction: 0.33, dialogDock: 'bottom', note: FAKES[3], nothing: null, emptyToken: '',
  dialogHistory: { a: [{ text: 'hello', auth: FAKES[4] }], b: FAKES[2] }, listy: [FAKES[2], 'x'],
};
function vault() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'show-setting-')); const plug = path.join(dir, '.obsidian/plugins/forge-actions'); fs.mkdirSync(plug, { recursive: true });
  fs.writeFileSync(path.join(plug, 'data.json'), JSON.stringify(DATA, null, 2)); return dir;
}
const run = (args) => { const r = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' }); return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '', all: `${r.stdout ?? ''}\n${r.stderr ?? ''}` }; };
const leaks = (text) => FAKES.filter((f) => text.includes(f.slice(5, 25)) || text.includes(f));

test('NON-VACUITY: the fake secrets are in the data file (a plain read would show them), and the scan below does catch a leak', () => {
  const v = vault(); const raw = fs.readFileSync(path.join(v, '.obsidian/plugins/forge-actions/data.json'), 'utf8');
  assert.equal(leaks(raw).length, FAKES.length, 'every fake is in the file');
  assert.deepEqual(leaks('...' + FAKES[0] + '...'), [FAKES[0]], 'the scan sees a leak');
});

test('A NAMED NON-SECRET KEY is shown: a URL, a flag, a number, a word, a null; exit 0', () => {
  const v = vault();
  for (const [key, want] of [['serverUrl', 'serverUrl="http://localhost:8000"'], ['transpileServiceUrl', 'transpileServiceUrl="https://forge.thecodingarena.com"'], ['seenWelcome', 'seenWelcome=true'], ['panelStripFraction', 'panelStripFraction=0.33'], ['dialogDock', 'dialogDock="bottom"'], ['nothing', 'nothing=null']]) {
    const r = run([key, '--vault', v]); assert.equal(r.code, 0, key); assert.equal(r.out.trim(), want); assert.deepEqual(leaks(r.all), []);
  }
});

test('A SECRET KEY IS REFUSED, exit 2, with a sentence, and the value appears nowhere: the token, the own API key, a key with an empty value, and sneaky names', () => {
  const v = vault();
  for (const key of ['transpileServiceToken', 'ownAnthropicKey', 'useOwnAnthropicKey', 'emptyToken', 'apiKey', 'Authorization', 'myPassword', 'bearerValue', 'sessionId', 'clientSecret', 'privateThing', 'COOKIE']) {
    const r = run([key, '--vault', v]); assert.equal(r.code, 2, key); assert.match(r.err, /^refused: ".+" looks like a secret/); assert.equal(r.out, ''); assert.deepEqual(leaks(r.all), [], key);
  }
});

test('A VALUE THAT LOOKS LIKE A SECRET under an innocent name is refused too (24+ characters of letters, digits and - _ + / =, with a letter and a digit); a URL, a path or a sentence is not', () => {
  const v = vault(); const r = run(['note', '--vault', v]); assert.equal(r.code, 2); assert.match(r.err, /looks like a secret, so it is not shown/); assert.deepEqual(leaks(r.all), []);
  assert.equal(looksLikeSecret('FAKE-innocent-name-value-abcdef0123456789xyz'), true);
  for (const ok of ['http://localhost:8000', '/Users/me/projects/some/long/path/here', 'a plain sentence with spaces in it, longer than 24', 'abcdefghijklmnopqrstuvwxyz', '12345678901234567890123456789', 'short1', '', 5, null, undefined]) assert.equal(looksLikeSecret(ok), false, String(ok));
});

test('--list: every key, its value or "(secret key: set|empty)" or "(object, N keys)"; a nested object is never opened; no secret appears', () => {
  const v = vault(); const r = run(['--list', '--vault', v]); assert.equal(r.code, 0); assert.deepEqual(leaks(r.all), []);
  const lines = Object.fromEntries(r.out.trim().split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]));
  assert.equal(lines.transpileServiceToken, '(secret key: set)'); assert.equal(lines.ownAnthropicKey, '(secret key: set)'); assert.equal(lines.emptyToken, '(secret key: empty)');
  assert.equal(lines.serverUrl, '"http://localhost:8000"'); assert.equal(lines.seenWelcome, 'true'); assert.equal(lines.note, '(looks like a secret: not shown)');
  assert.equal(lines.dialogHistory, '(object, 2 keys)'); assert.equal(lines.listy, '(list, 2 items)');
  assert.deepEqual(Object.keys(lines), Object.keys(DATA), 'the file\'s order');
});

test('USAGE AND ERRORS say nothing of the file: no such key, no file, a file that is not JSON (the parser\'s message quotes the text: never shown), a wrong flag, no arguments', () => {
  const v = vault(); let r = run(['nope', '--vault', v]); assert.equal(r.code, 1); assert.match(r.err, /no such key: "nope"/);
  r = run(['serverUrl', '--vault', path.join(v, 'missing')]); assert.equal(r.code, 1); assert.match(r.err, /^no data file at /);
  const bad = path.join(v, 'bad.json'); fs.writeFileSync(bad, '{"transpileServiceToken": "' + FAKES[0] + '" oops'); r = run(['serverUrl', '--file', bad]); assert.equal(r.code, 1); assert.match(r.err, /could not be read as JSON/); assert.deepEqual(leaks(r.all), []);
  for (const args of [[], ['--list', 'extra'], ['a', 'b'], ['--wat'], ['--vault'], ['--file']]) { r = run(args); assert.equal(r.code, 1, JSON.stringify(args)); assert.match(r.err, /^usage: /); assert.deepEqual(leaks(r.all), []); }
});

test('THE CORE: the secret-name rule, a refusal is decided from the NAME before the value is looked at, and listSettings refuses a file that is not an object', () => {
  for (const k of ['token', 'Token', 'transpileServiceToken', 'secret', 'apiKey', 'ownAnthropicKey', 'password', 'passwd', 'credentials', 'authorization', 'bearer', 'cookie', 'sessionToken', 'privateKey', 'signature']) assert.ok(SECRET_KEY.test(k), k);
  for (const k of ['serverUrl', 'transpileServiceUrl', 'seenWelcome', 'panelStripFraction', 'dialogDock', 'dialogHeight', 'showInspector', 'openRhythmNotesInBeatBox']) assert.ok(!SECRET_KEY.test(k), k);
  assert.equal(showSetting({ transpileServiceToken: FAKES[0] }, 'transpileServiceToken').code, 2);
  assert.ok(!JSON.stringify(showSetting({ transpileServiceToken: FAKES[0] }, 'transpileServiceToken')).includes(FAKES[0]));
  assert.equal(listSettings(null).code, 1); assert.equal(listSettings([1]).code, 1); assert.equal(showSetting(null, 'a').code, 1); assert.equal(showSetting({}, '__proto__').code, 1);
  assert.deepEqual(shownAs('x', 7), { kind: 'value', text: '7' });
});

test('MECHANISM PIN 2026-11-16-1201 (if the design moves this SHOULD go red): the script prints only what the core returns; it never prints the settings object, a parser message, or reads anything but the one data file', () => {
  const src = fs.readFileSync(SCRIPT, 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.doesNotMatch(src, /console\.(log|error)\((settings|JSON\.stringify|e\b|e\.message|err)/);
  assert.doesNotMatch(src, /e\.message|\.stack/);
  assert.equal((src.match(/readFileSync\(/g) ?? []).length, 1);
  assert.match(src, /\(r\.ok \? console\.log : console\.error\)\(r\.message\)/);
});
