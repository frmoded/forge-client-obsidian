// End-to-end Pyodide reproduction for the greet-snippet bug. Mounts
// the bundled engine + a fake user vault containing the user's exact
// Greet.md file content (frontmatter + body + the markdown `---`
// horizontal rule), then runs the full _forge_compute path. Lets us
// observe whether the engine's response envelope matches the user's
// reported `{result: undefined, stdout: ''}` or whether the bug is
// elsewhere (plugin-side / metadata cache).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadPyodide } from 'pyodide';

// Exact file content from the prompt's "File content (verbatim)"
// section. Frontmatter + body + the markdown `---` rule.
const GREET_FILE = `---
type: action
description: Greet
inputs:
---

# English

  print "hello1"

---

# Python

\`\`\`python
def compute(context):
    print("hello")
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

async function bootEngineAndVault() {
  const py = await getPyodide();

  // Mount the engine bundle at /bundle/engine.
  const engineDir = path.resolve(process.cwd(), 'assets/engine');
  if (!fs.existsSync(engineDir)) {
    throw new Error(`engine bundle not found at ${engineDir} — run npm run build first`);
  }

  // mkdir -p /bundle/engine and copy each file.
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
    py.FS.writeFile(target, fs.readFileSync(abs));
  }

  // Mount the user vault with the greet snippet.
  try { py.FS.mkdir('/bundle/user-vault'); } catch { /* exists */ }
  py.FS.writeFile('/bundle/user-vault/Greet.md', GREET_FILE);

  // Set up sys.path + scan registry.
  py.runPython(`
import sys
sys.path.insert(0, '/bundle/engine')
import pyyaml_mod_check
`.replace('import pyyaml_mod_check', ''));

  // pyyaml is needed by parse_frontmatter; numpy is imported at the
  // top of forge.core.executor for vault numerics (ParticleState etc).
  // Engine refuses to import without these.
  await py.loadPackage(['pyyaml', 'numpy']);

  py.runPython(`
import sys
if '/bundle/engine' not in sys.path:
    sys.path.insert(0, '/bundle/engine')

from forge.core.snippet_registry import SnippetRegistry
from forge.core.graph_resolver import GraphResolver
from forge.core.executor import extract_python, extract_section, exec_python

_reg = SnippetRegistry()
_reg.scan('/bundle/user-vault')
_resolver = GraphResolver(_reg)
`);

  return py;
}

test('greet-bug: registry parses Greet.md with the markdown --- rule in body', async () => {
  const py = await bootEngineAndVault();
  const meta = py.runPython(`_resolver.resolve("Greet").get("meta")`).toJs({
    dict_converter: Object.fromEntries,
  });
  assert.equal(meta.type, 'action', 'meta.type should round-trip from frontmatter');
  assert.equal(meta.description, 'Greet', 'meta.description should round-trip');
});

test('greet-bug: extract_python on the registry-parsed body returns the function', async () => {
  const py = await bootEngineAndVault();
  const code = py.runPython(`
_snip = _resolver.resolve("Greet")
extract_python(_snip["body"])
`);
  // If this is None (Python's None → JS undefined or null), the
  // registry stored a body shape that extract_python doesn't
  // recognize — and that IS the bug. If it returns the function
  // definition, the parsing path is fine and the bug is elsewhere.
  assert.equal(
    code,
    'def compute(context):\n    print("hello")',
    'extract_python on the registry-parsed body should return the function',
  );
});

test('greet-bug: full exec_python flow produces stdout "hello\\n"', async () => {
  const py = await bootEngineAndVault();
  const tuple = py.runPython(`
_snip = _resolver.resolve("Greet")
_code = extract_python(_snip["body"])
_stdout, _result = exec_python(_code, {}, _resolver, args=(),
                                vault_path='/bundle/user-vault',
                                registry=_reg, snippet_id='Greet')
(_stdout, _result)
`);
  const stdout = tuple.get(0);
  const result = tuple.get(1);
  tuple.destroy?.();
  // The user reported empty stdout. If THIS reproduces it, the
  // engine is the bug. If stdout = "hello\\n", the engine is fine
  // and the bug is plugin-side.
  assert.equal(stdout, 'hello\n', 'exec_python should produce stdout "hello\\n"');
  // Python's None crosses the JS bridge as undefined via Pyodide's
  // tuple proxy; both null and undefined are acceptable here.
  assert.ok(
    result === null || result === undefined,
    `compute returns None implicitly; got ${typeof result}: ${result}`,
  );
});
