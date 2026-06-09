# Surface `print()` output from MoDa snippets to the user

## Scope

Make `print()` calls inside MoDa snippets (specifically those invoked
through the `/moda/*` simulation fast-path) visible to the user in
the React iframe. Engine and React client changes only. No plugin /
Obsidian-side changes.

Does NOT:

- Change the generic `/compute` endpoint or its plugin rendering
  (already works — see Why).
- Introduce a new logging framework / structured logging.
- Affect non-moda vaults.

## Why

`print()` is documented in the base `/generate` system prompt as
"side-effect output." Students authoring or modifying MoDa snippets
expect their prints to land somewhere visible. Today, prints
disappear when invoked via the simulation iframe.

Diagnosis:

- **Generic `/compute` path (works):**
  `forge/forge/api/server.py:208` returns
  `{"type": "action", "result": ..., "stdout": stdout}`.
  Plugin reads it at `forge-client-obsidian/src/main.ts:1321`
  (`outputView.append(snippetId, result.stdout ?? '', result.result)`).
  Renderer at `forge-client-obsidian/src/output-view.ts:166–167`
  drops a `<pre class="forge-output-stdout">` when stdout is
  non-empty. End-to-end works.

- **MoDa fast-path (broken):** `forge/forge/api/moda.py:150`
  (`_, result = exec_python(...)`) discards `stdout` from the tuple.
  `/moda/init`, `/moda/compute`, `/moda/click` never propagate it
  to their wire responses. When `go` is invoked via the simulation
  iframe (the main way it runs), prints go into the void.

Fix: propagate stdout through `_run_snippet`, ship it on the moda
wire responses, render it in the React iframe.

## Files to modify

**forge (engine):**

- `forge/forge/api/moda.py`:
  - `_run_snippet()` — return `(stdout, result)` tuple instead of
    just `result`. For data snippets (lines 138–141), return
    `("", value)`.
  - `/moda/init` handler (~line 205): unpack stdout, include in
    response payload.
  - `/moda/compute` handler (~line 234): same.
  - `/moda/click` handler (~line 258): same.
- `forge/tests/api/test_moda.py`: add coverage for stdout in
  responses. A snippet whose Python facet prints "hello" should
  produce a response with `stdout: "hello\n"`.

**forge-moda-client (React):**

- `forge-moda-client/forge-moda-web/src/types/wire.ts`:
  add `stdout?: string` to the response shapes for init / compute /
  click.
- `forge-moda-client/forge-moda-web/src/adapters/LocalHttpAdapter.ts`:
  no change to call signatures; the new field flows through as
  part of the existing response objects.
- `forge-moda-client/forge-moda-web/src/components/Simulator.tsx`:
  add a small "console" surface — a scrollable text area at the
  bottom of the chrome (below the canvas, above the existing
  status row) that accumulates stdout lines from `/moda/*`
  responses. Append-only; auto-scroll to bottom; show last ~200
  lines, drop older. Empty when no prints.

## Implementation notes

### Engine

- `_run_snippet` already calls `exec_python(...)` which returns
  `(stdout, result)`. Currently throws away stdout with `_, result =`.
  Change to `stdout, result = ` and return both. Adjust callers.
- Data-snippet branch returns `("", value)` so the tuple shape is
  uniform.
- Each endpoint adds `stdout` to its JSON response. Suggested
  field name: `stdout` (matches the generic `/compute` convention,
  consistent across the codebase).
- For `/moda/compute` specifically: stdout accumulates per tick.
  Each tick's print output ships in that tick's response. Client
  decides what to do with it.
- Error path: when `_run_snippet` raises, the captured stdout up to
  the point of failure is currently lost (`SnippetExecError.stdout`
  carries it on the generic path; preserve this behavior in moda
  too by including stdout in the HTTPException detail, matching
  `server.py:207`).

### React client

- Console UI: a `<div>` styled as a monospace `<pre>` block, fixed
  height (~80px), `overflow-y: auto`, dark background, light text.
- State: a `consoleLines: string[]` piece of component state. Cap
  at 200 lines; when over, drop from the front.
- After each successful `/moda/compute` response: if
  `response.stdout` is non-empty, split on newlines, append each
  non-empty line to `consoleLines`. Don't add timestamps for v1
  (keep noise low; the per-line context is enough).
- Auto-scroll: `useEffect` keyed on `consoleLines.length` scrolls
  the container to the bottom.
- Header: small label like `console (last 200 lines)` above the
  scroll area so users know what it is.
- A clear button is nice-to-have but not required for v1.

### Type changes

- `wire.ts`: each response type gets `stdout?: string` (optional
  for back-compat; a server that doesn't include it just means
  the client sees `undefined`, which the appender treats as
  empty).

## Tests

**Automated (forge):**

- `forge/tests/api/test_moda.py`: new test
  `test_compute_returns_stdout` — author a tiny print-bearing
  snippet in the fixture, hit `/moda/compute` (or whichever
  endpoint is easiest to mount in the test), assert response
  contains `stdout` matching the printed text.
- Run the existing moda + api + core/test_llm suites; confirm
  no regression. Target: 50+ tests still passing.

**Automated (plugin):**

- No plugin changes in this prompt; existing 42 plugin tests stay
  green by default.

**Manual GUI (the load-bearing test for the user experience):**

1. Open the MoDa simulation in Obsidian (`Cmd+P → Forge: Open
   MoDa simulation`).
2. Customize `go.md` (right-click the library version → Customize).
   Edit the shadow at vault root to add a print statement in the
   English facet OR via `generation_notes` (whichever survives a
   regen). Suggested: add a line to go's body like
   `Print "tick advancing".` and regenerate; OR add to the
   generation_notes that the Python should include
   `print("tick advancing")` at the start of compute.
3. Run the simulation. Verify the new console area shows
   `tick advancing` accumulating once per tick. Verify it
   auto-scrolls; verify it caps at 200 lines without crashing
   when ticks accumulate past that.
4. Click in the canvas to add ink. If on_mouse_click had any
   prints, those should appear too.

## Out of scope

- Surfacing stdout from `/moda/*` to the Obsidian-side compute
  output panel. The iframe console is enough for v1; cross-process
  surfacing is a different design.
- stderr capture. exec_python doesn't currently separate it; matches
  the existing `/compute` behavior.
- Persisting console output across sessions. In-memory only.
- Timestamps, log levels, structured logging. Plain text lines.
- A "clear console" button (optional polish).
- Capturing print from `/generate`-time execution (the LLM doesn't
  run snippets at /generate; this is about runtime only).

## Report when done

Standard CC report shape per protocol. Specifically include:

- Engine changes (file paths + line ranges).
- New / modified test names and pass counts.
- React component diff summary (which file got the console UI,
  rough line count).
- A short note on the manual smoke test result (or "deferred to
  user GUI verification" if you can't run Obsidian headlessly).
- One observation: any stdout that's NOT student-print noise
  (engine-emitted logs, library warnings) leaking into the
  console? If so, flag — we may want a filter convention later.

## Don'ts

- **Don't change `/compute` (generic) or its plugin rendering.**
  Those work. Touching them risks regression on the music vault
  and other domains.
- **Don't add stdout to the React app's render loop for every tick.**
  Process the stdout field per-response, append-only. No re-render
  of the canvas on console updates.
- **Don't introduce a logging dependency** (winston, pino, etc.).
  Plain `print()` → captured stdout → plain text rendering.
- **Don't auto-commit or push.** Per protocol, commits require
  explicit user authorization outside the queue convention.
- **Don't touch forge-moda-vault snippets** to add prints as part
  of this work. The smoke test asks the user to add a print
  manually after the feature lands.
