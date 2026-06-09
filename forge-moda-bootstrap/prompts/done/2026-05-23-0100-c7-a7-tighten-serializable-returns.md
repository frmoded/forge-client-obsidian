# Tighten C7/A7 — serializable returns required, with explicit opt-out

## Scope

Constitutional + engine change. Promotes "wire-serializable returns" from a soft norm (C7 today says "encouraged") to a required contract with an explicit opt-out, and removes A7's silent skip-with-warning branch in favor of an error at return time.

1. **Constitution C7.** Rewrite to require wire-serializable returns by default, with explicit opt-out via frontmatter (`snapshot_capture: false`).
2. **Constitution A7.** Remove the "skipped with a warning" language; capture either succeeds, raises, or is opt-out-skipped.
3. **Engine.** Honor the new `snapshot_capture` frontmatter field. When the field is absent or true, a non-serializable return raises a clear error. When false, snapshot capture is skipped silently (no error, no warning).
4. **Tests.** Cover the three behaviors: serializable return (captured), opt-out + opaque return (no capture, no error), required + opaque return (clean error).

Does NOT:
- Add new codecs to the wire format (separate concern; the dataclass+ndarray codec already covers most domain types, music21/ParticleState have recognizers).
- Refactor the serializer dispatch to a registry pattern. Inline `_try_serialize_*` chain stays.
- Touch any vault content. No version bumps, no registry interactions.
- Change A8/A9 (freeze semantics). Frozen edges still work; opt-out snippets simply can't be frozen because they have no snapshot.
- Touch the plugin, iframe, or simulator code paths.

## Why

- Today's "encouraged" + "skipped with a warning" combination is a silent failure mode. Authors who return non-serializable values discover months later that an edge has no snapshot (and so can't be frozen, can't be replayed).
- We already verified this gap was real engine debt — bit us in the simulation-button work as the `serialize_result` 500 (now fixed) and in earlier sessions when ParticleState returns silently failed to snapshot.
- Tightening makes the authoring contract explicit: returns must serialize, OR the snippet declares "I'm not capturable." Either way the author goes in with eyes open.
- Aligns C7 with how serialize_for_wire already behaves on the snapshot-capture path (which raises today on unhandled types via the dataclass codec).

## Files to modify

### Constitution — `forge/docs/specs/constitution.md`

**C7 — rewrite.** Current:

> **C7.** Authors are encouraged to return wire-serializable values from `compute`. Returning unserializable values is valid — compute still runs — but cuts off the snapshot/freeze pathway for that edge: work can't be locked against drift, and the Edges panel shows no captured value. When a snippet's natural return type isn't yet wire-serializable, the cleaner move is usually to extend the engine's codec (see [`wire-format.md`](./wire-format.md)) rather than reshape the return value to fit. Domain return types are first-class once their wire encoding lands.

After (suggested shape — refine in the prompt as you see fit):

> **C7.** Action snippets must return wire-serializable values from `compute`. The engine attempts capture per A7; failure to serialize raises a clear error at return time. Authors who deliberately need a non-capturable return must declare `snapshot_capture: false` in frontmatter — the engine then skips capture for that snippet and the edge has no snapshot, no freeze, no replay. The default (field omitted) is `snapshot_capture: true`. When a snippet's natural return type isn't yet wire-serializable, the cleaner move is to extend the engine's codec (see [`wire-format.md`](./wire-format.md)) rather than reshape the return or opt out.

**A7 — adjust.** Current:

> **A7.** For every edge (caller_snippet, callee_snippet) traversed during a compute, Forge automatically captures the value the caller received and stores it as a snapshot. If a snapshot already exists for that edge, it is overwritten with the latest. Capture is automatic; users do not invoke it. Capture requires the return value to be wire-serializable per F3; non-serializable returns are skipped with a warning rather than crashing the compute.

After (suggested):

> **A7.** For every edge (caller_snippet, callee_snippet) traversed during a compute, Forge automatically captures the value the caller received and stores it as a snapshot. If a snapshot already exists for that edge, it is overwritten with the latest. Capture is automatic; users do not invoke it. Capture requires the return value to be wire-serializable per F3. A non-serializable return on a capture-eligible snippet raises at return time. Snippets that opt out via `snapshot_capture: false` (per C7) are not captured; the edge has no snapshot.

Read C7's surroundings; if any adjacent clause references the "skipped with a warning" behavior, update accordingly. Quote the changed clauses verbatim in the report so you can confirm the wording.

### Engine — `forge/forge/core/` and `forge/forge/api/`

- Read the new `snapshot_capture` frontmatter field on action snippets at resolution time. Default to `true` if absent.
- In the snapshot-capture path (wherever `serialize_for_wire` is called for the captured value — likely in the executor or snapshot writer), gate the capture on `snapshot_capture == true`. Skip silently otherwise.
- When capture is gated on and `serialize_for_wire` raises, surface the error to the caller with a clear message naming the snippet and the offending return type. Don't swallow.
- Don't touch `/moda/*` endpoints — they handle their own serialization via `_serialize_particles`.

Locate the exact call site by grepping for `serialize_for_wire(` in `forge/forge/`. Likely one or two sites in the snapshot-capture path. Pick the right gating point; don't gate at every call site.

### Tests — `forge/tests/`

Add a new test file (or extend an existing one — check `tests/core/test_serialization.py` or `tests/core/test_snapshots.py` if one exists) covering:

1. **`test_capture_succeeds_on_serializable_return`** — snippet returns a ParticleState, snapshot lands on disk at the expected `.forge/edges/...` path. Regression coverage for the existing path.
2. **`test_capture_skipped_when_snapshot_capture_false`** — snippet has `snapshot_capture: false` in frontmatter, returns an opaque object (e.g., an open file handle, or any non-serializable value). No snapshot written. No error.
3. **`test_capture_raises_on_unserializable_return_without_opt_out`** — snippet has no `snapshot_capture` field (default true), returns an opaque object. The compute raises a clear error naming the snippet and the type.

Run the full forge test suite. If any pre-existing snippet test breaks because a fixture returns something non-serializable, that's signal — fix the fixture (add `snapshot_capture: false` or change the return). Don't suppress the new behavior to make a stale test pass.

## Implementation notes

- The `snapshot_capture` field name is the suggested shape. If the codebase has a stronger convention (e.g., `capture: true|false` or `wire_serializable: true|false`), pick what's idiomatic and flag the choice in the report. The constitutional language should match the chosen field name.
- The opt-out semantics are deliberately silent (no warning) — a snippet declaring `snapshot_capture: false` is signaling "I know what I'm doing." A warning would be noise.
- The error message on non-serializable return should name the snippet ID and the Python type of the offending value. Resist verbose tracebacks; clarity matters more than depth.
- The constitution clause language above is a suggested shape, not load-bearing. Refine for tone and consistency with the surrounding clauses.

## Tests

- Engine: `pytest -q` full suite. Was 402 passed before (per the prior 1700 prompt's feedback). Expect +3 new cases, so ~405.
- Constitution: no automated test surface — the language is reviewed by the user.
- Manual verification deferred: user reads the updated C7 and A7 clauses, sanity-checks the language.

## Out of scope

- Adding new codecs to wire-format. The dataclass+ndarray codec plus the music21 and ParticleState recognizers cover everything we use today.
- Registry pattern refactor for the `_try_serialize_*` chain. Defer until more domain types want their own wire shape.
- Iframe / plugin changes. Pure engine + constitution.
- Vault content edits. No snippet today should need `snapshot_capture: false` — flag any that do as signal for a follow-up.
- `publish-vault.sh` auto-bump fix (item d). Separate concern.
- Postmessage forwarding for featured-button stdout. Separate concern.

## Report when done

- **C7 diff** — old and new text verbatim. Confirm wording for the opt-out, the default, the error semantics.
- **A7 diff** — old and new text verbatim.
- **Field name chosen** — and why if not `snapshot_capture`.
- **Engine diff** — files touched, the gate added in the capture path, the error-raising shape.
- **Test results** — full forge pytest pass count.
- **Pre-existing fixtures affected** — if any test fixture snippet had to gain `snapshot_capture: false` to keep passing, list them. (Probably empty.)
- **Commit SHA** — single forge commit on main.
- **One observation** — anything that surfaces during implementation worth a follow-up.

## Commit + push

Single forge commit. Suggested message:

```
constitution + engine: C7/A7 tighten serializable returns; explicit opt-out

C7 promotes wire-serializable returns from "encouraged" to required-
by-default, with explicit opt-out via `snapshot_capture: false`
frontmatter. A7's silent skip-with-warning is replaced by a clear
error at return time when capture is enabled.

Engine reads the new frontmatter field; capture path gates on it
and raises on non-serializable returns when capture is enabled.

Tests: <pass>/<total>. Pre-existing snippet fixtures unchanged.
```

Push to `forge/main`.

## Don'ts

- **Don't add new codecs.** Out of scope.
- **Don't refactor to a registry pattern.** Out of scope.
- **Don't touch any vault content.** No `snapshot_capture: false` added to any current moda/music/etc. snippet — they shouldn't need it.
- **Don't touch the iframe or plugin.** Pure engine + spec.
- **Don't suppress test failures by making the new behavior softer.** If a fixture breaks, fix the fixture or flag it.
- **Don't change A8/A9 (freeze semantics).** Opt-out snippets just can't be frozen because no snapshot exists.
- **Don't bump any version or publish anything.**
- **Don't bundle (d) (`publish-vault.sh` auto-bump fix).** Separate prompt.
