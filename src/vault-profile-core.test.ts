// score_first_experiment M0 (drain 2026-10-21-1100) — a vault's profile: `profile = "score_first"`, a constant key of forge.toml, read in ONE place.
//
// New-feature discipline: every observable behaviour has a test; the guards have mutants (see the FEEDBACK). The P3 half (a vault without the key behaves exactly as before,
// in every vault that ships) is in score-first-p3.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PROFILE_SCORE_FIRST, isScoreFirstToml, isScoreFirstVault, readVaultProfile } from './vault-profile-core.ts';

// The shape music-playground's forge.toml has: the key BEFORE [imports] (in TOML every key after a [table] header belongs to that table).
const PLAYGROUND = [
  'name = "music-playground"',
  'version = "0.0.1"',
  'description = "A score-first percussion playground."',
  'domains = ["music"]',
  'profile = "score_first"',
  '',
  '[imports]',
  'music-core = { local = "../music-core" }',
  '',
].join('\n');

test('a forge.toml that declares profile = "score_first" is score-first', () => {
  assert.equal(readVaultProfile(PLAYGROUND), 'score_first');
  assert.equal(isScoreFirstToml(PLAYGROUND), true);
  assert.equal(PROFILE_SCORE_FIRST, 'score_first');
});

test('the key may sit anywhere at the top level, with or without spaces, single or double quotes, and a trailing comment', () => {
  for (const line of ['profile="score_first"', 'profile = "score_first"', '  profile   =   "score_first"  ', "profile = 'score_first'", 'profile = "score_first" # constant']) {
    assert.equal(isScoreFirstToml(`name = "x"\n${line}\nversion = "1.0.0"\n`), true, line);
  }
  assert.equal(isScoreFirstToml('profile = "score_first"\nname = "x"\n'), true, 'first line');
  assert.equal(isScoreFirstToml('name = "x"\r\nprofile = "score_first"\r\n'), true, 'CRLF line endings');
});

test('the default is NOT score-first: absent, null, empty, commented out, another value, unquoted, empty string', () => {
  assert.equal(isScoreFirstToml(null), false);
  assert.equal(isScoreFirstToml(undefined), false);
  assert.equal(isScoreFirstToml(''), false);
  assert.equal(isScoreFirstToml('name = "music-theory"\nversion = "0.11.45"\ndomains = ["music"]\n'), false, 'no key at all');
  assert.equal(isScoreFirstToml('name = "x"\n# profile = "score_first"\n'), false, 'commented out');
  assert.equal(isScoreFirstToml('name = "x"\nprofile = "tutorial"\n'), false, 'another profile');
  assert.equal(isScoreFirstToml('name = "x"\nprofile = "Score_First"\n'), false, 'exact match only');
  assert.equal(isScoreFirstToml('name = "x"\nprofile = score_first\n'), false, 'unquoted is malformed TOML, so no profile (never a guess)');
  assert.equal(isScoreFirstToml('name = "x"\nprofile = score_first\nprofile = "score_first"\n'), false, 'a malformed first profile line is the vault\'s profile line: no guessing past it');
  assert.equal(isScoreFirstToml('name = "x"\nprofile = ""\n'), false, 'empty value');
  assert.equal(readVaultProfile('name = "x"\nprofile = "tutorial"\n'), 'tutorial', 'another value is still READ (so a future profile can be added), just not score_first');
});

test('KNOWN LIMITS (a decision, not an accident): spellings a full TOML parser would accept but this line reader does not are "no profile" — the default is always "behave as before"', () => {
  // Same value, different serialization (I27): quoted key, escape sequences, multi-line strings. A real TOML parser reads these as score_first; the plugin has no TOML parser and
  // a missed profile only means a normal vault, whereas a guessed one would change a vault's behaviour. Write the key the plain way (see docs/vault-profile.md).
  const odd = ['"profile" = "score_first"', 'profile = "score\\u005ffirst"', 'profile = """score_first"""', "profile = '''score_first'''", 'profile . x = "score_first"'];
  for (const line of odd) assert.equal(isScoreFirstToml(`name = "x"\nprofile_placeholder\n`.replace('profile_placeholder', line)), false, line);
});

test('a `profile` key inside a [table] is that table\'s key, not the vault\'s (so the key must come BEFORE [imports])', () => {
  assert.equal(isScoreFirstToml('name = "x"\n\n[imports]\nprofile = "score_first"\n'), false);
  assert.equal(isScoreFirstToml('[imports]\nmusic-core = { local = "../music-core" }\nprofile = "score_first"\n'), false);
  assert.equal(isScoreFirstToml('name = "x"\n[[dependencies]]\nname = "a"\nprofile = "score_first"\n'), false);
});

test('the FIRST profile line wins', () => {
  assert.equal(readVaultProfile('profile = "tutorial"\nprofile = "score_first"\n'), 'tutorial');
  assert.equal(readVaultProfile('profile = "score_first"\nprofile = "tutorial"\n'), 'score_first');
});

test('isScoreFirstVault reads forge.toml at the vault root through the adapter, and nothing else', async () => {
  const calls: string[] = [];
  const mk = (files: Record<string, string>, boom = false) => ({
    adapter: {
      async exists(p: string) { calls.push(`exists ${p}`); return p in files; },
      async read(p: string) { calls.push(`read ${p}`); if (boom) throw new Error('disk gone'); return files[p]; },
    },
  });
  assert.equal(await isScoreFirstVault(mk({ 'forge.toml': PLAYGROUND })), true);
  assert.deepEqual(calls, ['exists forge.toml', 'read forge.toml'], 'one existence check and one read, of forge.toml only');
  assert.equal(await isScoreFirstVault(mk({ 'forge.toml': 'name = "music-theory"\n' })), false);
  calls.length = 0;
  assert.equal(await isScoreFirstVault(mk({})), false, 'no forge.toml: a normal vault');
  assert.deepEqual(calls, ['exists forge.toml'], 'and nothing is read');
});

test('isScoreFirstVault never throws: an unreadable forge.toml is a normal vault (and says so on the console)', async () => {
  const errors: unknown[][] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { errors.push(a); };
  try {
    const v = { adapter: { async exists() { return true; }, async read(): Promise<string> { throw new Error('disk gone'); } } };
    assert.equal(await isScoreFirstVault(v), false);
    const w = { adapter: { async exists(): Promise<boolean> { throw new Error('adapter down'); }, async read() { return ''; } } };
    assert.equal(await isScoreFirstVault(w), false);
  } finally {
    console.error = orig;
  }
  assert.equal(errors.length, 2);
  assert.match(String(errors[0][0]), /isScoreFirstVault/, 'the originating function is named (caught errors go to console.error)');
});

test('nothing in the plugin can WRITE the key: no source file but this core and its tests mentions the profile key outside comments', async () => {
  // The profile is a constant of the vault, not a setting. A writer would be a toggle by another name.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = path.resolve(import.meta.dirname);
  const offenders: string[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts') && !x.endsWith('.generated.ts'))) {
    const code = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    if (/profile\s*=\s*"score_first"|PROFILE_SCORE_FIRST|PROFILE_KEY/.test(code) && f !== 'vault-profile-core.ts') offenders.push(f);
    if (/writeProfile|setProfile|toggleProfile|score_first['"]\s*:\s*/.test(code)) offenders.push(`${f} (writer)`);
  }
  assert.deepEqual(offenders, [], 'only vault-profile-core.ts knows the key');
});
