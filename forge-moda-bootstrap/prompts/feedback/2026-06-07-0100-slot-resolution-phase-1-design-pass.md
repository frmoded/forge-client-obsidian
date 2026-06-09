---
timestamp: 2026-06-07T01:30:00Z
session_id: drain-2026-06-07-0100
prompt_modified: 2026-06-07T01:00:00Z
status: success
---

# `{{ }}` slot resolution — Phase 1 design pass complete

## §0 — Release coordinates (no release; design phase)

| Field | Value |
| --- | --- |
| Plugin version | 0.2.69 (unchanged — no bump) |
| forge tag | none (no release this drain) |
| forge-client-obsidian tag | none (no release this drain) |
| Investigation commit (§1.1) | `forge` `43d2574` |
| Design commit (§1.2) | `forge` `9a8443d` |
| Python helper commit (§1.3a) | `forge` `0a0887f` (slot_cache.py + tests) |
| TypeScript helper commit (§1.3b) | `forge-client-obsidian` `0095d18` (slot-resolver-factory-core.ts + tests) |
| Constitution amendment (§1.4) | `forge` `65c49f0` (B7.3 DRAFT) |
| Push targets | `frmoded/forge` main, `frmoded/forge-client-obsidian` main |

No version bump, no `gh release create`, no tag, no `scripts/release.sh`.
Per prompt §2.

## §1 — Investigation findings (§1.1 commit)

Full text at `forge/docs/investigations/slot-resolution-wire-up.md`.
Key citations:

- **`e--/src/transpiler.py:34-46`** — `_default_resolver` raises
  `NotImplementedError("LLM slot resolver not wired; pass resolve_slot=...")`.
  `transpile(source, resolve_slot=None)` falls back to that default.
- **`e--/src/emitter.py:119-121`** — `_emit_expr` for `LlmSlot`:
  `resolved = resolve_slot(node.text); return str(resolved)`. The
  resolver's return value is spliced as literal Python text.
- **`e--/src/resolver.py:61-127`** — `make_anthropic_resolver()`
  reference implementation. Caches by `slot_text` alone in
  `.emm_cache.json`. Lazy client construction; needs
  `ANTHROPIC_API_KEY`. Validates via `ast.parse(mode="eval")` before
  caching; never executes.
- **`forge/forge/core/executor.py:486-505`** — `resolve_action_code`
  calls `transpile(english.strip())` with NO `resolve_slot` arg. A
  canonical snippet with a `{{ }}` slot crashes transpile today.
- **`forge-client-obsidian/src/server.ts:187-211`** —
  `generateSnippetAlpha` uses bearer-token auth via Obsidian's
  `requestUrl` to POST `${serviceUrl}/generate`. Reusable plumbing
  pattern for a `/resolve-slot` endpoint.
- **`forge/docs/specs/constitution.md` Mission preamble lines 47-57** —
  promises canonical-form + `{{ }}` resolution.
- **`forge/docs/specs/constitution.md` Anticipated extensions 780-791** —
  promises Phase 2 implementation.

**Architectural choice (§1.1):** new hosted `/resolve-slot` endpoint
(plugin-mediated) instead of direct `make_anthropic_resolver()` in the
engine. Reasons documented in the investigation note: Pyodide-isolation,
no per-client API keys, server-side cache amortization for the cohort.

## §2 — Design choices (§1.2 commit)

Full text at `forge/docs/investigations/slot-resolution-design.md`.

**§A — Endpoint contract.** `POST /resolve-slot` with
`{slot_text, snippet_id, surrounding_context, domain_hints}` request;
`{python_expr, cache_key}` response. Bearer-token auth, `temperature=0`,
server-side `ast.parse(mode="eval")` validation. Error envelope matches
`/generate` (400/401/429/502/5xx with `{"detail": ...}`).

**§B — Cache shape.** Sidecar `# Slots` heading inside the snippet's
`.md`, parallel to `# English` / `# Python` / `# Dependencies`. YAML-
encoded dict of `cache_key → python_expr`, optionally wrapped in a
`slots:` key for forward compatibility. Non-mutating to `# English`;
diff-friendly; user-overridable.

**§C — Resolver factory.** Two parallel helpers — Python
(`forge.core.slot_cache`) and TypeScript
(`slot-resolver-factory-core.ts`). Both compute the same cache key
from the same triple (verified by hardcoded-expectation cross-language
test). Both close over a mutable cache dict + a `hosted_resolve_slot`
callable.

**§D — Integration points.** Three: (1) engine reads `# Slots` on
snippet load; (2) engine builds resolver, passes to E--'s
`transpile(source, resolve_slot=resolver)`; (3) plugin writes
cache-updates back to `# Slots` after a `/resolve-slot` round-trip.

Cache-write owner: **plugin** (option ii in prompt §D). Engine returns
cache-updates as data; plugin owns vault I/O. Symmetric with how
`/generate` populates `# Python`.

Cache-miss seam: **two-pass via `SlotCacheMiss` exception**. Engine
resolver raises on miss; transpile envelope surfaces missing slots;
plugin batches them into `/resolve-slot`, writes back, retries
transpile. Preserves E-- spec §1.2 ("LLM at transpile time only").

**§E — Constitution clause B7.3 DRAFT.** Inlined in §4 below.

**§F — Risk register.** Eight rows: determinism, cache key sensitivity,
runtime LLM violation, migration, API cost, slot text in diff,
surrounding-context extraction, hosted availability. Each row pairs a
mitigation in the design with an open question for Phase 2.

## §3 — TDD for pure-core helpers (§1.3 commits, new-feature shape)

### §3.1 — Test cases for `slot_cache.py` (Python, helper 1)

23 cases in `forge/tests/core/test_slot_cache.py`:

- **`parse_slots_section`** (8): no heading → `{}`; valid YAML →
  dict; malformed YAML → `{}` (tolerant); empty heading → `{}`;
  flat-dict (no `slots:` wrapper) accepted; non-string values
  filtered; stops at next heading; empty body / None body → `{}`.
- **`serialize_slots_section`** (4): empty dict → empty string;
  single-entry renders full heading; stable asciibetical-by-key
  ordering (insertion order ignored); backslash/quote escaping.
- **Round-trip** (2): parse → serialize → parse preserves dict;
  handles real-world Python expressions (int, str, list, dict,
  call).
- **`compute_slot_cache_key`** (9): deterministic same-input same-
  output; distinguishes slot_text; distinguishes snippet_id;
  distinguishes surrounding_context; no concat collision via null-
  byte separator; None context ≡ empty string; rejects non-string
  input (TypeError); handles unicode; no-state idempotence (100
  calls).

### §3.2 — Verbatim test run output for helper 1

```
$ .venv/bin/pytest tests/core/test_slot_cache.py -v
============================= test session starts ==============================
platform darwin -- Python 3.9.6, pytest-8.4.2, pluggy-1.6.0 -- /Users/odedfuhrmann/projects/forge/.venv/bin/python3
cachedir: .pytest_cache
rootdir: /Users/odedfuhrmann/projects/forge
configfile: pyproject.toml
plugins: anyio-4.12.1
collecting ... collected 23 items

tests/core/test_slot_cache.py::test_parse_slots_section_no_heading_returns_empty PASSED [  4%]
tests/core/test_slot_cache.py::test_parse_slots_section_valid_yaml_heading_parses PASSED [  8%]
tests/core/test_slot_cache.py::test_parse_slots_section_malformed_yaml_returns_empty PASSED [ 13%]
tests/core/test_slot_cache.py::test_parse_slots_section_empty_heading_returns_empty PASSED [ 17%]
tests/core/test_slot_cache.py::test_parse_slots_section_accepts_flat_dict_without_slots_wrapper PASSED [ 21%]
tests/core/test_slot_cache.py::test_parse_slots_section_drops_non_string_values PASSED [ 26%]
tests/core/test_slot_cache.py::test_parse_slots_section_stops_at_next_heading PASSED [ 30%]
tests/core/test_slot_cache.py::test_parse_slots_section_handles_empty_body PASSED [ 34%]
tests/core/test_slot_cache.py::test_serialize_slots_section_empty_dict_returns_empty_string PASSED [ 39%]
tests/core/test_slot_cache.py::test_serialize_slots_section_single_entry_renders_full_heading PASSED [ 43%]
tests/core/test_slot_cache.py::test_serialize_slots_section_stable_ordering_by_key PASSED [ 47%]
tests/core/test_slot_cache.py::test_serialize_slots_section_escapes_backslash_and_quote PASSED [ 52%]
tests/core/test_slot_cache.py::test_parse_serialize_parse_roundtrip_preserves_dict PASSED [ 56%]
tests/core/test_slot_cache.py::test_parse_serialize_parse_roundtrip_handles_python_expressions PASSED [ 60%]
tests/core/test_slot_cache.py::test_compute_slot_cache_key_deterministic_same_input_same_output PASSED [ 65%]
tests/core/test_slot_cache.py::test_compute_slot_cache_key_distinguishes_slot_text PASSED [ 69%]
tests/core/test_slot_cache.py::test_compute_slot_cache_key_distinguishes_snippet_id PASSED [ 73%]
tests/core/test_slot_cache.py::test_compute_slot_cache_key_distinguishes_surrounding_context PASSED [ 78%]
tests/core/test_slot_cache.py::test_compute_slot_cache_key_no_concatenation_collision PASSED [ 82%]
tests/core/test_slot_cache.py::test_compute_slot_cache_key_none_context_equivalent_to_empty PASSED [ 86%]
tests/core/test_slot_cache.py::test_compute_slot_cache_key_rejects_non_string_input PASSED [ 91%]
tests/core/test_slot_cache.py::test_compute_slot_cache_key_handles_unicode PASSED [ 95%]
tests/core/test_slot_cache.py::test_compute_slot_cache_key_noop_idempotent PASSED [100%]

============================== 23 passed in 0.04s ==============================
```

### §3.3 — Test cases for `slot-resolver-factory-core.ts` (TypeScript, helper 2)

18 cases in `forge-client-obsidian/src/slot-resolver-factory-core.test.ts`:

- **`computeSlotCacheKey`** (9): 64-hex-char sha256 shape;
  deterministic; distinguishes each triple component; no concat
  collision; default empty context ≡ explicit empty; rejects non-
  string input; **matches Python helper byte-for-byte** (hardcoded
  expectation locks in cross-language determinism).
- **`makeForgeSlotResolver`** (9): cache hit returns cached value
  WITHOUT calling hosted; cache miss calls hosted + writes to
  cache; second call after miss is a cache hit (mutable cache);
  distinct snippets isolate caches; hosted error propagates; server
  cache_key mismatch raises (defense-in-depth); idempotent same-
  slot returns same value; distinct slot_text → separate cache
  entries; no-op idempotence (cache size doesn't grow per
  cc-prompt-queue.md §131).

### §3.4 — Verbatim test run output for helper 2

```
$ npx tsx --test src/slot-resolver-factory-core.test.ts
✔ computeSlotCacheKey: returns 64-hex-char sha256 (X ms)
✔ computeSlotCacheKey: same input → same output (deterministic) (0.645583ms)
✔ computeSlotCacheKey: distinguishes slot_text (0.208625ms)
✔ computeSlotCacheKey: distinguishes snippet_id (1.016292ms)
✔ computeSlotCacheKey: distinguishes surrounding_context (0.197375ms)
✔ computeSlotCacheKey: no concatenation collision via null-byte separator (0.177834ms)
✔ computeSlotCacheKey: default empty context same as explicit empty (0.197125ms)
✔ computeSlotCacheKey: rejects non-string input (0.194875ms)
✔ computeSlotCacheKey: matches Python helper byte-for-byte (cross-language determinism) (0.173042ms)
✔ makeForgeSlotResolver: cache hit returns cached value without calling hosted (0.187334ms)
✔ makeForgeSlotResolver: cache miss calls hosted + writes to cache (0.186625ms)
✔ makeForgeSlotResolver: second call after miss returns cached value (mutable cache) (0.21825ms)
✔ makeForgeSlotResolver: distinct snippets isolate caches (0.209916ms)
✔ makeForgeSlotResolver: hosted error propagates to caller (0.166666ms)
✔ makeForgeSlotResolver: server cache_key mismatch raises (0.133541ms)
✔ makeForgeSlotResolver: idempotent — same slot_text returns same value across calls (0.162709ms)
✔ makeForgeSlotResolver: distinct slot_text within same snippet → separate cache entries (0.412791ms)
✔ makeForgeSlotResolver: no-op idempotence — re-resolving same slot does not change cache size (0.147458ms)
ℹ tests 18
ℹ suites 0
ℹ pass 18
ℹ fail 0
ℹ duration_ms 132.734958
```

### §3.5 — Full-suite output (post-helpers)

**Forge engine (Python)**:

```
$ .venv/bin/pytest -q
======================= 571 passed, 1 warning in 56.29s ========================
```

571 = 548 prev-drain baseline + 23 new slot_cache tests. (The 3 tests
that previously failed in `tests/music/test_percussion_lab.py` due to
user WIP have since been reconciled — all green now.)

**Plugin (TypeScript)**:

```
$ npm test
ℹ tests 458
ℹ suites 0
ℹ pass 458
ℹ fail 0
ℹ duration_ms 4912.53325
```

458 = 440 prev-drain baseline + 18 new slot-resolver-factory tests.
No regressions.

## §4 — Constitution clause B7.3 DRAFT

Landed at `forge/docs/specs/constitution.md` after B7.2 (line ~429),
commit `65c49f0`:

```markdown
**B7.3.** *Value-slot resolution.* **[DRAFT — pending Phase 2
implementation of slot resolution; see
investigations/slot-resolution-design.md]**

When a snippet's canonical E-- facet contains a `{{ free-text }}`
value slot, the engine resolves the slot to a Python expression at
**transpile time** via a Forge-hosted `/resolve-slot` endpoint
(parallel to the existing `/generate` endpoint, same bearer-token
auth). The resolved expression is cached per
`(snippet_id, slot_text, surrounding_context)` triple in the
snippet's `# Slots` heading; the cache is the freeze mechanism.

**At runtime, the engine MUST NOT hit the LLM.** If the cache is
missing a slot at runtime (the snippet was authored after the cache
was generated, or the cache was hand-deleted), the runtime raises
an error; the user re-fires the authoring gesture to re-populate
the cache. Per E-- spec §1.2, LLM calls are transpile-time only —
this is a HARD RULE.

The resolver is hosted-side responsibility: the engine sees only
the resolved Python expression, never the LLM. The plugin owns the
`# Slots` write-back: when a cache-miss surfaces from transpile,
the plugin calls `/resolve-slot`, writes the result to the
snippet's `# Slots` heading, and re-fires the original gesture.

Per the Mission's "low floor" property, students never see an API
key or per-snippet LLM cost; per the "high ceiling" property,
hand-editing a cached value in `# Slots` to override the LLM's
choice is supported (the user types a different `python_expr`
directly into the heading).

Slot text MUST be stable across cache hits — the cache key
incorporates the slot text exactly as authored, plus the
snippet_id and the surrounding English line for disambiguation. A
user editing the slot text invalidates that slot's cache entry
(new hash key) and triggers re-resolution at next transpile.

The `# Slots` heading is a YAML-encoded dict of `cache_key →
python_expr`. See `docs/investigations/slot-resolution-design.md`
§B for the wire-format.
```

Phase 2's first commit will remove the `[DRAFT — ...]` marker.

## §5 — Risks + open questions for Phase 2

Distilled from design §F + surfaced during helper implementation:

1. **Determinism at LLM scale.** Server-side `temperature=0` is
   necessary but not sufficient — Anthropic model drift mid-cohort
   could yield different `python_expr` for the same triple. Mitigation
   surfaced in §F: empirical validation (100 calls, same triple) at
   the hosted-α layer before V1 cutover.
2. **Cache-key sensitivity to `domain_hints`.** Phase 1 design did
   NOT include `domain_hints` in the cache key. Adding it isolates
   per-domain semantics (a slot in a `moda` vault resolves differently
   from the same slot in a `music` vault) but invalidates every slot
   on a domains-list change. **Phase 2 decision needed.**
3. **`surrounding_context` extraction at the emitter level.** Today
   E--'s `LlmSlot` AST node carries only `text`. The design assumes
   the plugin can supply `surrounding_context` (the rendered English
   line). Two options for Phase 2: extend `LlmSlot` to carry source
   coordinates (surgical, AST change) OR pass the full English facet
   to the resolver and let it slice (simpler, more data). **Phase 2
   decision needed.**
4. **Two-pass cache-miss seam latency.** First-transpile of a slot-
   bearing snippet costs one extra round-trip. Phase 2 should
   instrument to confirm this doesn't visibly stall the Forge-click
   feel. If it does, a synchronous Pyodide-to-`/resolve-slot` bridge
   becomes a Phase 3 ask.
5. **Cache-write granularity.** Should the plugin batch multiple
   slot-misses in one `/resolve-slot` call (sending an array of
   `SlotRequest`)? Bandwidth-wise yes; complexity-wise it doubles
   the server contract. Phase 2 picks.
6. **Cache-row pruning.** When a slot's English text changes, the
   old cache row's key no longer matches anything in the source.
   Phase 2: auto-prune (clean diffs) or retain (history). The §1.3
   `parse_slots_section` / `serialize_slots_section` round-trip
   preserves orphan keys; pruning lives in the orchestration layer
   above the helpers.
7. **Hosted-endpoint availability.** When `/resolve-slot` is down,
   the user can't transpile a new slot-bearing snippet. Surface a
   clear Notice. Optionally add a `/health` check before the call
   surface. Phase 2 polish.
8. **Server-side cache key recomputation.** The server returns its
   own `cache_key` so the client can verify they agree. The §1.3
   TypeScript helper raises on mismatch — defense-in-depth against
   accidental drift in the hashing algorithm. Phase 2 server-side
   code must compute the key the same way (Python's
   `compute_slot_cache_key` is the reference impl).

## §6 — Phase 2 prompt sketch

Not a finalized prompt — an outline so the user can authorize Phase
2 with a clear shape in mind.

```
# Phase 2: slot resolution implementation

## Scope
- Hosted /resolve-slot endpoint (server-side, follows server.ts
  pattern + reuses forge/core/llm._get_client).
- Engine wiring at forge/core/executor.py:486-505: parse # Slots,
  build resolver, call transpile(source, resolve_slot=resolver),
  surface SlotCacheMiss in error envelope.
- Plugin wiring at src/main.ts generate path: catch missing-slots
  envelope, call /resolve-slot per slot (or batched), write to
  # Slots via vault.process, retry transpile.
- Bump # Slots support into the canonical_demo_compose fixture
  (or a new fixture forge-moda/slot_demo.md) so cohort smokes
  exercise the path.
- Remove [DRAFT — ...] marker from constitution B7.3.

## Out of scope for Phase 2
- Server-side cache (amortizes across cohort) — Phase 3 if
  needed.
- Synchronous Pyodide-to-hosted bridge — Phase 3 if first-
  transpile latency becomes visible.
- domain_hints in the cache key — Phase 2 design decision per §5.2.

## Tests
- New: end-to-end transpile of a canonical snippet containing
  {{ }} slots against a stubbed /resolve-slot. Engine + plugin
  side, suite-level.
- Regression: existing canonical_demo_compose stays green
  (no slots, no behavior change).

## Release
- Bump manifest.json (patch).
- Release.sh per current automation.
- Smoke: clean-vault install + open canonical_demo_compose +
  Forge-click → output panel shows "Hello <5-letter-name>"
  unchanged from v0.2.69 (no slots in this fixture, so no
  /resolve-slot calls).
- Smoke: clean-vault install + open NEW slot-demo fixture +
  Forge-click → first click resolves slot, writes # Slots
  heading, second click is a cache hit.
```

## §7 — Auto-smoke results

**Auto-verified by CC:**

- `pytest -q` on `forge` → 571 passed (was 548, +23 new). No
  regressions.
- `npm test` on `forge-client-obsidian` → 458 passed (was 440, +18
  new). No regressions.
- `pytest tests/core/test_slot_cache.py -v` → 23/23 pass (helper 1
  TDD coverage complete).
- `npx tsx --test src/slot-resolver-factory-core.test.ts` → 18/18
  pass (helper 2 TDD coverage complete).
- Cross-language hash consistency verified: Python helper produces
  `07e931d8c9c59770f5bb8d3105d270e7fc4fcd5b323cb49964ef7d2c2f71c98d`
  for `("the answer", "forge-moda/demo", "")`; TypeScript helper
  asserts the same hex.
- All five commits push cleanly to `frmoded/forge` and
  `frmoded/forge-client-obsidian`.

**Deferred to user (Phase 2 / out-of-scope):**

- Hosted `/resolve-slot` endpoint implementation (server-side).
- Engine wiring of helpers (`executor.py:486-505`).
- Plugin orchestration of cache-miss round-trip.
- E2E smoke with a slot-bearing snippet against a live
  `/resolve-slot`.

No release-side smoke (no release this drain).

## §8 — Review surface — decisions for Phase 2 authorization

The user reviews these and refines before Phase 2 starts. Each item
is a design choice baked into Phase 1's helpers but still open to
revision.

1. **Endpoint name `/resolve-slot`.** Parallel to `/generate`. OK?
2. **Bearer-token auth** reused from `/generate`'s transpileServiceToken.
   Same shared token covers both endpoints. OK?
3. **Cache key triple** = `(slot_text, snippet_id, surrounding_context)`.
   `domain_hints` is NOT in the key (it's a request-time hint to the
   LLM but not a cache discriminator). Open: should `domain_hints` be
   in the key? Trade-off: per-domain semantic isolation vs. cache
   invalidation on domain change.
3a. **`surrounding_context` in the key.** Means line edits to the
    snippet invalidate that slot's cache. Intended. OK?
4. **Cache-write owner = plugin** (Pyodide isolation pattern).
   Engine returns updates as data. OK with the slightly larger
   transpile-result envelope?
5. **Two-pass cache-miss seam.** Engine raises `SlotCacheMiss`, plugin
   round-trips, retries. Preserves E-- spec §1.2 "LLM is transpile-time
   only." Alternative: async Pyodide bridge (Phase 3). Phase 2 starts
   with two-pass. OK?
6. **YAML format for `# Slots`.** `slots:` wrapper at the top with
   asciibetical-by-key entries. OK with the wire format? Alternative:
   JSON, TOML, or a custom inline format.
7. **Server-side `cache_key` verification on the client.** The TS
   helper raises if server's returned `cache_key` doesn't match the
   client-computed one. Defense-in-depth; rejects silent server-side
   drift. OK?
8. **Constitution clause B7.3 wording.** Inlined in §4. The DRAFT
   marker stays until Phase 2 implementation lands. Any text
   refinements you want before authorizing Phase 2?
9. **Phase 2 scope per §6 sketch.** Hosted endpoint + engine wiring
   + plugin orchestration + one new slot-demo fixture + DRAFT marker
   removal. Anything to add (e.g., cohort-shared server-side cache,
   domain-hints handling, batched slot-resolution) or defer?

Once the user confirms / refines, Phase 2 prompt drafts and
authorizes its drain.

## Acceptance criteria check

- ✓ Investigation note committed at
  `forge/docs/investigations/slot-resolution-wire-up.md` citing line
  numbers across e--, forge engine, forge plugin.
- ✓ Design doc committed at
  `forge/docs/investigations/slot-resolution-design.md` covering
  §A endpoint, §B cache, §C resolver factory, §D integration points,
  §E B7.3 draft, §F risks, §G choices summary.
- ✓ Two pure-core helpers
  (`forge/forge/core/slot_cache.py`,
  `forge-client-obsidian/src/slot-resolver-factory-core.ts`) with
  full test coverage (23 + 18 = 41 cases). All tests pass. Full
  suites green (571 / 458).
- ✓ Constitution amendment commit landing the B7.3 DRAFT clause.
- ✓ Feedback file per §4 shape (this file).
- ✓ No version bump, no tag, no release.
- ✓ Phase 2 prompt sketch in §6.
- ✓ Numbered review surface in §8.
