# Pyodide spike — does music21 run in WASM?

## Scope

Research spike, parallel to `2026-05-23-0400-pyodide-moda-spike.md`. NOT production work. Deliverable is a small HTML+JS+Python scaffold + a measurement report answering:

1. **Can music21 be installed and imported in Pyodide?** Via `loadPackage`, `micropip`, or alternative.
2. **Does basic music21 actually work?** Stream construction, MusicXML serialization — the operations forge-music actually uses.
3. **Does a real forge-music snippet run end-to-end through the engine?** Mirror the moda spike's shape — load trimmed engine, mount vault, execute snippet, compare against native baseline.
4. **Bundle size delta.** music21 + transitive deps alongside the existing Pyodide + numpy + pyyaml bundle.
5. **Feature gaps.** Which music21 features DON'T work in Pyodide (corpus access, Lilypond integration, anything else). Flag so snippet authoring knows what to avoid.

Performance is a bonus measurement — music isn't real-time the way moda is, but a slow MusicXML serialize is still worth knowing.

Does NOT:
- Touch the engine, the plugin, the iframe, any vault content, or the registry.
- Build a real Pyodide-backed forge-music plugin.
- Refactor music21 or `forge.music.lib`.
- Mix with moda's spike — separate directory, separate report.
- Make architectural decisions. This spike informs a decision; doesn't make one.

## Why

Music V1 is approaching commitment per the user; pressure on delivery. The moda spike validated Pyodide V1 for moda. We need to know whether the same architecture extends to forge-music before committing engineering budget to a plan that may not cover music.

Three outcomes, each useful:

- **music21 works fully in Pyodide.** Pyodide V1 extends cleanly. Same plugin shape ships both vaults.
- **music21 partially works.** Snippets using the working subset ship; we document the forbidden subset for snippet-authoring guidance.
- **music21 doesn't work in Pyodide.** forge-music V1 needs a different deployment path (Homebrew, sidecar, separate plugin, or a pure-Python music lib replacement). Knowing now buys time to plan.

## Files to create

`/Users/odedfuhrmann/projects/forge-moda-bootstrap/spikes/pyodide-music/`

Mirrors the moda spike layout. Specifically:

- `README.md` — short description, how to run, what's measured.
- `index.html` — browser scaffold loading Pyodide + music21 + the spike's bundled engine + vault.
- `run-spike.mjs` — Node.js runner equivalent of the browser scaffold (faster iteration, same WASM core).
- `native-baseline.py` — same forge-music snippet timed natively for comparison.
- `report.md` — primary deliverable; same structure as the moda spike's report.
- `bundle/forge/` — trimmed engine subset that needs music21 (`forge.core.executor`, `forge.core.snippet_registry`, `forge.core.graph_resolver`, `forge.core.serialization`, `forge.core.snapshots`, `forge.core.exceptions`, `forge.core.registry`, plus `forge.music.lib` and whatever it depends on).
- `bundle/vault/` — forge-music vault content copied from `~/projects/forge-music/`.
- `package.json` + `node_modules/pyodide/` — same as moda spike for the Node runner.

## Implementation notes

### Music21 install path

Pyodide doesn't ship music21 as a built-in package (verify with `pyodide.loadPackage` against its index). Two paths to try:

1. **`micropip.install("music21")`.** Pyodide's package manager for PyPI wheels. Works if music21's wheel is pure-Python and its transitive deps are all installable. Try first; log what comes in and how long it takes.
2. **Pre-bundled wheels.** Download music21's wheel + transitive deps once, mount into MEMFS at startup, install via `micropip.install("file:///bundle/wheels/...")`. The production shape — eliminates runtime network dependency.

Try (1) first for learning. (2) is what real V1 would do.

### Music21 transitive deps

music21 pulls in some dependency closure: chord-naming, optionally matplotlib (for plotting we don't use), possibly more. Some may be C extensions Pyodide doesn't have. If any dep can't install, document it — flag whether it's optional (skippable) or required.

If music21 itself fails to import after install (e.g., because its module-load code does something Pyodide can't handle), document where exactly.

### Engine subset + forge.music.lib

Mount under `/bundle` similar to the moda spike. Include:
- The `forge.core.*` files needed by the music snippet path.
- `forge.music.lib` (the wrapper around music21 — `bar`, `voices`, `sequence`, `repeat`, `pentatonic` per `executor.py`'s import).
- `forge.music` package's `__init__.py` if it exists.

The `try/except ImportError` blocks in `forge/core/executor.py` will need to succeed for music21 to be pre-injected into snippet globals. If they silently fail in Pyodide, snippets that reference `stream`, `note`, `chord`, etc. without explicit imports will break — flag.

### Pick a representative forge-music snippet

Browse `~/projects/forge-music/`. Pick a snippet that:
- Constructs a music21 Stream (so `_try_serialize_music21` is exercised).
- Returns the Stream (engine serializes to MusicXML).
- Doesn't require corpus access (corpus is large and orthogonal to the question — defer).
- Is small enough to time meaningfully.

Candidates: `chorus`, `form`, `twelve_bar_blues_progression`, any of the blues snippets. Pick one; document choice in the report.

### Verovio note

The plugin renders MusicXML via Verovio. The spike doesn't need to test rendering — Verovio runs in the plugin already, doesn't care where the MusicXML came from. As long as music21 produces valid MusicXML in Pyodide, the rendering pipeline is unchanged. One-line note in the report.

### Corpus

music21 ships with a sizable built-in corpus of musical works (Bach chorales, etc.). The corpus is data, not code — large to bundle (~30-50MB I think, unverified), and most forge-music snippets don't use it. The spike should NOT load the corpus and should pick a snippet that doesn't need it. If a music21 import fails because it tries to validate the corpus path, that's a real friction worth flagging.

### Performance measurement

Same shape as the moda spike. Three trials of the chosen snippet in Pyodide; three trials native. Report mean, ratio, headroom.

Music doesn't have a real-time fps target like moda, but the "is this acceptable?" verdict is still useful — a 5-second MusicXML serialize is fine; a 30-second one isn't.

### Bundle size

After music21 + transitive deps are loaded (whether via micropip or pre-bundled wheels), measure the additional download cost on top of moda's 8MB gzipped baseline. Report:
- Total gzipped bundle if music21 ships alongside everything moda needs.
- Just the music21 + transitive-deps delta.

## Tests

The spike is the test. The native-baseline run uses an existing forge-music test (if one exists for the chosen snippet) or a small custom timing script.

## Out of scope

- Building a real forge-music Pyodide plugin.
- Bundling music21 + moda into one spike — keep them separate for cleanliness.
- Iframe integration.
- Production-quality error handling, retries, lazy-loading.
- Testing every music21 feature exhaustively — just what the engine + the chosen snippet actually use.
- Replacing music21 with a different library — that's a fork in the road this spike informs but doesn't take.
- Corpus support — flagged if blocking, otherwise skipped.

## Report when done

`report.md` (same structure as moda's report). Sections:

1. **Environment.** Pyodide version, browser/Node version, native baseline machine, vault under test, snippet under test, trials.
2. **Music21 install.** Which path worked (micropip, pre-bundled wheels, neither), install time, transitive deps that came in, anything that failed.
3. **Basic Stream + MusicXML.** Probe results — construct a Stream, serialize to MusicXML, verify output is reasonable. Compare against the native version of the same probe.
4. **Forge-music snippet end-to-end.** Did it run? Did it return a Stream? Did `_try_serialize_music21` produce MusicXML? Diff against native output.
5. **Performance.** Pyodide vs native, three trials each, ratio, verdict ("fast enough" / "slow but tolerable" / "unacceptably slow").
6. **Bundle size.** Total + delta over moda baseline.
7. **Feature gaps.** What music21 features failed or are unsupported in Pyodide. Flag for forge-music snippet-authoring guidance.
8. **Surprises / blockers.**
9. **Recommendation.** Honest verdict — full / partial / not viable. State dependencies if any.

Plus a chat post with:
1. Verdict on each of the five questions in scope.
2. Top-line recommendation.
3. Anything that didn't work and why.

## Commits + push

No commits. `forge-moda-bootstrap/spikes/` is untracked, mirroring the moda spike.

## Don'ts

- **Don't refactor music21.** Document failures; don't patch.
- **Don't refactor `forge.music.lib`.** Observe, don't fix.
- **Don't refactor engine code** to make Pyodide work with music21. Same as moda spike — if the engine doesn't run in Pyodide for music's path, document and recommend, don't ship.
- **Don't optimize for performance.** First-pass numbers.
- **Don't load the music21 corpus.** Too large, orthogonal to the question.
- **Don't ship anything to production.**
- **Don't commit.**
- **Don't bundle into the moda spike directory** — separate exploration, separate report.
- **Don't hedge the recommendation** — give a verdict with named dependencies. "Depends on X" is OK if X is concrete.
- **Don't try every music21 feature** — just what the engine + the chosen snippet actually exercise.
