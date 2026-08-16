// Drain 2026-08-16-1200 — input-name discovery must go through the
// RESOLVED action code, not the cached `# Python` facet.
//
// The gap (found and flagged in drain 1900's §6): `_forge_get_input_names`
// unions frontmatter `inputs:` with the signature of the note's CACHED
// Python facet. A Recipe-canonical note has no cached Python until
// something transpiles it — so a hand-authored, never-stamped note returns
// [], `runSnippet` skips the Run dialog entirely, and the note computes
// with {} without ever asking for inputs it plainly declares.
//
// The bundled notes only escape this because drain 2230 stamped their
// `inputs:`. A cohort member authoring their own Recipe note gets no
// stamp and silently loses the dialog. That is the case this closes.
//
// IMPORTANT: this file loads the production Python block out of
// src/pyodide-host.ts at test time. src/input-inference.test.ts — the
// older tests for this same function — instead carries a hand-written
// "verbatim copy" of `_forge_get_input_names`, which predates the
// fixture-drift HARD RULE. Those tests therefore exercise a fixture, not
// production, and would stay green even if production broke. Flagged in
// this drain's FEEDBACK; not rewritten here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadPyodide } from 'pyodide';
import { extractProductionPythonBlock } from './test-support/extract-python-block.ts';

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

/** Recipe-canonical: declares an Input, has NO `inputs:` frontmatter and
 *  NO `# Python` facet. Exactly what a cohort member hand-authors. */
const UNSTAMPED_RECIPE_NOTE = `---
type: action
---

# Description

Hand-authored, never opened in a plugin-loaded vault.

# Recipe

Input x: str = "a".
Return x + "!".
`;

/** Genuinely zero inputs — the dialog SHOULD stay skipped (§8). */
const NO_INPUT_NOTE = `---
type: action
---

# Description

Takes nothing.

# Recipe

Return "constant".
`;

/** Already stamped — must behave identically before and after. */
const STAMPED_NOTE = `---
type: action
inputs:
  - x
---

# Description

Stamped by the bundle-time pass.

# Recipe

Input x: str = "a".
Return x + "!".
`;

/** Mid-edit garbage: the Recipe cannot transpile. Must degrade to the
 *  frontmatter answer rather than throw or return []. */
const BROKEN_RECIPE_NOTE = `---
type: action
inputs:
  - x
---

# Description

Caught mid-keystroke.

# Recipe

Input x: str = "a".
This is not E-- at all {{{{ ]]]]
`;

let _booted: any = null;
async function boot(): Promise<any> {
  if (_booted) return _booted;
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
    try { py.FS.writeFile('/bundle/engine/' + parts.join('/'), fs.readFileSync(abs)); }
    catch { /* already written */ }
  }
  try { py.FS.mkdir('/bundle/user-vault'); } catch { /* exists */ }

  py.FS.writeFile('/bundle/user-vault/unstamped.md', UNSTAMPED_RECIPE_NOTE);
  py.FS.writeFile('/bundle/user-vault/noinput.md', NO_INPUT_NOTE);
  py.FS.writeFile('/bundle/user-vault/stamped.md', STAMPED_NOTE);
  py.FS.writeFile('/bundle/user-vault/broken.md', BROKEN_RECIPE_NOTE);

  await py.loadPackage(['pyyaml', 'numpy']);

  // The REAL production block, extracted at test time (fixture-drift rule).
  // Drain 2026-08-16-1600 — extraction shared with the other suites.
  py.runPython(extractProductionPythonBlock());

  _booted = py;
  return py;
}

function inputNames(py: any, snippetId: string): string[] {
  py.globals.set('_forge_input_names_snippet_id', snippetId);
  const proxy = py.runPython(`list(_forge_get_input_names(_forge_input_names_snippet_id))`);
  const out = proxy.toJs ? proxy.toJs() : proxy;
  proxy.destroy?.();
  return out as string[];
}

test('input-names: an unstamped Recipe-canonical note surfaces its declared input', async () => {
  // THE case. Pre-fix this returns [] and runSnippet skips the dialog.
  const py = await boot();
  assert.deepEqual(inputNames(py, 'unstamped'), ['x']);
});

test('input-names: a genuinely zero-input note still returns [] so the dialog stays skipped', async () => {
  // §8 — the skip is correct here and must not change.
  const py = await boot();
  assert.deepEqual(inputNames(py, 'noinput'), []);
});

test('input-names: a stamped note is unchanged, with no double-counting', async () => {
  // The union must not now report ['x', 'x'] from two agreeing sources.
  const py = await boot();
  assert.deepEqual(inputNames(py, 'stamped'), ['x']);
});

test('input-names: an unparseable Recipe degrades to the frontmatter answer', async () => {
  // §4's failure posture: resolution failing costs the resolved read, never
  // the dialog. This note can't transpile, but its frontmatter still says x.
  const py = await boot();
  assert.deepEqual(inputNames(py, 'broken'), ['x']);
});

test('input-names: a note that does not resolve at all does not throw', async () => {
  const py = await boot();
  assert.throws(() => inputNames(py, 'no-such-note'));
});

test('input-names and input-defaults read the same source', async () => {
  // Drain 1900 built the defaults reader on the resolved signature because
  // that is by construction what the executor binds. Names must agree with
  // it, or the dialog could ask for one set and bind another.
  const py = await boot();
  py.globals.set('_forge_input_defaults_snippet_id', 'unstamped');
  const proxy = py.runPython(`_forge_get_input_defaults(_forge_input_defaults_snippet_id)`);
  const defaults = proxy.toJs({ dict_converter: Object.fromEntries });
  proxy.destroy?.();
  assert.deepEqual(Object.keys(defaults), ['x']);
  assert.deepEqual(inputNames(py, 'unstamped'), Object.keys(defaults));
});
