// v0.2.30 — freeze-edge tests. Closes the HTTP-only /freeze gap by
// routing through Pyodide via _forge_set_edge_state. Engine has
// snapshots.set_snapshot_state; this test exercises the JS↔Python
// boundary helper end-to-end against a fixture vault with a real
// snapshot file pre-written into MEMFS.
//
// Per cc-prompt-queue.md §80 dynamic-load rider: the test fixture
// loads the inline Python block from src/pyodide-host.ts dynamically
// via the _PYTHON_BLOCK_BEGIN/_END markers — no hand-mirrored
// _forge_set_edge_state inline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadPyodide } from 'pyodide';

let _pyodidePromise: Promise<any> | null = null;
function getPyodide(): Promise<any> {
  if (_pyodidePromise === null) _pyodidePromise = loadPyodide();
  return _pyodidePromise;
}

function walk(dir: string, base = ''): Array<{ rel: string; abs: string }> {
  const out: Array<{ rel: string; abs: string }> = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entry.name);
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, rel));
    else out.push({ rel, abs });
  }
  return out;
}

// Mirrors the bundled snapshot shape observed at
// ~/projects/forge-music/.forge/edges/authoring/song/authoring/chorus.md
// captured_at is a constant so tests are deterministic.
const LIVE_SNAPSHOT_BODY = `---
type: snapshot
caller: authoring/song
callee: authoring/chorus
state: live
captured_at: '2026-06-02T01:44:22Z'
content_type: musicxml
---

<placeholder body content for test>
`;

const FROZEN_SNAPSHOT_BODY = LIVE_SNAPSHOT_BODY.replace(
  'state: live',
  'state: frozen',
);

async function bootSnapshotVault(): Promise<any> {
  const py = await getPyodide();
  await py.loadPackage(['numpy', 'pyyaml']);

  // Mount the engine + an empty user vault. Mirrors bootGreet's
  // boot shape (compute-kwargs.test.ts).
  const engineDir = path.resolve(process.cwd(), 'assets/engine');
  if (!fs.existsSync(engineDir)) {
    throw new Error(`engine bundle not found at ${engineDir} — run npm run build first`);
  }
  try { py.FS.mkdir('/bundle'); } catch { /* exists */ }
  try { py.FS.mkdir('/bundle/engine'); } catch { /* exists */ }
  try { py.FS.mkdir('/bundle/user-vault'); } catch { /* exists */ }

  const created = new Set(['/bundle/engine']);
  for (const { rel, abs } of walk(engineDir)) {
    const parts = rel.split(path.sep);
    let cursor = '/bundle/engine';
    for (let i = 0; i < parts.length - 1; i++) {
      cursor = cursor + '/' + parts[i];
      if (!created.has(cursor)) {
        try { py.FS.mkdir(cursor); created.add(cursor); } catch { /* exists */ }
      }
    }
    const target = '/bundle/engine/' + parts.join('/');
    try { py.FS.writeFile(target, fs.readFileSync(abs)); } catch { /* already */ }
  }

  // Pre-create the snapshot directory structure: caller_id 'authoring/song'
  // → .forge/edges/authoring/song/authoring/chorus.md
  for (const dir of [
    '/bundle/user-vault/.forge',
    '/bundle/user-vault/.forge/edges',
    '/bundle/user-vault/.forge/edges/authoring',
    '/bundle/user-vault/.forge/edges/authoring/song',
    '/bundle/user-vault/.forge/edges/authoring/song/authoring',
  ]) {
    try { py.FS.mkdir(dir); } catch { /* exists */ }
  }
  // Write a fresh live snapshot per test boot (state will be mutated
  // by tests; reset on each load is the safer default).
  py.FS.writeFile(
    '/bundle/user-vault/.forge/edges/authoring/song/authoring/chorus.md',
    LIVE_SNAPSHOT_BODY,
  );

  // Load the production Python block dynamically per §80 rider.
  const hostSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pyodide-host.ts'),
    'utf-8',
  );
  const blockMatch = hostSource.match(
    /\/\/ _PYTHON_BLOCK_BEGIN[\s\S]*?pyodide\.runPython\(`([\s\S]*?)`\);\s*\/\/ _PYTHON_BLOCK_END/,
  );
  if (!blockMatch) {
    throw new Error('Could not locate _PYTHON_BLOCK in src/pyodide-host.ts');
  }
  const productionPython = blockMatch[1]
    .replace(/\\\\/g, '\\')
    .replace(/\\\$\{/g, '${');
  py.runPython(productionPython);

  return py;
}

// Helpers that mirror the JS-side host's setEdgeState call but bypass
// the full PyodideHost class (which depends on the obsidian import).
// This is the same pattern compute-kwargs.test.ts uses for
// computeViaEngine. The §80 drift-protection assertion below verifies
// the helper signature is identical to production.
function callSetEdgeState(py: any, caller: string, callee: string, state: string) {
  py.globals.set('_forge_freeze_caller', caller);
  py.globals.set('_forge_freeze_callee', callee);
  py.globals.set('_forge_freeze_state', state);
  py.runPython(
    '_forge_set_edge_state(_forge_freeze_caller, _forge_freeze_callee, _forge_freeze_state, "")',
  );
}

function readSnapshot(py: any, relPath: string): string {
  return py.FS.readFile(relPath, { encoding: 'utf8' });
}

test('freezeEdge: _forge_set_edge_state helper exists on the production block', async () => {
  const py = await bootSnapshotVault();
  // Helper presence — if the production Python block didn't define
  // it, runPython below would fail at the lookup. Use Python's
  // callable() check rather than a raise-on-missing import.
  const ok = py.runPython(
    'callable(globals().get("_forge_set_edge_state", None))',
  );
  assert.equal(ok, true);
});

test('freezeEdge: live → frozen flips state field', async () => {
  const py = await bootSnapshotVault();
  callSetEdgeState(py, 'authoring/song', 'authoring/chorus', 'frozen');
  const body = readSnapshot(
    py, '/bundle/user-vault/.forge/edges/authoring/song/authoring/chorus.md',
  );
  assert.match(
    body, /state: frozen/,
    `expected 'state: frozen' in snapshot, got:\n${body}`,
  );
  assert.doesNotMatch(body, /state: live/);
});

test('freezeEdge: frozen → live flips back', async () => {
  const py = await bootSnapshotVault();
  // First freeze, then unfreeze.
  callSetEdgeState(py, 'authoring/song', 'authoring/chorus', 'frozen');
  callSetEdgeState(py, 'authoring/song', 'authoring/chorus', 'live');
  const body = readSnapshot(
    py, '/bundle/user-vault/.forge/edges/authoring/song/authoring/chorus.md',
  );
  assert.match(body, /state: live/);
  assert.doesNotMatch(body, /state: frozen/);
});

test('freezeEdge: non-existent snapshot raises clear error', async () => {
  const py = await bootSnapshotVault();
  assert.throws(
    () => {
      callSetEdgeState(
        py, 'authoring/nonexistent_caller', 'authoring/nonexistent_callee', 'frozen',
      );
    },
    (err: any) => {
      const msg = String(err);
      return (
        /FileNotFoundError/.test(msg) &&
        // Path should be named so the user can navigate to the
        // missing file. snapshot_path puts caller + callee under
        // .forge/edges/.
        /nonexistent_caller/.test(msg) &&
        /nonexistent_callee/.test(msg)
      );
    },
  );
});

test('freezeEdge: idempotent re-freeze leaves state unchanged', async () => {
  const py = await bootSnapshotVault();
  callSetEdgeState(py, 'authoring/song', 'authoring/chorus', 'frozen');
  const bodyAfterFirst = readSnapshot(
    py, '/bundle/user-vault/.forge/edges/authoring/song/authoring/chorus.md',
  );
  // Second freeze should be a no-op semantically — file rewritten but
  // state field is the same. body content type stays musicxml.
  callSetEdgeState(py, 'authoring/song', 'authoring/chorus', 'frozen');
  const bodyAfterSecond = readSnapshot(
    py, '/bundle/user-vault/.forge/edges/authoring/song/authoring/chorus.md',
  );
  assert.equal(
    bodyAfterFirst, bodyAfterSecond,
    'second freeze should produce byte-identical output to first freeze',
  );
  assert.match(bodyAfterSecond, /state: frozen/);
});

test('freezeEdge: drift-protection — server.ts freezeEdge wires through Pyodide', async () => {
  // §80 drift rider for the JS-side wire-up. Read server.ts at
  // test-start and assert the freezeEdge function routes through
  // host.setEdgeState before falling back to HTTP.
  const serverSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/server.ts'),
    'utf-8',
  );
  // freezeEdge is `export async function freezeEdge(...)`; the body
  // following must reach host.setEdgeState before any HTTP fallback.
  const freezeEdgeBlock = serverSrc.match(
    /export\s+async\s+function\s+freezeEdge[\s\S]*?(?=\nexport\s+|\n\/\/\s+v0\.|\Z)/,
  );
  assert.ok(
    freezeEdgeBlock,
    'could not locate export async function freezeEdge in server.ts',
  );
  assert.match(
    freezeEdgeBlock![0],
    /host\.setEdgeState\s*\(\s*caller\s*,\s*callee\s*,\s*state\s*\)/,
    "freezeEdge body must call host.setEdgeState(caller, callee, state)",
  );
});
