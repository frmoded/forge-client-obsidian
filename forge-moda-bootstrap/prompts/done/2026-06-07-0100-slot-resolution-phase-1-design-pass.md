# {{ }} slot resolution — Phase 1 design pass (NO shipping)

**Date queued**: 2026-06-07
**Driver**: forge-core (Oded)
**Scope decision**: PHASE 1 ONLY — design + tested pure-core helpers + risk register + constitution clause draft. **No engine wiring. No release. No tag.** Phase 2 (engine wiring + hosted endpoint + ship) is a separate prompt drafted AFTER user reviews Phase 1 output and authorizes the implementation.

## §0 — Why this prompt exists

Forge-doc's authoring work on Tier 1 chapters 1-8 is complete (per their message at `~/projects/forge-moda-bootstrap/messages/to-forge-core/done/2026-06-06-1803-tier1-corrections-canonical-inputs-footguns-and-slot-v1-case.md`). Chapter 9 (Slots) is blocked on whether `{{ free-text }}` slot resolution lands in V1. Forge-doc's strong preference is to wire it for V1 — the chapter demonstrates Forge's headline "low floor" property (write what you want in English, get a working value) which is the Mission's central pedagogical claim. Without it, V1's tutorial ships with its strongest demonstration missing.

The constitutional framing for slots is already in place:

- **Mission preamble** (`~/projects/forge/docs/specs/constitution.md`:47-57): "The canonical form is E--... a closed-vocabulary, deterministically-parseable subset of English with explicit markers for calls (`[[snippet]](args)`), assignments, returns, and **value slots (`{{ ... }}`)**. The LLM is invoked only to normalize free English into canonical E-- (and **to resolve `{{ slot }}` values**) — never to decide program structure."
- **B7.1** (`constitution.md`:368-370): "Each argument is itself an expression per the E-- grammar (literal, variable, nested call, **`{{ ... }}` value slot**, list, dict, or parenthesized group)."
- **Anticipated extensions** (`constitution.md`:780-791): "the LLM runs only for free-English → canonical normalization (at /generate time) and for **`{{ ... }}` value-slot resolution (cached per slot text)**."

So the constitution promises this feature. What's missing is:

1. **The wire-up** between Forge's canonical-form execution path (`~/projects/forge/forge/core/executor.py`:486-505 `resolve_action_code`) and E--'s `transpile(source, resolve_slot=...)` (`~/projects/e--/src/transpiler.py`:39). Today Forge calls `transpile(english.strip())` without a resolver, so E-- falls back to `_default_resolver` which raises `NotImplementedError("LLM slot resolver not wired; pass resolve_slot=...")`.
2. **A hosted resolver service** (or equivalent) that turns slot text → Python expression, with caching, deterministic enough for reproducibility.
3. **A cache shape** that persists resolved slot values per-snippet so re-runs don't hit the LLM.
4. **A constitution clause (B7.3)** that formalizes the slot-resolution contract — the hosted-side responsibility, the cache shape, the freeze-by-cache guarantee.

This prompt's deliverable is the DESIGN for all four, plus tested pure-core helpers that prove the design composes correctly. Phase 2 will implement the design.

## §1 — Phase 1 scope (what CC SHIPS)

Five commits, ALL on `forge-client-obsidian/main` and `forge/main` (and any docs change on `forge-moda-bootstrap`). NO version bump on `forge-client-obsidian/manifest.json`. NO release. NO tag.

### §1.1 — Investigation commit (FIRST)

Title: `[2026-06-07-0100-slot-resolution-phase-1-design-pass] investigation: slot resolution wire-up survey`

Read end-to-end and cite line numbers:

- `~/projects/e--/src/transpiler.py` — `transpile()` signature + `_default_resolver` + `make_anthropic_resolver` import + CLI wire-up.
- `~/projects/e--/src/resolver.py` — `make_anthropic_resolver()` implementation. What does the resolver actually call? What's its caching behavior? What's its determinism contract?
- `~/projects/e--/src/emitter.py` — `_emit_expr` slot-node handling at line 120 (`resolved = resolve_slot(node.text)`). What's the return type? What if the resolver throws?
- `~/projects/forge/forge/core/executor.py:486-505` — `resolve_action_code` canonical path. Where exactly would the resolver get injected?
- `~/projects/forge/forge/core/llm.py` — existing `/generate` LLM path: how does the hosted endpoint contract work? What's the request/response shape? What's the cache behavior? How does the plugin call out? `~/projects/forge-client-obsidian/src/...` — the plugin-side `/generate` caller.
- `~/projects/e--/docs/spec.md` §4.4 (slots) + §1.2 (LLM is transpile-time only HARD RULE) — what the E-- spec promises about slot semantics.

Write a single-page investigation note documenting:

- The current state (what's wired, what's not).
- The conceptual gap (what code paths need to connect).
- Any surprises (return types, error handling, encoding, caching behavior of `make_anthropic_resolver`).
- The architectural choice surface for Phase 2 (e.g., reuse E--'s `make_anthropic_resolver` vs build a new hosted `/resolve-slot` endpoint analogous to `/generate`).

Commit the note as `~/projects/forge/docs/investigations/slot-resolution-wire-up.md` (new file).

### §1.2 — Design commit

Title: `[2026-06-07-0100-slot-resolution-phase-1-design-pass] design: hosted /resolve-slot endpoint + sidecar cache + resolver factory`

Write a design document at `~/projects/forge/docs/investigations/slot-resolution-design.md` (new file). Cover:

**§A — Endpoint contract.** Proposed `/resolve-slot` endpoint:
- Request shape: `{ slot_text: string, snippet_id: string, surrounding_context: string, domain_hints: string[] }`. Include enough context that the LLM can disambiguate the slot ("a calm blue" in a `plot` call's `color=` arg vs. in a `text` value).
- Response shape: `{ python_expr: string, cache_key: string }`. The `cache_key` is the hash the client uses to look up the resolved value next time.
- Idempotency: same `slot_text` + `snippet_id` + `surrounding_context` MUST produce the same `python_expr` deterministically (via prompt design + temperature=0 or equivalent). This is the freeze-by-cache guarantee.
- Error shape: HTTP 4xx for malformed requests, 5xx for LLM failures with structured error payload.

Alternative considered: reuse E--'s `make_anthropic_resolver()` directly from the engine (no new endpoint). Document why this was rejected for V1 (API key exposure if engine runs in Pyodide; engine running on the client doesn't have the key; needs server-side proxy anyway).

**§B — Cache shape.** Sidecar `# Slots` heading inside each snippet's `.md`. Format:

```markdown
# Slots

```yaml
"sha256(slot_text)": "<python_expr>"
"abc123...": "\"a calm blue\" → \"#3366cc\""
```
```

(The exact YAML encoding TBD; CC proposes a concrete shape during design.)

Why sidecar instead of inline rewrite:
- Non-mutating: the canonical `# English` heading stays readable as authored.
- Mirrors the existing `# Python` cached-codegen pattern from B-series for free-English snippets.
- Diff-friendly: a single new slot adds a single line to `# Slots`; doesn't churn the English facet.
- User can hand-edit a resolved value if they don't like the LLM's choice (cache key for the slot becomes a "frozen" override).

**§C — Resolver factory.** Pure-core helper signature:

```typescript
// In forge engine (Python equivalent for the engine side):
function make_forge_slot_resolver(
  snippet_id: string,
  slot_cache: Record<string, string>,
  hosted_resolve_slot: (req: SlotRequest) => Promise<SlotResponse>,
): (slot_text: string) => Promise<string>;
```

Returns a callable that:
1. Computes cache key from slot_text (+ surrounding_context if used).
2. Checks `slot_cache` for the key. If present, returns the cached `python_expr` without hitting the hosted endpoint.
3. If absent, calls `hosted_resolve_slot()`, writes the result back to `slot_cache`, returns the value.
4. Errors propagate; LLM failure aborts the transpile per spec §1.2.

The factory makes determinism a runtime invariant (re-running a snippet with the cache present cannot hit the LLM).

**§D — Where the resolver is built and how the cache is read/written.**

Three integration points:
1. **Engine side**: `resolve_action_code` at `~/projects/forge/forge/core/executor.py:486-505` builds a resolver from the snippet's `# Slots` heading + a callable that knows how to call the hosted endpoint. Passes to `transpile(source, resolve_slot=resolver)`.
2. **Cache reads**: parsing the `# Slots` heading on snippet load (analogous to how `# Python` is parsed in `extract_python`). Add `extract_slots` helper.
3. **Cache writes**: when the resolver hits the hosted endpoint and gets a fresh value, it needs to persist back to the snippet's `.md`. Two options:
   - **(i) Engine writes via vault adapter** (engine-side write). Symmetric with how `/generate` populates `# Python`.
   - **(ii) Engine returns the resolved-values dict; plugin writes** (plugin-side write). More aligned with Pyodide-can't-write-files architecture.
   
   CC: pick one in the design + document why. Option (ii) is more consistent with V1's Pyodide isolation, but adds plumbing.

**§E — Constitution clause B7.3 draft.** Propose text for a new `constitution.md` clause:

> **B7.3.** *Value-slot resolution.* When a snippet's canonical E-- facet contains a `{{ free-text }}` value slot, the engine resolves the slot to a Python expression at **transpile time** via a Forge-hosted LLM call. The resolved expression is cached per `(snippet_id, slot_text)` pair in the snippet's `# Slots` heading; the cache is the freeze mechanism. **At runtime, the engine MUST NOT hit the LLM**; if the cache is missing a slot, the runtime raises an error (the snippet was transpiled before the slot was authored, or the cache was hand-deleted).
>
> The resolver is hosted-side responsibility: the engine receives the resolved value as data and writes it to the cache. Per the Mission's "low floor" property, students never see an API key or per-snippet LLM cost; per the "high ceiling" property, hand-editing a cached value to override the LLM's choice is supported (the user types a different `python_expr` directly into the `# Slots` heading).
>
> Slot text MUST be stable across cache hits — the cache key incorporates the slot text exactly as authored. A user editing the slot text invalidates that slot's cache and triggers re-resolution at next transpile.

(Draft text; user reviews and refines in Phase 2.)

**§F — Risk register.** Catalog risks Phase 2 will need to address:
- **Determinism**: LLM responses must be stable per (slot_text, surrounding_context). Prompt design + temperature handling matters.
- **Cache key sensitivity**: hash of just `slot_text` vs. `(snippet_id, slot_text)` vs. `(snippet_id, slot_text, surrounding_context)`. Each has trade-offs.
- **Error handling**: what does a learner see when the hosted endpoint is down? Spec §1.2 says LLM is transpile-time only — a runtime LLM call would violate the constitution.
- **Migration**: existing snippets without `# Slots` headings are valid (no slots → no cache entries needed). Constitution clause must not break them.
- **API cost / rate limiting**: cohort-wide first-tweak experience hitting a hosted endpoint. Cache mitigates but cold-start of first-time-authored slots is a real cost. Phase 2 needs to think about backpressure.
- **Slot text in commit diff**: when a learner edits slot text, the diff shows the slot change + invalidated cache row. Phase 2 needs to decide whether to auto-prune the invalidated cache row or leave it.

### §1.3 — Pure-core helper commit (TESTED, NOT WIRED)

Title: `[2026-06-07-0100-slot-resolution-phase-1-design-pass] pure-core: slot-cache parsing + resolver-factory helper`

Pure-core extractions (per cc-prompt-queue.md §86-118). NOT wired into welcome.ts / executor.py — just the helpers + tests.

**Helper 1**: `~/projects/forge/forge/core/slot_cache.py` (new file). Pure Python (no I/O dependencies).

```python
def parse_slots_section(body: str) -> dict[str, str]:
    """Extract the `# Slots` YAML heading from a snippet body.
    Returns dict mapping cache_key → python_expr. Returns {}
    when no # Slots heading is present.

    Behavior: tolerant of missing heading, malformed YAML
    (silently returns {} on parse error per S7 spirit), and
    whitespace variations. Mirrors extract_python's tolerance
    shape at executor.py:508."""

def serialize_slots_section(slots: dict[str, str]) -> str:
    """Inverse: given a slots dict, produce the # Slots heading
    body for round-trip. Stable ordering by cache_key for
    diff-friendliness."""

def compute_slot_cache_key(
    slot_text: str,
    snippet_id: str,
    surrounding_context: str | None = None,
) -> str:
    """Stable cache key for (slot_text, snippet_id, context).
    Returns hex-encoded sha256. Phase 2 may extend the input
    set; the function signature accommodates that.

    Determinism: same inputs MUST produce same output across
    Python versions and platforms."""
```

Tests at `~/projects/forge/tests/core/test_slot_cache.py` covering:
1. `parse_slots_section` with no # Slots heading → `{}`.
2. `parse_slots_section` with valid YAML heading → correct dict.
3. `parse_slots_section` with malformed YAML → `{}` (tolerant).
4. `parse_slots_section` with empty # Slots heading → `{}`.
5. `serialize_slots_section({})` → empty/minimal heading body.
6. `serialize_slots_section({'k': 'v'})` → valid # Slots body.
7. `parse → serialize → parse` roundtrip preserves the dict.
8. `compute_slot_cache_key` determinism: same inputs → same output across runs.
9. `compute_slot_cache_key` distinguishes (slot_text, snippet_id) pairs.
10. `compute_slot_cache_key` distinguishes (slot_text, snippet_id, context_a) vs (slot_text, snippet_id, context_b).

Run `pytest tests/core/test_slot_cache.py -v` and paste verbatim output in §1.3 feedback.

**Helper 2**: `~/projects/forge-client-obsidian/src/slot-resolver-factory-core.ts` (new file, pure-core extraction). TypeScript helper for the plugin-side resolver factory. Mirror the design from §C above:

```typescript
export interface SlotRequest {
  slot_text: string;
  snippet_id: string;
  surrounding_context: string;
}
export interface SlotResponse {
  python_expr: string;
  cache_key: string;
}
export interface HostedResolveSlot {
  (req: SlotRequest): Promise<SlotResponse>;
}

export function makeForgeSlotResolver(
  snippet_id: string,
  slot_cache: Record<string, string>,
  hosted_resolve_slot: HostedResolveSlot,
): (slot_text: string) => Promise<string>;
```

Tests at `~/projects/forge-client-obsidian/src/slot-resolver-factory-core.test.ts` covering:
1. Cache hit: cached slot → returns cached value without calling hosted.
2. Cache miss: calls hosted, returns value, writes to cache.
3. Mutable cache: a second call with the same slot returns the cached value from step 2 (cache populated by side-effect).
4. Distinct snippets isolate caches.
5. Hosted error propagates: rejection in `hosted_resolve_slot` → rejection in resolver.
6. Stable hashing: same `slot_text` produces same cache key regardless of call order.
7. Idempotency: calling resolver twice with same slot_text returns same value.

Run `node --test src/slot-resolver-factory-core.test.ts` and paste verbatim output in §1.3 feedback. Also run `npm test` to confirm no regression to the broader suite.

### §1.4 — Constitution clause draft commit

Title: `[2026-06-07-0100-slot-resolution-phase-1-design-pass] constitution: B7.3 draft for value-slot resolution`

Add the B7.3 clause from §1.2 §E (or your refined version) to `~/projects/forge/docs/specs/constitution.md`, placed alphabetically after B7.2 (after line ~428). Mark it as DRAFT with a comment so future readers know it's pending implementation:

```markdown
**B7.3.** *Value-slot resolution.* **[DRAFT — pending Phase 2 implementation
of slot resolution; see investigations/slot-resolution-design.md]**

When a snippet's canonical E-- facet contains a `{{ free-text }}` value
slot...
```

Phase 2's first commit will remove the DRAFT marker once the implementation lands.

### §1.5 — Documentation index commit (optional)

If `~/projects/forge/docs/investigations/` doesn't have an index/README, add one listing the two new investigation docs. Otherwise skip this commit.

## §2 — What CC does NOT ship

- NO version bump on `~/projects/forge-client-obsidian/manifest.json`.
- NO `gh release create`.
- NO git tag.
- NO `scripts/release.sh` invocation.
- NO wiring of the resolver into `resolve_action_code` (engine stays as-is — `transpile(english.strip())` without resolver — until Phase 2).
- NO `# Slots` heading appearing in any bundled snippet (cache parsing helper exists but is unused at runtime).
- NO hosted `/resolve-slot` endpoint changes (Phase 2).

The point of Phase 1 is to land the design + tested helpers such that Phase 2's implementation drain is a direct wire-up of pieces already proven to compose correctly. If Phase 1 surfaces a design problem, Phase 2 doesn't ship until the design is fixed.

## §3 — Investigation-first override

Per cc-prompt-queue.md §80, this prompt explicitly opts INTO investigation-first (§1.1 is the investigation commit shipping before §1.2 design). The deliverable is a docs + tested-helpers PR, not a feature.

## §4 — Feedback file shape

Per cc-prompt-queue.md §30-46. Header block + the following sections:

- **§0** — release coordinates (no release this time): commit SHAs for §1.1-§1.5, branches, push targets. Note no manifest bump, no tag.
- **§1** — investigation findings (the §1.1 commit's investigation note inlined or summarized; full text in the committed `slot-resolution-wire-up.md`).
- **§2** — design choices (the §1.2 commit's design doc, summarized; full text in committed `slot-resolution-design.md`).
- **§3** — TDD for pure-core helpers (per cc-prompt-queue.md §120-129 — new-feature shape, NOT bug-fix-failing-first; coverage report mandatory):
  - §3.1 list of test cases for slot_cache (helper 1).
  - §3.2 verbatim test run output for helper 1.
  - §3.3 list of test cases for makeForgeSlotResolver (helper 2).
  - §3.4 verbatim test run output for helper 2.
  - §3.5 full-suite output (`pytest -q` for forge; `npm test` for plugin).
- **§4** — constitution clause B7.3 draft (text from the §1.4 commit).
- **§5** — risks + open questions for Phase 2 (from §1.2 §F + any surfaced during implementation of helpers).
- **§6** — Phase 2 prompt sketch: an outline of what the implementation drain would do, so the user can authorize Phase 2 with a clear shape in mind. NOT a fully-drafted prompt; just a sketch.
- **§7** — auto-smoke results (test runs only, no release-side smoke since no release).
- **§8** — review surface: a numbered list of decisions the user needs to confirm or refine before authorizing Phase 2.

Post the same report in chat per cc-prompt-queue.md §43.

## §5 — Self-contained context for CC

You will be drained without conversational context. Everything you need:

- E-- standalone: `~/projects/e--/`. Spec at `docs/spec.md`, source at `src/`. Key files: `transpiler.py`, `emitter.py`, `resolver.py`.
- Forge engine: `~/projects/forge/`. Key files: `forge/core/executor.py` (canonical path at line 452-505), `forge/core/llm.py` (existing `/generate` integration for comparison).
- Plugin: `~/projects/forge-client-obsidian/`. Key files: search for `/generate` callers to understand existing hosted-endpoint plumbing pattern.
- Constitution: `~/projects/forge/docs/specs/constitution.md`. Mission preamble lines 3-61, B7.1 lines 356-400, B7.2 lines 402-428, Anticipated extensions lines 758-791.
- Forge-doc's chapter-9 advocacy: `~/projects/forge-moda-bootstrap/messages/to-forge-core/done/2026-06-06-1803-tier1-corrections-canonical-inputs-footguns-and-slot-v1-case.md` §2b. (Read this for the "why now" context; not for design specifics.)
- Pure-core convention: cc-prompt-queue.md §86-118.
- TDD discipline for new features (NOT failing-first): cc-prompt-queue.md §120-129.

The hosted endpoint side (`/resolve-slot`) is OUT OF SCOPE for Phase 1 — design the contract, don't implement the server. Phase 2 covers the server-side.

## §6 — Acceptance criteria

- Investigation note committed at `forge/docs/investigations/slot-resolution-wire-up.md` citing line numbers across e--, forge engine, forge plugin.
- Design doc committed at `forge/docs/investigations/slot-resolution-design.md` covering §A endpoint, §B cache, §C resolver factory, §D integration points, §E B7.3 draft, §F risks.
- Two pure-core helpers (`forge/forge/core/slot_cache.py`, `forge-client-obsidian/src/slot-resolver-factory-core.ts`) with full test coverage. All tests pass. Full suites green (`pytest -q` + `npm test`).
- Constitution amendment commit landing the B7.3 DRAFT clause.
- Feedback file at `forge-moda-bootstrap/prompts/feedback/2026-06-07-0100-slot-resolution-phase-1-design-pass.md` per §4 shape.
- No version bump, no tag, no release.
- Phase 2 prompt sketch in §6 of feedback.
- Numbered list of user-decision items in §8 of feedback.
