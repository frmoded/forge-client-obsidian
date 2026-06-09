# v0.2.74 — investigate persistent cache miss on consistent on-disk state

**Date queued**: 2026-06-07
**Driver**: forge-core (Oded)
**Target plugin version**: bump per placeholder — `{CURRENT} → {NEXT_PATCH}` (expected `0.2.73 → 0.2.74`). Read `~/projects/forge-client-obsidian/manifest.json` first per cc-prompt-queue.md §347; pause and flag if not at 0.2.73.

## §0 — Reproduction (driver-verified at v0.2.73)

Driver-side cache-miss-every-click bug, distinct from the parity hypothesis the prior `prompts/questions/2026-06-07-1700-english-hash-parity-broken-on-real-fixtures.md` drain refuted. That drain (feedback at `prompts/feedback/2026-06-07-1700-...md`) correctly established Python ↔ TS `compute_english_hash` parity on the bundled fixture. THIS drain investigates a different shape: cache misses every Forge-click against `~/forge-vaults/bluh/forge-moda/slot_demo.md` even when the on-disk state is internally CONSISTENT.

**Driver-observed consistent state**:

```
$ head -10 ~/forge-vaults/bluh/forge-moda/slot_demo.md
---
type: action
inputs: []
facet_form: canonical
description: Stage-3 demo — canonical snippet with a `{{ }}` value slot. First Forge-click resolves the slot via the hosted /resolve-slot endpoint and writes the result into the # Slots heading. Second click is a cache hit (no LLM call).
english_hash: f44f75cfaa0c23cd390f587cddd56718f6639de5be62e918ccdafe0cc4b635db
---

# English

$ grep -A 5 "^# English" ~/forge-vaults/bluh/forge-moda/slot_demo.md
# English

Set greeting to {{a friendly hello message in the style of a children's storybook}}.
Do [[print]](greeting).

# Python
```

**Per the prior drain's verified pin**, `compute_english_hash` over the exact storybook content `"Set greeting to {{a friendly hello message in the style of a children's storybook}}.\nDo [[print]](greeting)."` produces `f44f75cfaa0c23cd390f587cddd56718f6639de5be62e918ccdafe0cc4b635db` on BOTH Python and TS helpers. That matches what's on disk. So `stored_hash == current_hash` SHOULD hold and cache SHOULD hit.

It doesn't. Driver-verified Forge-click console log:

```
Forge: skipping /generate, slot_demo is in canonical E-- mode
Forge Compute → {... vaultPath: '/Users/odedfuhrmann/forge-vaults/bluh', snippetId: 'forge-moda/slot_demo', ...}
Forge: slot cache miss {snippetId: 'forge-moda/slot_demo', missingCount: 1}
pyodide.asm.js:8 Forge debug: run_snippet('forge-moda/slot_demo') body=119ch code=161ch preview='def compute(context): |     greeting = "Once upon a time, in a land far, far away, hello there, dear friend! Welcome to our magical adventure!" |     print(greeting)'
Forge: slot cache write succeeded {snippetId: 'forge-moda/slot_demo', count: 1}
Forge Compute Result: {type: 'action', result: undefined, stdout: 'Once upon a time, in a land far, far away, hello t…, dear friend! Welcome to our magical adventure!\n'}
```

Two notable observations:

- **`slot cache miss` fires on a state that should be a clean hit.**
- **`body=119ch`** — the engine's body is 119 characters. The visible English content (`Set greeting to {{a friendly hello message in the style of a children's storybook}}.\nDo [[print]](greeting).`) hand-counts to ~108 chars. The 11-char delta suggests the engine's body has extra leading/trailing whitespace, newlines, or some other content that differs from what the plugin used to compute the persisted `english_hash` of `f44f75cf...`.

The bug shape: **the engine's recomputed hash on this body ≠ the persisted `english_hash`**, despite the body's English content visibly matching what should produce `f44f75cf...`. Some byte-level divergence between the cache-write path (plugin-side, used to persist `english_hash`) and the cache-read path (engine-side, used to recompute and compare) is firing on the user's real vault file.

## §1 — Investigation phase (commit before fix — HARD RULE per cc-prompt-queue.md §78)

**Five plausible root causes.** Investigation MUST pin which one fires before fix design.

### §1.1 — Hypothesis A: SnippetRegistry has stale cached meta with OLD english_hash

The Python-side `SnippetRegistry` caches snippet objects (per the v0.2.17 `_forge_sync_user_file` Python helper docstring at `~/projects/forge-client-obsidian/src/pyodide-host.ts:604`). If a prior session's `english_hash` (e.g., `5fe21a3d` Victorian) is still in the cached meta dict, the engine compares `5fe21a3d` (stored) against `f44f75cf` (current computed from storybook English) → mismatch → cache miss every time.

Test: read the SnippetRegistry's cached entry for `forge-moda/slot_demo` after a Forge-click. Compare to the on-disk frontmatter `english_hash` value. If they differ, hypothesis A confirmed.

### §1.2 — Hypothesis B: MEMFS has different bytes than disk

If MEMFS at `/bundle/user-vault/forge-moda/slot_demo.md` has different content than the on-disk file, the engine reads different bytes than what we observe on disk. The user's prior smoke involved multiple file edits + plugin re-extracts; MEMFS may not have caught up.

Test: from inside Pyodide, read `/bundle/user-vault/forge-moda/slot_demo.md` bytes; compute SHA-256 of those bytes; compare to SHA-256 of the on-disk file bytes (`sha256sum ~/forge-vaults/bluh/forge-moda/slot_demo.md` or equivalent). If hashes differ, MEMFS staleness confirmed.

### §1.3 — Hypothesis C: extract_section + compute_english_hash divergence on this specific body

CC's prior parity test (`prompts/feedback/2026-06-07-1700-...md`) verified parity on the bundled fixture. But the USER'S vault file may have subtly different bytes (line endings, BOM, trailing whitespace, frontmatter field ordering) that cause `extract_section` to return slightly different content than `_extractEnglishFromBody` did at write time. Even after `compute_english_hash` normalizes, a leading/trailing-blank-line divergence in extraction could produce a different hash.

Test: copy the user's vault file's bytes byte-for-byte. Run BOTH `extract_section(body, "English")` (Python) and `_extractEnglishFromBody(body)` (TS). Compare hex bytes. If they differ, hypothesis C confirmed. Pin the exact divergence point (extra trailing newline? different boundary?).

### §1.4 — Hypothesis D: Frontmatter parse divergence on this specific body

If the engine's frontmatter parser returns a different value for the `english_hash` field than the literal `f44f75cf...` on disk (e.g., due to YAML quoting, line continuation, encoding), `stored_hash` would not match anything sensible.

Test: parse the user's frontmatter via the engine's YAML path. Print `meta.get("english_hash")`. Compare to the literal disk string `f44f75cfaa0c23cd390f587cddd56718f6639de5be62e918ccdafe0cc4b635db`. If they differ, hypothesis D confirmed.

### §1.5 — Hypothesis E: Plugin write-side body-read race (CC's prior Cause 2)

In `main.ts:handleSlotCacheMiss`, the plugin reads the body TWICE (once for hashing, once inside `vault.process`). If body changes between reads, `english_hash` could be persisted matching the FIRST body while `# English` matches the SECOND. Test: instrument the plugin to log body bytes at both read sites; trigger a cache miss; compare. If they differ, hypothesis E confirmed.

This hypothesis predicts the bug persists ONLY when vault.on('modify') fires during /resolve-slot. If hypothesis E fires here, there must be a concurrent modify (Obsidian auto-save, plugin write, etc.). Investigation should verify whether any modify fires during the Forge-click.

### §1.6 — Investigation commit

Title: `[2026-06-07-1800-cache-miss-on-consistent-state-investigate] phase 1: pin the cache-miss root cause`

Investigation note at `~/projects/forge/docs/investigations/v0.2.74-cache-miss-on-consistent-state.md`. For each hypothesis:
- Run the test described.
- Report the data (hex bytes, hashes, log lines — verbatim).
- Confirm or refute.

**Investigation completes when at least ONE hypothesis is confirmed.** If all five are refuted, route to `questions/` with a sixth-hypothesis section open for design help.

CC must verify against the actual user vault state by reading `~/forge-vaults/bluh/forge-moda/slot_demo.md` directly (the driver's bash sandbox should be able to read this path; if not, CC instructs the user to capture relevant data and amend the prompt).

## §2 — Fix phase (TDD per cc-prompt-queue.md §57-74)

Depends on confirmed hypothesis:

- **A confirmed**: ensure SnippetRegistry refreshes its cached meta on every disk write that touches the snippet. Probably the v0.2.71 `syncFileToMemfsAfterWrite` path needs to invalidate the registry cache too (currently it writes MEMFS but the registry may retain stale parsed meta).
- **B confirmed**: ensure MEMFS sync fires consistently before every compute path that reads body. Add a preflight sync analogous to the v0.2.19 `/generate` preflight at `main.ts:1502-1532` but for the regular compute path.
- **C confirmed**: align extraction logic between TS `_extractEnglishFromBody` and Python `extract_section`. Add a property-test layer that constructs realistic vault file bodies (with various YAML frontmatter shapes, trailing whitespace, etc.) and asserts both extractors return byte-identical output.
- **D confirmed**: fix the frontmatter parser path; add a property test for english_hash field round-trip.
- **E confirmed**: rewrite `handleSlotCacheMiss` to read the body ONCE inside `vault.process` and use that snapshot for both hashing and writing (eliminate the race).

TDD: failing test FIRST (the regression test from §1's hypothesis confirmation), implement fix, re-run, full suite.

## §3 — Release ship

Per cc-prompt-queue.md §339:

1. Bump `manifest.json` per placeholder.
2. NO `forge-moda/forge.toml` bump (no bundled-vault content change). Declare opt-out explicitly in §0 of feedback.
3. `scripts/release.sh` per current automation.
4. Tag pushed, GH release published, zip SHA reported.

## §4 — User-side smoke (CC writes post-implementation)

Pre-spec'd Step 1 per cc-prompt-queue.md §187: the exact reproduction from §0 — second Forge-click on the consistent slot_demo.md produces NO `slot cache miss` console line.

```
# Step 1: After install, open vault, Forge-click slot_demo.md (first click — write fresh english_hash).
# Step 2: Forge-click slot_demo.md again. Expected console: NO `slot cache miss` log. Output panel: same greeting as Step 1, no LLM call.
# Step 3: Verify on disk:
grep "^english_hash:" ~/forge-vaults/bluh/forge-moda/slot_demo.md
# Should match the engine's recomputed hash.
```

Plus regression check: Step 4 (English-edit invalidation) still invalidates correctly.

Failure modes keyed by step.

## §5 — Feedback file shape

Per cc-prompt-queue.md §30-46 + §66-74:

- §0 — release coordinates.
- §1 — Investigation findings (per §1.1 / §1.2 / §1.3 / §1.4 / §1.5 — which confirmed, which refuted, with verbatim data for each).
- §2 — TDD continuity (5 checkpoints).
- §3 — User-side smoke checklist per §4 of this prompt.
- §4 — Auto-smoke results.
- §5 — Open follow-ups.

Post the same report in chat per cc-prompt-queue.md §43.

## §6 — Self-contained context for CC

- Prior drain (parity refuted): `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-07-1700-english-hash-parity-broken-on-real-fixtures.md`. Property tests added there (8 Python pins, 7 TS pins) verify the helpers agree on varied inputs.
- v0.2.73 fix (slot_resolutions forces re-transpile): `forge-client-obsidian` `04de28e` + `forge` `ab775e7`. Defense against symptom; doesn't fix the underlying cache miss.
- Driver vault: `~/forge-vaults/bluh/forge-moda/slot_demo.md`. On-disk english_hash: `f44f75cfaa0c23cd390f587cddd56718f6639de5be62e918ccdafe0cc4b635db`. Visible English: bundled storybook content.
- Constitution B7.3 (authoritative cache contract): `~/projects/forge/docs/specs/constitution.md` (~line 430).
- "Assert cannot only with concrete error" HARD RULE: `~/projects/forge-moda-bootstrap/cowork-forge-protocol.md`. Applies to feedback assertions — CC must verify each hypothesis with concrete data before confirming.
- "Forge-core's CC-drain review is always-on" HARD RULE: same protocol file §77.

## §7 — Acceptance criteria

- Investigation commit lands BEFORE fix commit; identifies which hypothesis (A/B/C/D/E) is the root cause OR routes to questions/ with all five refuted.
- Failing test FIRST per TDD HARD RULE.
- Fix lands; failing test passes; full suites green (engine + plugin).
- User-side smoke step 2 = second Forge-click produces NO `slot cache miss` log on consistent on-disk state.
- v0.2.74 released cleanly via release.sh.
- Feedback per §5 shape.

If investigation refutes ALL five hypotheses, STOP and route to `questions/`. Don't speculatively chain more guesses.
