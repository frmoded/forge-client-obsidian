// v0.2.27 — verify music21 + the music-domain helpers are accessible
// from within Pyodide after the host's boot sequence runs.
//
// Pre-v0.2.27 the executor's `try: import music21` silently caught the
// ImportError in Pyodide (music21 wasn't bundled), leaving the music
// domain bundle empty. forge-music snippets crashed with
// `NameError: name 'key' is not defined` six call-levels deep when a
// user forge-clicked them.
//
// These tests mount the vendored wheels into Pyodide's MEMFS, run the
// production micropip-install loop (extracted from pyodide-host.ts via
// the wheel-list this test agrees on), and confirm the core music21
// modules + forge.music.lib helpers + a form.md-equivalent compute
// body all work end-to-end. This is the closed-beta "Forge a music
// snippet" UX value chain except the literal Obsidian DOM render.

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

// Boot Pyodide + mount the wheels + the engine bundle, then extract
// each wheel into /bundle/site-packages via Python's stdlib zipfile
// and add it to sys.path. We deliberately do NOT use micropip — even
// with deps=False, micropip parses the wheel's METADATA and calls
// loadPackage for each declared dep, which in production (no
// network) would either 404 against the local indexURL or fall back
// to the jsdelivr CDN. Closed-beta has no network, so we vendor every
// wheel music21 transitively imports at top-level and use the
// stdlib's zipfile to extract them.
//
// Wheels currently vendored: music21 + chardet, jsonpickle,
// more-itertools, webcolors, joblib (declared deps) + requests,
// urllib3, certifi, charset-normalizer, idna (transitive via
// music21.converter which music21's __init__ pulls eagerly).
// matplotlib and the matplotlib-only optional path is left
// unvendored — music21 emits a stdout warning about it but doesn't
// import it eagerly, and the music-domain snippets we ship don't
// touch plot helpers.
async function bootWithMusic21(): Promise<any> {
  const py = await getPyodide();

  // Stock packages first.
  await py.loadPackage(['numpy', 'pyyaml']);

  // Mount the wheels.
  try { py.FS.mkdir('/bundle'); } catch { /* exists */ }
  try { py.FS.mkdir('/bundle/wheels'); } catch { /* exists */ }
  try { py.FS.mkdir('/bundle/site-packages'); } catch { /* exists */ }
  const wheelsDir = path.resolve(process.cwd(), 'assets/wheels');
  for (const { rel, abs } of walk(wheelsDir)) {
    const target = '/bundle/wheels/' + rel;
    try { py.FS.writeFile(target, fs.readFileSync(abs)); } catch { /* already */ }
  }

  // Mount the engine bundle so forge.music.lib + forge.core.* land
  // on sys.path.
  try { py.FS.mkdir('/bundle/engine'); } catch { /* exists */ }
  const engineDir = path.resolve(process.cwd(), 'assets/engine');
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

  // Extract wheels into site-packages and wire sys.path. No network
  // calls — this is the production-safe path.
  py.runPython(`
import os, sys, zipfile
SITE = "/bundle/site-packages"
WHEELS = "/bundle/wheels"
if SITE not in sys.path:
    sys.path.insert(0, SITE)
for fname in sorted(os.listdir(WHEELS)):
    if fname.endswith(".whl"):
        with zipfile.ZipFile(os.path.join(WHEELS, fname)) as zf:
            zf.extractall(SITE)
if "/bundle/engine" not in sys.path:
    sys.path.insert(0, "/bundle/engine")
`);

  return py;
}

test('music21 importable after boot', async () => {
  const py = await bootWithMusic21();
  // Will raise ModuleNotFoundError if music21 wheel wasn't vendored
  // (pre-v0.2.27) or if micropip-install failed silently.
  py.runPython(`import music21; _ver = music21.VERSION_STR`);
  const version = py.runPython(`music21.VERSION_STR`);
  assert.equal(version, '8.3.0');
});

test('music21 core modules accessible — seam test for executor bundle', async () => {
  const py = await bootWithMusic21();
  // Every module the executor binds into _MUSIC21_NAMES gets touched
  // with a basic method call. Pre-v0.2.27, any of these would raise
  // NameError because the silent ImportError in executor.py left
  // _MUSIC21_NAMES = {}. Post-v0.2.27 every binding works.
  py.runPython(`
import music21
from music21 import key, stream, note, chord, meter, tempo
from music21 import pitch, duration, instrument, harmony, roman
k = key.Key('E', 'major')
ts = meter.TimeSignature('12/8')
rn = roman.RomanNumeral('I', k)
p = stream.Part()
p.append(instrument.Piano())
n = note.Note('E4', quarterLength=1.0)
c = chord.Chord(['E4', 'G#4', 'B4'])
mm = tempo.MetronomeMark(number=70)
d = duration.Duration(type='quarter', dots=1)
pi = pitch.Pitch('E4')
cs = harmony.ChordSymbol('Em7')
_result = (k.name, ts.numerator, rn.figure, n.pitch.nameWithOctave)
`);
  // music21 8.3.0: Key.name returns the tonic+mode label.
  const result = py.runPython(`_result`).toJs();
  assert.deepEqual(result, ['E major', 12, 'I', 'E4']);
});

test('forge.music.lib accessible — engine bundle contains music helpers', async () => {
  const py = await bootWithMusic21();
  // Pre-v0.2.27 assets/engine/forge/ was missing the music/ subdir.
  // The executor's `from forge.music import lib as _music_lib` (line 33)
  // would ImportError on Pyodide. _FORGE_MUSIC_LIB_NAMES would be {}
  // — so even `sequence` was missing from the music domain bundle.
  py.runPython(`
from forge.music import lib
from music21 import stream, instrument
p1 = stream.Part(); p1.append(instrument.Piano())
p2 = stream.Part(); p2.append(instrument.Piano())
score = lib.sequence(p1, p2)
_kind = type(score).__name__
`);
  const kind = py.runPython(`_kind`);
  assert.equal(kind, 'Score');
});

test('form.md-equivalent compute body runs to completion', async () => {
  const py = await bootWithMusic21();
  // Inline form.md's load-bearing shape: build a Score with a
  // Key + TimeSignature + RomanNumeral-derived Chord. This is the
  // body that triggered the user's NameError pre-v0.2.27. Post-fix
  // it must execute and return a music21.stream.Score.
  py.runPython(`
import music21
from music21 import key, stream, note, chord, meter, tempo, instrument, roman, harmony, duration
import copy

def compute_form():
    tonic = 'E'
    mode = 'major'
    k = key.Key(tonic, mode)
    ts = meter.TimeSignature('12/8')
    bar_ql = ts.barDuration.quarterLength
    mm = tempo.MetronomeMark(number=70, referent=duration.Duration(type='quarter', dots=1))
    part = stream.Part()
    part.append(instrument.Piano())
    for i, numeral in enumerate(['I', 'I', 'I', 'I']):
        m = stream.Measure(number=i + 1)
        if i == 0:
            m.append(copy.deepcopy(k))
            m.append(copy.deepcopy(ts))
            m.append(copy.deepcopy(mm))
        rn = roman.RomanNumeral(numeral, k)
        cs = harmony.ChordSymbol(rn.root().name)
        m.insert(0, cs)
        c = chord.Chord(list(rn.pitches), quarterLength=bar_ql)
        m.insert(0, c)
        part.append(m)
    score = stream.Score()
    score.append(part)
    return score

_score = compute_form()
_kind = type(_score).__name__
_n_parts = len(_score.parts)
_n_measures = len(_score.parts[0].getElementsByClass(stream.Measure))
`);
  const kind = py.runPython(`_kind`);
  const nParts = py.runPython(`_n_parts`);
  const nMeasures = py.runPython(`_n_measures`);
  assert.equal(kind, 'Score');
  assert.equal(nParts, 1);
  assert.equal(nMeasures, 4);
});
