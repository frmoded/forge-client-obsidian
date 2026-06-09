---
timestamp: 2026-05-22T23:33:16Z
session_id: unknown
prompt_modified: 2026-05-22T16:21:54Z
status: success
---

# unify-compute-serialization — engine debt cleanup

## 1. `serialize_result` diff

Before (line 153):
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
  # (1) Already-tagged — pass through. Idempotency.
  if (isinstance(value, dict)
      and value.get("type") in _NATIVE_WIRE_FORMATS):
    return value

  # (2) Domain-specific recognizers.
  musicxml = _try_serialize_music21(value, snippet)
  if musicxml is not None:
    return musicxml

  particle_state = _try_serialize_particle_state(value, snippet)
  if particle_state is not None:
    return particle_state

  # (3) Generic fallthrough.
  return _dataclass_to_jsonable(value)
```

Three changes: idempotency early-return, ParticleState recognizer,
generic fallthrough to `_dataclass_to_jsonable` for any other
dataclass+ndarray return.

## 2. `_try_serialize_particle_state` content

```python
def _try_serialize_particle_state(value, snippet):
  try:
    from forge.moda.types import ParticleState
  except ImportError:
    return None
  if not isinstance(value, ParticleState):
    return None

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

**Decision: duplicated the transposition from
`forge.api.moda._serialize_particles` rather than reusing it.**
Reuse would require either (a) `forge.core.serialization` importing
from `forge.api.moda` (core → api, wrong layering direction) or
(b) hoisting `_serialize_particles` from the moda router into
`forge.moda.serialization` (cleaner but widens this prompt's blast
radius — a separate refactor decision). Duplication is local, ~10
lines, and the row-shape contract is stable. Flagged as a follow-up
in §Observation.

Use-time import of `forge.moda.types` keeps `forge.core.serialization`
loadable when the moda module isn't installed and prevents any
circular-import risk at module load time.

## 3. `_NATIVE_WIRE_FORMATS` change

Added `"moda_sim_state"` to the set. Comment notes that
moda_sim_state matches the iframe wire shape that /moda/compute
already produces, so generic /compute now emits the same content
shape (just wrapped in the `{type, result, stdout}` envelope).

## 4. `serialize_for_wire` cleanup

**Not the trivial simplification the prompt suggested.** The prompt
said:
> the `json.dumps(_dataclass_to_jsonable(payload))` in the second
> branch becomes `json.dumps(payload)` (the `_dataclass_to_jsonable`
> step is redundant after the fix)

That assumes `serialize_for_wire(value) = serialize_result(value)
+ post-processing`. After the fix, `serialize_result(ParticleState)`
returns the **lossy** moda_sim_state wire shape (row-oriented
Particle list — drops `headings`, `speeds`, `width`, `height` from
the dataclass). Funneling that through `serialize_for_wire` and
storing as `(moda_sim_state, json.dumps(content))` would break
`tests/core/test_serialization.py::test_particle_state_with_arrays_round_trips`
and `tests/moda/test_go_snapshot.py::test_go_second_call_uses_snapshot`
because `deserialize_text("moda_sim_state", …)` doesn't exist and
the dropped fields can't be reconstructed.

`serialize_result` and `serialize_for_wire` have **different
contracts**:
- `serialize_result` (HTTP path): emit the shape the consumer wants
  to render. May be lossy.
- `serialize_for_wire` (snapshot path): emit a shape `deserialize_text`
  can losslessly rebuild. Must round-trip.

These coincide for music21 (MusicXML round-trips) but diverge for
ParticleState. So `serialize_for_wire` now calls
`_try_serialize_music21` directly (the round-trip-safe case) and
falls through to `("json", json.dumps(_dataclass_to_jsonable(value)))`
on the **original** value — bypassing `serialize_result`'s lossy
ParticleState recognition. New shape:

```python
def serialize_for_wire(value, snippet=None):
  musicxml = _try_serialize_music21(value, snippet)
  if musicxml is not None:
    return "musicxml", musicxml["content"]
  return "json", json.dumps(_dataclass_to_jsonable(value))
```

This is a real deviation from the prompt's stated path. Discovered
when the existing snapshot round-trip tests failed under my first
naive implementation. The prompt did anticipate this risk ("verify
with the existing snapshot-capture tests that no shape regresses")
— flagged here as the resolution path.

## 5. Test results

`pytest -q` → **402 passed**, 4 skipped (existing `requires_llm`
markers), 1 pre-existing urllib3+LibreSSL warning. Was 396 before
this prompt; +6 net (4 unit cases in `tests/core/test_serialization.py`,
2 HTTP cases in `tests/api/test_compute_serialization.py`).

No pre-existing test was failing prior to my work that I "papered
over" — the two snapshot-roundtrip failures during development
(`test_particle_state_with_arrays_round_trips`,
`test_go_second_call_uses_snapshot`) were caused by my initial
serialize_for_wire shape and both resolved when I split it from
serialize_result (per §4).

New test cases:
- `tests/core/test_serialization.py`:
  - `test_serialize_result_emits_moda_sim_state_for_particle_state`
  - `test_serialize_result_idempotent_on_tagged_input`
  - `test_serialize_result_falls_through_to_dataclass_codec_for_other_dataclasses`
  - `test_serialize_for_wire_still_round_trips_particle_state_losslessly`
- `tests/api/test_compute_serialization.py`:
  - `test_compute_simulation_returns_moda_sim_state`
  - `test_compute_go_returns_moda_sim_state`

`test_compute_go_returns_moda_sim_state` deliberately loosens its
tick assertion (`>= 1` rather than `== 1`): the simulation test
running earlier in the suite leaves snapshots in the moda vault's
`.forge/edges/authoring/go/` directory, so subsequent `go` calls
read the latest snapshot rather than `sample_state`. Tick semantics
are covered by an isolated-vault test in `test_moda.py`; this
test's job is wire-shape recognition.

## 6. Server-route audit

`grep -n "serialize_result\|return {.*result\|/compute" forge/api/server.py`
shows:

```
15:from forge.core.serialization import serialize_result, SUPPORTED_CONTENT_TYPES
152:  return {"result": get_test_value()}                    # /test endpoint
171:@app.post("/compute")
189:    return {"type": snippet_type, "result": serialize_result(value, snippet), "stdout": ""}  # data
208:    return {"type": "action", "result": serialize_result(result, snippet), "stdout": stdout} # action
```

**Both `/compute` branches go through `serialize_result`.** No
bypass. The `/test` endpoint returns a raw dict but that's an
unrelated diagnostic endpoint, not a snippet result path.

The moda router's `/moda/*` endpoints handle their own
serialization via `_serialize_particles` (intentionally —
different fast-path with hardcoded ParticleState shape). Out of
scope per spec ("Don't change the moda router. Keep
_serialize_particles and the /moda/* endpoints as-is."). After
this fix, generic /compute produces the same `moda_sim_state`
content shape — so a future consolidation could collapse them, but
that's a separate prompt.

## 7. Manual curl verification

`uvicorn` was running. Live curl against the authoring vault
(no stale shadows):
```bash
curl -sS -X POST http://localhost:8000/connect \
  -d '{"vault_path": "/Users/odedfuhrmann/projects/forge-vaults/forge-moda-vault"}'
# → 200

curl -sS -X POST http://localhost:8000/compute \
  -d '{
    "vault_path": "/Users/odedfuhrmann/projects/forge-vaults/forge-moda-vault",
    "snippet_id": "simulation",
    "inputs": {}
  }'
```

Response shape (snippet-id-keyed parsing):
```
result.type:   moda_sim_state
tick:          300
n particles:   650
first particle: {'id': 0, 'type': 'water', 'x': 507.6, 'y': 515.6, 'mass': 'medium'}
```

End-to-end works.

**Side observation from manual testing:** /compute simulation
against `foo` and `bluh` returned 500 with detail
`"compute() missing 1 required positional argument: 'temperature'"`.
That's a **pre-existing stale-shadow issue** flagged in two earlier
feedbacks: both `foo/setup.md` and `bluh/setup.md` shadows predate
the v0.4.11 setup signature change (`def compute(context,
temperature="medium")`), so when simulation's `context.compute("setup")`
fires with no args, A4 resolves to the shadow with the old
no-default signature → TypeError. NOT a regression from this
prompt — the serialization fix correctly produces the wire shape;
the upstream snippet call fails earlier. The fix is the standing
"reconcile your shadows" punch list from the 2026-05-22-0000
prompt's feedback.

## 8. Observation

Three follow-ups surfaced during this work, in descending order
of urgency:

**(a) Pull `_serialize_particles` from the moda router into a
core/moda serialization module.** Two near-identical row-shape
transpositions now live in the codebase: `forge.api.moda._serialize_particles`
(used by /moda/*) and the new `_try_serialize_particle_state` body
in `forge.core.serialization` (used by generic /compute). The
row-shape conversion is a serializer concern, not a router concern;
extracting to `forge.moda.serialization` would let both paths share
one impl. Moderate-size refactor; flagged as a separate prompt.

**(b) Serializer registry refactor.** The inline
`_try_serialize_music21` + `_try_serialize_particle_state` chain
will keep growing as more domain types want their own wire shape
(future IFC, drawing, audio). A `register_serializer(recognizer)`
pattern would let each domain self-register at import time rather
than being hardcoded in `forge.core.serialization`. Architectural
cleanup, not urgent.

**(c) Constitution C7/A7 tightening — "serializable returns
required" vs "encouraged".** Today A7 says snapshot capture
"requires the return value to be wire-serializable per F3;
non-serializable returns are skipped with a warning". After this
prompt, generic /compute also wire-encodes via the dataclass codec,
which means non-dataclass non-ndarray returns (like raw music21
objects without the recognizer) now hit FastAPI's JSON encoder
unencoded. Currently fine because the existing recognizers cover
music21 + ParticleState, but the constitutional invariant could
firm up the contract: "every compute return must serialize via the
dataclass+ndarray codec OR through a registered recognizer; opaque
objects raise at return time rather than later in FastAPI."
Separate spec discussion.

## Commit SHA

| Repo | SHA | What |
|---|---|---|
| `forge` | `a739390` | core/serialization unify-compute-serialization |

Pushed to `forge/main`.

## Deviations

- **`serialize_for_wire` split from `serialize_result`** rather than
  the prompt's "redundancy simplification" path. The prompt's
  claim "should still produce the same output for the same input"
  was wrong for ParticleState; the two functions have genuinely
  different contracts. Discovered via two snapshot-round-trip test
  failures during development; resolved by splitting (see §4).
- **Duplicated transposition rather than reuse from
  `forge.api.moda`.** Avoids the core → api import layering
  problem. Flagged as a follow-up in §Observation (a).
- **`test_compute_go_returns_moda_sim_state` asserts tick ≥ 1**
  rather than `== 1`. Test isolation issue with on-disk snapshots
  (per-test cleanup of `.forge/edges/` would be the strict fix,
  but tick semantics are already covered in `test_moda.py`'s
  isolated synthetic vault; this test's value is wire-shape
  recognition).

## Unblocks

The queued simulation-button prompt
(`prompts/questions/2026-05-22-1500-simulation-snippet-featured-button.md`)
can now move back to `prompts/` for a retry. Phase 2's generic
`/compute` path returns the moda_sim_state wire shape end-to-end;
Phase 3's iframe-side rendering can consume `result.content`
directly since it matches the existing /moda/* SimState shape.

The stale-shadow situation in `foo` / `bluh` / `dry-run-vault`
also resurfaces for the simulation-button work — Phase 2's button
firing against a vault with a stale `setup.md` shadow will hit the
same TypeError I just observed. Worth surfacing in the
simulation-button retry's smoke test guidance.
