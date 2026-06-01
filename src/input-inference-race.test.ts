// TDD failing-test-first for the v0.2.20 → v0.2.21 race surfaced in
// user smoke.
//
// Bug: `runSnippet` calls `host.getInputNames(snippetId)` → helper
// calls `_forge_resolver.resolve(snippet_id)` → registry returns
// the CACHED entry. If the user edited the file after plugin load
// and the modify-hook hasn't fired yet, the cached body is stale.
// Helper parses the OLD Python signature, finds no `name`, returns
// `[]`. Modal opens with no fields → submit → compute → TypeError.
//
// The existing v0.2.20 input-inference.test.ts passes because each
// case reboots the registry with a fresh body BEFORE calling the
// helper. Production never reboots — registry cache is sticky.
// `refresh_file` is the only way to update an entry's cached body
// without a full re-scan.
//
// This test reproduces the production sequence: scan with OLD body
// → write NEW body to MEMFS (no refresh_file) → call helper. Pre-
// fix: helper returns OLD signature's inputs (stale). Post-fix:
// helper internally refresh_file's first, returns NEW signature's
// inputs.
//
// Per cc-prompt-queue.md TDD hard rule: this test exists BEFORE
// the fix. Cases 1, 3, 4 fail today; case 2 passes (no race
// involved). After the fix all 4 pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadPyodide } from 'pyodide';

const BODY_OLD = `---
type: action
description: Greet
inputs:
---

# English

  greet someone

# Python

\`\`\`python
def compute(context):
    print("hello")
\`\`\`
`;

const BODY_NEW = `---
type: action
description: Greet
inputs:
---

# English

  greet someone by name

# Python

\`\`\`python
def compute(context, name):
    print("hello " + name)
\`\`\`
`;

const BODY_NEW_MORE = `---
type: action
description: Greet
inputs:
---

# English

  greet someone by name and title

# Python

\`\`\`python
def compute(context, name, title):
    print(title + " " + name)
\`\`\`
`;

function walk(dir: string, base = ''): Array<{ rel: string; abs: string }> {
  const out: Array<{ rel: string; abs: string }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entry.name);
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, rel));
    else out.push({ rel, abs });
  }
  return out;
}

let _pyodidePromise: Promise<any> | null = null;
function getPyodide(): Promise<any> {
  if (_pyodidePromise === null) _pyodidePromise = loadPyodide();
  return _pyodidePromise;
}

/** Boot the engine, define the helper VERBATIM as
 *  src/pyodide-host.ts has it, then scan the user-vault. After this
 *  the test can call py.FS.writeFile to mutate MEMFS without going
 *  through refresh_file — exactly the production race shape. */
async function bootScanWithBody(snippetId: string, body: string): Promise<any> {
  const py = await getPyodide();

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
    try { py.FS.writeFile(target, fs.readFileSync(abs)); } catch { /* already written */ }
  }

  // Reset user-vault between cases so stale snippets don't leak.
  try {
    const listing = py.FS.readdir('/bundle/user-vault');
    for (const entry of listing) {
      if (entry === '.' || entry === '..') continue;
      try { py.FS.unlink(`/bundle/user-vault/${entry}`); } catch { /* dir or in-use */ }
    }
  } catch { /* dir doesn't exist yet */ }
  try { py.FS.mkdir('/bundle/user-vault'); } catch { /* exists */ }
  py.FS.writeFile(`/bundle/user-vault/${snippetId}.md`, body);

  await py.loadPackage(['pyyaml', 'numpy']);

  // VERBATIM copy of the helper from pyodide-host.ts. Drift-protection
  // NOTE: keep this aligned with the inlined Python in
  // src/pyodide-host.ts. v0.2.21 fix lives in BOTH places — when CC
  // applies it, the refresh_file call gets added to the helper body
  // here too, mirroring the production helper.
  py.runPython(`
import sys
if '/bundle/engine' not in sys.path:
    sys.path.insert(0, '/bundle/engine')

from forge.core.snippet_registry import SnippetRegistry
from forge.core.graph_resolver import GraphResolver
from forge.core.executor import extract_python

_forge_registry = SnippetRegistry()
_forge_registry.scan('/bundle/user-vault')
_forge_resolver = GraphResolver(_forge_registry)

import ast as _forge_ast
def _forge_get_input_names(snippet_id):
    # v0.2.21 race fix: refresh registry from MEMFS before resolving.
    relpath = f"/bundle/user-vault/{snippet_id}.md"
    try:
        _forge_registry.refresh_file(relpath)
    except Exception:
        pass
    snip = _forge_resolver.resolve(snippet_id)
    meta = snip.get("meta") or {}
    declared = [str(i) for i in (meta.get("inputs") or [])]
    body = snip.get("body") or ""
    try:
        code = extract_python(body)
    except Exception:
        return declared
    if not code or not code.strip():
        return declared
    try:
        tree = _forge_ast.parse(code)
    except SyntaxError:
        return declared
    sig_args = None
    for node in _forge_ast.walk(tree):
        if isinstance(node, _forge_ast.FunctionDef) and node.name == "compute":
            sig_args = (
                [a.arg for a in node.args.args]
                + [a.arg for a in node.args.kwonlyargs]
            )
            break
    if sig_args is None:
        return declared
    sig_args = [a for a in sig_args if a != "context"]
    out = list(declared)
    for a in sig_args:
        if a not in out:
            out.append(a)
    return out
`);

  return py;
}

// (1) The Greet smoke-failure shape: registry scanned with OLD body
// (no `name` param), MEMFS overwritten with NEW body (`name` param)
// WITHOUT refresh_file. Helper called → should return ["name"] from
// the NEW signature. Pre-fix: returns [] from stale registry.
test('input-inference-race: registry scans body OLD, MEMFS overwritten with NEW body, getInputNames called', async () => {
  const py = await bootScanWithBody('Greet', BODY_OLD);
  // Simulate "user edited the file after plugin load; modify-hook
  // hasn't fired yet."
  py.FS.writeFile('/bundle/user-vault/Greet.md', BODY_NEW);
  const result = py.runPython(`list(_forge_get_input_names("Greet"))`);
  const inputs = result.toJs();
  result.destroy?.();
  assert.deepEqual(
    inputs,
    ['name'],
    'helper should self-refresh and return NEW signature inputs (post-fix); pre-fix returns []',
  );
});

// (2) No race: registry scanned with NEW body already. Helper should
// return ["name"]. PASSES both pre- and post-fix.
test('input-inference-race: registry scans body NEW, MEMFS unchanged, getInputNames called', async () => {
  const py = await bootScanWithBody('Greet', BODY_NEW);
  const result = py.runPython(`list(_forge_get_input_names("Greet"))`);
  const inputs = result.toJs();
  result.destroy?.();
  assert.deepEqual(inputs, ['name'], 'no-race case stays green');
});

// (3) Variation: more params added between scan and call. Same race
// shape; helper should return all NEW params.
test('input-inference-race: registry scans body OLD, MEMFS overwritten with body that has MORE params, getInputNames called', async () => {
  const py = await bootScanWithBody('Greet', BODY_OLD);
  py.FS.writeFile('/bundle/user-vault/Greet.md', BODY_NEW_MORE);
  const result = py.runPython(`list(_forge_get_input_names("Greet"))`);
  const inputs = result.toJs();
  result.destroy?.();
  assert.deepEqual(
    inputs,
    ['name', 'title'],
    'helper should self-refresh and return all NEW signature inputs',
  );
});

// (4) Idempotence: two calls in a row against the same MEMFS state
// return the same fresh inputs. Catches "first call refreshes, second
// call sees the refreshed-cache rather than re-reading MEMFS" subtle
// bugs.
test('input-inference-race: getInputNames is idempotent across repeated calls after MEMFS update', async () => {
  const py = await bootScanWithBody('Greet', BODY_OLD);
  py.FS.writeFile('/bundle/user-vault/Greet.md', BODY_NEW);
  const firstProxy = py.runPython(`list(_forge_get_input_names("Greet"))`);
  const first = firstProxy.toJs();
  firstProxy.destroy?.();
  const secondProxy = py.runPython(`list(_forge_get_input_names("Greet"))`);
  const second = secondProxy.toJs();
  secondProxy.destroy?.();
  assert.deepEqual(first, ['name']);
  assert.deepEqual(second, first);
});
