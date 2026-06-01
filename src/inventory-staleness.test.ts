// TDD failing-test-only reproduction for the v0.2.17 smoke-surfaced
// inventory-staleness bug.
//
// Scenario from the user's smoke:
//
//   1. Edit `Greet.md` English directly in the Obsidian editor
//      (print "hello 999" → print "hello 9991"). Save (Cmd+S).
//   2. Click Forge. `getGenerateInventory("Greet")` reads from the
//      Pyodide resolver's cached entry — which is still the pre-edit
//      body because no refresh_file fired (v0.2.17 §2.4 deferred).
//      The /generate request to α uses STALE English; α returns
//      Python matching the OLD English; writeGeneratedCode writes
//      that mismatched Python to disk AND triggers syncUserVaultFile,
//      which finally refreshes MEMFS.
//   3. Click Forge a SECOND time. NOW the inventory is fresh; α
//      returns the right Python.
//
// This is a regression class beyond the v0.2.17 fix's scope: that
// closed the writeGeneratedCode → next-compute path. But the
// edit → first-Forge-click → /generate path still uses stale
// inventory.
//
// **This prompt's scope is the failing test only.** No fix lands in
// this drain; the follow-up prompt ships the patch after the user
// approves the reproduction. Per the prompt's explicit §2.4 and §4:
// no edits to getGenerateInventory, no vault.on('modify') hook, no
// version bump.

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

// Boot Pyodide once with the engine + a fresh user vault containing
// BODY_OLD. Each test reboots the per-test registry state so cases
// don't bleed into each other (the engine + Pyodide instance itself
// is shared across tests via the promise above).
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

  // Verbatim copy of the relevant Python helpers from pyodide-host.ts
  // (the regex helpers + the generate-inventory builder). Drift-
  // protection comment from v0.2.5 applies: keep this aligned with
  // the inlined Python in src/pyodide-host.ts. v1.1 centralization
  // into forge.core.* collapses these duplicates.
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

# v0.2.18: verbatim copy of pyodide-host.ts:_forge_sync_user_file.
# The production vault.on('modify') hook calls this; case 4 below
# invokes it to simulate the production flow at suite time.
# Drift-protection comment from v0.2.5 applies: keep aligned with
# the inlined Python in src/pyodide-host.ts.
import os as _forge_os_for_test
def _forge_sync_user_file(relpath, new_body):
    target = f"/bundle/user-vault/{relpath}"
    parent = _forge_os_for_test.path.dirname(target)
    if parent:
        _forge_os_for_test.makedirs(parent, exist_ok=True)
    with open(target, "w") as f:
        f.write(new_body)
    _reg.refresh_file(target)

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
`);

  return py;
}

// (a) Baseline — initial inventory reflects scan-time english.
// PASS today. Sanity check that the helper works at all.
test('inventory-staleness: initial inventory reflects scan-time english', async () => {
  const py = await bootFreshGreet(BODY_OLD);
  const englishProxy = py.runPython(`_forge_get_generate_inventory("Greet")["english"]`);
  assert.match(
    englishProxy,
    /hello 999/,
    'scan-time english should contain the OLD greeting',
  );
});

// (b) The staleness — direct MEMFS write without refresh_file leaves
// the inventory stale. PASS today; documents the bug at suite time
// (matches the user-side smoke observation from v0.2.17).
test('inventory-staleness: post-direct-MEMFS-edit inventory STILL returns stale english', async () => {
  const py = await bootFreshGreet(BODY_OLD);
  // Simulate "user edited in editor + saved" — disk (MEMFS) changed
  // but no refresh_file call. This is the v0.2.17 §2.4 deferred-path.
  py.FS.writeFile('/bundle/user-vault/Greet.md', BODY_NEW);
  const english = py.runPython(`_forge_get_generate_inventory("Greet")["english"]`);
  assert.match(
    english,
    /hello 999"/,
    'without explicit refresh_file, inventory should still return the stale OLD english',
  );
  assert.doesNotMatch(
    english,
    /hello 9991/,
    'NEW english should NOT yet be visible — that\'s the staleness bug',
  );
});

// (c) The mechanism works — calling refresh_file after the MEMFS
// write does propagate to the inventory. PASS today; confirms
// `SnippetRegistry.refresh_file` is the right tool for the follow-
// up fix.
test('inventory-staleness: inventory returns FRESH english after refresh_file', async () => {
  const py = await bootFreshGreet(BODY_OLD);
  py.FS.writeFile('/bundle/user-vault/Greet.md', BODY_NEW);
  py.runPython(`_reg.refresh_file("/bundle/user-vault/Greet.md")`);
  const english = py.runPython(`_forge_get_generate_inventory("Greet")["english"]`);
  assert.match(
    english,
    /hello 9991/,
    'after explicit refresh_file, inventory should return the NEW english',
  );
});

// (d) BUG REPRO — locked in as a regression test by v0.2.18. The
// originating prompt landed this case as a failing-test-only commit
// (assertion: getGenerateInventory should return fresh english
// without explicit refresh). The v0.2.18 fix is the production
// vault.on('modify') hook in main.ts, which calls
// syncUserVaultFile → _forge_sync_user_file → refresh_file in
// response to Obsidian autosave / Cmd-S.
//
// The hook fires inside Obsidian, not in node --test. To verify
// "the v0.2.18 fix propagates direct edits to inventory" at
// suite-run time, this case now simulates the production flow by
// invoking `_forge_sync_user_file` directly — the same Python
// helper the production hook calls. If we removed this case, the
// edit → inventory contract would lose its suite-time regression
// witness; if we left it as a writeFile-only test, it would still
// fail (the test bypasses Obsidian's modify event).
//
// Case (b) above keeps the "writeFile-only is stale" assertion as
// the documented pre-hook behavior; case (d) here asserts the
// post-hook (production-fix) behavior. Together they pin the
// contract from both sides.
test('inventory-staleness: post-modify-hook flow returns fresh english (v0.2.18 fix witness)', async () => {
  const py = await bootFreshGreet(BODY_OLD);
  // Simulate v0.2.18's vault.on('modify') flow: Obsidian fires
  // modify → main.ts hook calls host.syncUserVaultFile(file.path,
  // content) → pyodide-host.ts wraps the runPython call →
  // _forge_sync_user_file writes to MEMFS + refreshes the registry.
  // The test calls the Python helper directly because Obsidian's
  // event loop isn't available in node --test.
  py.runPython(`
_forge_sync_user_file("Greet.md", _forge_new_body)
`.replace('_forge_new_body', JSON.stringify(BODY_NEW)));
  const english = py.runPython(`_forge_get_generate_inventory("Greet")["english"]`);
  // Post-hook, the inventory should see the new english.
  assert.match(
    english,
    /hello 9991/,
    'after the v0.2.18 modify hook propagates the edit, inventory should return fresh english',
  );
});
