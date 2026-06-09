# v0.2.74 — fix `english_hash` parity between TS and Python helpers (cache never hits)

**Date queued**: 2026-06-07
**Driver**: forge-core (Oded)
**Target plugin version**: bump per placeholder — `{CURRENT} → {NEXT_PATCH}` (expected `0.2.73 → 0.2.74`). Read `~/projects/forge-client-obsidian/manifest.json` first per cc-prompt-queue.md §347; pause and flag if not at 0.2.73.

## §0 — Reproduction (driver-verified at v0.2.73; bug present since v0.2.72)

Forge-doc cowork ran the v0.2.72/v0.2.73 smoke and verified concretely (per the "Assert cannot only with concrete error" HARD RULE) that the `# Python` cache never hits because `english_hash` on disk doesn't match what the engine recomputes on read. Their message at `~/projects/forge-moda-bootstrap/messages/to-forge-core/done/2026-06-07-1600-bug-slot-cache-never-hits-english-hash-parity-v0273.md` documents:

**Same English input, two different hashes:**

- English facet of `~/projects/forge-moda/slot_demo.md` (exact verbatim):
  ```
  Set greeting to {{a friendly hello message in the style of a children's storybook}}.
  Do [[print]](greeting).
  ```
- Engine `forge.core.slot_cache.compute_english_hash(<that English>)` → `f44f75cfaa0c23cd390f587cddd56718f6639de5be62e918ccdafe0cc4b635db`
- Plugin's `english_hash` written to disk (computed via TS `computeEnglishHash` over the same English): `5fe21a3d85ff8df536854a08a8c22556b249a236858f2d7d5737b98b4b6ccada`

Because `resolve_action_code` returns the cached `# Python` ONLY when `stored_hash == current_hash`, and these never match for this fixture, every compute falls through → re-transpile → `SlotCacheMissError` → `/resolve-slot` round-trip → second compute → write back. The cache is dead on arrival.

The driver's earlier observation (v0.2.72 Step 5: `# Python` content didn't update after slot text edit) and v0.2.73's "fix" (slot_resolutions-forces-retranspile) BOTH made sense as defenses against a SYMPTOM of this parity bug. v0.2.73 unintentionally masks the bug by making re-transpile always work — but the cache never hits, so every Forge-click against a slot-bearing snippet hits the hosted endpoint. Constitution B7.3's "deterministic + free after first resolve" property is violated until this is fixed.

**Test that should have caught this** (per cc-prompt-queue.md §131 about no-op idempotence + cross-language parity tests): the v0.2.72 cross-language pin used the SHORT input `"Set greeting to {{a friendly hello}}.\nDo [[print]](greeting)."` → `43415de1...` — happened to normalize to the same bytes on both sides. The fixture's actual longer slot text exposes the divergence. Single-input pin is too narrow.

## §1 — Investigation phase (commit before fix — HARD RULE)

Per cc-prompt-queue.md §78 (investigation-before-design): the divergence shape isn't pinned yet. Forge-doc hypothesized it's a normalization or extraction difference (trailing newline / whitespace / how each side slices the `# English` section). That's a hypothesis; CC investigates concretely.

### §1.1 — Locate the byte-level divergence

Construct identical input to both helpers and diff their intermediate state:

1. Read the EXACT English facet of `~/projects/forge-moda/slot_demo.md`:
   ```python
   # Python side
   from forge.core.slot_cache import compute_english_hash
   from forge.core.executor import extract_section
   body = open('~/projects/forge-moda/slot_demo.md').read()
   english = extract_section(body, "English")
   python_hash = compute_english_hash(english)
   ```
2. Compute the TS-side equivalent on the same body:
   ```typescript
   // TS side
   import { computeEnglishHash } from './english-hash-core';
   // Replicate the plugin's English-extraction logic from handleSlotCacheMiss / _extractEnglishFromBody
   const body = readFileSync('~/projects/forge-moda/slot_demo.md', 'utf-8');
   const english = _extractEnglishFromBody(body);
   const ts_hash = await computeEnglishHash(english);
   ```
3. Compare `python_hash` vs `ts_hash`. If they differ, log the inputs that went into each (bytes, not strings — `Buffer.from(english).toString('hex')` on the TS side, `english.encode('utf-8').hex()` on the Python side).

The byte-level diff isolates whether the divergence is:
- **English-extraction**: the two sides slice the `# English` section differently (e.g., one includes the trailing blank line before `# Python`, the other doesn't).
- **Normalization**: the two implementations of compute_english_hash apply different whitespace normalization rules.
- **Encoding**: one side double-encodes or applies a non-utf-8 encoding somewhere.
- **Hash function**: extremely unlikely (sha256 of identical bytes ALWAYS produces identical hex) but verify.

### §1.2 — Investigation commit

Title: `[2026-06-07-1700-english-hash-parity-broken-on-real-fixtures] phase 1: investigation of english_hash divergence on slot_demo fixture`

Note at `~/projects/forge/docs/investigations/v0.2.74-english-hash-parity.md`. Document:
- Verbatim input bytes (hex) that each side hashes.
- The point of divergence (where they stop agreeing byte-by-byte).
- The cause (extraction boundary / normalization / etc.).
- The fix shape (align which side to which — generally the engine's behavior is the authority since the engine reads the cache at compute time).

## §2 — Fix phase (TDD per cc-prompt-queue.md §57-74)

### §2.1 — Failing test FIRST

Add a parity test that uses the ACTUAL `slot_demo.md` English content (or a property test that varies input across many realistic shapes, not just one short pinned string):

**Python side** at `~/projects/forge/tests/core/test_english_hash.py`:

```python
def test_compute_english_hash_matches_typescript_on_slot_demo_fixture():
    """Property: Python and TS compute_english_hash MUST agree on the
    exact English facet content of the bundled slot_demo.md fixture.
    
    Hardcoded expected hash here is whatever the FIXED implementation
    produces. The TS-side test (english-hash-core.test.ts) pins to the
    same hex.
    """
    english_from_slot_demo = (
        "Set greeting to {{a friendly hello message in the style of "
        "a children's storybook}}.\n"
        "Do [[print]](greeting)."
    )
    expected = "<HEX_VALUE_TBD>"  # CC fills this with the fix's output
    assert compute_english_hash(english_from_slot_demo) == expected

def test_compute_english_hash_property_varied_shapes():
    """Property: compute_english_hash must agree with the TS-side
    implementation across input shapes: with/without trailing newline,
    leading whitespace, multiple paragraphs, unicode, etc."""
    cases = [
        "Set greeting to {{a friendly hello}}.",
        "Set greeting to {{a friendly hello}}.\n",  # trailing newline
        "Set greeting to {{a friendly hello}}.\nDo [[print]](greeting).",
        "Set greeting to {{a friendly hello}}.\nDo [[print]](greeting).\n",
        "  Set greeting to {{a friendly hello}}.  ",  # leading/trailing whitespace
        "Set greeting to {{a friendly hello}}.\n\nDo [[print]](greeting).",  # paragraph break
        "Set greeting to {{中国 hello}}.",  # unicode
        # ... CC adds more cases as needed to cover the divergence
    ]
    for case in cases:
        expected = "<computed-per-case>"  # CC pins each via TS-Python parity
        assert compute_english_hash(case) == expected
```

**TS side** at `~/projects/forge-client-obsidian/src/english-hash-core.test.ts`: mirror the Python test cases with hardcoded expectations matching the Python output byte-for-byte.

Cross-language parity is the load-bearing assertion. Both tests use the same hex literals.

Run both tests pre-fix to confirm they fail (or pass against divergent expectations — CC clarifies which side is "right" first).

### §2.2 — Pre-fix run output (capture verbatim)

Per HARD RULE §66-74. Paste failing terminal output for both test files.

### §2.3 — The fix

Depends on the §1.1 investigation finding. Two general shapes:

**If divergence is in English-extraction (different boundary detection)**:
- Align both `_extractEnglishFromBody` (TS) and `extract_section(body, "English")` (Python) to the same precise contract: where does the `# English` section start (after the heading line) and where does it end (before the next `^# ` heading or EOF)? Trailing blank lines: included or stripped?
- Update the helper that diverges. Document the contract clearly in the helper's docstring.

**If divergence is in whitespace normalization within compute_english_hash**:
- Align both implementations to the same normalization rules. The current Python helper does: trim trailing whitespace per line, strip leading/trailing blank lines, preserve internal blank lines. If TS deviates, fix TS (or vice versa). The Python contract is documented in `compute_english_hash` docstring; the TS contract should mirror.

**Robust shape**: factor the normalization into a single source-of-truth on each side, with the EXACT same algorithm, and add an extensive property test (varied inputs) that locks in parity going forward.

### §2.4 — Post-fix run output

Same tests pass.

### §2.5 — Full suite

`pytest -q` on forge: should add new tests to baseline (608 + N).
`npm test` on plugin: same (492 + N).
All green.

## §3 — User-side smoke (CC writes post-implementation)

Pre-spec'd Step 1 per cc-prompt-queue.md §187: the exact reproduction from §0 — second Forge-click on `slot_demo.md` produces NO `slot cache miss` in console (clean cache hit). On-disk `english_hash` matches what engine recomputes.

```
# After installing v0.2.74 + opening vault:
# (assuming there's a clean v0.2.73-extracted slot_demo.md with stale english_hash)

# Step 1: First Forge-click — re-resolves and writes fresh english_hash.
# Should see slot cache miss + slot cache write succeeded.

# Step 2: Second Forge-click — THIS is the regression test.
# Should see NO slot cache miss log (cache hit on matching hash).
# Output panel: same greeting as Step 1, no LLM call.

# Verify cache-hit:
grep "^english_hash:" ~/forge-vaults/bluh/forge-moda/slot_demo.md
# Should match what `forge/forge/core/slot_cache.py:compute_english_hash` produces over the file's # English section.
```

Plus regression checks:
- Step 3 (v0.2.72 smoke) of English-edit invalidation: should still invalidate (new English → new hash → cache miss).
- Step 4: `edit_mode: python` override still works.

Failure modes keyed by step including the parity-check command (computing engine's hash via a one-liner Python script if Pyodide isn't available).

## §4 — Release ship

Per cc-prompt-queue.md §339:

1. Bump `manifest.json` per placeholder.
2. NO `forge-moda/forge.toml` bump (no bundled-vault content change). Declare opt-out explicitly in §0 of feedback.
3. `scripts/release.sh` per current automation.
4. Tag pushed, GH release published, zip SHA reported.

## §5 — Feedback file shape

Per cc-prompt-queue.md §30-46 + §66-74:

- §0 — release coordinates.
- §1 — investigation findings: byte-level divergence point cited.
- §2 — TDD continuity (5 checkpoints).
- §3 — user-side smoke checklist per §3 of this prompt.
- §4 — auto-smoke results.
- §5 — follow-ups: extend cross-language parity tests to other helpers (slot_cache_key already pinned; verify it survives the same property-test treatment). Consider adding a build-step parity-check that runs both helpers against a shared fixture file on every commit (similar to the §6.5 backtick-trap build-lint follow-up from v0.2.72 feedback).

## §6 — Self-contained context for CC

- Forge-doc's bug report: `~/projects/forge-moda-bootstrap/messages/to-forge-core/done/2026-06-07-1600-bug-slot-cache-never-hits-english-hash-parity-v0273.md`. Contains the verified hash mismatch + the exact English input.
- Engine helper: `~/projects/forge/forge/core/slot_cache.py` `compute_english_hash` + `forge/core/executor.py` `extract_section`.
- Plugin helper: `~/projects/forge-client-obsidian/src/english-hash-core.ts` `computeEnglishHash` + `src/main.ts` `_extractEnglishFromBody` (the wrapper that extracts English from a snippet body before hashing).
- v0.2.72 drain feedback (introduced the parity helpers + the inadequate pin): `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-07-0400-slot-resolution-unify-into-python-facet.md` §2.3.
- v0.2.73 drain feedback (defense-against-symptom fix): `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-07-0600-slot-resolution-second-pass-writes-stale-python.md`.
- Fixture: `~/projects/forge-moda/slot_demo.md` (English facet quoted in §0 of this prompt).
- Constitution B7.3 (authoritative contract on cache semantics): `~/projects/forge/docs/specs/constitution.md` (~line 430).
- "Assert cannot only with concrete error" HARD RULE: `~/projects/forge-moda-bootstrap/cowork-forge-protocol.md`. Applies to feedback assertions.
- "Forge-core's CC-drain review is always-on" HARD RULE: same protocol file §77.

## §7 — Acceptance criteria

- Investigation commit identifies the byte-level divergence point AND its cause.
- Failing test FIRST, demonstrating the parity break on the real `slot_demo` fixture.
- Fix aligns TS and Python implementations to produce identical hex on identical English input.
- Property test covering varied input shapes (trailing newlines, paragraph breaks, leading/trailing whitespace, unicode, etc.) — locks in parity going forward.
- Existing v0.2.72 cross-language pin (`"Set greeting to {{a friendly hello}}.\nDo [[print]](greeting)."` → `43415de1...`) STILL passes (regression check).
- Full suites green.
- v0.2.74 released cleanly.
- User-side smoke step 2 (second click after first compute) produces NO cache miss log + identical greeting (true cache hit).
- Feedback per §5 shape.

If investigation finds the divergence cannot be aligned cleanly (e.g., the two implementations have fundamentally incompatible normalization contracts that can't be reconciled without breaking either side's other consumers), STOP and route to `questions/` with the data.

## §8 — Why this matters

B7.3's central promise — "the answer is frozen in `# Python` and re-running is free + reproducible" — is currently false in practice. Every Forge-click on a slot-bearing snippet hits the hosted endpoint. Cohort cost + latency grow linearly with click count. Chapter 9 of forge-doc's tutorial teaches a claim that doesn't hold until this lands.

This is also the underlying root cause of the v0.2.72 Step-5 observation (the driver's "Python didn't change after edit") AND the v0.2.73 "fix" that defended against the symptom. With the parity bug fixed, the v0.2.73 fix becomes correct-but-defensive instead of correct-and-load-bearing.
