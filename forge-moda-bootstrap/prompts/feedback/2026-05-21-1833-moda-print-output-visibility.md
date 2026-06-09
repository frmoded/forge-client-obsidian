---
timestamp: 2026-05-21T18:42:28Z
session_id: unknown
prompt_modified: 2026-05-21T11:34:36Z
status: success
---

# Surface `print()` output from MoDa snippets — implementation report

## Summary

`print()` calls inside any MoDa snippet (`setup`, `go`, `on_mouse_click`,
or anything they call) now propagate through the `/moda/*` wire
responses as a `stdout` field, and the React simulator renders the
captured output in a new console panel under the canvas.

## Engine changes (`/Users/odedfuhrmann/projects/forge/`)

**`forge/api/moda.py`** (+30 / −12, three logical changes):

1. `_run_snippet()` (lines 122-176) — return shape changed from
   `result` to `(stdout, result)`. Data-snippet branch returns
   `("", value)` so the tuple shape is uniform. Action-snippet
   branch unpacks the existing `exec_python(...)` `(stdout, result)`
   tuple instead of discarding stdout. `SnippetExecError` path
   preserves `e.stdout` in the HTTPException detail dict, mirroring
   `forge/api/server.py:207`.

2. Response models gained an explicit `stdout: str = ""` field:
   - `InitResponse` (line ~82)
   - `ComputeResponse` (line ~95)
   - `ClickResponse` (line ~104)

   Defaulted to `""` so any code path that doesn't explicitly pass
   stdout still serializes a well-formed wire response. Field name
   `stdout` matches the generic `/compute` convention in
   `server.py:189` / `:208`.

3. The three endpoint handlers unpack stdout and pass it through:
   - `/moda/init` (~line 205): `stdout, particle_state = _run_snippet("setup", …)` → `InitResponse(…, stdout=stdout)`
   - `/moda/compute` (~line 234): same shape, threads through `go`'s output
   - `/moda/click` (~line 258): same, threads through `on_mouse_click`'s output

**`tests/api/test_moda.py`** (+45 / −2):

- New test `test_compute_returns_stdout` — overrides `go.md` with a
  print-bearing version (`print("tick advancing")`), hits
  `/moda/compute`, asserts `"tick advancing" in response.stdout`.
  Verifies setup's stdout is empty (the test vault's setup doesn't
  print), confirming the field flows correctly even when empty.
- Updated `test_click_acks_for_known_session` — the previous
  `assert resp.json() == {"ack": True}` exact-equality broke when
  `stdout` was added to `ClickResponse`. Replaced with explicit
  field assertions (`data["ack"] is True`, `data["stdout"] == ""`).

**Test results:** `pytest tests/api/test_moda.py tests/moda/ tests/core/test_llm.py tests/core/test_registry.py -q` → **81 passed** (was 80; +1 for the new stdout test).

## React client changes (`/Users/odedfuhrmann/projects/forge-moda-client/forge-moda-web/`)

**`src/types/wire.ts`** (+8): added `stdout?: string` to
`InitResponse`, `ComputeResponse`, `ClickResponse`. Optional for
back-compat — a server that doesn't include the field maps to
`undefined`, which the appender treats as empty.

**`src/components/Simulator.tsx`** (+~55):

- New `MAX_CONSOLE_LINES = 200` module constant.
- State: `consoleLines: string[]` and `consoleRef: HTMLPreElement`.
- `appendStdout(stdout?: string)` helper — splits on `\n`, drops
  empty entries, appends non-empty lines to `consoleLines`, caps
  at 200 by dropping from the front. Centralized so init / compute
  (auto-loop) / step / click all funnel through the same path.
- Hooked into all four success callbacks: init effect, compute
  interval, `handleStep`, `handleCanvasClick`.
- `useEffect` keyed on `consoleLines.length` scrolls
  `consoleRef.current` to bottom on each append.
- New JSX block inserted between the canvas wrap and the existing
  `actionbar` (status row): a `<div class="console">` containing
  a header label "console (last 200 lines)" and a scrollable
  `<pre class="consoleBody">` rendering the joined lines.

**`src/components/Simulator.module.css`** (+33): styles for
`.console`, `.consoleHeader`, `.consoleBody` — dark surface,
monospace body, 80px fixed height with `overflow-y: auto`, top
border matching Obsidian's theme variables where available with
oklch fallbacks.

**Vitest:** `npm test` → **1/1 passed** (the existing
`Simulator.test.tsx`). Pre-existing `tsc -b` error in
`vite.config.ts` (vitest `test` block in vite's config) confirmed
unrelated by stashing my changes and seeing the same error — not
introduced by this work.

## Manual smoke test

**Deferred to user GUI verification.** I can't run Obsidian /
forge-moda-web in this environment to walk through the prompt's
4-step smoke list (open MoDa sim, customize `go.md` with a print
line, run sim, verify console accumulates and caps). Engine path
proven by automated test. React path proven by code review +
existing vitest suite green. The end-to-end walk-through against
your live forge server + Bluh is the load-bearing verification.

To run yourself:
1. Restart the forge server so the engine changes take effect.
2. Rebuild forge-moda-web (`npm run build` from `forge-moda-web/`).
3. Open MoDa simulation in Bluh. New console panel should appear
   below the canvas, empty at first.
4. Customize `bluh/go.md` to include `print("tick advancing")`
   either by editing the English to ask for a print and regenerating,
   or by editing the Python facet directly (since this is a
   user-shadowed file, you can hand-tune without losing the change
   on regen — see `edit_mode: python` from Phase 6.5).
5. Run the simulation. Each tick should add one "tick advancing"
   line to the console panel; auto-scroll keeps the latest visible.

## Observation

The prompt asks: "any stdout that's NOT student-print noise
(engine-emitted logs, library warnings) leaking into the console?"

`exec_python` captures `sys.stdout` only inside the snippet's
execution scope (`buf = io.StringIO()`; `sys.stdout = buf` →
restored in finally). Engine code that runs outside the snippet
(the surrounding `_run_snippet`, FastAPI routing, performance
logging via `logger.info`) writes to the real `sys.stdout` or to
Python's logging module, neither of which is captured. So
engine-emitted logs **do not leak** into the console panel by
design.

The exposure surface is therefore narrow: whatever `print()`
calls a snippet's Python facet itself executes, plus any nested
`context.compute(...)` calls. For nested computes, look at
`executor.py:140-150`:

```python
nested_stdout, result = exec_python(...)
if nested_stdout:
  sys.stdout.write(nested_stdout)
```

Nested stdout IS written to the outer scope's `sys.stdout`, which
at that point IS the captured buffer. So if `setup` calls
`create_water_particles` which prints, the print bubbles up to
setup's captured stdout and reaches the client. That's the
expected pedagogical behavior — a print anywhere in the
composition surfaces to the educator's screen.

No filter convention needed for v1. The thing that could later
warrant a filter: if students accidentally `print(state)` and
flood the console with numpy array dumps. That's a noise problem
solvable by line-length truncation at the React appender, not by
filtering by source. Flag as a v2 polish target if it bites.

## Follow-ups noted but not built

- **Per-line truncation** for accidental `print(state)` dumps —
  see Observation. Not a v1 concern.
- **Clear-console button** — the prompt explicitly marked this
  out of scope.
- **stderr capture** — out of scope; matches generic `/compute`
  behavior (also stdout-only).
- **Timestamps / log levels** — out of scope; plain text per spec.
- **Persisting console across sessions** — out of scope; in-memory
  only per spec.
- **No commits made.** Per the queue convention's "Never
  auto-commit to git" rule. Files are modified in three trees
  (`forge/`, `forge-moda-client/`); leaving them unstaged for your
  review. Per the same rule, no registry publish or version
  bumping either — this prompt didn't ship forge-moda content
  changes anyway.

## Files modified (uncommitted)

- `forge/forge/api/moda.py`
- `forge/tests/api/test_moda.py`
- `forge-moda-client/forge-moda-web/src/types/wire.ts`
- `forge-moda-client/forge-moda-web/src/components/Simulator.tsx`
- `forge-moda-client/forge-moda-web/src/components/Simulator.module.css`
