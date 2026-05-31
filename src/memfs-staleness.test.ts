// TDD reproduction for the v0.2.16 greet-snippet MEMFS-staleness bug.
// The Pyodide host mounts the user vault into MEMFS at plugin init.
// Subsequent disk writes (writeGeneratedCode, manual editor saves) DO
// NOT propagate into MEMFS. Pyodide compute reads from MEMFS, so it
// runs the pre-init snapshot. Disk and MEMFS diverge silently.
//
// Per prompt §1: this test exists BEFORE the fix. Cases (a)(b)(c)
// pass (snapshot behavior intact). Cases (d)(e)(f) fail until the
// v0.2.17 sync helper lands.
//
// Same pattern as src/greet-snippet-integration.test.ts: mount the
// bundled engine, populate /bundle/user-vault/, exercise the real
// registry + resolver + executor APIs.

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

  print "hello"

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

  print "hello1"

# Python

\`\`\`python
def compute(context):
    print("hello1")
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

let _bootedFor: string | null = null;
async function bootWithGreet(body: string): Promise<any> {
  const py = await getPyodide();

  // Re-bootstrap if a previous test booted with a different body.
  // Cheaper than re-loading Pyodide; just re-walk + re-write.
  if (_bootedFor === body) return py;

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

  try { py.FS.mkdir('/bundle/user-vault'); } catch { /* exists */ }
  py.FS.writeFile('/bundle/user-vault/Greet.md', body);

  await py.loadPackage(['pyyaml', 'numpy']);

  py.runPython(`
import sys
if '/bundle/engine' not in sys.path:
    sys.path.insert(0, '/bundle/engine')

from forge.core.snippet_registry import SnippetRegistry
from forge.core.graph_resolver import GraphResolver
from forge.core.executor import extract_python, exec_python

# Fresh registry per body change so we exercise the same boot path the
# real plugin does at init.
_reg = SnippetRegistry()
_reg.scan('/bundle/user-vault')
_resolver = GraphResolver(_reg)

# Verbatim copy of pyodide-host.ts:_forge_sync_user_file (v0.2.17).
# The drift-protection comment from v0.2.5 applies: keep this in sync
# with the embedded Python in src/pyodide-host.ts. The v1.1 plan to
# centralize plugin Python helpers inside forge.core.* collapses this.
import os as _forge_os_for_test
def _forge_sync_user_file(relpath, new_body):
    target = f"/bundle/user-vault/{relpath}"
    parent = _forge_os_for_test.path.dirname(target)
    if parent:
        _forge_os_for_test.makedirs(parent, exist_ok=True)
    with open(target, "w") as f:
        f.write(new_body)
    _reg.refresh_file(target)
`);

  _bootedFor = body;
  return py;
}

// (a) Snapshot behavior intact — resolver returns the pre-init body.
test('memfs-staleness: registry caches body at scan time', async () => {
  const py = await bootWithGreet(BODY_OLD);
  const body = py.runPython(`_resolver.resolve("Greet").get("body")`);
  assert.match(
    body,
    /print\("hello"\)/,
    'pre-edit body cached at scan time should contain print("hello")',
  );
});

// (b) Snapshot behavior produces matching compute output.
test('memfs-staleness: pre-sync run produces pre-edit output', async () => {
  const py = await bootWithGreet(BODY_OLD);
  const tuple = py.runPython(`
_snip = _resolver.resolve("Greet")
_code = extract_python(_snip["body"])
_stdout, _result = exec_python(_code, {}, _resolver, args=(),
                                vault_path='/bundle/user-vault',
                                registry=_reg, snippet_id='Greet')
(_stdout, _result)
`);
  const stdout = tuple.get(0);
  tuple.destroy?.();
  assert.equal(stdout, 'hello\n', 'pre-sync compute should produce "hello\\n"');
});

// (c) Simulate the user-flow disk write — BUT without sync, registry
// stays stale. This is the bug we're fixing.
test('memfs-staleness: disk write without sync leaves registry stale', async () => {
  const py = await bootWithGreet(BODY_OLD);
  py.FS.writeFile('/bundle/user-vault/Greet.md', BODY_NEW);
  // Registry should STILL return BODY_OLD because no sync happened.
  const body = py.runPython(`_resolver.resolve("Greet").get("body")`);
  assert.match(
    body,
    /print\("hello"\)/,
    'without sync, registry should still return pre-edit body — this is the bug',
  );
  assert.doesNotMatch(
    body,
    /print\("hello1"\)/,
    'without sync, new body should NOT be visible',
  );
});

// (d) sync_user_file invalidates cache. **FAILS before fix.**
test('memfs-staleness: sync_user_file refreshes the cached entry', async () => {
  const py = await bootWithGreet(BODY_OLD);
  // Apply the disk + cache sync in one call (the helper handles
  // both writeFile and registry refresh).
  py.runPython(`
_forge_sync_user_file("Greet.md", _forge_new_body)
`.replace('_forge_new_body', JSON.stringify(BODY_NEW)));
  const body = py.runPython(`_resolver.resolve("Greet").get("body")`);
  assert.match(
    body,
    /print\("hello1"\)/,
    'post-sync body should contain the new print("hello1")',
  );
});

// (e) Post-sync resolve returns BODY_NEW.
test('memfs-staleness: post-sync resolve returns new body', async () => {
  const py = await bootWithGreet(BODY_OLD);
  py.runPython(`
_forge_sync_user_file("Greet.md", _forge_new_body)
`.replace('_forge_new_body', JSON.stringify(BODY_NEW)));
  const body = py.runPython(`_resolver.resolve("Greet").get("body")`);
  assert.doesNotMatch(
    body,
    /print\("hello"\)\n/,
    'post-sync body should not retain the old print',
  );
});

// (f) Post-sync run_snippet executes the new code.
test('memfs-staleness: post-sync run produces new output', async () => {
  const py = await bootWithGreet(BODY_OLD);
  py.runPython(`
_forge_sync_user_file("Greet.md", _forge_new_body)
`.replace('_forge_new_body', JSON.stringify(BODY_NEW)));
  const tuple = py.runPython(`
_snip = _resolver.resolve("Greet")
_code = extract_python(_snip["body"])
_stdout, _result = exec_python(_code, {}, _resolver, args=(),
                                vault_path='/bundle/user-vault',
                                registry=_reg, snippet_id='Greet')
(_stdout, _result)
`);
  const stdout = tuple.get(0);
  tuple.destroy?.();
  assert.equal(stdout, 'hello1\n', 'post-sync compute should produce "hello1\\n"');
});

// (g) Defensive: refresh_file on SnippetRegistry directly leaves other
// entries untouched.
test('memfs-staleness: refresh_file only updates the named entry', async () => {
  const py = await bootWithGreet(BODY_OLD);
  // Add a sibling snippet, scan, then sync only Greet — sibling
  // should remain at its scan-time content.
  py.FS.writeFile('/bundle/user-vault/Sibling.md', BODY_OLD.replace('Greet', 'Sibling'));
  py.runPython(`_reg.scan('/bundle/user-vault')`);
  py.runPython(`
_forge_sync_user_file("Greet.md", _forge_new_body)
`.replace('_forge_new_body', JSON.stringify(BODY_NEW)));
  const greetBody = py.runPython(`_resolver.resolve("Greet").get("body")`);
  const siblingBody = py.runPython(`_resolver.resolve("Sibling").get("body")`);
  assert.match(greetBody, /print\("hello1"\)/, 'Greet updated');
  assert.match(siblingBody, /print\("hello"\)/, 'Sibling untouched');
});
