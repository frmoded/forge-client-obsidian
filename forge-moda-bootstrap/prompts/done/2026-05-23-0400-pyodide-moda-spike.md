# Pyodide spike — does moda's engine run in WASM?

## Scope

Research spike. NOT production work. Deliverable is a small HTML+JS+Python scaffold + a measurement report that answers three questions:

1. **Can the moda engine + forge-moda's `simulation` snippet run in Pyodide end-to-end?** I.e., does the actual engine code (`forge.core.executor`, `forge.core.serialization`, `forge.core.snippet_registry`, `forge.moda.types`) plus the moda snippets work when loaded into Pyodide's Python runtime?
2. **How slow is it?** Time a full `simulation` run (300 ticks, sample_clicks scenario) in Pyodide. Compare to native pytest baseline.
3. **Does `dtype=object` numpy work in Pyodide?** moda uses object-dtype arrays for `types` and `masses` string columns. If they don't work, we need a workaround.

Plus a bonus measurement: Pyodide + numpy bundle size (compressed and uncompressed) — informs the Obsidian plugin bundle decision.

Does NOT:
- Ship anything to production.
- Touch any Obsidian plugin code, the iframe, the engine, the constitution, the registry, or any vault content.
- Build a real Pyodide-backed plugin. This is purely "can Pyodide run our Python at all, how fast."
- Address music21 / forge-music. Separate question, separate spike if/when needed.
- Address the transpile service architecture (option α from our discussion).
- Make any architectural decisions. This spike informs a decision; doesn't make one.

## Why

We're evaluating V1 deployment paths for moda. Pyodide is the cleanest shape if it actually works (single Obsidian plugin install, no Homebrew, no Python on user's machine, no hosted compute server). Three real risks ranked by my prior research:

1. **Live-simulator performance.** Pyodide's numpy is ~2-5x slower than native; live 30fps simulator may fall to ~7-12fps.
2. **`dtype=object` arrays.** Empirically untested in Pyodide.
3. **Bundle size.** Estimated 10-15MB for Pyodide + numpy. Acceptable for Obsidian plugins but at the high end.

A 1-2 hour spike resolves #1 and #2 simultaneously and gets us a concrete number for #3. Cheap insurance before committing to either Pyodide V1 or the Homebrew V1 fallback.

## Files to create

All under a new directory:
`/Users/odedfuhrmann/projects/forge-moda-bootstrap/spikes/pyodide-moda/`

This directory exists for exploratory code only. Don't fold into any persistent location (engine, plugin, registry, etc.).

### `spikes/pyodide-moda/README.md`

One short page describing what the spike does, how to run it, what it measures. Just enough that someone re-opening this in three months can pick it up. Plain markdown.

### `spikes/pyodide-moda/index.html`

Minimal HTML page with:
- Load Pyodide from CDN (e.g. `https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.js` — pick the latest stable; check Pyodide release notes for the right version).
- A bit of UI: "Run simulation" button, output panel showing timing + result summary.
- JS that:
  1. Loads Pyodide.
  2. Loads numpy via `await pyodide.loadPackage("numpy")`.
  3. Mounts moda vault content into Pyodide's MEMFS (see below for how).
  4. Imports the engine and runs `simulation` via the executor.
  5. Times the run with `performance.now()`.
  6. Reports timing, returned tick count, particle counts, any errors.

### `spikes/pyodide-moda/bundle/`

Subdirectory holding:
- A trimmed copy of `forge/forge/core/` (executor, serialization, snippet_registry, resolver, exceptions, ...) — the minimum imports `simulation` actually transitively requires. Skip anything that imports `fastapi`, `uvicorn`, `requests`, `dotenv`. The engine's `_capture_edge` is fine; just no HTTP layer.
- A copy of `forge/forge/moda/types.py` (ParticleState dataclass).
- A copy of `forge/forge/builtins/` snippets if the spike needs them (probably not — `install` etc. are out of scope).
- The forge-moda vault content (the `.md` snippets and `_meta/_chips.md`). Copy from `/Users/odedfuhrmann/projects/forge-moda/`.

Wire these up so the spike's JS layer can mount the bundle into MEMFS at startup and the Python `import forge.core.executor` etc. resolves.

You may need to fiddle with `sys.path` inside Pyodide to make the imports work cleanly. Document whatever path setup is needed in the README.

### `spikes/pyodide-moda/report.md`

The measurement report. Sections:
1. **Environment.** Pyodide version, browser tested, native baseline machine (your laptop's spec).
2. **`simulation` runtime in Pyodide.** Three trials, mean, min, max.
3. **`simulation` runtime native (baseline).** Run `pytest tests/moda/test_simulation_snippet.py::test_simulation_returns_particle_state` with timing, three trials.
4. **Object-dtype verdict.** Did `dtype=object` arrays load, create, and survive concatenation? Any surprises?
5. **Bundle size.** Compressed (gzipped) and uncompressed sizes of: Pyodide core, numpy, your spike's bundled `forge/` + vault content, total.
6. **Surprises / blockers.** Anything that broke and how you worked around it (or didn't).
7. **Recommendation.** Honest read on whether Pyodide V1 is viable based on the numbers. Don't hedge — give a verdict, even if it's "depends on user-facing fps tolerance."

## Implementation notes

### Pyodide setup

- Use Pyodide's standard distribution. Avoid building anything custom for the spike.
- `pyodide.loadPackage(...)` for numpy and any other Pyodide-built packages.
- For pure-Python source files (the engine + vault), mount via Pyodide's filesystem API. Two reasonable shapes:
  - Use `pyodide.FS.writeFile(path, content)` for each file at startup. Synchronous; works but verbose for many files.
  - Use Pyodide's `unpackArchive` to mount a tarball. Cleaner for the vault content.

### What to import in Pyodide

Minimum to make `simulation` run via the engine's executor:

```python
from forge.core.snippet_registry import SnippetRegistry
from forge.core.resolver import Resolver  # or whatever the public API is
from forge.core.executor import exec_python, extract_python
# Plus whatever else the executor's globals injection needs
```

Then construct a registry against the mounted moda vault and invoke `exec_python` on `simulation.md`'s Python facet with the right context.

If the engine has hard dependencies on disk paths in ways that don't translate to MEMFS, document the friction and either patch around it (in the spike's copy of the code) or flag it as a real issue blocking Pyodide V1.

### What to skip

- `forge.api.*` — no HTTP layer needed.
- `forge.installer.*` — vault content is pre-bundled, no install.
- `forge.sdk.*` — separate client.
- The whole moda router (`forge/api/moda.py`) — not needed.
- `dotenv` / env vars — config can be hardcoded for the spike.

### Object-dtype test

Inside Pyodide, run a minimal standalone test before invoking the simulation:

```python
import numpy
arr = numpy.full(10, "water", dtype=object)
arr2 = numpy.full(5, "ink", dtype=object)
combined = numpy.concatenate([arr, arr2])
print(combined.dtype, combined.shape, combined.tolist())
mask = combined == "water"
print(mask.sum())
```

If this prints sensible values without error, object-dtype is fine. Report.

### Native baseline timing

For the baseline, time `simulation`'s execution in the native engine. Easiest is a small `time.perf_counter()` wrap around the existing test:

```python
import time
from tests.moda._helpers import _find_vault
# ... set up resolver against ~/projects/forge-vaults/forge-moda-vault
t0 = time.perf_counter()
result = run_block("simulation")
elapsed = time.perf_counter() - t0
print(f"native simulation: {elapsed*1000:.1f}ms")
```

Three trials, report mean. Run with `cd ~/projects/forge && source .venv/bin/activate && python -c "..."` or as a small script.

### What "fast enough" means

For the recommendation:
- Featured-button `simulation` (one-shot 300-tick run): if Pyodide finishes in <15 seconds, ship-it-able. Above 30s, painful.
- Live simulator at 30fps would need <33ms per tick. Likely 2-5x slower in Pyodide → 60-150ms per tick → 7-15fps. Note in report; recommendation might be "live simulator drops to 10fps under Pyodide; acceptable if Tamar is OK with it."

## Tests

No formal test suite for the spike. The spike IS the test. The native-baseline run uses existing tests for timing only.

## Out of scope

- Building a real Obsidian plugin that uses Pyodide. Pure browser-side spike.
- Bundling the Anthropic transpile path. Spike is compute-only.
- Iframe integration. Spike runs in a standalone browser tab.
- Production-quality error handling, retries, progressive loading.
- Trying music21 in Pyodide. Separate spike if needed.
- Any commits to forge/, forge-moda/, forge-client-obsidian/, or forge-moda-client/. Spike lives in forge-moda-bootstrap/spikes/ only.

## Report when done

The report.md (per structure above) is the primary deliverable. Plus chat post:

1. Verdict on each of the three questions (engine runs in Pyodide? how slow? object-dtype works?).
2. The bundle size measurement.
3. Top-line recommendation: Pyodide V1 viable / borderline / not viable.
4. Anything you tried that didn't work and why.
5. Files added under `spikes/pyodide-moda/` (don't list every file in bundle/, just summarize).

## Commits + push

`forge-moda-bootstrap` is not a git repo today. Just add the files; don't try to commit them. If at any point bootstrap becomes a git repo, the spike materials should be retained — they're the research record.

## Don'ts

- **Don't refactor any engine code to make Pyodide happy.** If the engine doesn't run in Pyodide as-is, document what breaks and recommend the engine-side change — don't ship it yourself in this spike.
- **Don't optimize the spike for performance.** First-pass numbers are what we want; "what does it cost out of the box" is the answer we need.
- **Don't bundle in unrelated experiments.** Moda only. No music. No transpile. No iframe.
- **Don't write a production Pyodide adapter.** This is exploratory; production code would look very different (lazy loading, real error UX, integration with the iframe's existing canvas renderer, etc.).
- **Don't commit anything** — `forge-moda-bootstrap` is untracked, and no production repo should see spike code.
- **Don't ship a recommendation hedge.** Give a verdict. "It depends" is fine when stated with the dependency clearly named.
