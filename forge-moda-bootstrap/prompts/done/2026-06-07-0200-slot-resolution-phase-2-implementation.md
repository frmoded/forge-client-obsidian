# Phase 2 — {{ }} slot resolution implementation (engine wiring + hosted endpoint + ship)

**Date queued**: 2026-06-07
**Driver**: forge-core (Oded)
**Predecessor**: Phase 1 design pass at `~/projects/forge-moda-bootstrap/prompts/done/2026-06-07-0100-slot-resolution-phase-1-design-pass.md`. Feedback at `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-07-0100-slot-resolution-phase-1-design-pass.md`.
**Target plugin version**: bump per placeholder convention — `{CURRENT} → {NEXT_PATCH}` (expected `0.2.69 → 0.2.70`). Read `~/projects/forge-client-obsidian/manifest.json` first; if not at 0.2.69, pause and flag per cc-prompt-queue.md §347.

## §0 — Scope summary

Wire up `{{ free-text }}` value-slot resolution end-to-end. Engine + hosted endpoint + plugin orchestration + bundled slot-demo fixture + remove the B7.3 DRAFT marker. Single v0.2.70 release ships the feature.

**Five deltas from Phase 1's design** baked into this prompt (driver-authorized in chat 2026-06-07):

1. **Cache key = `(slot_text, snippet_id)` only.** `surrounding_context` flows in the REQUEST to the LLM for disambiguation, but NOT in the cache key. Rationale: prose edits to the surrounding English line MUST NOT invalidate previously-resolved slots; freeze semantics require user-surface stability. Phase 1's `compute_slot_cache_key` accepted `surrounding_context` as an optional parameter; Phase 2 calls it with `None` / empty string in the production path.
2. **Batched `/resolve-slot` is mandatory.** Server contract: `POST /resolve-slot` accepts `{requests: [SlotRequest]}` (array), returns `{responses: [SlotResponse]}` (array). Single round-trip per transpile regardless of slot count.
3. **Pin a specific Claude model version for `/resolve-slot`.** CC's choice — recommend `claude-haiku-4-5-20251001` for cost (slot resolution is short-form, low-context; haiku is sufficient). Document the choice in the design doc + endpoint code. Mid-cohort model upgrades become explicit operational decisions, not silent drift.
4. **Add cache-miss-then-cache-hit E2E integration test** to the scope. First transpile populates `# Slots`; second transpile is silent (no `/resolve-slot` call; suite-level mock verifies). Validates freeze-by-cache at integration level, not just unit.
5. **Constitution B7.3 wording refinements** ship with DRAFT-marker removal. Two phrasings:
   - "the user re-fires the authoring gesture to re-populate the cache" → "the next transpile (Forge-click) re-populates the cache".
   - "the snippet was authored after the cache was generated" → "the snippet was edited to add a new slot since the cache was last generated".

## §1 — Implementation phases (commit ordering)

Investigation-first is NOT required here (the Phase 1 design is the investigation). TDD HARD RULE applies for behavioral changes (engine wiring, plugin orchestration); new-feature shape applies for the hosted endpoint (per cc-prompt-queue.md §120-129). Tests precede or accompany each implementation commit.

### §1.1 — Hosted `/resolve-slot` endpoint (server-side)

Implementation lives wherever the existing `/generate` endpoint lives (per Phase 1 investigation, `forge-client-obsidian/src/server.ts:187-211` is the plugin-side caller; the server itself is in the hosted service repo — CC navigates from the existing `/generate` plumbing to find it).

Endpoint contract:

- **Method + path**: `POST /resolve-slot`.
- **Auth**: bearer token reuse from `/generate` (same `transpileServiceToken`).
- **Request body**: `{requests: [{slot_text: string, snippet_id: string, surrounding_context: string, domain_hints: string[]}]}`. Array shape mandatory per delta #2.
- **Response body**: `{responses: [{python_expr: string, cache_key: string}]}`. Order MUST match request order. `cache_key` is server-computed using the same algorithm as `compute_slot_cache_key` (locked at Phase 1; cache_key triple is `(slot_text, snippet_id, "")` since surrounding_context is no longer in the key per delta #1).
- **Model pinning**: `claude-haiku-4-5-20251001` (or CC's chosen pin — document the choice). Temperature 0. Server-side `ast.parse(mode="eval")` validation on each `python_expr` before responding.
- **Error envelope**: matches `/generate` (400 malformed, 401 auth, 429 rate limit, 502 LLM upstream, 5xx server fault) with `{detail: ...}`.
- **Server-side cache** (optional Phase 2; Phase 3 if not in scope): a server-side LRU keyed on `(model_pin, cache_key)` amortizes cohort-wide first-resolution costs. CC's call whether to include; document either way.

Prompt design for the LLM call:

- System prompt explains the role: "Resolve the slot text to a single Python expression. Return only the expression. The expression must `ast.parse(mode='eval')` cleanly."
- User content includes: slot text, snippet_id, surrounding_context (the English line containing the slot, for disambiguation), domain_hints (e.g., `["music"]` to bias toward music21 idioms). Surrounding_context is NOT in the cache key, but IS in the LLM request — it helps the model pick a sensible Python expression on first resolution.
- Validation: parse response with `ast.parse(mode="eval")` server-side. If it doesn't parse, retry up to 2 times with the parse error included in a follow-up prompt; if still failing, return 502 with the parse error in `detail`.

Tests:

- Server-side: smoke test against the live `/resolve-slot` with 3-5 representative slot texts. CC actually hits the endpoint (per cc-prompt-queue.md §140-145) and reports verbatim responses.
- Empty `requests: []` array returns `responses: []` cleanly (no LLM call). Document.

### §1.2 — Engine wiring at `~/projects/forge/forge/core/executor.py`

Current state (Phase 1 investigation, executor.py:486-505 `resolve_action_code`): `transpile(english.strip())` called WITHOUT a resolver. Canonical snippet with `{{ }}` slot crashes with `NotImplementedError("LLM slot resolver not wired; pass resolve_slot=...")`.

Phase 2 change: parse the snippet's `# Slots` heading on snippet load, build a resolver that closes over the cache + an "unresolved slot tracker" (since the engine cannot call the hosted endpoint synchronously from Pyodide), and pass to `transpile(source, resolve_slot=resolver)`. The two-pass cache-miss seam works as follows:

1. Resolver checks cache; if hit, returns cached `python_expr` immediately.
2. If miss, the resolver records the slot text into a side-channel "missing slots" list and raises a sentinel exception (e.g., `SlotCacheMiss`) that the transpile wrapper catches.
3. The transpile wrapper unwinds, returns a structured `{result: "cache_miss", missing: [SlotRequest, ...]}` envelope from `resolve_action_code` (instead of the transpiled Python).
4. Plugin sees `cache_miss` envelope, calls `/resolve-slot` with the batched missing slots, writes the response back to the snippet's `# Slots` heading via `vault.process`, re-fires the transpile gesture.
5. Second transpile: now cache hit, returns Python normally.

New helpers needed engine-side (extracted per pure-core convention):

- `parse_slots_heading_from_body(body: str) -> dict[str, str]` — wrapper around Phase 1's `slot_cache.parse_slots_section` for use inside `resolve_action_code`.
- `build_engine_slot_resolver(snippet_id: str, slot_cache: dict[str, str], missing_collector: list) -> Callable[[str], str]` — pure-core factory; resolver closes over the cache (read-only) + missing_collector (mutable list of `SlotRequest` shapes the caller will batch).
- The engine resolver MUST raise `SlotCacheMiss` on first miss it encounters; the transpile envelope wraps and surfaces all collected misses to the caller.

TDD step 1 (failing-first per cc-prompt-queue.md §57): write integration test in `~/projects/forge/tests/core/test_executor_slots.py` covering:

- **Slot-bearing snippet, no cache**: `resolve_action_code` returns `{result: "cache_miss", missing: [...]}` envelope listing all unresolved slots in document order.
- **Slot-bearing snippet, partial cache**: only the unresolved slots surface as missing.
- **Slot-bearing snippet, full cache**: returns transpiled Python normally; no missing collector entries.
- **Slot-free canonical snippet**: works unchanged (verifies no regression).
- **Slot-bearing snippet, malformed `# Slots` heading**: tolerant — treats as no cache, surfaces all slots as missing.

TDD step 2: run, confirm fails (no `SlotCacheMiss` envelope path exists pre-Phase 2). Capture verbatim output.

TDD step 3: implement helpers + wire into `resolve_action_code` + change `transpile` invocation. Update the call site at executor.py:486-505 to pass `resolve_slot=resolver` and handle the `SlotCacheMiss` exception envelope-wrapping.

TDD step 4: re-run, confirm passes.

TDD step 5: full suite `pytest -q`. Confirm no regression.

### §1.3 — Plugin orchestration

Where to wire: the plugin's main `compute` path that invokes the engine. CC navigates from `forge-client-obsidian/src/server.ts:187-211` (`generateSnippetAlpha` for `/generate`) to find the parallel `/resolve-slot` caller.

Flow:

1. Plugin calls engine `compute` (or `resolve_action_code` equivalent surface).
2. If engine returns the `{result: "cache_miss", missing: [SlotRequest, ...]}` envelope:
   a. Batch the `missing` array into a single `POST /resolve-slot` call.
   b. On success, write the `responses` back to the snippet's `# Slots` heading via `vault.process` (atomicity per the same pattern `insertViaVault` uses for chip insertions).
   c. Re-fire the compute. (Second pass should be a clean cache hit; if it surfaces another `cache_miss`, log error and abort — this is a defensive bound on resolver loops.)
3. If `/resolve-slot` returns an error, surface a Notice to the user with a Notice describing the failure mode (e.g., "Forge slot resolution failed: <detail>") and abort the compute.

New TypeScript helpers (pure-core extractions per convention):

- `~/projects/forge-client-obsidian/src/slot-cache-writer-core.ts` — pure-core helper that takes a snippet body + cache updates (dict of cache_key → python_expr) and returns the updated body with `# Slots` heading inserted or merged. Uses Phase 1's `slot-resolver-factory-core.ts` for the cache shape; new helper handles the heading insertion + merge logic. Tests cover: insert when no `# Slots` heading exists; merge when one exists; preserve other headings; idempotency.
- Plugin glue file (non-pure-core, imports `obsidian`) wires the helper into `vault.process`.

TDD: failing-first integration test using stub `vault.process` adapter. Then implement. Re-run. Full `npm test` suite.

### §1.4 — Bundled slot-demo fixture

Add `~/projects/forge-moda/slot_demo.md` (or `~/projects/forge-moda/canonical_demo_slot.md` — CC's naming choice, document it). Bundled into the plugin's `assets/vaults/forge-moda/` per the existing extract pattern. Bumps forge-moda's `forge.toml` version per cc-prompt-queue.md §356 (bundled-vault content changes MUST bump forge-moda's forge.toml).

Fixture shape:

```markdown
---
type: action
description: Demo of {{ }} slot resolution
inputs: []
facet_form: canonical
---

# English

Set greeting to {{ a friendly hello message in the style of a children's storybook }}.
Do print(greeting).
```

No `# Slots` heading initially. First Forge-click resolves the slot, populates `# Slots`, runs. Second click is a cache hit.

CC verifies fixture transpiles + executes by running through the engine after the wire-up is in place. Document the first-resolution result.

### §1.5 — Constitution clause: remove DRAFT marker + apply wording refinements

`~/projects/forge/docs/specs/constitution.md` B7.3:

1. Remove the `**[DRAFT — pending Phase 2 implementation of slot resolution; see investigations/slot-resolution-design.md]**` marker.
2. Apply two wording refinements per delta #5:
   - "the user re-fires the authoring gesture to re-populate the cache" → "the next transpile (Forge-click) re-populates the cache".
   - "the snippet was authored after the cache was generated" → "the snippet was edited to add a new slot since the cache was last generated".

Commit message references Phase 2 implementation completion.

### §1.6 — Cache-miss-then-cache-hit E2E integration test (delta #4)

Add to either engine test suite (`forge/tests/core/`) or plugin test suite (`forge-client-obsidian/src/`), wherever the integration boundary lives. Test shape:

1. Stub `/resolve-slot` mock that counts call invocations.
2. Snippet with one `{{ }}` slot, no `# Slots` heading.
3. First transpile: mock called once with the missing slot; cache populated; transpile completes.
4. Second transpile of the same snippet (with the populated cache from step 3): mock invocation count UNCHANGED at 1; transpile completes from cache only.
5. Assert: second-transpile result equals first-transpile result (deterministic via cache).

This is the load-bearing freeze-by-cache contract test. If it passes, the slot resolution wire-up honors E-- spec §1.2 ("LLM at transpile time only").

## §2 — Release ship

Per cc-prompt-queue.md §339 (default-on git ops) and §347 (version-bump sanity check):

1. Bump `~/projects/forge-client-obsidian/manifest.json` per the placeholder. Read current value first.
2. Bump `~/projects/forge-moda/forge.toml` `version` field per cc-prompt-queue.md §356 (slot_demo.md adds new bundled content).
3. `scripts/release.sh` runs per current automation. Should be the fifteenth consecutive clean run.
4. Tag pushed, GH release published, zip SHA reported.
5. Clean-vault smoke per cc-prompt-queue.md §296: fresh test directory, `install-latest.sh` v0.2.70, verify the slot_demo.md fixture loads, Forge-click resolves the slot end-to-end (CC documents whether they can drive this in their sandbox or whether it defers to user-side).

## §3 — User-side smoke checklist (CC writes post-implementation per cc-prompt-queue.md §183-294)

CC writes after the wire-up lands. Pre-spec'd Step 1 per the bug-fix exception §187: install v0.2.70 + open slot_demo.md + Forge-click. Subsequent steps cover:

- Verify `# Slots` heading appears after first click (idempotency: second click doesn't re-write).
- Edit the slot text → save → re-Forge-click → verify new resolution lands (cache invalidation works).
- Hand-edit a `# Slots` entry → re-Forge-click → verify the hand-edit is respected (user override path).
- Hand-delete the `# Slots` heading → re-Forge-click → verify the slot re-resolves (recovery path).
- Network-failure simulation: disconnect or block the hosted endpoint → Forge-click → verify the Notice surfaces and compute aborts cleanly (no crash, no partial cache write).

All steps follow the 6a/6b paste-able-commands rule + CC actually runs as much as possible from the sandbox (mock the hosted endpoint for network-failure simulation).

## §4 — Auto-smoke CC must run (per cc-prompt-queue.md §133-181)

1. `npm run build` exit 0.
2. `npm test` all green. New plugin tests: +slot-cache-writer-core tests + integration test from §1.6. Previous baseline 458/458; new baseline TBD.
3. `pytest -q` in forge all green. New engine tests: +integration tests from §1.2 + cache-miss E2E from §1.6. Previous baseline 571/571.
4. `scripts/release.sh` clean.
5. Clean-vault smoke per §1.6.

If any auto-smoke fails, fix and re-verify per cc-prompt-queue.md §181.

## §5 — Feedback file shape

Per cc-prompt-queue.md §30-46 + §66-74:

- Header block.
- §0 — release coordinates (manifest before/after, forge-moda forge.toml before/after, commit hashes for each phase, tag, GH release URL, zip SHA).
- §1 — TDD continuity for engine wiring (5 checkpoints per cc-prompt-queue.md §66-74).
- §2 — TDD continuity for plugin orchestration (5 checkpoints).
- §3 — User-side smoke checklist (CC writes after auto-smoke green).
- §4 — Auto-smoke results (auto-verified vs deferred-to-user split).
- §5 — Cache-miss-then-cache-hit E2E test result (the load-bearing contract).
- §6 — Model pinning choice (which model, why, where documented).
- §7 — Hosted endpoint smoke results (verbatim responses from 3-5 representative slot texts).
- §8 — Constitution clause update (DRAFT marker removed + wording refinements applied; full pre/post text inlined).
- §9 — Slot-demo fixture: first-resolution result captured (slot text → python_expr verbatim).
- §10 — Follow-ups noted but not built (Phase 3 candidates: server-side LRU cache, sync Pyodide bridge if latency visible, batching across snippets if cohort load patterns motivate).

Post the same report in chat per cc-prompt-queue.md §43.

## §6 — Self-contained context for CC

You will be drained without conversational context. Everything you need:

- Phase 1 design doc: `~/projects/forge/docs/investigations/slot-resolution-design.md`. Authoritative for the architecture. The five deltas in §0 of this prompt override Phase 1's defaults; otherwise follow the design.
- Phase 1 investigation note: `~/projects/forge/docs/investigations/slot-resolution-wire-up.md`. Reference for the line citations.
- Phase 1 pure-core helpers (already shipped, use these):
  - `~/projects/forge/forge/core/slot_cache.py` (parse/serialize/hash).
  - `~/projects/forge-client-obsidian/src/slot-resolver-factory-core.ts` (resolver factory).
- Constitution B7.3 DRAFT clause: `~/projects/forge/docs/specs/constitution.md` (search for "B7.3.").
- Engine integration point: `~/projects/forge/forge/core/executor.py:486-505` (`resolve_action_code`).
- Plugin /generate caller for reference: `~/projects/forge-client-obsidian/src/server.ts:187-211`.
- Pure-core convention: cc-prompt-queue.md §86-118.
- TDD discipline: cc-prompt-queue.md §57-118.
- Bundled-vault forge.toml bump rule: cc-prompt-queue.md §356.
- Version-bump sanity check rule: cc-prompt-queue.md §347.
- "Assert cannot only with concrete error" rule (HARD RULE landed today): `~/projects/forge-moda-bootstrap/cowork-forge-protocol.md` (search for "Assert \"cannot\""). Applies to assertions in §0-§5 of feedback file and any chat output during this drain.

The hosted endpoint server code lives in a hosted service repo (per Phase 1 investigation). CC navigates from `/generate` plumbing to find it.

## §7 — Acceptance criteria

- `/resolve-slot` endpoint live, batched, model-pinned, validated, responds with `python_expr` + `cache_key` arrays matching request order.
- Engine wiring at `executor.py:486-505` passes `resolve_slot` to transpile; surfaces `SlotCacheMiss` envelope on cache miss; transpiles cleanly on cache hit.
- Plugin orchestration handles the cache-miss envelope, batches into `/resolve-slot`, writes back to `# Slots`, retries transpile.
- Slot-demo fixture bundled at forge-moda; first Forge-click resolves slot end-to-end.
- Cache-miss-then-cache-hit E2E test passes (the freeze-by-cache contract).
- Constitution B7.3 DRAFT marker removed; two wording refinements applied.
- All tests green (engine + plugin suites).
- v0.2.70 released cleanly via release.sh.
- Feedback per §5 shape.
- Smoke checklist §3 ready for user to run.

If any of the five deltas in §0 of this prompt would require a design re-think (rather than straightforward implementation), STOP and route to `questions/` per cc-prompt-queue.md §51. Don't silently revert a delta back to Phase 1's default.
