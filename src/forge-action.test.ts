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
