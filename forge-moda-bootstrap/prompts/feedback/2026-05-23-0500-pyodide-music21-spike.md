---
timestamp: 2026-05-23T04:18:31Z
session_id: unknown
prompt_modified: 2026-05-23T05:00Z
status: success
---

# Pyodide music21 spike — verdict: viable, but heavy

## TL;DR

**Pyodide V1 for forge-music is viable.** music21 installs via
micropip in ~5 seconds. A real forge-music snippet (12-bar blues
`form`) runs end-to-end through the engine and produces well-formed
MusicXML at 1.20× native speed (essentially indistinguishable).
**Bundle is heavy: ~40 MB gzipped over the wire**, ~22 MB of which
is the music21 wheel itself (already-zipped). No feature gaps in
the compose-and-serialize surface area the engine touches.

## Q1: can music21 be installed and imported in Pyodide?

**Yes.** `micropip.install("music21")` pulls music21 8.3.0 from
PyPI along with its full transitive closure (matplotlib, Pillow,
fonttools, contourpy, kiwisolver, cycler, requests + closure,
joblib, pytz, dateutil, six, packaging, pyparsing, more-itertools).
All wheels Pyodide-compatible. Install time: **4.78s** (cached
after first run).

Note: only HARD import-time dep is `requests` (+ its closure).
matplotlib/Pillow/etc. are runtime-lazy. Real V1 can trim ~10 MB
with `micropip.install(deps=False)` + explicit `requests`. Spike
runs the full install for first-pass realism.

## Q2: does basic music21 actually work?

**Yes.** Stream + Note + TimeSignature + GeneralObjectExporter
produce well-formed MusicXML (2166 bytes for a C-major
4-note example). `roman.RomanNumeral('I', Key('E','major')).pitches`
returns `[E4, G#4, B4]` — correct.

## Q3: does a real forge-music snippet run end-to-end?

**Yes.** `form.md` (12-bar blues skeleton, uses
`meter`/`key`/`tempo`/`duration`/`stream`/`roman`/`harmony`/
`chord`/`instrument`) runs through the engine in Pyodide:

- Engine import lazy-loads music21 via `try/except` in
  `executor.py:13-30` — succeeds; `_MUSIC21_NAMES` has 12 names
  injected (same as native). `forge.music.lib`'s 5 names also
  injected.
- `exec_python(form_code, ..., snippet_id="form")` dispatches
  `context.compute("twelve_bar_blues_progression")` to the JSON
  data snippet, builds a Score.
- `serialize_for_wire(score, form)` returns
  `("musicxml", <12,779 chars>)`. Native produced 12,469 chars —
  a 2.4% pretty-print delta between music21 versions; semantic
  music identical.

## Q4: performance

| | Pyodide | Native | Ratio |
|---|---|---|---|
| Total (exec + serialize) | **42 ms** | **35 ms** | **1.20×** |
| exec only | ~20 ms | ~16 ms | 1.25× |
| serialize only | ~21 ms | ~19 ms | 1.10× |

Three trials each. **Faster ratio than moda's 1.44×** — music21's
stream/measure construction is mostly small-object Python (no hot
loop where the WASM-JIT gap could amplify). For a user clicking a
snippet and expecting a rendered score, 42 ms is well below the
threshold where they'd notice WASM is involved.

## Q5: bundle size

**Total bundle: ~40 MB gzipped over the wire (~50 MB uncompressed).**

| Component | Gzipped |
|---|---|
| Pyodide core (wasm + js + stdlib) | 5.20 MB |
| numpy + pyyaml + micropip | 2.88 MB |
| **music21 wheel itself** | **21.83 MB** |
| Transitive (matplotlib, Pillow, fonttools, requests closure, …) | ~10.4 MB |
| Engine + vault | 35 KB |
| **Total** | **~40 MB** |

**Delta over moda's 8 MB baseline: ~32 MB gzipped** — music21
contributes basically all of that. The music21 wheel is 22.77 MB
because it bundles the music21 corpus (~69 MB expanded) inside —
already a zip, so gzip can't recompress.

**Optimization paths (not pursued in this spike):**

- `micropip.install("music21", deps=False)` + explicit `requests` →
  drops ~10 MB of unused matplotlib/Pillow/fonttools closure.
- Vendor a corpus-stripped music21 → drops the 22 MB wheel to ~10 MB.
- Both together → estimated **~22 MB gzipped total** (close to
  moda's footprint).

## Feature gaps

**None in the compose-and-serialize surface area** the engine
exercises. All 12 music21 modules the executor injects loaded and
worked.

**Untested but probable concerns:**
- **Corpus access** (`corpus.parse('bach/bwv57.8')`) — not probed.
  Corpus files are in the wheel; should work but unverified.
- **MIDI export** (`s.write('midi')`) — not probed.
- **Lilypond rendering** — won't work (no subprocess in WASM). The
  plugin renders via Verovio in JS, so this is moot.
- **`.plot()` / `.show()`** — out of scope for forge-music V1.

**Snippet-authoring guidance:** compose + serialize only. Avoid
corpus parsing until probed. Avoid lilypond, plot, show.

## What tried and didn't work

Nothing of substance failed. Two notes worth recording:

1. **Spent time probing minimal-deps path.** Tested
   `micropip.install("music21", deps=False)` plus single-dep
   re-adds — confirmed only `requests` is required at import time,
   but didn't complete a full minimal-deps run-through to time
   (the JS error path in Node-side Pyodide buried the Python
   error in 1 MB of asm.js stack trace, making debugging
   expensive). Documented as a V1 optimization path; not load-bearing
   for the spike's verdict.

2. **music21's "matplotlib optional" warning prints on import** —
   harmless cosmetic noise. A `warnings.filterwarnings` call in V1
   init would silence it.

## Files added under `spikes/pyodide-music/`

- `README.md` — how to run; layout
- `report.md` — primary deliverable, all measurements + verdict
- `run-spike.mjs` — Node.js runner (measurement vehicle)
- `native-baseline.py` — same `form` snippet timed natively
- `index.html` — browser scaffold for the same flow
- `bundle/forge/` — trimmed engine (8 files + 3 `__init__.py` + music/lib + moda/types)
- `bundle/vault/` — `form.md` + `twelve_bar_blues_progression.md` + minimal forge.toml
- `bundle/manifest.json` — flat fetch-list for the browser scaffold
- `package.json` + `node_modules/pyodide/` — Node deps

No git commits (`forge-moda-bootstrap` is untracked, per the prompt).

## Recommendation

**Pyodide V1 for forge-music. No hedges. Conditioned on:**

1. **40 MB gzipped plugin asset is acceptable.** Larger than moda's
   8 MB, but within Obsidian plugin norms.
2. **~10 second initial session warmup (Pyodide load + music21
   install) is acceptable.** Both one-time; subsequent snippet
   runs are <50 ms.
3. **Snippet authoring stays in compose-and-serialize.** No corpus
   parsing, no lilypond, no plot.

If any of those is non-negotiable in the other direction, the trim
path (corpus-stripped music21 + `deps=False`) puts total bundle at
~22 MB gzipped — sub-1-day to implement.

## One observation

Combined with the moda spike's verdict, **the V1 deployment story
is now coherent: one Obsidian plugin, two domain vaults, single
Pyodide runtime, no Homebrew, no Python on the user's machine.**

The Anthropic transpile service (option α) is even further
undercut by these results. Music's per-snippet cost is 42 ms
in Pyodide; transpiling to JS would shave ~7ms at best, not worth
the architectural complexity. α remains attractive for
LLM-mediated language layer reasons (authoring DX, debuggability)
but the speed argument is now dead for both moda AND music.

Separately: forge-music's snippet inventory today is essentially
empty — the vault has README + LICENSE + forge.toml only.
forge-music V1 needs actual content before the Pyodide V1 plugin
has anything to compute. The blues form/twelve_bar_blues_progression
pair from `~/bin/obsidian_sandbox/sandbox/blues/` is a candidate
starting set; might be worth a "promote to forge-music vault" prompt
parallel to whatever the engineering plan is.
