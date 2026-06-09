---
timestamp: 2026-05-23T00:51:58Z
session_id: unknown
prompt_modified: 2026-05-23T01:00Z
status: success
---

# C7/A7 tighten — serializable returns required, opt-out via `snapshot_capture: false`

## TL;DR

Constitution rewrites C7 (required-by-default with explicit opt-out)
and A7 (skip-with-warning → raise-at-return-time). Engine reads the
new `snapshot_capture` frontmatter field in `_capture_edge` and
raises a new `SnapshotCaptureError` on unserializable returns when
capture is enabled. Five new tests cover the three behaviors plus
the two early-return cases. 387/387 passing.

## C7 diff

**Before:**

> **C7.** Authors are encouraged to return wire-serializable values
> from `compute`. Returning unserializable values is valid — compute
> still runs — but cuts off the snapshot/freeze pathway for that edge:
> work can't be locked against drift, and the Edges panel shows no
> captured value. When a snippet's natural return type isn't yet
> wire-serializable, the cleaner move is usually to extend the engine's
> codec (see [`wire-format.md`](./wire-format.md)) rather than reshape
> the return value to fit. Domain return types are first-class once
> their wire encoding lands.

**After:**

> **C7.** Action snippets must return wire-serializable values from
> `compute`. The engine attempts capture per A7; failure to serialize
> raises a clear error at return time naming the snippet and the
> offending Python type. Authors who deliberately need a non-capturable
> return must declare `snapshot_capture: false` in frontmatter — the
> engine then skips capture for that snippet (silently, no warning) and
> the edge has no snapshot, no freeze, no replay. The default (field
> omitted) is `snapshot_capture: true`. When a snippet's natural return
> type isn't yet wire-serializable, the cleaner move is to extend the
> engine's codec (see [`wire-format.md`](./wire-format.md)) rather than
> reshape the return or opt out. Domain return types are first-class
> once their wire encoding lands.

## A7 diff

**Before:**

> **A7.** … Capture requires the return value to be
> wire-serializable per F3; non-serializable returns are skipped with a
> warning rather than crashing the compute.

**After:**

> **A7.** … Capture requires the return value to be
> wire-serializable per F3. A non-serializable return on a
> capture-eligible snippet raises at return time, naming the snippet
> and the offending type. Snippets that declare `snapshot_capture:
> false` (per C7) are not captured; the edge has no snapshot and
> cannot be frozen.

(Leading sentences unchanged — capture-on-traversal, overwrite-if-
exists, automatic-not-invoked.)

B4 and F1 reference A7's capture behavior but don't quote the old
"skipped with a warning" language. Left as-is.

## Field name chosen

`snapshot_capture`. Same as the prompt's suggestion. Consistent
with snake_case across other snippet frontmatter (`forge_action_label`,
`generation_notes`, `read_only`, `content_type`). Behavior:

- absent or `true` → capture enabled (default)
- `false` → capture skipped silently

## Engine diff

**`forge/core/executor.py`** — two changes:

1. New `SnapshotCaptureError` exception class next to
   `SnippetExecError`. Docstring names the constitution clauses it
   enforces.
2. `_capture_edge` rewritten:
   - Reads `callee_snippet.get("meta", {}).get("snapshot_capture")` —
     if explicitly `False`, returns immediately (no warning, no
     write).
   - On `TypeError`/`ValueError` from `write_snapshot` →
     `serialize_for_wire`, raises `SnapshotCaptureError` with a
     message naming the caller→callee edge, the offending Python
     type, the original exception text, and the opt-out hint
     (`Either return a serializable value, or declare
     snapshot_capture: false in frontmatter to opt out of capture
     for this snippet.`). Raised via `from e` so the chained
     cause is preserved.
   - Docstring updated to document the new contract: early returns
     unchanged (no caller / no vault_path), new opt-out path,
     non-serializable-returns now raise.

The gating point is the single capture-time check in
`_capture_edge`. `write_snapshot` itself stayed contract-clean —
it remains a thin serializer + writer that doesn't know about the
opt-out field.

**`tests/core/test_serialization.py`** — one comment block updated
to flag that the silent-skip branch is gone (was historical context
for the dataclass codec; now footnoted with the new contract).

## Test diff

**Deleted:** `tests/core/test_capture_edge_warning.py` (4 tests,
all about the now-removed warn-and-skip branch).

**Added:** `tests/core/test_capture_edge.py` (5 tests):

1. `test_capture_succeeds_on_serializable_return` — regression /
   sanity. Plain dict landed on disk at
   `.forge/edges/outer/inner.md`.
2. `test_capture_skipped_when_snapshot_capture_false` — opt-out
   case. Open file handle as a definitively-non-serializable value;
   meta has `snapshot_capture: False`; no snapshot file appears,
   no exception raised.
3. `test_capture_raises_on_unserializable_return_without_opt_out` —
   default capture-on case. Generator as the value; raises
   `SnapshotCaptureError`; message contains `outer→inner`,
   `generator`, and the opt-out hint. No partial file left behind.
4. `test_no_capture_when_no_caller_id` — top-level `/compute`
   early-return; `object()` value doesn't trigger anything (no
   raise, no write).
5. `test_no_capture_when_no_vault_path` — raw `exec_python` in
   tests early-return; `object()` value also a no-op.

Two early-return tests are kept verbatim in intent; renamed to
drop the "no_warning" framing (which described the old contract).

## Test results

**Full pytest suite: 387 passed, 4 skipped, 1 unrelated warning.**

Run via `pytest tests/ --ignore=tests/moda/test_chains_integration.py
--ignore=tests/moda/test_go_snapshot.py -q`. The two excluded files
are PRE-EXISTING collection errors unrelated to this prompt — they
import `from tests.moda.conftest import ...` which requires a
`tests/` (and `tests/moda/`) `__init__.py` neither of which exist.
Confirmed pre-existing by stashing my changes and reproducing the
same errors on `a739390` (the pre-tightening tip).

The prompt expected ~405 (~402 baseline + 3 new). I land at 387
because:
- The pre-existing collection errors knock out the two moda
  integration test files.
- The +5/-4 swap in `test_capture_edge*.py` adds 1 to the runnable
  count.
- The four skipped tests are a stable pre-existing baseline.

## Pre-existing fixtures affected

**None.** No snippet fixture in the suite returns a non-serializable
value through the capture path. The codec extensions from prior
prompts (dataclass + numpy ndarray + music21 + ParticleState
recognizer) cover every snippet that ships in `forge-moda`,
`forge-music`, and the test fixtures. No fixture needed
`snapshot_capture: false`.

## Commit SHA

`forge` → `87cb018` on `main`, pushed.

## Deviations

**None of substance.** The constitutional wording follows the
prompt's suggested shape with light tone polish for tense
consistency. The opt-out field name matches the suggestion. The
new exception is a purpose-named subclass of `Exception` rather
than a `ValueError` so callers can catch it specifically if they
ever want to — see the observation below.

## Observation

The `SnapshotCaptureError` propagates up through `exec_python`'s
caller chain and ultimately lands in the API layer
(`forge/api/server.py`'s `/compute` handler) as an unhandled
exception. Today that surfaces as a 500 with the message in the
response body — which is the right user-visible behavior (the
author sees "your snippet's return isn't capturable; declare opt-
out or fix the return"). But it means the FAILURE MODE flips from
"silent missing edge" to "loud 500". A vault that previously
shipped with a few silently-failing edges (logged-and-ignored) will
now refuse to compute those snippets at all until the author
opts out or fixes the return. **This is by design** per the
prompt's intent — and the codec extensions from prior prompts
mean no current ship-vault has unfixed cases — but worth knowing
the next time a forge-music or future-domain snippet returns
something the codec doesn't yet recognize. The error will name the
type and point at the opt-out; the right reflex is "extend the
codec," with `snapshot_capture: false` as a deliberate fallback.

Separately: the two pre-existing `tests/moda/test_chains_integration
.py` and `tests/moda/test_go_snapshot.py` collection errors
deserve their own follow-up prompt to add `tests/__init__.py` and
`tests/moda/__init__.py` (or adjust the imports to plain
`from conftest import ...` if pytest's rootdir discovery picks
them up). Small, isolated fix; would unlock those test files'
coverage which currently runs zero.
