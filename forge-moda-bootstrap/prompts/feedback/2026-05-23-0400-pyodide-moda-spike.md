---
timestamp: 2026-05-23T03:52:29Z
session_id: unknown
prompt_modified: 2026-05-23T04:00Z
status: success
---

# Pyodide moda spike — verdict: ship it

## TL;DR

**Pyodide V1 for moda is viable.** 1.44× slower than native (not the
feared 2-5×), ~38 fps headroom for the live simulator, no engine
changes required, ~8 MB gzipped bundle. Object-dtype numpy works
identically to native. Engine + vault imports cleanly first try.

The prompt's pessimistic prior (live simulator drops to 7-12fps) is
off by a factor of ~2 in our favor.

## Q1: does moda's engine run in Pyodide end-to-end?

**Yes.** No engine changes needed. Loaded `forge.core.executor`,
`forge.core.snippet_registry`, `forge.core.graph_resolver`,
`forge.core.serialization`, `forge.core.snapshots`,
`forge.core.exceptions`, `forge.core.registry`, and
`forge.moda.types` (plus the empty `__init__.py` files) into Pyodide
MEMFS at `/bundle`. Added `/bundle` to `sys.path`. Imports resolved
on the first attempt. The `try/except` blocks that lazily import
music21 and forge.music degraded gracefully (music21 isn't shipped
in Pyodide — separate spike when forge-music V1 lands).

The simulation snippet ran end-to-end through `exec_python` — all
300 ticks, 3 click events, full execution of the
`setup → 300 × (on_mouse_click? + go) → return state` loop.
Returned `tick=300, water=500, ink=150`, identical to the native
result.

`_capture_edge` works fine writing snapshots to `/bundle/vault/
.forge/edges/` in MEMFS. Persists for the runtime's lifetime; fine
for V1.

## Q2: how slow is it?

| | Pyodide | Native | Ratio |
|---|---|---|---|
| 300-tick `simulation` total | **7839 ms** | **5429 ms** | **1.44×** |
| Per tick | 26.13 ms | 18.10 ms | 1.44× |
| Implied live fps | 38.3 | 55.2 | — |

Three trials each. Pyodide: 7487 / 8000 / 8031 ms. Native: 5049 / 5432 /
5806 ms.

The ratio is well below the worst-case prior (2-5×) because moda's
per-tick cost is dominated by numpy vectorized math (move, interact,
bounce_off_*) where Pyodide's WASM numpy approaches native speed —
the heavy work is BLAS-style array ops, not Python interpreter
loops. Pyodide's slowdown is concentrated in interpreter overhead;
the engine's hot loop is mostly out of the interpreter.

## Q3: dtype=object?

**Works identically to native.** Probe:

```python
arr1 = np.full(10, "water", dtype=object)
arr2 = np.full(5, "ink", dtype=object)
combined = np.concatenate([arr1, arr2])
mask = combined == "water"
```

→ `dtype=object`, `shape=(15,)`, `mask.sum()=10`. No special handling
required. ParticleState's `types` and `masses` columns ran through
all 300 ticks without numpy throwing or returning unexpected shapes.

## Bundle size

| Asset | Uncompressed | Gzipped |
|---|---|---|
| pyodide.asm.wasm | 8.25 MB | **2.70 MB** |
| pyodide.asm.js | 1.02 MB | 216 KB |
| python_stdlib.zip | 2.31 MB | 2.27 MB (already zip) |
| numpy wheel | 2.69 MB | 2.66 MB (already zip) |
| pyyaml wheel | 108 KB | 107 KB (already zip) |
| Engine + vault | 82 KB | 30 KB |
| **Total** | **~14.4 MB** | **~8.0 MB over the wire** |

In the prompt's expected range (10-15 MB). Comfortable for an
Obsidian plugin; the WASM core dominates and is a Pyodide-internal
constant.

## What tried and didn't work

Nothing of substance. The spike worked end-to-end on the first
serious attempt. Two notes worth recording:

1. I initially loaded only `numpy` and got `ModuleNotFoundError: No
   module named 'yaml'` when the snippet registry tried to parse
   frontmatter. Added `pyyaml` to `loadPackage` and it resolved.
   Both are stock Pyodide packages.

2. The native baseline's vault had prior-session snapshots in
   `.forge/edges/` which the executor reads at the start of each
   trial (per C8). The Pyodide MEMFS starts cold, so its trials
   include the full first-call cost. Apples-to-apples comparison
   would zero out both; the gap is small (one-time, not per-tick)
   and the comparison's shape is still useful. Noted in the report.

## Files added under `spikes/pyodide-moda/`

- `README.md` — how to run; layout.
- `report.md` — primary deliverable with all measurements + verdict.
- `run-spike.mjs` — Node.js runner (the measurement vehicle).
- `native-baseline.py` — pytest-equivalent native timing.
- `index.html` — browser scaffold for the same flow.
- `bundle/forge/` — trimmed engine (8 files + 2 __init__.py).
- `bundle/vault/` — forge-moda v0.4.16 .md snippets (33 files +
  forge.toml).
- `bundle/manifest.json` — flat fetch-list for the browser scaffold.
- `package.json` + `node_modules/pyodide/` — Node deps for the runner.

No git commits (forge-moda-bootstrap is untracked, per the prompt).

## Recommendation

**Pyodide V1 for moda. No hedges.**

- One-shot featured-button `simulation`: ~8s in Pyodide.
  Comfortably under the 15s "ship-it-able" threshold.
- Live simulator at 30fps: implied 38fps Python budget. Should hit
  the target with slack to spare even after canvas redraw and
  postMessage tick pacing overhead.
- Bundle: 8 MB gzipped, one-time load per browser session.
- Engine unchanged.

Deployment sketch (not for this prompt, just orientation):

1. Bundle Pyodide assets + the trimmed engine + chosen domain
   vaults into the Obsidian plugin's `assets/`.
2. Iframe initializes Pyodide on mount; pre-load packages from
   local URLs (no CDN hit at runtime).
3. The existing iframe adapter's HTTP calls become local Pyodide
   function calls. Wire shape (`/init`, `/compute`, generic
   `/compute`) stays identical.
4. Forge Output relay (compute-result postMessage from prompt
   0300) already in place — Pyodide-side stdout flows the same
   way.

Deferred: music21 in Pyodide for forge-music V1. Not a blocker for
moda; sub-1-hour separate spike when needed.

## One observation

The 1.44× Pyodide:native ratio is good enough that **the case
for the Anthropic transpile service (option α) gets weaker**.
The original case for α was "Python-in-WASM will be too slow for
live simulation, so we pre-transpile to JS." With 38fps headroom
on the live simulator's per-tick budget, the slow-Python premise
falls apart. α is still attractive for *other* reasons (snippet
authoring against an LLM-mediated language layer, debuggability,
etc.) but no longer for raw runtime performance. Worth a sanity-
check conversation before committing engineering budget to α —
the speed argument was load-bearing in the prior framing.

Separately: the spike skipped music21. If forge-music ever wants
the same Pyodide V1 path, the music21 question is a real fork —
music21 isn't a stock Pyodide package, and micropip-based pure-
Python install of it may or may not work depending on its C
deps. A small follow-up spike when forge-music V1 surfaces would
be cheap insurance there.
