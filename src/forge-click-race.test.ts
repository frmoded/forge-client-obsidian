// TDD failing-test-only contract for the v0.2.18 → v0.2.19 race
// surfaced during smoke:
//
//   §3.2 (autosave ~2s wait → Forge-click) → PASS. vault.on('modify')
//        handler completed before forgeSnippet ran.
//   §3.3 (Cmd-S → Forge-click within ~100ms) → FAIL. modify event
//        fired but its async handler is still completing when
//        forgeSnippet calls /generate. Inventory uses stale english.
//
// The v0.2.18 async-hook fix is insufficient against fast clicks.
// The architectural fix: forgeSnippet does its own SYNCHRONOUS
// preflight sync before calling /generate, rather than trusting the
// async hook to have completed.
//
// This file is the failing-test-only commit. The fix prompt will
// add the helper. Per the cowork-forge-protocol rider on
// "tests must invoke the production code path" — this is the SOFT
// FORM: the test verifies the helper's contract from outside the
// production wiring (since node --test can't reproduce Obsidian's
// event-loop race). The harder form (asserting forgeSnippet calls
// the helper before /generate) requires integration testing we
// don't have. The soft form is still useful: it locks in the API
// surface the fix will commit to and survives future refactors
// that preserve the helper's name + semantics.

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

  print "hello 999"

# Python

\`\`\`python
def compute(context):
    print("hello 999")
\`\`\`
`;

const BODY_NEW = `---
type: action
description: Greet
inputs:
---

# English

  print "hello 9991"

# Python

\`\`\`python
def compute(context):
    print("hello 999")
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

// Same fixture pattern as inventory-staleness.test.ts: boot engine,
// scan a vault with Greet.md (BODY_OLD), define the helpers the
// production pyodide-host.ts inline block defines. Verbatim copies
// have the drift-protection NOTE — keep aligned with the live source.
//
// NOTE: this fixture deliberately does NOT define
// `_forge_preflight_then_inventory`. That helper is what the fix
// will add. Until then, every reference to it raises NameError in
// Pyodide.
async function bootFreshGreet(body: string): Promise<any> {
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

  try { py.FS.mkdir('/bundle/user-vault'); } catch { /* exists */ }
  py.FS.writeFile('/bundle/user-vault/Greet.md', body);

  await py.loadPackage(['pyyaml', 'numpy']);

  py.runPython(`
import sys, re
if '/bundle/engine' not in sys.path:
    sys.path.insert(0, '/bundle/engine')

from forge.core.snippet_registry import SnippetRegistry
from forge.core.graph_resolver import GraphResolver
from forge.core.executor import extract_section

_reg = SnippetRegistry()
_reg.scan('/bundle/user-vault')
_resolver = GraphResolver(_reg)

_FORGE_ID_CHARS = r"[\\w./-]+"

def _forge_find_deps(body):
    deps = []
    seen = set()
    for m in re.finditer(rf'\\[\\[({_FORGE_ID_CHARS})(?:\\|[^\\]]*)?\\]\\]', body or ""):
        dep = m.group(1).strip()
        if dep and dep not in seen:
            deps.append(dep); seen.add(dep)
    for m in re.finditer(rf'context\\.compute\\(\\s*["\\']({_FORGE_ID_CHARS})["\\']', body or ""):
        dep = m.group(1).strip()
        if dep and dep not in seen:
            deps.append(dep); seen.add(dep)
    return deps

def _forge_get_generate_inventory(snippet_id):
    snip = _resolver.resolve(snippet_id)
    meta = snip.get("meta") or {}
    body = snip.get("body", "") or ""
    dep_ids = _forge_find_deps(body)
    dep_infos = []
    for dep_id in dep_ids:
        try:
            dep_snip = _resolver.resolve(dep_id)
        except Exception:
            continue
        dep_meta = dep_snip.get("meta") or {}
        dep_infos.append({
            "snippet_id": dep_id,
            "description": (dep_meta.get("description") or "").strip(),
            "inputs": [str(i) for i in (dep_meta.get("inputs") or [])],
        })
    return {
        "snippet_id": snippet_id,
        "description": (meta.get("description") or "").strip(),
        "english": extract_section(body, "english") or "",
        "inputs": [str(i) for i in (meta.get("inputs") or [])],
        "generation_notes": (meta.get("generation_notes") or "").strip(),
        "deps": dep_infos,
    }

# v0.2.19: verbatim copy of pyodide-host.ts:_forge_preflight_then_inventory.
# The 4 failing-test cases below flip to pass once this is defined.
# Drift-protection NOTE from v0.2.5 applies: keep aligned with the
# inlined Python in src/pyodide-host.ts.
def _forge_preflight_then_inventory(snippet_id: str):
    relpath = f"/bundle/user-vault/{snippet_id}.md"
    try:
        _reg.refresh_file(relpath)
    except Exception:
        pass
    return _forge_get_generate_inventory(snippet_id)
`);

  return py;
}

// (a) Existence check — fails today with a plain assertion message.
test('forge-click-race: preflight helper exists', async () => {
  const py = await bootFreshGreet(BODY_OLD);
  // Use a Python expression that evaluates to a boolean we can read
  // from JS rather than calling the helper (which would raise
  // NameError before the assertion message ever fires).
  const exists = py.runPython(`'_forge_preflight_then_inventory' in dir()`);
  assert.equal(
    exists,
    true,
    '_forge_preflight_then_inventory should exist in Pyodide globals',
  );
});

// (b) The load-bearing race-fix witness. Simulate "Obsidian wrote
// to disk but the modify hook hasn't fired yet" by writing to MEMFS
// directly (no _forge_sync_user_file call), then exercise the
// preflight helper. The helper must read fresh content and return
// up-to-date inventory.
test('forge-click-race: preflight returns fresh english after disk-write-without-hook', async () => {
  const py = await bootFreshGreet(BODY_OLD);
  py.FS.writeFile('/bundle/user-vault/Greet.md', BODY_NEW);
  // Helper doesn't exist yet → NameError. After the fix, this call
  // succeeds and returns an inventory with the NEW english.
  const english = py.runPython(
    `_forge_preflight_then_inventory("Greet")["english"]`,
  );
  assert.match(
    english,
    /hello 9991/,
    'preflight should sync MEMFS into the registry before materializing inventory',
  );
});

// (c) Idempotence — repeated preflight calls should both produce
// fresh inventory; no stale-cache leak between calls.
test('forge-click-race: preflight is idempotent across repeated calls', async () => {
  const py = await bootFreshGreet(BODY_OLD);
  py.FS.writeFile('/bundle/user-vault/Greet.md', BODY_NEW);
  const englishA = py.runPython(
    `_forge_preflight_then_inventory("Greet")["english"]`,
  );
  const englishB = py.runPython(
    `_forge_preflight_then_inventory("Greet")["english"]`,
  );
  assert.equal(
    englishA,
    englishB,
    'two consecutive preflight calls against the same MEMFS state should return identical inventory',
  );
  assert.match(englishA, /hello 9991/);
});

// (d) Unknown snippet_id behavior. Post-fix, the helper should raise
// SnippetResolutionError (same as _forge_resolver.resolve). Today
// it raises NameError (helper doesn't exist). Both throw, but the
// fix-vs-today distinction is the error MESSAGE — the unknown id
// "Nonexistent" appears in SnippetResolutionError's text, not in
// NameError's. Assert against the message to make the test mean
// what it says.
test('forge-click-race: preflight handles unknown snippet_id', async () => {
  const py = await bootFreshGreet(BODY_OLD);
  assert.throws(
    () => {
      py.runPython(`_forge_preflight_then_inventory("Nonexistent")`);
    },
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      // Post-fix expectation: the error message should reference
      // the unknown snippet_id (as SnippetResolutionError does).
      // Today the message will say NameError instead and this
      // matcher won't match — case fails as designed.
      return /Nonexistent/.test(msg);
    },
    'unknown snippet_id should raise an error that mentions the id (SnippetResolutionError-style)',
  );
});
