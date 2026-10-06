// Drain 2026-10-05-2330 (CCQA finding R1): on the Lean edition a music note said "music21 is not yet mounted ... wait ...
// retry" plus "Fix: Every facet of this note is current". Here the WHOLE path runs for real, with no mocks of our own code:
// real Pyodide, the bundled engine (assets/engine), the PRODUCTION bootstrap block from pyodide-host.ts (which sets the
// edition flag), no music21 wheel mounted (exactly what Lean has), a music chip called through the engine's exec_python,
// and the resulting text fed to the real panel classifier.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadPyodide } from 'pyodide';
import { classifyForgeError } from './forge-error-core.ts';
import { extractProductionPythonBlock } from './test-support/extract-python-block.ts';

function walk(dir: string, base = ''): Array<{ rel: string; abs: string }> {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name), path.join(base, e.name)) : [{ rel: path.join(base, e.name), abs: path.join(dir, e.name) }]);
}

let booted: Promise<any> | null = null;
function bootLeanRuntime(): Promise<any> {
  if (booted) return booted;
  booted = (async () => {
    const py = await loadPyodide();
    const engineDir = path.resolve(process.cwd(), 'assets/engine');
    for (const d of ['/bundle', '/bundle/engine', '/bundle/user-vault']) { try { py.FS.mkdir(d); } catch { /* exists */ } }
    const made = new Set<string>();
    for (const { rel, abs } of walk(engineDir)) {
      const parts = rel.split(path.sep);
      let cur = '/bundle/engine';
      for (let i = 0; i < parts.length - 1; i++) {
        cur += '/' + parts[i];
        if (!made.has(cur)) { try { py.FS.mkdir(cur); } catch { /* exists */ } made.add(cur); }
      }
      py.FS.writeFile('/bundle/engine/' + parts.join('/'), fs.readFileSync(abs));
    }
    await py.loadPackage(['pyyaml', 'numpy']);
    py.runPython(extractProductionPythonBlock());     // no /bundle/wheels was created: music21 is NOT available, as on Lean
    return py;
  })();
  return booted;
}

/** Call a music chip through the engine's real exec_python and return what the panel would receive. */
function callMusicChip(py: any): string {
  py.runPython(`
from forge.core.executor import exec_python
try:
    exec_python("def compute(context):\\n  return bar()\\n", {}, None, domains=["music"], snippet_id="lean_probe")
    _lean_probe_err = "NO ERROR"
except BaseException as _e:
    _lean_probe_err = type(_e).__name__ + ": " + str(_e)
`);
  return py.globals.get('_lean_probe_err');
}

test('the production bootstrap block sets FORGE_EDITION from the build\'s edition (Lean here)', async () => {
  const py = await bootLeanRuntime();
  assert.equal(py.runPython('__import__("os").environ.get("FORGE_EDITION")'), 'lean');
});

test('Lean, no music21: a music chip says the edition does not include music — no "wait", no "retry"', async () => {
  const py = await bootLeanRuntime();
  py.runPython('import importlib.util as _u\n_has_m21 = _u.find_spec("music21") is not None');
  assert.equal(py.globals.get('_has_m21'), false, 'precondition: music21 really is absent in this runtime');
  const err = callMusicChip(py);
  assert.match(err, /Music features are not included in the Lean edition of Forge Actions/);
  assert.match(err, /Music edition/);
  assert.ok(!/wait|retry|not yet mounted|few seconds/i.test(err), err);
});

test('the panel then shows a cause that matches and a Fix that is true (not "Every facet of this note is current")', async () => {
  const py = await bootLeanRuntime();
  for (const facet of ['python', 'description', 'recipe', 'synced'] as const) {
    const shown = classifyForgeError({ errorMsg: callMusicChip(py), sourceFacet: facet });
    assert.ok(shown);
    assert.match(shown!.cause, /^Music features are not included in the Lean edition/);
    assert.ok(!/^SnippetExecError/.test(shown!.cause), 'the exception name is not part of the cause');
    assert.match(shown!.suggested_fix, /Install the Music edition/);
    assert.ok(!/Every facet of this note is current/.test(shown!.suggested_fix));
  }
});

test('the SAME runtime flagged as the Music edition keeps the genuine "still loading" message and its true Fix', async () => {
  const py = await bootLeanRuntime();
  py.runPython('import os\n_prev = os.environ.get("FORGE_EDITION")\nos.environ["FORGE_EDITION"] = "music"');
  try {
    const err = callMusicChip(py);
    assert.match(err, /music21 is not yet mounted/);
    assert.ok(!/Lean edition/.test(err));
    const shown = classifyForgeError({ errorMsg: err, sourceFacet: 'synced' });
    assert.match(shown!.suggested_fix, /Wait a few seconds/);
    assert.ok(!/Every facet of this note is current/.test(shown!.suggested_fix));
  } finally {
    py.runPython('os.environ["FORGE_EDITION"] = _prev');
  }
});
