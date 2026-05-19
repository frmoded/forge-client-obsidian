// Dispatcher unit tests. Runs under `node --test` (Node ≥ 23.6 strips
// the type annotations natively — no bundler, no obsidian shim). We test
// the pure core only; the manifest parse is `parseDomainsField`, so
// "mock the manifest parser" here just means feeding forgeActionContext
// the values that parser would have produced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  forgeActionContext,
  parseDomainsField,
  isValidVaultName,
  renderForgeToml,
  replaceForgeTomlDomains,
  unionDomains,
  diffDomains,
} from './forge-action-core.ts';

test('forgeActionContext: no forge.toml → init wizard', () => {
  assert.deepEqual(forgeActionContext(false, undefined), { kind: 'init' });
  // domainsField is irrelevant when the file is absent.
  assert.deepEqual(forgeActionContext(false, ['moda']), { kind: 'init' });
});

test('forgeActionContext: forge.toml without domains → legacy menu', () => {
  assert.deepEqual(forgeActionContext(true, undefined), { kind: 'legacy' });
});

test('forgeActionContext: forge.toml with empty domains → declared (core-only)', () => {
  assert.deepEqual(forgeActionContext(true, []), { kind: 'domains', domains: [] });
});

test('forgeActionContext: forge.toml with declared domains → scoped menu', () => {
  assert.deepEqual(forgeActionContext(true, ['moda']), {
    kind: 'domains',
    domains: ['moda'],
  });
  assert.deepEqual(forgeActionContext(true, ['moda', 'music']), {
    kind: 'domains',
    domains: ['moda', 'music'],
  });
});

test('parseDomainsField: absent field → undefined (legacy)', () => {
  assert.equal(
    parseDomainsField('name = "v"\nversion = "0.1.0"\n'),
    undefined,
  );
});

test('parseDomainsField: single-line array', () => {
  assert.deepEqual(
    parseDomainsField('name = "v"\ndomains = ["moda", "music"]\n'),
    ['moda', 'music'],
  );
});

test('parseDomainsField: multi-line array (installer reformat shape)', () => {
  const toml =
    'name = "dry-run-vault"\n' +
    'version = "0.0.0"\n' +
    'domains = [\n    "moda",\n]\n';
  assert.deepEqual(parseDomainsField(toml), ['moda']);
});

test('parseDomainsField: empty array → [] (core-only, not legacy)', () => {
  assert.deepEqual(parseDomainsField('domains = []\n'), []);
});

test('isValidVaultName: engine name rule ^[a-z][a-z0-9-]{2,63}$', () => {
  assert.ok(isValidVaultName('my-forge-vault'));
  assert.ok(isValidVaultName('abc'));
  assert.ok(!isValidVaultName('ab')); // too short (min 3)
  assert.ok(!isValidVaultName('My-Vault')); // uppercase
  assert.ok(!isValidVaultName('1vault')); // must start with a letter
  assert.ok(!isValidVaultName('my vault')); // no spaces
  assert.ok(!isValidVaultName('-vault')); // must start with a letter
});

test('renderForgeToml: empty domains writes []', () => {
  assert.equal(
    renderForgeToml('my-vault', []),
    'name = "my-vault"\nversion = "0.1.0"\n' +
      'description = "Forge vault."\ndomains = []\n',
  );
});

test('renderForgeToml: declared domains round-trip through parseDomainsField', () => {
  const toml = renderForgeToml('my-vault', ['moda', 'music']);
  assert.deepEqual(parseDomainsField(toml), ['moda', 'music']);
  // And the dispatcher reads it back as a scoped menu.
  assert.deepEqual(forgeActionContext(true, parseDomainsField(toml)), {
    kind: 'domains',
    domains: ['moda', 'music'],
  });
});

test('unionDomains: undefined existing treated as []', () => {
  assert.deepEqual(unionDomains(undefined, ['moda']), ['moda']);
});

test('unionDomains: preserves existing order, drops duplicates', () => {
  assert.deepEqual(
    unionDomains(['moda'], ['moda', 'music']),
    ['moda', 'music'],
  );
  assert.deepEqual(unionDomains(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
});

test('replaceForgeTomlDomains: single-line array, other fields intact', () => {
  const toml =
    'name = "v"\nversion = "0.1.0"\ndomains = ["moda"]\n';
  const out = replaceForgeTomlDomains(toml, ['moda', 'music']);
  assert.equal(
    out, 'name = "v"\nversion = "0.1.0"\ndomains = ["moda", "music"]\n');
  assert.deepEqual(parseDomainsField(out), ['moda', 'music']);
});

test('replaceForgeTomlDomains: multi-line array (installer reformat) not corrupted', () => {
  const toml =
    'name = "dry-run-vault"\nversion = "0.0.0"\n' +
    'dependencies = [\n    { name = "forge-moda", version = "0.4.0" },\n]\n' +
    'domains = [\n    "moda",\n]\n';
  const out = replaceForgeTomlDomains(toml, ['moda', 'music']);
  assert.deepEqual(parseDomainsField(out), ['moda', 'music']);
  // The dependencies array must survive untouched.
  assert.ok(out.includes('{ name = "forge-moda", version = "0.4.0" }'));
  // No dangling array remnants from a line-only replace.
  assert.ok(!out.includes('\n    "moda",\n]'));
});

test('diffDomains: empty / empty → empty diff', () => {
  assert.deepEqual(diffDomains([], []), { to_add: [], to_remove: [] });
});

test('diffDomains: add-only', () => {
  assert.deepEqual(diffDomains([], ['moda']), {
    to_add: ['moda'], to_remove: [],
  });
  assert.deepEqual(diffDomains(['moda'], ['moda', 'music']), {
    to_add: ['music'], to_remove: [],
  });
});

test('diffDomains: remove-only', () => {
  assert.deepEqual(diffDomains(['moda'], []), {
    to_add: [], to_remove: ['moda'],
  });
  assert.deepEqual(diffDomains(['moda', 'music'], ['moda']), {
    to_add: [], to_remove: ['music'],
  });
});

test('diffDomains: mixed add + remove', () => {
  assert.deepEqual(diffDomains(['moda'], ['music']), {
    to_add: ['music'], to_remove: ['moda'],
  });
});

test('diffDomains: same on both sides → no-op (Save button stays disabled)', () => {
  assert.deepEqual(diffDomains(['moda', 'music'], ['moda', 'music']), {
    to_add: [], to_remove: [],
  });
  // Order on the "next" side shouldn't matter for the diff.
  assert.deepEqual(diffDomains(['moda', 'music'], ['music', 'moda']), {
    to_add: [], to_remove: [],
  });
});

test('replaceForgeTomlDomains: legacy vault with no domains field appends one', () => {
  const toml = 'name = "v"\nversion = "0.1.0"\n';
  const out = replaceForgeTomlDomains(toml, ['moda']);
  assert.deepEqual(parseDomainsField(out), ['moda']);
  assert.ok(out.startsWith('name = "v"\nversion = "0.1.0"'));
});
