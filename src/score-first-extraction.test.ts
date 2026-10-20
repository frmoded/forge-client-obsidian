// Drain 2026-10-21-2200 (driver decision 5) — a score-first vault gets no bundled-library extraction and no Welcome.md; every other vault extracts exactly as before.
// The no-harm half is kept in full (light profile): for every shipped vault's real forge.toml, and for a vault like ClaudeQA's, the answer is what `isSourceVault` alone gave.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { SCORE_FIRST_SKIP, extractionSkipFor, isSourceVault, shouldSkipBundledExtract, skipWhy } from './source-vault-core.ts';
import { shouldCreateLegacyWelcomeMd } from './welcome-legacy-gate-core.ts';
import { BUNDLED_VAULT_NAMES } from './bundled-vault-extraction-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const PLAYGROUND = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const NAMES: ReadonlySet<string> = new Set(['forge-moda', 'forge-tutorial', 'music-core', 'music-theory']);
const CLAUDEQA = 'name = "ClaudeQA"\nversion = "0.1.0"\ndescription = "QA vault"\ndomains = ["moda", "music"]\n';

test('a score-first vault skips the first-open extraction, the Welcome files and the legacy Welcome.md', () => {
  const skip = extractionSkipFor(isSourceVault(PLAYGROUND, NAMES), PLAYGROUND);
  assert.equal(skip, SCORE_FIRST_SKIP);
  assert.equal(shouldSkipBundledExtract(skip), true, 'bundled libraries + welcome.md/greet.md (the call sites in welcome.ts)');
  assert.equal(shouldCreateLegacyWelcomeMd(false, skip), false, 'the capital-W Welcome.md');
});

test('NO HARM: every shipped vault\'s real forge.toml and an ordinary user vault give exactly what isSourceVault alone gave (a source repo skips, everything else extracts)', () => {
  const vaults = path.join(ROOT, 'assets/vaults');
  const found = fs.readdirSync(vaults).filter((d) => fs.existsSync(path.join(vaults, d, 'forge.toml')));
  assert.ok(found.length >= 2, `non-vacuity: found ${found.join(', ')}`);
  for (const v of found) {
    const toml = fs.readFileSync(path.join(vaults, v, 'forge.toml'), 'utf8');
    const before = isSourceVault(toml, NAMES);
    assert.equal(extractionSkipFor(before, toml), before, `${v}: unchanged (it is its own source repo: skip, by name)`);
  }
  for (const name of BUNDLED_VAULT_NAMES) assert.equal(extractionSkipFor(name, `name = "${name}"\n`), name, 'a source repo keeps its name as the reason');
  assert.equal(extractionSkipFor(isSourceVault(CLAUDEQA, NAMES), CLAUDEQA), null, 'an ordinary vault extracts');
  assert.equal(extractionSkipFor(null, null), null, 'no forge.toml: extracts');
  assert.equal(extractionSkipFor(null, ''), null);
  assert.equal(shouldSkipBundledExtract(extractionSkipFor(isSourceVault(CLAUDEQA, NAMES), CLAUDEQA)), false);
  assert.equal(shouldCreateLegacyWelcomeMd(false, extractionSkipFor(null, CLAUDEQA)), true, 'and its Welcome.md is still created');
});

test('a library\'s own source repo wins over a profile (the more specific fact); a profile only counts at the top level', () => {
  assert.equal(extractionSkipFor('music-core', PLAYGROUND), 'music-core');
  assert.equal(extractionSkipFor(null, 'name = "x"\n[imports]\nprofile = "score_first"\n'), null);
  assert.equal(extractionSkipFor(null, 'name = "x"\n# profile = "score_first"\n'), null);
});

test('the log phrase names the real reason, and the old wording is unchanged for a source repo', () => {
  assert.match(skipWhy(SCORE_FIRST_SKIP), /profile = "score_first"/);
  assert.equal(skipWhy('music-core'), 'vault root declares itself as source repo for music-core');
  assert.ok(SCORE_FIRST_SKIP.includes(' '), 'can never equal a real vault name');
});

test('MECHANISM PIN: welcome.ts asks the question in ONE place (detectSourceVault) and every extraction gate uses its answer — if the design moves this SHOULD go red; reassess, do not just rewrite', () => {
  const code = fs.readFileSync(path.join(ROOT, 'src/welcome.ts'), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.equal((code.match(/extractionSkipFor\(/g) ?? []).length, 1);
  assert.ok(!/isScoreFirstVault|vault-profile-core/.test(code), 'welcome.ts does not read the profile on its own');
  const gates = (code.match(/shouldSkipBundledExtract\(sourceVaultName\)/g) ?? []).length;
  assert.ok(gates >= 4, `the four extraction gates (welcome files, libraries, sweep, ensureBundledFor) all use it: ${gates}`);
  assert.match(code, /shouldCreateLegacyWelcomeMd\(hasSentinel, sourceVaultName\)/);
});
