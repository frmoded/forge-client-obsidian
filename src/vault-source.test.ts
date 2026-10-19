// Drain 2026-10-20-1100 §6 — the sibling-vs-bundle DISAGREEMENT check for tests that read a vault file (a widget, a data note).
//
// The incident (Iterations 83 → 86): the widget tests read `../music-theory` first and the committed bundle (`assets/vaults/music-theory`) second. For
// two deploys the sibling still held the OLD widget while the bundle held (or was about to hold) the new one, so a test pinned to the removed Export JSON
// button passed on the dev machine and failed on the driver's after a pull — a test result that depended on WHICH of two checkouts it happened to read,
// reported nowhere. The rule now: if the sibling and the bundle both have the file and their bytes differ, the test does not pick one — it FAILS, naming
// both paths and the command that brings them together. Reading one of them knowingly is an explicit, named choice (an env override), never a default.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { VaultDisagreementError, disagreementMessage, readVaultFile, resolveVaultFile } from './test-support/vault-source.ts';

const REL = 'music_instruments/resources/html/rhythm_box.html';
function layout(files: { sibling?: string; bundle?: string }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vsrc-'));
  const cwd = path.join(root, 'client');
  fs.mkdirSync(cwd, { recursive: true });
  const sibling = path.join(root, 'music-theory', REL);
  const bundle = path.join(cwd, 'assets', 'vaults', 'music-theory', REL);
  for (const [p, c] of [[sibling, files.sibling], [bundle, files.bundle]] as const) {
    if (c === undefined) continue;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, c);
  }
  return { cwd, sibling, bundle };
}

test('only the sibling has it -> the sibling; only the bundle has it -> the bundle; neither -> null (the caller skips with its own reason)', () => {
  const a = layout({ sibling: 'S' });
  assert.deepEqual(resolveVaultFile('music-theory', REL, { cwd: a.cwd }), { path: a.sibling, source: 'sibling' });
  const b = layout({ bundle: 'B' });
  assert.deepEqual(resolveVaultFile('music-theory', REL, { cwd: b.cwd }), { path: b.bundle, source: 'bundle' });
  assert.equal(resolveVaultFile('music-theory', REL, { cwd: layout({}).cwd }), null);
});

test('both have it and the bytes AGREE -> fine (the sibling is read, as always)', () => {
  const t = layout({ sibling: '<html>same</html>', bundle: '<html>same</html>' });
  assert.deepEqual(resolveVaultFile('music-theory', REL, { cwd: t.cwd }), { path: t.sibling, source: 'sibling' });
  assert.equal(readVaultFile('music-theory', REL, { cwd: t.cwd }), '<html>same</html>');
});

test('THE INCIDENT: both have it and the bytes DIFFER -> it throws, naming BOTH paths, both digests and the sync command', () => {
  const t = layout({ sibling: '<html>old widget with Export JSON</html>', bundle: '<html>new widget</html>' });
  assert.throws(() => resolveVaultFile('music-theory', REL, { cwd: t.cwd }), (e: unknown) => {
    assert.ok(e instanceof VaultDisagreementError);
    const m = (e as Error).message;
    assert.ok(m.includes(t.sibling), 'names the sibling path');
    assert.ok(m.includes(t.bundle), 'names the bundle path');
    assert.match(m, /sync-bundled-vault\.mjs music-theory/);
    assert.match(m, /FORGE_ALLOW_VAULT_DISAGREEMENT/);
    assert.match(m, /md5 [0-9a-f]{32}/g);
    return true;
  });
  assert.throws(() => readVaultFile('music-theory', REL, { cwd: t.cwd }), VaultDisagreementError);
});

test('a one-byte difference counts (a trailing newline is not "the same file")', () => {
  const t = layout({ sibling: 'x\n', bundle: 'x' });
  assert.throws(() => resolveVaultFile('music-theory', REL, { cwd: t.cwd }), VaultDisagreementError);
});

test('an EXPLICIT choice is honoured and never second-guessed: an override file wins without comparing; the allow flag reads the sibling knowingly', () => {
  const t = layout({ sibling: 'S', bundle: 'B' });
  const override = path.join(path.dirname(t.cwd), 'my-widget.html');
  fs.writeFileSync(override, 'O');
  assert.deepEqual(resolveVaultFile('music-theory', REL, { cwd: t.cwd, override }), { path: override, source: 'override' });
  assert.deepEqual(resolveVaultFile('music-theory', REL, { cwd: t.cwd, allowDisagreement: true }), { path: t.sibling, source: 'sibling' });
  // an override that does not exist is NOT silently ignored in favour of the default: it is no resolution at all
  assert.equal(resolveVaultFile('music-theory', REL, { cwd: t.cwd, override: path.join(t.cwd, 'missing.html') }), null);
});

test('the message is for a person: it says what is wrong, what it means for the test, and how to fix it in the order that works', () => {
  const m = disagreementMessage('music-theory', REL, { path: '/a/music-theory/x', md5: '1'.repeat(32) }, { path: '/b/assets/vaults/music-theory/x', md5: '2'.repeat(32) });
  assert.match(m, /DISAGREE/);
  assert.match(m, /sibling: +\/a\/music-theory\/x/);
  assert.match(m, /bundle: +\/b\/assets\/vaults\/music-theory\/x/);
  assert.match(m, /testing something the plugin will not ship|not what the plugin ships/i);
  assert.match(m, /FORGE_EDITION=music node scripts\/sync-bundled-vault\.mjs music-theory/);
});

test('the real tree: every vault file the rhythm tests read agrees between the sibling and the bundle, or only one of them exists (the check is live, not decorative)', () => {
  // Reads through the same function the tests use; on a machine where they disagree THIS is the test that says so, once, with the paths.
  for (const rel of [REL, 'rhythm_data/rhythm_pattern_straight_rock.md']) {
    resolveVaultFile('music-theory', rel);
  }
});

test('the migrated readers all go through it: no test (or test helper) names the sibling vault path itself — comments aside', () => {
  const src = path.resolve(import.meta.dirname);
  const files = [
    ...fs.readdirSync(src).filter((n) => n.endsWith('.test.ts')).map((n) => path.join(src, n)),
    ...fs.readdirSync(path.join(src, 'test-support')).filter((n) => n.endsWith('.ts')).map((n) => path.join(src, 'test-support', n)),
  ].filter((f) => !/vault-source(\.test)?\.ts$/.test(f));
  assert.ok(files.length > 100, 'NON-VACUITY: the scan covers the whole suite');
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  // the hand-rolled shapes: '../music-theory…' as a string, or path pieces '..', 'music-theory'
  const SIBLING = /['"`]\.\.\/music-theory|['"]\.\.['"]\s*,\s*['"]music-theory['"]/;
  const offenders = files.filter((f) => SIBLING.test(strip(fs.readFileSync(f, 'utf8')))).map((f) => path.relative(src, f));
  assert.deepEqual(offenders.sort(), [], 'these still choose the sibling vault path themselves (go through test-support/vault-source.ts)');
  // and the detector can fire: a hand-rolled line in the shape the old tests had
  assert.match(strip("const f = path.resolve(process.cwd(), '../music-theory', REL);"), SIBLING);
  assert.match(strip("path.resolve(ROOT, '..', 'music-theory', 'x')"), SIBLING);
  assert.doesNotMatch(strip("// reads ../music-theory first\nconst x = 1;"), SIBLING, 'a comment is not a reader');
});
