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

import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadPyodide } from 'pyodide';

// Music-edition Phase 2: the 11 wheels are FETCHED + sha256-verified into the gitignored assets/wheels/
// (`npm run fetch-music-wheels`), not committed. A checkout that has not fetched them skips this suite
// with an explicit reason instead of failing — lean builds neither need nor ship them. With wheels
// present (the music edition's setup) every test below runs against the real Pyodide + real wheels.
const WHEELS_DIR = path.resolve(process.cwd(), 'assets/wheels');
const WHEELS_PRESENT = fs.existsSync(WHEELS_DIR)
  && fs.readdirSync(WHEELS_DIR).some((f) => f.endsWith('.whl'));
const test = (name: string, fn: () => Promise<void>) =>
  baseTest(
    name,
    { skip: WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels' },
    fn,
  );

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

test('registry can scan a library vault (forge.toml read) without tomli_w', async () => {
  // v0.2.32: regression test for the v0.2.30/v0.2.31 production
  // failure where _scan_library_vault silently failed in Pyodide
  // because forge.core.manifest had unconditional imports of
  // tomli_w + packaging.version + forge.installer.exceptions —
  // none of which are available in the closed-beta Pyodide bundle.
  // Scan result: 0 library vaults registered; lookups for qualified
  // IDs (forge-music/blues/song) all failed with SnippetResolutionError.
  //
  // Without this test, the failure mode only surfaces when a user
  // forge-clicks a snippet inside a library subdir — too late.
  const py = await bootWithMusic21();
  // Lay down a minimal library vault in MEMFS.
  py.runPython(`
import os
os.makedirs("/tmp/forge_scan_test/forge-music/blues", exist_ok=True)
with open("/tmp/forge_scan_test/forge-music/forge.toml", "w") as f:
    f.write('name = "forge-music"\\nversion = "0.3.4"\\ndescription = "test"\\ndomains = ["music"]\\n')
with open("/tmp/forge_scan_test/forge-music/blues/song.md", "w") as f:
    f.write('---\\ntype: action\\ndescription: x\\ninputs: []\\n---\\n\\n# English\\n\\nplay\\n')
from forge.core.snippet_registry import SnippetRegistry
_reg = SnippetRegistry()
_reg.scan("/tmp/forge_scan_test")
`);
  const vaults = py.runPython(`list(_reg._vaults.keys())`).toJs();
  const errors = py.runPython(`list(_reg.errors)`).toJs();
  const songFound = py.runPython(`_reg.get_in_vault("forge-music", "blues/song") is not None`);
  assert.deepEqual(
    errors, [],
    `scan should produce zero errors; got: ${JSON.stringify(errors)}`,
  );
  assert.ok(
    vaults.includes('forge-music'),
    `forge-music should be registered as a library vault; vaults=${JSON.stringify(vaults)}`,
  );
  assert.equal(
    songFound, true,
    'blues/song should be reachable via get_in_vault("forge-music", "blues/song")',
  );
});

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

// ---------------------------------------------------------------------------------------------------
// Music-edition Phase 2 — the beat-as-data chain, executed for real inside Pyodide: the BUNDLED engine
// (assets/engine/forge/music/lib.py, synced from forge) running rhythm_data_to_stream over the BUNDLED
// music-theory vault's rhythm_data notes, using the FETCHED music21 wheels. This is the exact
// combination that failed in Obsidian ("music21 is not yet mounted"), minus only the Obsidian DOM.
// ---------------------------------------------------------------------------------------------------

function bundledRhythmData(name: string): unknown {
  const file = path.resolve(process.cwd(), 'assets/vaults/music-theory/rhythm_data', `${name}.md`);
  const body = fs.readFileSync(file, 'utf-8');
  const m = body.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(m, `no fenced json block in ${file}`);
  return JSON.parse(m[1]);
}

test('rhythm_data_to_stream runs in Pyodide on the bundled rhythm_data notes; voices_list layers them (the multiplex)', async () => {
  const py = await bootWithMusic21();
  py.globals.set('_pattern_a_json', JSON.stringify(bundledRhythmData('rhythm_pattern_straight_rock')));
  py.globals.set('_pattern_b_json', JSON.stringify(bundledRhythmData('rhythm_pattern_syncopated')));
  py.runPython(`
import json
from forge.music.lib import rhythm_data_to_stream, voices_list
from music21 import note, tempo

_a = rhythm_data_to_stream(json.loads(_pattern_a_json))
_b = rhythm_data_to_stream(json.loads(_pattern_b_json))
_layered = voices_list(sections=[_a, _b])

def _hits(part):
    return [(float(n.offset), float(n.quarterLength)) for n in part.flatten().notes]

_a_parts = len(_a.parts)
_layered_parts = len(_layered.parts)
_kick_a = _hits(_a.parts[0])
_kick_b = _hits(_layered.parts[3])
_tempos = [m.number for p in _layered.parts for m in p.flatten().getElementsByClass(tempo.MetronomeMark)]
`);
  assert.equal(py.runPython('_a_parts'), 3, 'one Part per channel (kick, snare, hihat)');
  assert.equal(py.runPython('_layered_parts'), 6, 'two data notes -> six Parts layered');
  // Straight rock: kick on beats 1 and 3, a sixteenth long.
  assert.deepEqual(py.runPython('_kick_a').toJs(), [[0, 0.25], [2, 0.25]]);
  // Syncopated kick (steps 0, 3, 10 of 16): offsets 0, 0.75, 2.5.
  assert.deepEqual(py.runPython('_kick_b').toJs(), [[0, 0.25], [0.75, 0.25], [2.5, 0.25]]);
  assert.deepEqual(py.runPython('_tempos').toJs(), [100, 100, 100, 100, 100, 100]);
});

// ---------------------------------------------------------------------------------------------------
// Beat-as-data Phases 2+3 (drain 2026-10-04-2330) — rhythm_sequence and rhythm_accented, executed in Pyodide
// with the BUNDLED engine + FETCHED music21 wheels. What runs is the note's own stored `# Python` section.
//
// Vault-freshness caveat: the BUNDLED music-theory copy (assets/vaults/music-theory) only gains these notes
// when the driver re-syncs it (`FORGE_EDITION=music node scripts/sync-bundled-vault.mjs ...`). So the note is
// read from the bundled copy when it is there (post-sync) and otherwise from the SOURCE vault checkout
// (../music-theory); with neither, the test skips with that explicit reason rather than silently passing.
// The two data-note leaves are always read from the bundled copy (they ship today).
// ---------------------------------------------------------------------------------------------------

function exampleNote(name: string): { text: string; from: 'bundled' | 'source' } | null {
  const candidates: Array<['bundled' | 'source', string]> = [
    ['bundled', path.resolve(process.cwd(), 'assets/vaults/music-theory/rhythm_data', `${name}.md`)],
    ['source', path.resolve(process.cwd(), '../music-theory/rhythm_data', `${name}.md`)],
  ];
  for (const [from, file] of candidates) {
    if (fs.existsSync(file)) return { text: fs.readFileSync(file, 'utf-8'), from };
  }
  return null;
}

function noteFrontmatterAndPython(text: string): { python: string } {
  const m = text.match(/# Python\n\n```python\n([\s\S]*?)\n```/);
  assert.ok(m, 'note has no # Python section');
  return { python: m[1] };
}

// Runs a note's compiled Python the way the plugin runtime does: the data-note leaves are functions that
// return their parsed JSON; lib chips are in scope; `compute(context)` is the entry point.
async function runExampleNote(name: string): Promise<{ py: any; from: string }> {
  const note = exampleNote(name);
  assert.ok(note, `neither the bundled nor the source music-theory vault has rhythm_data/${name}.md`);
  const py = await bootWithMusic21();
  py.globals.set('_pattern_a_json', JSON.stringify(bundledRhythmData('rhythm_pattern_straight_rock')));
  py.globals.set('_pattern_b_json', JSON.stringify(bundledRhythmData('rhythm_pattern_syncopated')));
  py.globals.set('_note_python', noteFrontmatterAndPython(note.text).python);
  py.runPython(`
import json
import forge.music.lib as _lib
_ns = {n: getattr(_lib, n) for n in dir(_lib) if not n.startswith('_')}
_ns['rhythm_pattern_straight_rock'] = lambda: json.loads(_pattern_a_json)
_ns['rhythm_pattern_syncopated'] = lambda: json.loads(_pattern_b_json)
exec(_note_python, _ns)
_score = _ns['compute'](None)
_names = [p.getInstrument().instrumentName for p in _score.parts]
_bars = [len(p.getElementsByClass('Measure')) for p in _score.parts]
_vels = [[n.volume.velocity for n in p.flatten().notes] for p in _score.parts]
_kick = [float(n.offset) for n in _score.parts[0].flatten().notes]
_accents = [sum(any(type(a).__name__ == 'Accent' for a in n.articulations) for n in p.flatten().notes) for p in _score.parts]
`);
  return { py, from: note.from };
}

const exampleSkip = (name: string) =>
  exampleNote(name) ? undefined : `skipped: rhythm_data/${name}.md is in neither the bundled music-theory vault (not re-synced yet) nor ../music-theory`;

baseTest('rhythm_sequence (note\'s own Python) runs in Pyodide: a 2-bar Score, same-instrument staves merged, straight rock then syncopated', { skip: exampleSkip('rhythm_sequence') ?? (WHEELS_PRESENT ? false : 'music wheels not fetched') }, async () => {
  const { py } = await runExampleNote('rhythm_sequence');
  assert.deepEqual(py.runPython('_names').toJs(), ['Kick', 'Snare', 'Closed Hi-Hat']);
  assert.deepEqual(py.runPython('_bars').toJs(), [2, 2, 2]);
  // straight rock kick (steps 0, 8 -> 0, 2) in bar 1, then syncopated kick (0, 3, 10 -> 4, 4.75, 6.5) in bar 2
  assert.deepEqual(py.runPython('_kick').toJs(), [0, 2, 4, 4.75, 6.5]);
});

baseTest('rhythm_accented (note\'s own Python) runs in Pyodide: one bar, accents land where the syncopated mask hits', { skip: exampleSkip('rhythm_accented') ?? (WHEELS_PRESENT ? false : 'music wheels not fetched') }, async () => {
  const { py } = await runExampleNote('rhythm_accented');
  assert.deepEqual(py.runPython('_names').toJs(), ['Kick', 'Snare', 'Closed Hi-Hat']);
  assert.deepEqual(py.runPython('_bars').toJs(), [1, 1, 1]);
  assert.deepEqual(py.runPython('_vels').toJs(), [
    [112, 72],
    [72, 112],
    [112, 112, 72, 112, 72, 112, 112, 112],
  ]);
});

// Beatbox Phase 3b (drain 2026-10-05-1800): the loud hits are VISIBLE — an Accent articulation on every hit whose
// authored velocity is >= 100 — and the mark is notation only (the velocities above are exactly as authored).
baseTest('rhythm_accented (note\'s own Python) in Pyodide: Accent marks on exactly the loud hits — kick 1, snare 1, hi-hat 6 — velocities untouched', { skip: exampleSkip('rhythm_accented') ?? (WHEELS_PRESENT ? false : 'music wheels not fetched') }, async () => {
  const { py } = await runExampleNote('rhythm_accented');
  assert.deepEqual(py.runPython('_accents').toJs(), [1, 1, 6]);
  assert.deepEqual(py.runPython('_vels').toJs(), [
    [112, 72],
    [72, 112],
    [112, 112, 72, 112, 72, 112, 112, 112],
  ]);
});

baseTest('rhythm_sequence (note\'s own Python) in Pyodide: all-boolean data carries no accent marks', { skip: exampleSkip('rhythm_sequence') ?? (WHEELS_PRESENT ? false : 'music wheels not fetched') }, async () => {
  const { py } = await runExampleNote('rhythm_sequence');
  assert.deepEqual(py.runPython('_accents').toJs(), [0, 0, 0]);
});

test('accent_mask velocities survive a MIDI write in Pyodide (the accents reach the file, not just the in-memory notes)', async () => {
  const py = await bootWithMusic21();
  py.globals.set('_pattern_a_json', JSON.stringify(bundledRhythmData('rhythm_pattern_straight_rock')));
  py.globals.set('_pattern_b_json', JSON.stringify(bundledRhythmData('rhythm_pattern_syncopated')));
  py.runPython(`
import json, os, tempfile
from forge.music.lib import accent_mask, rhythm_data_to_stream
from music21 import converter

_score = rhythm_data_to_stream(accent_mask(json.loads(_pattern_a_json), json.loads(_pattern_b_json)))
_fp = os.path.join(tempfile.mkdtemp(), 'accented.mid')
_score.write('midi', fp=_fp)
_by = {}
for _n in sorted(converter.parse(_fp).flatten().notes, key=lambda n: float(n.offset)):
    _by.setdefault(_n.storedInstrument.percMapPitch, []).append(_n.volume.velocity)
_kick, _snare, _hat = _by[35], _by[38], _by[42]
`);
  assert.deepEqual(py.runPython('_kick').toJs(), [112, 72]);
  assert.deepEqual(py.runPython('_snare').toJs(), [72, 112]);
  assert.deepEqual(py.runPython('_hat').toJs(), [112, 112, 72, 112, 72, 112, 112, 112]);
});
