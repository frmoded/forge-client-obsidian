// Pure-core tests for forge-toml-stub.ts. Uses an in-memory
// TomlStubAdapter stub — same shape as the v0.2.13 CopyAdapter stub
// pattern. Catches the v0.2.14 "InitializeForgeVaultWizard auto-open
// suppression" contract at suite time instead of at student-reload
// time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureForgeTomlStub,
  FORGE_TOML_STUB_BODY,
  FORGE_TOML_STUB_PATH,
  type TomlStubAdapter,
} from './forge-toml-stub.ts';

interface AdapterState {
  files: Map<string, string>;
}

function makeAdapter(state: AdapterState): TomlStubAdapter {
  return {
    exists: async (path: string) => state.files.has(path),
    write: async (path: string, data: string) => {
      state.files.set(path, data);
    },
  };
}

test('ensureForgeTomlStub: writes the stub when forge.toml is missing', async () => {
  const state: AdapterState = { files: new Map() };
  const adapter = makeAdapter(state);

  const wrote = await ensureForgeTomlStub(adapter);

  assert.equal(wrote, true);
  assert.ok(state.files.has(FORGE_TOML_STUB_PATH));
  assert.equal(state.files.get(FORGE_TOML_STUB_PATH), FORGE_TOML_STUB_BODY);
});

test('ensureForgeTomlStub: skips when forge.toml already exists', async () => {
  // Existing forge.toml (user-managed OR from a pre-v0.2.14 vault
  // with declared domains) MUST NOT be overwritten — that would
  // silently delete the user's domain declarations.
  const userToml = 'domains = ["moda", "music"]\n';
  const state: AdapterState = {
    files: new Map([[FORGE_TOML_STUB_PATH, userToml]]),
  };
  const adapter = makeAdapter(state);

  const wrote = await ensureForgeTomlStub(adapter);

  assert.equal(wrote, false);
  // Existing content preserved verbatim.
  assert.equal(state.files.get(FORGE_TOML_STUB_PATH), userToml);
});

test('FORGE_TOML_STUB_BODY: declares empty domains', async () => {
  // The whole point of the stub is to satisfy the
  // InitializeForgeVaultWizard auto-open trigger ("no forge.toml")
  // while NOT activating any domain-gated commands. `domains = []`
  // is the V1 closed-beta default — bundled forge-moda runs from
  // plugin assets regardless of what's listed.
  assert.match(FORGE_TOML_STUB_BODY, /^domains\s*=\s*\[\s*\]\s*$/m);
});

test('FORGE_TOML_STUB_BODY: comments explain how to add domains later', async () => {
  // Closed-beta students are non-developers; the stub doubles as
  // documentation for "what does forge.toml do?" The comment block
  // is the only in-vault hint they get pre-v1.1 about adding domains.
  assert.match(FORGE_TOML_STUB_BODY, /v1\.1\+/);
  assert.match(FORGE_TOML_STUB_BODY, /music/);
});
