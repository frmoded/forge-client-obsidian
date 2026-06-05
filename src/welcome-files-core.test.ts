// Pure-core tests for ensureWelcomeFiles. Runs under `node --test`
// with an in-memory stub satisfying WelcomeFilesAdapter — no
// obsidian shim needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureWelcomeFiles,
  WELCOME_VAULT_PATH,
  GREET_VAULT_PATH,
} from './welcome-files-core.ts';
import type {
  WelcomeFilesAdapter,
  WelcomeBundledPaths,
} from './welcome-files-core.ts';

const BUNDLE_PATHS: WelcomeBundledPaths = {
  welcomeBundle: '.obsidian/plugins/forge-client-obsidian/assets/welcome/welcome.md',
  greetBundle: '.obsidian/plugins/forge-client-obsidian/assets/welcome/greet.md',
};

const WELCOME_BODY = 'welcome body\n';
const GREET_BODY = 'greet body\n';

interface AdapterRecord {
  reads: string[];
  writes: Array<{ path: string; body: string }>;
  existsCalls: string[];
}

function makeAdapter(initial: Map<string, string>): {
  adapter: WelcomeFilesAdapter;
  state: Map<string, string>;
  record: AdapterRecord;
} {
  const state = new Map(initial);
  const record: AdapterRecord = { reads: [], writes: [], existsCalls: [] };
  const adapter: WelcomeFilesAdapter = {
    async exists(path: string): Promise<boolean> {
      record.existsCalls.push(path);
      return state.has(path);
    },
    async read(path: string): Promise<string> {
      record.reads.push(path);
      const v = state.get(path);
      if (v === undefined) throw new Error(`read: ${path} not found`);
      return v;
    },
    async write(path: string, body: string): Promise<void> {
      record.writes.push({ path, body });
      state.set(path, body);
    },
  };
  return { adapter, state, record };
}

// --- ensureWelcomeFiles ---

test('ensureWelcomeFiles: extracts both files when neither exists', async () => {
  const { adapter, state, record } = makeAdapter(new Map([
    [BUNDLE_PATHS.welcomeBundle, WELCOME_BODY],
    [BUNDLE_PATHS.greetBundle, GREET_BODY],
  ]));
  const result = await ensureWelcomeFiles(adapter, BUNDLE_PATHS);
  assert.deepEqual(result, { kind: 'extracted' });
  assert.equal(state.get(WELCOME_VAULT_PATH), WELCOME_BODY);
  assert.equal(state.get(GREET_VAULT_PATH), GREET_BODY);
  // Both writes happened.
  assert.equal(record.writes.length, 2);
});

test('ensureWelcomeFiles: skips when welcome.md already exists (preserves user edits)', async () => {
  const { adapter, state, record } = makeAdapter(new Map([
    [WELCOME_VAULT_PATH, '# user-edited welcome\n'],
    [BUNDLE_PATHS.welcomeBundle, WELCOME_BODY],
    [BUNDLE_PATHS.greetBundle, GREET_BODY],
  ]));
  const result = await ensureWelcomeFiles(adapter, BUNDLE_PATHS);
  assert.deepEqual(result, { kind: 'skip-existing' });
  // User's welcome unchanged; no writes happened.
  assert.equal(state.get(WELCOME_VAULT_PATH), '# user-edited welcome\n');
  assert.equal(record.writes.length, 0);
});

test('ensureWelcomeFiles: skips when only greet.md exists (respects partial deletion)', async () => {
  // User deleted welcome.md but kept greet.md (using it for their own
  // work). Don't restore welcome — they signaled past-welcome state.
  const { adapter, state, record } = makeAdapter(new Map([
    [GREET_VAULT_PATH, '# user-edited greet\n'],
    [BUNDLE_PATHS.welcomeBundle, WELCOME_BODY],
    [BUNDLE_PATHS.greetBundle, GREET_BODY],
  ]));
  const result = await ensureWelcomeFiles(adapter, BUNDLE_PATHS);
  assert.deepEqual(result, { kind: 'skip-existing' });
  assert.equal(state.has(WELCOME_VAULT_PATH), false);  // not restored
  assert.equal(state.get(GREET_VAULT_PATH), '# user-edited greet\n');
  assert.equal(record.writes.length, 0);
});

test('ensureWelcomeFiles: warns + skips when bundled welcome.md missing', async () => {
  const { adapter, record } = makeAdapter(new Map([
    // No bundled assets at all.
  ]));
  const result = await ensureWelcomeFiles(adapter, BUNDLE_PATHS);
  assert.equal(result.kind, 'skip-no-bundle');
  if (result.kind === 'skip-no-bundle') {
    assert.equal(result.missing, BUNDLE_PATHS.welcomeBundle);
  }
  assert.equal(record.writes.length, 0);
});

test('ensureWelcomeFiles: warns + skips when bundled greet.md missing', async () => {
  const { adapter, record } = makeAdapter(new Map([
    [BUNDLE_PATHS.welcomeBundle, WELCOME_BODY],
    // greet bundle absent
  ]));
  const result = await ensureWelcomeFiles(adapter, BUNDLE_PATHS);
  assert.equal(result.kind, 'skip-no-bundle');
  if (result.kind === 'skip-no-bundle') {
    assert.equal(result.missing, BUNDLE_PATHS.greetBundle);
  }
  assert.equal(record.writes.length, 0);
});

test('ensureWelcomeFiles: idempotent — second call after extraction is a no-op', async () => {
  const initial = new Map([
    [BUNDLE_PATHS.welcomeBundle, WELCOME_BODY],
    [BUNDLE_PATHS.greetBundle, GREET_BODY],
  ]);
  const { adapter, state, record } = makeAdapter(initial);
  const first = await ensureWelcomeFiles(adapter, BUNDLE_PATHS);
  assert.deepEqual(first, { kind: 'extracted' });
  const writesAfterFirst = record.writes.length;
  const second = await ensureWelcomeFiles(adapter, BUNDLE_PATHS);
  assert.deepEqual(second, { kind: 'skip-existing' });
  // No new writes after the first extraction.
  assert.equal(record.writes.length, writesAfterFirst);
  // Both files still at the bundled content.
  assert.equal(state.get(WELCOME_VAULT_PATH), WELCOME_BODY);
  assert.equal(state.get(GREET_VAULT_PATH), GREET_BODY);
});

// Defensive extras — protocol §1.1 "lean toward more coverage"

test('ensureWelcomeFiles: error during read propagates as kind: error', async () => {
  // Simulate a bundled asset that exists (per exists()) but throws on
  // read — e.g., permission denied. The helper catches and returns
  // an error result so the caller can log without aborting plugin
  // onload.
  const state = new Map([
    [BUNDLE_PATHS.welcomeBundle, '<throws on read>'],
    [BUNDLE_PATHS.greetBundle, GREET_BODY],
  ]);
  const adapter: WelcomeFilesAdapter = {
    async exists(path: string): Promise<boolean> {
      return state.has(path);
    },
    async read(path: string): Promise<string> {
      if (path === BUNDLE_PATHS.welcomeBundle) {
        throw new Error('EACCES: permission denied');
      }
      return state.get(path)!;
    },
    async write(): Promise<void> { /* no-op */ },
  };
  const result = await ensureWelcomeFiles(adapter, BUNDLE_PATHS);
  assert.equal(result.kind, 'error');
  if (result.kind === 'error') {
    assert.match(result.message, /EACCES/);
  }
});

test('ensureWelcomeFiles: WELCOME_VAULT_PATH + GREET_VAULT_PATH constants are vault-relative (no leading slash)', async () => {
  // Defensive — caller writes to adapter using these literally. A
  // leading slash would mean "absolute" on some adapters and silently
  // misplace the files.
  assert.equal(WELCOME_VAULT_PATH, 'welcome.md');
  assert.equal(GREET_VAULT_PATH, 'greet.md');
  assert.equal(WELCOME_VAULT_PATH.startsWith('/'), false);
  assert.equal(GREET_VAULT_PATH.startsWith('/'), false);
});

test('ensureWelcomeFiles: order of exists calls — vault-files first (cheap), bundle second', async () => {
  // Verifies the "fast path" optimization: if welcome.md already
  // exists at vault root, we don't even probe the bundled assets.
  const { adapter, record } = makeAdapter(new Map([
    [WELCOME_VAULT_PATH, 'user content'],
  ]));
  await ensureWelcomeFiles(adapter, BUNDLE_PATHS);
  // First two exists calls are the vault-file probes (welcome, greet).
  // We short-circuit before touching the bundle paths.
  assert.equal(record.existsCalls.length, 2);
  assert.equal(record.existsCalls[0], WELCOME_VAULT_PATH);
  assert.equal(record.existsCalls[1], GREET_VAULT_PATH);
});
