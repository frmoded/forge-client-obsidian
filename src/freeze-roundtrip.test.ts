// v0.2.40 — freeze roundtrip + bare-ID auto-qualify tests.
//
// Closes the gap surfaced by the URGENT 2026-06-03-0000 freeze bug:
// capture writes snapshots at QUALIFIED paths (.forge/edges/<vault>/
// <caller>/<vault>/<callee>.md), but ForgeFreezeModal accepts BARE
// IDs from user input and routes them verbatim through
// _forge_set_edge_state, producing the user-reported FileNotFoundError.
//
// Fix shape: _forge_set_edge_state auto-qualifies bare IDs via the
// registry before calling set_snapshot_state. Already-qualified IDs
// pass through unchanged; truly-missing bare IDs still raise
// FileNotFoundError (F5 preserved).
//
// Per cc-prompt-queue.md §80: load the production Python block from
// src/pyodide-host.ts dynamically — no hand-mirrored helper inline.

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

// Tiny vault contents — two snippets that exercise the capture-then-
// freeze loop. random_name returns a fresh 5-letter string; caller
// (hello_random) invokes it via context.compute('random_name').
const RANDOM_NAME_MD = `---
type: action
inputs: [n]
description: Returns n random lowercase letters.
---

# Python

\`\`\`python
import random
import string

def compute(context, n):
    return ''.join(random.choices(string.ascii_lowercase, k=n))
\`\`\`
`;

const HELLO_RANDOM_MD = `---
type: action
description: Calls random_name and prints "hello <name>".
---

# Python

\`\`\`python
def compute(context):
    name = context.compute("random_name", n=5)
    print(f"hello {name}")
    return name
\`\`\`
`;

async function bootFreshVault(): Promise<any> {
  const py = await getPyodide();
  await py.loadPackage(['numpy', 'pyyaml']);

  // Mount the engine + an empty user vault.
  const engineDir = path.resolve(process.cwd(), 'assets/engine');
  if (!fs.existsSync(engineDir)) {
    throw new Error(`engine bundle not found at ${engineDir} — run npm run build first`);
  }
  try { py.FS.mkdir('/bundle'); } catch { /* exists */ }
  try { py.FS.mkdir('/bundle/engine'); } catch { /* exists */ }

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

  // Fresh, empty user vault — each boot resets edge state. Tear down
  // .forge/ if it exists from a prior test run within the same Pyodide
  // instance (we only boot once, so subsequent tests get a residual
  // .forge/ dir).
  try { py.FS.mkdir('/bundle/user-vault'); } catch { /* exists */ }
  try {
    py.runPython(`
import shutil, os
forge_dir = "/bundle/user-vault/.forge"
if os.path.isdir(forge_dir):
    shutil.rmtree(forge_dir)
# Also clean any stale .md files at vault root from a prior test.
for fn in os.listdir("/bundle/user-vault"):
    if fn.endswith(".md") or fn == "forge.toml":
        os.remove(os.path.join("/bundle/user-vault", fn))
`);
  } catch { /* first boot */ }

  // Write the two snippets + a minimal forge.toml.
  py.FS.writeFile('/bundle/user-vault/random_name.md', RANDOM_NAME_MD);
  py.FS.writeFile('/bundle/user-vault/hello_random.md', HELLO_RANDOM_MD);
  py.FS.writeFile(
    '/bundle/user-vault/forge.toml',
    'name = "smoke-v0.2.13"\nversion = "0.0.1"\ndomains = []\n',
  );

  // Configure the engine path so the inline production block can
  // import forge.* on first load.
  py.runPython(`
import sys
if '/bundle/engine' not in sys.path:
    sys.path.insert(0, '/bundle/engine')
`);

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

  // The production block scans the vault at boot. After we wrote new
  // .md files above, force a re-scan so the registry picks them up.
  py.runPython('_forge_registry.scan(_forge_user_vault)');

  return py;
}

function callForgeCompute(py: any, snippet_id: string): { stdout: string } {
  py.globals.set('_forge_t_snippet_id', snippet_id);
  py.runPython(`
_forge_t_result, _forge_t_stdout = _forge_compute(
    _forge_t_snippet_id, [], {}, "",
)
`);
  const stdout = String(py.globals.get('_forge_t_stdout') ?? '');
  return { stdout };
}

function callSetEdgeState(py: any, caller: string, callee: string, state: string) {
  py.globals.set('_forge_t_caller', caller);
  py.globals.set('_forge_t_callee', callee);
  py.globals.set('_forge_t_state', state);
  py.runPython(
    '_forge_set_edge_state(_forge_t_caller, _forge_t_callee, _forge_t_state, "")',
  );
}

function fsExists(py: any, p: string): boolean {
  try {
    py.FS.stat(p);
    return true;
  } catch {
    return false;
  }
}

function fsRead(py: any, p: string): string {
  return py.FS.readFile(p, { encoding: 'utf8' });
}

// --- Test cases ---

test('freeze-roundtrip: capture writes snapshot at QUALIFIED path', async () => {
  const py = await bootFreshVault();
  callForgeCompute(py, 'hello_random');
  // Capture writes to .forge/edges/<caller_qualified>/<callee_qualified>.md
  // — the QUALIFIED path (constitution F1, snapshot_path semantics).
  const expected = '/bundle/user-vault/.forge/edges/authoring/hello_random/authoring/random_name.md';
  assert.ok(
    fsExists(py, expected),
    `expected snapshot file at ${expected}; .forge/edges/ tree was:\n` +
      py.runPython(`
import os
out = []
root = "/bundle/user-vault/.forge/edges"
for dirpath, _dirs, files in os.walk(root):
    for f in files:
        out.append(os.path.join(dirpath, f))
"\\n".join(out) if out else "<empty>"
`),
  );
});

test('freeze-roundtrip: snapshot frontmatter has qualified caller + callee', async () => {
  const py = await bootFreshVault();
  callForgeCompute(py, 'hello_random');
  const body = fsRead(
    py, '/bundle/user-vault/.forge/edges/authoring/hello_random/authoring/random_name.md',
  );
  assert.match(body, /caller: authoring\/hello_random/);
  assert.match(body, /callee: authoring\/random_name/);
});

test('freeze-roundtrip: set_snapshot_state with QUALIFIED IDs flips state', async () => {
  const py = await bootFreshVault();
  callForgeCompute(py, 'hello_random');
  callSetEdgeState(py, 'authoring/hello_random', 'authoring/random_name', 'frozen');
  const body = fsRead(
    py, '/bundle/user-vault/.forge/edges/authoring/hello_random/authoring/random_name.md',
  );
  assert.match(body, /state: frozen/);
  assert.doesNotMatch(body, /state: live/);
});

test('freeze-roundtrip: set_snapshot_state with BARE IDs auto-qualifies via registry', async () => {
  // Load-bearing test — this is the bug the user hit.
  const py = await bootFreshVault();
  callForgeCompute(py, 'hello_random');
  // Pre-fix: callSetEdgeState raises FileNotFoundError because the
  // bare-id path /bundle/user-vault/.forge/edges/hello_random/random_name.md
  // doesn't exist. Post-fix: _forge_set_edge_state qualifies the IDs
  // via the registry and flips state at the qualified path.
  callSetEdgeState(py, 'hello_random', 'random_name', 'frozen');
  const body = fsRead(
    py, '/bundle/user-vault/.forge/edges/authoring/hello_random/authoring/random_name.md',
  );
  assert.match(body, /state: frozen/);
});

test('freeze-roundtrip: set_snapshot_state with bare ID that does not match any snippet still raises FileNotFoundError', async () => {
  // F5 preserved — bare IDs auto-qualify only when they resolve in
  // the registry. Unknown bare IDs pass through unchanged and
  // set_snapshot_state raises the usual error.
  const py = await bootFreshVault();
  callForgeCompute(py, 'hello_random');
  assert.throws(
    () => callSetEdgeState(py, 'no_such_snippet', 'random_name', 'frozen'),
    (err: any) => /FileNotFoundError/.test(String(err)),
    'expected FileNotFoundError for unknown bare caller',
  );
});

test('freeze-roundtrip: capture → freeze → re-compute returns frozen value', async () => {
  // The whole point of freeze: pin a callee's return so subsequent
  // computes return the snapshot rather than re-invoking.
  const py = await bootFreshVault();
  const r1 = callForgeCompute(py, 'hello_random');
  // Extract the random 5-letter name from the first run's stdout.
  const m1 = r1.stdout.match(/hello ([a-z]{5})/);
  assert.ok(m1, `first run stdout did not match expected shape: ${r1.stdout}`);
  const firstName = m1![1];

  // Freeze using bare IDs (the production user-facing path).
  callSetEdgeState(py, 'hello_random', 'random_name', 'frozen');

  // Re-compute hello_random — should re-use the frozen name.
  const r2 = callForgeCompute(py, 'hello_random');
  const m2 = r2.stdout.match(/hello ([a-z]{5})/);
  assert.ok(m2, `frozen re-run stdout did not match expected shape: ${r2.stdout}`);
  assert.equal(
    m2![1], firstName,
    `frozen re-compute should return original name '${firstName}', got '${m2![1]}'`,
  );
});

test('freeze-roundtrip: unfreeze → re-compute returns a fresh value', async () => {
  const py = await bootFreshVault();
  const r1 = callForgeCompute(py, 'hello_random');
  const firstName = r1.stdout.match(/hello ([a-z]{5})/)![1];

  callSetEdgeState(py, 'hello_random', 'random_name', 'frozen');
  callSetEdgeState(py, 'hello_random', 'random_name', 'live');

  // After unfreezing, the snippet runs fresh again. Statistically the
  // chance of collision is 1/26^5 ≈ 1 in 12M, so a single assertion
  // is reliable enough for a smoke test. (If it ever does collide,
  // the test reports a clear failure and the user re-runs.)
  const r2 = callForgeCompute(py, 'hello_random');
  const secondName = r2.stdout.match(/hello ([a-z]{5})/)![1];
  assert.notEqual(
    secondName, firstName,
    `unfrozen re-compute should produce a fresh name; got identical '${firstName}'`,
  );
});
