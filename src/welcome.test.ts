// Pure-core tests for welcome.ts's copyDirRecursive. Uses a minimal
// in-memory DataAdapter stub — only the four methods copyDirRecursive
// touches (mkdir, list, readBinary, writeBinary) need real
// implementations; everything else is a typed `as unknown as
// DataAdapter` shim.
//
// Catches the v0.2.13 bundled-forge-moda extraction at suite time
// (file content preserved, nested-dir structure preserved, target
// paths landed at the right vault-root path).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyDirRecursive, type CopyAdapter } from './copy-dir-core.ts';

interface AdapterState {
  /** `path → bytes` for files. Directories don't have explicit
   *  entries; their presence is inferred from list()'s tree walk. */
  files: Map<string, Uint8Array>;
  /** Paths that exist as directories — list() returns immediate
   *  children only. */
  dirs: Set<string>;
}

function makeAdapter(state: AdapterState): CopyAdapter {
  const adapter: CopyAdapter = {
    mkdir: async (path: string) => {
      state.dirs.add(path);
    },
    list: async (path: string) => {
      // Immediate children only — mimics Obsidian's actual list()
      // behavior. Walk every file/dir, keep those whose parent is
      // exactly `path`.
      const files: string[] = [];
      const folders: string[] = [];
      const prefix = path === '' ? '' : path + '/';
      for (const f of state.files.keys()) {
        if (!f.startsWith(prefix)) continue;
        const rest = f.slice(prefix.length);
        if (!rest.includes('/')) files.push(f);
      }
      for (const d of state.dirs) {
        if (d === path) continue;
        if (!d.startsWith(prefix)) continue;
        const rest = d.slice(prefix.length);
        if (!rest.includes('/')) folders.push(d);
      }
      return { files, folders };
    },
    readBinary: async (path: string): Promise<ArrayBuffer> => {
      const bytes = state.files.get(path);
      if (!bytes) throw new Error(`readBinary: ${path} not found`);
      // Return an actual ArrayBuffer rather than the underlying
      // SharedArrayBuffer-vs-ArrayBuffer ambiguity Uint8Array carries.
      const buf = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buf).set(bytes);
      return buf;
    },
    writeBinary: async (path: string, data: ArrayBuffer) => {
      state.files.set(path, new Uint8Array(data));
    },
  };
  return adapter;
}

test('copyDirRecursive: copies flat source to fresh target', async () => {
  const state: AdapterState = {
    files: new Map([
      ['src/a.md', new TextEncoder().encode('alpha')],
      ['src/b.md', new TextEncoder().encode('beta')],
    ]),
    dirs: new Set(['src']),
  };
  const adapter = makeAdapter(state);
  await copyDirRecursive(adapter, 'src', 'dst');

  assert.ok(state.dirs.has('dst'), 'target dir created');
  assert.equal(new TextDecoder().decode(state.files.get('dst/a.md')), 'alpha');
  assert.equal(new TextDecoder().decode(state.files.get('dst/b.md')), 'beta');
});

test('copyDirRecursive: preserves nested directory structure', async () => {
  // forge-moda has nested layout (forge-moda/_chips.md +
  // forge-moda/forge.toml + forge-moda/<id>.md flat for V1, but
  // future-proofing for nested subdirs). copyDirRecursive must
  // walk recursively and recreate the structure verbatim.
  const state: AdapterState = {
    files: new Map([
      ['src/a.md', new TextEncoder().encode('top')],
      ['src/nested/b.md', new TextEncoder().encode('inner')],
      ['src/nested/deep/c.md', new TextEncoder().encode('deepest')],
    ]),
    dirs: new Set(['src', 'src/nested', 'src/nested/deep']),
  };
  const adapter = makeAdapter(state);
  await copyDirRecursive(adapter, 'src', 'dst');

  assert.equal(new TextDecoder().decode(state.files.get('dst/a.md')), 'top');
  assert.equal(new TextDecoder().decode(state.files.get('dst/nested/b.md')), 'inner');
  assert.equal(new TextDecoder().decode(state.files.get('dst/nested/deep/c.md')), 'deepest');
});

test('copyDirRecursive: empty source produces empty target dir', async () => {
  // Defensive — if the bundled forge-moda assets happen to be empty
  // (a build glitch), we shouldn't error; we should produce an empty
  // target dir and let downstream resolve cleanly.
  const state: AdapterState = {
    files: new Map(),
    dirs: new Set(['src']),
  };
  const adapter = makeAdapter(state);
  await copyDirRecursive(adapter, 'src', 'dst');
  assert.ok(state.dirs.has('dst'));
});

test('copyDirRecursive: binary file content survives round-trip', async () => {
  // forge-moda files are all text in V1, but the implementation uses
  // readBinary/writeBinary specifically so binary assets (future
  // images, midi blobs) survive. Verify bytes are preserved
  // verbatim, not text-mangled.
  const original = new Uint8Array([0xff, 0x00, 0x7f, 0x80, 0x01, 0xfe]);
  const state: AdapterState = {
    files: new Map([['src/binary.bin', original]]),
    dirs: new Set(['src']),
  };
  const adapter = makeAdapter(state);
  await copyDirRecursive(adapter, 'src', 'dst');

  const copied = state.files.get('dst/binary.bin');
  assert.ok(copied);
  assert.deepEqual(Array.from(copied!), Array.from(original));
});

test('copyDirRecursive: path slicing handles single-segment src + dst', async () => {
  // The slice math is `filePath.slice(src.length + 1)` — easy to get
  // off-by-one with single-segment paths like 'forge-moda' →
  // 'forge-moda/setup.md' should slice cleanly to 'setup.md'.
  const state: AdapterState = {
    files: new Map([
      ['forge-moda/setup.md', new TextEncoder().encode('setup body')],
    ]),
    dirs: new Set(['forge-moda']),
  };
  const adapter = makeAdapter(state);
  await copyDirRecursive(adapter, 'forge-moda', 'forge-moda-copy');

  assert.equal(
    new TextDecoder().decode(state.files.get('forge-moda-copy/setup.md')),
    'setup body',
  );
});
