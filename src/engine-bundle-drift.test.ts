// Pure-core tests for engine-bundle-drift-core.ts. The drift helper is
// the 10th pure-core extraction in the v0.2.x arc (per the protocol's
// pure-core / structural-adapter convention). It walks both source-of-
// truth (forge engine repo) and bundle (forge-client-obsidian assets/
// engine/) file lists via a BundleDriftAdapter shim and produces a
// drift list naming missing, orphaned, and content-mismatched files.
//
// Tests construct an in-memory adapter satisfying the structural
// interface; the real filesystem-backed adapter lives in
// build-release-zip.mjs's preflight + scripts/sync-engine-bundle.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineBundleDrift } from './engine-bundle-drift-core.ts';
import type {
  BundleDriftAdapter,
  // DriftEntry imported implicitly via the helper return type
} from './engine-bundle-drift-core.ts';

// Fake adapter: each scope's file list + per-file bytes are kept in
// in-memory maps. The adapter applies the scope filter on listing
// (real fs adapter does too) so test inputs simulating "source has
// api/server.py" simply omit it from the listed map.
function makeAdapter(
  sourceFiles: Record<string, string>,
  bundleFiles: Record<string, string>,
): BundleDriftAdapter {
  return {
    async listEngineFiles(scope) {
      const files = scope === 'source' ? sourceFiles : bundleFiles;
      return Object.keys(files).sort();
    },
    async readFile(scope, relPath) {
      const files = scope === 'source' ? sourceFiles : bundleFiles;
      const content = files[relPath];
      if (content === undefined) {
        throw new Error(`no such file in ${scope}: ${relPath}`);
      }
      return Buffer.from(content);
    },
  };
}

test('engineBundleDrift returns empty when bundle matches source', async () => {
  const adapter = makeAdapter(
    {
      'core/registry.py': 'class Registry: pass\n',
      'core/executor.py': 'def exec(): pass\n',
      '__init__.py': '',
    },
    {
      'core/registry.py': 'class Registry: pass\n',
      'core/executor.py': 'def exec(): pass\n',
      '__init__.py': '',
    },
  );
  const drift = await engineBundleDrift(adapter);
  assert.deepEqual(drift, []);
});

test('engineBundleDrift detects file added in source not in bundle', async () => {
  const adapter = makeAdapter(
    {
      'core/registry.py': 'A\n',
      'core/llm_prompts.py': 'B\n', // source-only
    },
    {
      'core/registry.py': 'A\n',
    },
  );
  const drift = await engineBundleDrift(adapter);
  assert.deepEqual(drift, [
    { relPath: 'core/llm_prompts.py', status: 'missing-in-bundle' },
  ]);
});

test('engineBundleDrift detects file in bundle not in source', async () => {
  const adapter = makeAdapter(
    {
      'core/registry.py': 'A\n',
    },
    {
      'core/registry.py': 'A\n',
      'core/old_helper.py': 'orphaned\n', // bundle-only
    },
  );
  const drift = await engineBundleDrift(adapter);
  assert.deepEqual(drift, [
    { relPath: 'core/old_helper.py', status: 'orphaned-in-bundle' },
  ]);
});

test('engineBundleDrift detects content mismatch', async () => {
  const adapter = makeAdapter(
    {
      'core/registry.py': 'class Registry: VERSION = 2\n',
    },
    {
      'core/registry.py': 'class Registry: VERSION = 1\n',
    },
  );
  const drift = await engineBundleDrift(adapter);
  assert.deepEqual(drift, [
    { relPath: 'core/registry.py', status: 'content-mismatch' },
  ]);
});

test('engineBundleDrift respects scope filter — adapter omits out-of-scope source files', async () => {
  // The real adapter applies the scope filter on listEngineFiles. So
  // a source repo that has api/server.py (out-of-scope) would not
  // appear in the listed files; the bundle correctly omits it; drift
  // is empty. Simulated here by simply not including api/server.py
  // in either input.
  const adapter = makeAdapter(
    {
      'core/registry.py': 'A\n',
      // 'api/server.py' deliberately omitted — out of scope at list time
    },
    {
      'core/registry.py': 'A\n',
    },
  );
  const drift = await engineBundleDrift(adapter);
  assert.deepEqual(drift, []);
});

test('engineBundleDrift surfaces multiple drift kinds together in deterministic order', async () => {
  // Belt-and-suspenders: when several drift kinds coexist, the
  // returned list is sorted by relPath so reviewers see a stable
  // shape.
  const adapter = makeAdapter(
    {
      'core/registry.py': 'v2\n',
      'core/llm.py': 'source-only\n',
    },
    {
      'core/__init__.py': '', // orphan
      'core/registry.py': 'v1\n', // mismatch
    },
  );
  const drift = await engineBundleDrift(adapter);
  assert.deepEqual(drift, [
    { relPath: 'core/__init__.py', status: 'orphaned-in-bundle' },
    { relPath: 'core/llm.py', status: 'missing-in-bundle' },
    { relPath: 'core/registry.py', status: 'content-mismatch' },
  ]);
});
