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

// (d) BUG REPRO — the load-bearing failing assertion. The "ideal"
// behavior is that `getGenerateInventory` always returns fresh
// english regardless of whether refresh_file was called.
//
// This test FAILS today. The follow-up fix prompt will:
//   - Hook `vault.on('modify')` (debounced) to call
//     syncUserVaultFile on user-vault `.md` edits, OR
//   - Have `getGenerateInventory` (or its caller) refresh the
//     snippet's entry from MEMFS before reading, OR
//   - Some other mechanism that closes the edit→first-Forge-click
//     staleness gap.
//
// **Until that fix lands, this case is the bug witness.** The
// commit that adds it is test-only (no fix); the assertion
// failure documents the bug at suite-run time and locks it in as
// a regression test for whichever fix lands.
test('inventory-staleness: BUG REPRO — getGenerateInventory should return fresh english without explicit refresh', async () => {
  const py = await bootFreshGreet(BODY_OLD);
  // Same write as case (b) — no refresh_file follow-up.
  py.FS.writeFile('/bundle/user-vault/Greet.md', BODY_NEW);
  const english = py.runPython(`_forge_get_generate_inventory("Greet")["english"]`);
  // EXPECTED: english should contain the NEW greeting because the
  // disk (MEMFS) was updated. This is what the user expects when
  // they edit in the editor and click Forge.
  // ACTUAL (today, pre-fix): english still contains the OLD
  // greeting — the inventory was materialized from the stale
  // resolver cache. This assertion FAILS until the fix ships.
  assert.match(
    english,
    /hello 9991/,
    'getGenerateInventory should auto-pick-up new english from MEMFS without an explicit refresh_file call (this fails until the follow-up fix lands)',
  );
});
