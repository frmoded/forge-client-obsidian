# Unify compute serialization — wire-encode dataclass+ndarray returns through generic `/compute`

## Scope

Engine-side fix to close the asymmetry between `serialize_result`
(used by generic `/compute` HTTP responses) and `serialize_for_wire`
(used by snapshot capture). Both should produce the same JSON-able
shape for any return value, including dataclasses containing numpy
arrays.

Specifically:

1. **Generic serialization fallthrough.** `serialize_result` in
   `forge/core/serialization.py` falls through to JSON-encode
   dataclass+ndarray values via the existing `_dataclass_to_jsonable`
   helper that `serialize_for_wire` already uses.
2. **Moda ParticleState wire shape.** Add a
   `_try_serialize_particle_state` alongside `_try_serialize_music21`
   that recognizes a `ParticleState` and emits the same `{type:
   "moda_sim_state", content: {tick, particles: list[Particle]}}`
   shape the moda router's `_serialize_particles` already produces
   for `/moda/compute`. Generic `/compute` then yields the same
   inner content shape, just wrapped in the `{type, result, stdout}`
   envelope.
3. **Tests** that prove a `TestClient` POST to `/compute` with
   `snippet_id="simulation"` returns 2xx with the expected wire
   shape. Plus a regression test that the snapshot-capture path
   (`serialize_for_wire`) still produces valid JSON for the same
   value.

This prompt unblocks:

- Forge-click on any snippet returning `ParticleState` (e.g.,
  `go.md`, `simulation.md`) through generic `/compute`.
- Phase 2 of the queued `2026-05-22-1500-simulation-snippet-featured-button.md`
  prompt currently parked in `questions/` — once this lands, that
  prompt can be moved back to `prompts/` and re-fired with the
  iframe button's compute path working end-to-end.

Does NOT:

- Touch the iframe (forge-moda-client) or the plugin
  (forge-client-obsidian). Both will pick up the new wire shape on
  next request without code changes — `_serialize_particles` and
  `_try_serialize_particle_state` produce the same content shape;
  the iframe needs at most a small unwrap step for the `{type,
  result, stdout}` envelope, and that's part of the simulation-
  button prompt's retry, not this one.
- Introduce a generic serializer registry. Adding
  `_try_serialize_particle_state` next to `_try_serialize_music21`
  follows the existing pattern; registry refactor is a separate,
  larger design question (flagged in §Observation).
- Touch the moda router (`forge/api/moda.py`). `_serialize_particles`
  stays where it is; `_try_serialize_particle_state` can reuse it
  or duplicate the small transposition logic — pick whichever
  layering reads cleaner.
- Touch any other content domain (music, future). Music21 path
  stays unchanged; only the fallthrough behavior is extended.
- Modify any forge-moda snippet, vault content, or registry state.
  The library at v0.4.16 is correct as-is; this is purely an engine
  fix for how returns are serialized over HTTP.
- Add new endpoints. Generic `/compute` and `/moda/compute` keep
  their current routes; only their internal serialization behavior
  is unified.
- Change C7 / A7 in the constitution. Tightening "serializable
  returns required" is a separate later prompt; this prompt fixes
  the implementation gap, not the constitutional commitment.

## Why

Three converging reasons:

**Immediate unblock.** The queued simulation-button prompt
(`2026-05-22-1500-...`) hit a 500 on its Phase 2 path because
`serialize_result` doesn't know how to encode `ParticleState`.
Same root cause produced the earlier "Internal Server Error" when
Forge-clicking `go.md`. Every future snippet returning a structured
dataclass would hit the same wall.

**Existing asymmetry is a latent bug.** `serialize_for_wire` (the
snapshot capture path) already uses `_dataclass_to_jsonable` to
handle dataclass+ndarray cleanly. `serialize_result` (the HTTP
response path) doesn't — it dispatches music21 then returns the raw
value. So the same compute that produces a snapshot
successfully fails on the HTTP response. That asymmetry is a
trap: any author who tests via `context.compute(...)` from a parent
sees the value flow correctly (snapshot path), then ships and
discovers the consumer-facing wire path is broken.

**Aligns with A7's invariant.** A7 says snapshot capture requires
wire-serializability and skips-with-warning on failure. If
`serialize_for_wire` succeeds on a value, `serialize_result` should
too — they describe the same constraint from different sides.

## Files to modify

### Primary fix — `forge/core/serialization.py`

Current shape (around line 153):

```python
def serialize_result(value, snippet=None):
  musicxml = _try_serialize_music21(value, snippet)
  if musicxml is not None:
    return musicxml
  return value
```

After:

```python
def serialize_result(value, snippet=None):
  musicxml = _try_serialize_music21(value, snippet)
  if musicxml is not None:
    return musicxml

  particle_state = _try_serialize_particle_state(value, snippet)
  if particle_state is not None:
    return particle_state

  # Fall through: encode any remaining structured value (dataclass,
  # ndarray, nested) to a JSON-able shape. Mirrors what
  # serialize_for_wire does on the snapshot-capture path.
  return _dataclass_to_jsonable(value)
```

Add `_try_serialize_particle_state(value, snippet)`:

```python
def _try_serialize_particle_state(value, snippet=None):
  """Detect a ParticleState dataclass and emit the moda iframe wire
  shape: {type: "moda_sim_state", content: {tick, particles:
  list[{id, type, x, y, mass}]}}. Returns None for non-matches so
  the caller can fall through to other serializers."""
  try:
    from forge.moda.types import ParticleState
  except ImportError:
    return None
  if not isinstance(value, ParticleState):
    return None

  # Row-oriented transposition. Could also import and reuse
  # forge.api.moda._serialize_particles if the layering reads cleaner
  # — pick whichever avoids a circular import.
  particles = [
    {
      "id": int(value.ids[i]),
      "type": str(value.types[i]),
      "x": float(value.xs[i]),
      "y": float(value.ys[i]),
      "mass": str(value.masses[i]),
    }
    for i in range(len(value.ids))
  ]
  return {
    "type": "moda_sim_state",
    "content": {"tick": int(value.tick), "particles": particles},
  }
```

Notes on layering: the `from forge.moda.types import ParticleState`
inside the function is a deliberate use-time import, mirroring the
music21 import-when-needed pattern. If that creates a circular
import in your build, hoist the import to module top and
swallow ImportError there. The principle is the same: core
serialization knows about a small fixed set of recognized domain
types via inline checks; a future registry refactor would tidy this
but is out of scope here.

If you reuse `_serialize_particles` from `forge/api/moda.py` rather
than re-implementing the transposition, document why in a comment
— pulling a function out of the router into core is technically a
layering improvement (the row-shape conversion is a serializer
concern, not a router concern), but it widens this prompt's blast
radius. Probably keep them duplicated and flag the duplication for
a follow-up.

### Consistency check — `serialize_for_wire`

`serialize_for_wire` (line 169) does:

```python
def serialize_for_wire(value, snippet=None):
  payload = serialize_result(value, snippet)
  if isinstance(payload, dict) and payload.get("type") in _NATIVE_WIRE_FORMATS:
    return payload["type"], payload["content"]
  return "json", json.dumps(_dataclass_to_jsonable(payload))
```

After the `serialize_result` fix, this function should still produce
the same output for the same input. The `serialize_result(value,
snippet)` call now returns either a tagged dict (music21,
moda_sim_state) or a JSON-able value (after the fallthrough).
`serialize_for_wire`'s subsequent check still does the right thing:

- Tagged dict → decompose into `(type, content)`.
- JSON-able value → wrap as `("json", json.dumps(...))`.

Note: now that `serialize_result` already JSON-prepped the
fallthrough value, the `json.dumps(_dataclass_to_jsonable(payload))`
in the second branch becomes `json.dumps(payload)` (the
`_dataclass_to_jsonable` step is redundant after the fix). Simplify
that line — but verify with the existing snapshot-capture tests
that no shape regresses.

Also add `"moda_sim_state"` to `_NATIVE_WIRE_FORMATS` so
`serialize_for_wire` correctly decomposes it on snapshot capture.

### Server response shape — `forge/api/server.py`

No change required. The route at `forge/api/server.py:208` already
calls `serialize_result(result, snippet)` and assigns the return
value to the `result` field of `{type, result, stdout}`. After the
fix, that field carries either a tagged `{type, content}` dict (for
recognized domain types) or a JSON-able value (for everything else).
FastAPI's encoder handles both.

Read the route once to confirm no other path bypasses
`serialize_result` (e.g., a fast-path for specific snippet IDs that
returns the raw value). If one exists, decide whether it should also
go through the unified serializer. Flag in the report regardless.

## Implementation notes

### Order of operations

1. Read `forge/core/serialization.py` end-to-end; understand
   `_NATIVE_WIRE_FORMATS`, `_dataclass_to_jsonable`,
   `_try_serialize_music21`'s exact return shape. The new function
   must match that contract (return None on no-match, a
   `{type, content}` dict on match).
2. Add `_try_serialize_particle_state`.
3. Modify `serialize_result`'s fallthrough.
4. Add `"moda_sim_state"` to `_NATIVE_WIRE_FORMATS`.
5. Simplify the `serialize_for_wire` redundant `_dataclass_to_jsonable`
   call (or leave it — the redundancy is harmless, just ugly).
6. Run existing tests; fix any regressions BEFORE adding new tests.
7. Add new tests per §Tests.
8. Commit + push.

### Circular import risk

`forge.moda.types` imports from `forge.core` (likely). If
`forge.core.serialization` imports from `forge.moda.types` at module
top, you get a cycle. Use-time import (inside the function body) is
the simplest break. If the build complains anyway, push the
ParticleState recognition into a thin module
(`forge/moda/serialization.py`?) that's imported lazily from
`forge.core.serialization.serialize_result` only when the value
isn't a basic type. This is over-engineering for one type — try
the use-time import first.

### Idempotency

`serialize_result` may be called multiple times on the same value
in different code paths. Ensure the function is idempotent: passing
in a value that's ALREADY been serialized once (e.g., a tagged
`{type: "moda_sim_state", content: {...}}` dict) should return the
same shape, not wrap it again. Add an early-return for already-tagged
inputs:

```python
if isinstance(value, dict) and value.get("type") in _NATIVE_WIRE_FORMATS:
  return value
```

at the top of `serialize_result`.

## Tests

### New tests — `forge/tests/api/test_compute_serialization.py`

Create a new test file (or extend an existing one if there's a
natural home — check `tests/api/test_server.py` first). Cases:

1. **`test_compute_simulation_returns_moda_sim_state`** — TestClient
   POSTs to `/compute` with `snippet_id="simulation"` and
   `vault_path=<test moda vault>`. Asserts:
   - 200 status.
   - Response JSON `{type: "action", result: {type:
     "moda_sim_state", content: {...}}, stdout: ...}`.
   - `result.content.tick == 300`.
   - `len(result.content.particles) == 500 + 150` (water + ink).

2. **`test_compute_go_returns_moda_sim_state`** — same shape via
   `snippet_id="go"`, single tick. Confirms `ParticleState`
   recognition is on any returning snippet, not snippet-name-keyed.

3. **`test_compute_simple_value_returns_json`** — a snippet that
   returns a plain dict or string flows through unchanged (no
   regression in the music-vault or string-returning code paths).

4. **`test_serialize_for_wire_round_trips_particle_state`** — unit
   test on `serialize_for_wire(particle_state)`. Asserts
   `(content_type, content_str) == ("moda_sim_state", "<json
   serialization>")` and that
   `deserialize_text("moda_sim_state", content_str)` returns the
   same data (round-trip).

5. **`test_serialize_result_idempotent`** — calling
   `serialize_result(serialize_result(value))` returns the same
   shape as calling it once. Guards the early-return.

### Existing tests — full forge suite

Run end-to-end:

```bash
cd /Users/odedfuhrmann/projects/forge && source .venv/bin/activate
pytest -q
```

Expect 203/203 plus the new cases (so ~208/208). Any pre-existing
test that was passing because `serialize_result` was a no-op
fallthrough should be investigated — it may have been hiding a
silent bug.

Critical regression candidates:

- The music21 path (`test_chains_integration.py` or any
  forge-music test). The new `_NATIVE_WIRE_FORMATS` entry shouldn't
  change music21's behavior, but verify the existing assertions
  hold.
- The snapshot-capture path
  (`forge/tests/core/test_snapshots.py` if it exists, or similar
  for edge capture).
- The existing moda integration tests
  (`tests/moda/test_chains_integration.py`,
  `tests/moda/test_simulation_snippet.py` from the prior prompt).

Stop on any regression, route to `failed/`, and report concretely.
Don't paper over a test failure by editing the test — the test was
correct; if your change breaks it, your change is wrong.

### Manual verification (optional)

After the fix lands and forge tests pass, you can invoke from a
shell against a running uvicorn:

```bash
curl -sS -X POST http://localhost:8000/compute \
  -H 'Content-Type: application/json' \
  -d '{
    "vault_path": "/Users/odedfuhrmann/forge-vaults/bluh",
    "snippet_id": "simulation",
    "inputs": {}
  }' | python -m json.tool | head -20
```

Should return a 2xx with `result.type == "moda_sim_state"`. Flag in
the report whether you verified this (worth doing if uvicorn is up;
optional if not).

## Out of scope

- **The simulation-button prompt's Phase 2/3.** Those wait for this
  prompt to land. After this is merged + pushed, that prompt moves
  from `questions/` back to `prompts/` for a retry.
- **Iframe (forge-moda-client) changes.** The iframe doesn't change
  in this prompt. Whether it needs to handle the `{type, result,
  stdout}` envelope from generic `/compute` is the simulation-
  button prompt's problem.
- **Plugin (forge-client-obsidian) changes.** Same — no plugin work
  here.
- **Serializer registry refactor.** Adding `register_serializer(...)`
  to replace the inline `_try_serialize_*` chain is a real
  architectural improvement but a separate prompt. Mention in
  observation.
- **C7 / A7 constitutional tightening.** Separate prompt. This
  prompt fixes the implementation; the constitution still says
  "encouraged" not "required" — that distinction stays for now.
- **stdout-to-Forge-Output piping.** Separate prompt.
- **Simulator iframe console retirement.** Separate prompt.
- **Touching any forge-moda content** (simulation.md,
  sample_clicks.md, etc.) — content is correct at v0.4.16. No
  version bump, no registry publish, no reinstall in this prompt.
- **Touching the music21 serializer.** Don't refactor working code.
- **New content types.** No additions to TEXT_CONTENT_TYPES or
  BINARY_CONTENT_TYPES.
- **Adding a `/moda/run` endpoint.** Not needed — generic
  `/compute` now suffices.

## Report when done

Per protocol 8-section CC report. Specifically:

1. **`serialize_result` diff** — before/after, including the new
   fallthrough call and the early-return for idempotency.
2. **`_try_serialize_particle_state` content** — the full function
   body. Note whether you reused `_serialize_particles` from the
   moda router or duplicated the transposition (with rationale).
3. **`_NATIVE_WIRE_FORMATS` change** — what was added.
4. **`serialize_for_wire` cleanup** — whether you simplified the
   redundant `_dataclass_to_jsonable` call.
5. **Test results** — full pytest run pass count, including the
   new test cases. List any pre-existing tests that needed
   investigation.
6. **Server-route audit** — did `forge/api/server.py:208`'s code
   path or any other route bypass `serialize_result`? Report
   findings.
7. **Manual curl verification** — output of the curl invocation
   above against a running uvicorn (or note "skipped, uvicorn not
   available in test environment").
8. **Observation** — anything worth flagging for a follow-up.
   Reasonable candidates:
   - Should `_try_serialize_*` move to a registry pattern?
   - Should `_serialize_particles` move from `forge/api/moda.py`
     to `forge/moda/serialization.py` so the row-shape conversion
     lives with the domain rather than the router?
   - Should A7's skip-with-warning be tightened to an error?
   - Is there any other code path that constructs an HTTP response
     from a compute result without going through `serialize_result`?

Plus:

- **Commit SHA** — single forge commit, pushed to main.
- **Any deviation and why.**

## Commit + push

This change is engine debt cleanup that belongs on `forge/main`.
Commit with a clear message — suggested:

```
core/serialization: wire-encode ParticleState; unify serialize_result with serialize_for_wire

serialize_result now falls through to _dataclass_to_jsonable for
dataclass+ndarray returns, matching serialize_for_wire's
snapshot-capture path. Adds _try_serialize_particle_state alongside
_try_serialize_music21 to produce the moda iframe wire shape on
the HTTP response. Closes the asymmetry that caused 500s on
Forge-click on go.md and any other ParticleState-returning snippet.

Tests: <pass count>/<total>. Existing snapshot path unchanged.
```

Push to `forge/main` after tests pass.

## Don'ts

- **Don't change the moda router** (`forge/api/moda.py`). Keep
  `_serialize_particles` and the `/moda/*` endpoints as-is. They
  already work for the live event loop; this prompt is about
  closing the gap for the generic path, not unifying everything.
- **Don't introduce a registry pattern.** Use the existing inline
  `_try_serialize_*` shape. Registry refactor is separate.
- **Don't touch the constitution.** No spec edits.
- **Don't modify any forge-moda content** — the v0.4.16 library is
  correct.
- **Don't add new content types.** This is about how existing
  types serialize over HTTP, not about adding new types.
- **Don't paper over a failing test by editing it.** The tests were
  correct under the old serialization behavior; if they break,
  your change is wrong.
- **Don't fix the auto-bump duality in `publish-vault.sh`** — not
  in scope. Separate prompt material.
- **Don't bundle the simulation-button retry** — keep this prompt
  focused on serialization only. After this lands, the queued
  prompt moves back.
- **Don't touch any other vault** — no music, no forge-core, no
  registry interactions.
- **Don't run `/generate` on anything.** No content regen.
- **Don't add a new endpoint.** Generic `/compute` is the right
  surface; just fix what it returns.
