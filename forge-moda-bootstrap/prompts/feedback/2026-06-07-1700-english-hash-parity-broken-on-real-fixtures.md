---
timestamp: 2026-06-07T18:00:00Z
session_id: drain-2026-06-07-1700
prompt_modified: 2026-06-07T17:00:00Z
status: aborted
---

# v0.2.74 — `english_hash` parity investigation: REFUTED + routed to questions/

## §0 — Decision

**Hypothesis refuted; routed to `questions/` per cc-prompt-queue.md §51.**

Per cc-prompt-queue.md §76 — "If the failing test passes against current code, the bug isn't where the prompt hypothesized. Do NOT ship a speculative fix. Either pivot to investigate elsewhere or ship diagnostic instrumentation only. Report the pivot decision explicitly."

The cowork's hypothesis — that Python `compute_english_hash` and TS `computeEnglishHash` diverge on the real `slot_demo.md` fixture — is REFUTED by direct measurement. Both helpers agree byte-for-byte on the fixture's English content. The on-disk `5fe21a3d…` the cowork observed is the **correct** hash of the **Victorian** slot text, not a divergent storybook hash.

The bug the cowork reported (cache miss every Forge-click on slot_demo) is real, but the root cause is **not** in the parity helpers. This drain ships diagnostic + property tests that lock in the existing parity; the actual root-cause investigation needs forge-doc/user disambiguation before designing a fix.

## §1 — Investigation findings (concrete data)

### Both helpers AGREE on the bundled slot_demo fixture

**Python side** (`forge.core.slot_cache.compute_english_hash` via `extract_section`):

```
$ .venv/bin/python3 -c "
from forge.core.slot_cache import compute_english_hash
from forge.core.executor import extract_section
body = open('/Users/odedfuhrmann/projects/forge-moda/slot_demo.md').read()
english = extract_section(body, 'English')
print('Python english repr:', repr(english))
print('Python english hex bytes:', english.encode('utf-8').hex())
print('Python hash:', compute_english_hash(english))
"

Python english repr: "Set greeting to {{a friendly hello message in the style of a children's storybook}}.\nDo [[print]](greeting)."
Python english hex bytes: 536574206772656574696e6720746f207b7b6120667269656e646c792068656c6c6f206d65737361676520696e20746865207374796c65206f662061206368696c6472656e27732073746f7279626f6f6b7d7d2e0a446f205b5b7072696e745d5d286772656574696e67292e
Python hash: f44f75cfaa0c23cd390f587cddd56718f6639de5be62e918ccdafe0cc4b635db
```

**TS side** (`computeEnglishHash` via `_extractEnglishFromBody` mirrored from main.ts):

```
TS english repr: "Set greeting to {{a friendly hello message in the style of a children's storybook}}.\nDo [[print]](greeting)."
TS english hex bytes: 536574206772656574696e6720746f207b7b6120667269656e646c792068656c6c6f206d65737361676520696e20746865207374796c65206f662061206368696c6472656e27732073746f7279626f6f6b7d7d2e0a446f205b5b7072696e745d5d286772656574696e67292e
TS hash: f44f75cfaa0c23cd390f587cddd56718f6639de5be62e918ccdafe0cc4b635db
```

**Hex bytes identical. Hashes identical.** No parity divergence.

### Triangulating `5fe21a3d…`

The cowork observed `5fe21a3d…` as the on-disk `english_hash`. Tracing what input produces that hex:

```
$ .venv/bin/python3 -c "
from forge.core.slot_cache import compute_english_hash
print(compute_english_hash(\"Set greeting to {{a formal hello message in the style of a Victorian letter}}.\nDo [[print]](greeting).\"))
"
5fe21a3d85ff8df536854a08a8c22556b249a236858f2d7d5737b98b4b6ccada
```

`5fe21a3d…` is the **correct Python hash of the Victorian English** — the slot text the driver edited to during the v0.2.73 smoke. NOT a divergent value for the storybook English.

### Conclusion

The user's vault state has `english_hash: 5fe21a3d…` (Victorian) persisted with `# English` content reverted to storybook. Cache miss every click because the storage is inconsistent — not because the helpers disagree.

Full byte-level trace + extraction analysis in `forge/docs/investigations/v0.2.74-english-hash-parity.md`.

## §2 — What this drain shipped

Per §76 — ship diagnostic that IS warranted:

### Property test suite (Python + TS, byte-identical pins)

`forge` commit `9075967` — 8 new tests in `tests/core/test_english_hash.py`:
- `test_parity_pin_slot_demo_storybook_english` → `f44f75cf…`
- `test_parity_pin_victorian_slot_text` → `5fe21a3d…`
- `test_parity_pin_short_v0_2_72_baseline` → `43415de1…`
- `test_parity_pin_trailing_newline` → same baseline (normalized away)
- `test_parity_pin_leading_blank_lines` → same baseline
- `test_parity_pin_paragraph_break` → distinct from baseline
- `test_parity_pin_trailing_per_line_whitespace_normalized` → same baseline
- `test_parity_pin_unicode_em_dash_in_slot_text` → `60db14ea…`

`forge-client-obsidian` commit `50fe07e` — 7 parallel TS pins in `src/english-hash-core.test.ts` with byte-identical hex literals to the Python pins above.

Any future regression that breaks one side without the other will trip both test files.

### Investigation note

`forge/docs/investigations/v0.2.74-english-hash-parity.md` — full byte trace + three plausible alternative root causes documented for the user's disambiguation.

### Test counts

```
Forge:  616/616 pass (was 608 + 8 new parity pins).
Plugin: 499/499 pass (was 492 + 7 new parity pins).
```

### NO production code changes

- No `compute_english_hash` normalization change.
- No `computeEnglishHash` normalization change.
- No manifest bump.
- No release.
- No `forge-moda/forge.toml` bump.

## §3 — Three plausible alternative root causes (questions for user)

The bug the cowork reported (cache miss every Forge-click on slot_demo) is REAL. The parity hypothesis was wrong. Three alternative causes plausible — please disambiguate via re-smoke + diagnostic:

### Cause 1 — User edited English to Victorian, then reverted to storybook by some means (git checkout, manual edit, Obsidian undo, etc.) without re-running Forge

Symptoms match exactly:
- `english_hash: 5fe21a3d…` (Victorian) persisted from prior session.
- `# English` reverted to storybook content.
- Every compute since: storybook hash (`f44f75cf…`) vs stored Victorian hash (`5fe21a3d…`) → mismatch → re-transpile → /resolve-slot.

**Question for user:** did the smoke involve any Victorian edits prior to the failing Step 3 click? Was the `# English` content modified between the initial session and the failure observation?

### Cause 2 — Plugin write-side body-read race

In `main.ts:handleSlotCacheMiss`, the plugin reads the file **TWICE**:

```typescript
let body: string;
body = await this.app.vault.read(file);  // First read for hashing
const english = _extractEnglishFromBody(body) ?? '';
const englishHash = await computeEnglishHash(english);

await this.app.vault.process(file, (content) =>  // Second read inside process callback
  writePythonAndEnglishHash(content, {
    pythonCode: python,
    englishHash,  // Computed from the FIRST read
    ...
  }));
```

If the body changes between the two reads (vault.on('modify') firing async during /resolve-slot's network round-trip), the persisted `english_hash` could match the FIRST body while the in-disk `# English` matches the SECOND.

**Question for user:** is there an Obsidian auto-save or any other write to slot_demo.md during the /resolve-slot network round-trip? Can you capture the timing via DevTools network panel + a `console.log` of the body length before/after?

### Cause 3 — Auto re-extract anomaly

The bundled `forge-moda/slot_demo.md` has no `english_hash` field. If `ensureBundledForgeModa`'s auto re-extract overwrites the user's `# English` but somehow preserves the user's frontmatter (engine merges or skip-on-conflict logic), this would explain the inconsistency.

**Question for user:** any auto re-extract drift log line in the console (`Forge: forge-moda drift detected ...`)? The cowork's report says `forge-moda already at version 0.4.19; skipping` — so re-extract did NOT fire this session. But did it fire in any prior session?

## §4 — Path forward

When the user disambiguates which of the three causes is actual, the prompt moves back from `prompts/questions/` to `prompts/` and CC re-drains with a targeted fix:

- **If Cause 1:** ship a one-time "english_hash heal" pass that detects stale english_hash on snippet load + clears it, forcing the next compute to re-resolve and store a correct hash. Plus a smoke checklist update teaching users not to revert English without re-clicking Forge.
- **If Cause 2:** rewrite `handleSlotCacheMiss` to read the body ONCE inside `vault.process` and use that body for both hashing and writing.
- **If Cause 3:** investigate the auto re-extract path; ensure it overwrites frontmatter consistently with content.

Per cc-prompt-queue.md §45 retry semantics — the next CC drain will append a new feedback block to this file documenting the actual fix.

## §5 — Per-protocol HARD RULE compliance

- ✓ cc-prompt-queue.md §78 (investigation-before-design): investigation committed BEFORE any fix; investigation REFUTED the prompt's literal hypothesis, findings win per §78.
- ✓ §76 (failing test passes against current code): no speculative fix shipped; ship diagnostic + property tests only.
- ✓ §131 (no-op idempotence): property tests verify byte-level idempotence across both helpers.
- ✓ §347 (version-bump sanity check): manifest at 0.2.73; no bump because no release fired.
- ✓ §51 (route to questions/ when CC could proceed but needs disambiguation): the bug is real but the cause needs user-side data to pin.
- ✓ §321 (feedback file written before move): this feedback file exists; prompt move follows.

---

## §6 — Supersession note (2026-06-07)

This prompt was retired by driver authorization on 2026-06-07. The cache-miss-every-click bug the parity hypothesis attempted to explain was actually a SnippetRegistry routing bug — `refresh_file` defaulted to AUTHORING_VAULT, leaving library-snippet registry entries stale-since-install. Fixed by the subsequent `2026-06-07-1800-cache-miss-on-consistent-state-investigate.md` drain (Hypothesis A from its five-hypothesis investigation note). Engine commit `0edca80` adds longest-vault_path-prefix auto-detection to `refresh_file`; plugin v0.2.75 ships the engine bundle resync. Driver-verified end-to-end on `~/forge-vaults/bluh` 2026-06-07.

The 8+7 property-test pins this drain shipped (parity tests across varied input shapes) remain valuable as regression coverage for any future parity-breaking change.

Moved from `questions/` to `done/` to retire from the active queue.
