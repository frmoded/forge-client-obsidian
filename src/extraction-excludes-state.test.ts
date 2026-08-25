// TDD failing-test-first — drain 2026-08-25-1010.
//
// The 0140 leak had a runtime twin nobody looked at. The release zip
// shipped `.forge/` because its bulk-add was unfiltered; EXTRACTION
// copies a bundled vault into the USER'S vault with no filter either.
//
// Today nothing leaks, because 0140 removed `.forge/` from the bundle.
// But that is a property of the input, not a guarantee of the copier —
// the exact "an exclusion prevents arrival, it does not enforce
// absence" shape 0140 named. Put `.forge/` back in the bundle by any
// means and extraction spreads it to every install again.
//
// The authority reused here is `isReservedDirName` from
// vault-mount-exclusions-core — the runtime's existing mirror of the
// engine's `_RESERVED_DIRS` + `.bak.` pattern, already drift-tested
// against the vendored engine source. NOT a new list: the whole point
// of 1010 §2 is one fact, one definition.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copyDirRecursive } from './copy-dir-core.ts';
import { isReservedDirName } from './vault-mount-exclusions-core.ts';

function makeAdapter(seed: Record<string, string>) {
  const files = new Map<string, string>(Object.entries(seed));
  const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
  const dec = (b: ArrayBuffer) => new TextDecoder().decode(new Uint8Array(b));
  return {
    files,
    mkdir: async () => {},
    list: async (path: string) => {
      const f = new Set<string>(), d = new Set<string>();
      for (const k of files.keys()) {
        if (!k.startsWith(`${path}/`)) continue;
        const rest = k.slice(path.length + 1);
        const slash = rest.indexOf('/');
        if (slash === -1) f.add(`${path}/${rest}`);
        else d.add(`${path}/${rest.slice(0, slash)}`);
      }
      return { files: [...f].sort(), folders: [...d].sort() };
    },
    readBinary: async (p: string) => enc(files.get(p)!),
    writeBinary: async (p: string, b: ArrayBuffer) => { files.set(p, dec(b)); },
  };
}

/** A bundled vault that DOES carry state dirs — the non-vacuity
 *  fixture. If extraction is unfiltered, these reach the user. */
const BUNDLE = {
  'bundle/forge.toml': 'version = "1.0.0"',
  'bundle/01-hello/Hello.md': '# Hello',
  'bundle/.forge/edges/authoring/a/authoring/b.md': 'type: snapshot',
  'bundle/.forge/initialized': '1',
  'bundle/.obsidian/community-plugins.json': '["x"]',
  'bundle/.git/config': '[core]',
  'bundle/lib.bak.previous/old.md': 'stale',
};

test('non-vacuity: the fixture really does carry state the copier could spread', async () => {
  const a = makeAdapter(BUNDLE);
  await copyDirRecursive(a, 'bundle', 'unfiltered');
  const leaked = [...a.files.keys()]
    .filter(k => k.startsWith('unfiltered/') && /\.(forge|obsidian|git)\/|\.bak\./.test(k));
  assert.ok(leaked.length >= 5,
    `an unfiltered copy must spread all of it, or this suite proves nothing — got ${leaked.length}`);
});

test('extraction skips Forge-managed state and backup dirs', async () => {
  const a = makeAdapter(BUNDLE);
  await copyDirRecursive(a, 'bundle', 'vault', isReservedDirName);

  const got = [...a.files.keys()].filter(k => k.startsWith('vault/')).sort();
  assert.deepEqual(got, [
    'vault/01-hello/Hello.md',
    'vault/forge.toml',
  ]);
});

test('the real note content still arrives — the filter is not a blanket block', async () => {
  const a = makeAdapter(BUNDLE);
  await copyDirRecursive(a, 'bundle', 'vault', isReservedDirName);
  assert.equal(a.files.get('vault/01-hello/Hello.md'), '# Hello');
  assert.equal(a.files.get('vault/forge.toml'), 'version = "1.0.0"');
});

test('no filter argument means no filtering — the rolling backup depends on it', async () => {
  // main.ts's snapshotToRollingBackup copies the extracted tree into
  // the backup dir and MUST take everything, `.forge/` included: a
  // backup that silently drops the user's runtime state is not a
  // backup. So the skip is opt-in per call, never baked into the copy.
  const a = makeAdapter(BUNDLE);
  await copyDirRecursive(a, 'bundle', 'backup');
  assert.equal(a.files.get('backup/.forge/initialized'), '1');
});
