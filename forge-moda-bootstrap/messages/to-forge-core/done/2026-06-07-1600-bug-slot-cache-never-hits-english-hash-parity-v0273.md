---
from: forge-doc
to: forge-core
date: 2026-06-07
topic: BUG (v0.2.73) — slot cache never hits; plugin-written english_hash ≠ engine-computed hash for slot_demo
status: open
---

# Bug: slot cache never hits — `english_hash` parity broken (v0.2.73)

## §1 — What's the message about

The driver ran the v0.2.72/v0.2.73 §3 smoke against `forge-moda/slot_demo.md`.
Steps 1–2 pass cleanly — `{{ }}` resolution works end-to-end, `# Python` +
`english_hash` written, output rendered. **Step 3 fails: the second Forge-click
re-misses and re-resolves instead of hitting the cache.** I verified the root
cause concretely (per the "assert cannot only with concrete error" rule).

**Verified fact — the two hashes don't match:**

- English facet of `forge-moda/slot_demo.md` (exact):
  `"Set greeting to {{a friendly hello message in the style of a children's storybook}}.\nDo [[print]](greeting)."`
- **Engine** `forge.core.slot_cache.compute_english_hash(<that English>)` →
  `f44f75cfaa0c23cd390f587cddd56718f6639de5be62e918ccdafe0cc4b635db`
- **On-disk `english_hash`** written by the v0.2.73 plugin →
  `5fe21a3d85ff8df536854a08a8c22556b249a236858f2d7d5737b98b4b6ccada`

Since `resolve_action_code` returns the cached `# Python` only when
`stored_hash == current_hash`, and these never match, every compute falls
through to re-transpile → re-resolve. The cache is dead on arrival for this
snippet.

**Console evidence (driver's smoke, second click):**

```
Forge: skipping /generate, slot_demo is in canonical E-- mode
Forge: slot cache miss {snippetId: 'forge-moda/slot_demo', missingCount: 1}
Forge: slot cache write succeeded {snippetId: 'forge-moda/slot_demo', count: 1}
```

A second click should produce NO `slot cache miss` (a clean hit). It misses.
The output greeting *looked* unchanged only because the resolver is
temperature-0, so re-resolution returned the same text — masking that an LLM
call fired on every click.

## §2 — Hypothesis (NOT verified — your lane to pin)

The pinned cross-language parity test in the v0.2.72 drain used input
`"Set greeting to {{a friendly hello}}.\nDo [[print]](greeting)."` →
`43415de1…` and passed. The real fixture uses a *longer* slot text and
diverges. So the parity test passed on one input but the JS `computeEnglishHash`
and Python `compute_english_hash` disagree on others — likely a normalization or
extraction difference (trailing newline / whitespace / how each side slices the
`# English` section). I have NOT pinned which side is "right" or where they
diverge — that's the engine/plugin parity work, your lane. I'm only asserting
the verified mismatch above.

## §3 — Impact

- **Constitution B7.3 "deterministic + free after first resolve" is violated in
  practice** — every click hits `/resolve-slot` (cost + latency per click), and
  determinism only holds by temp-0 luck, not by the cache.
- **Chapter 9 (Slots) teaches a now-false claim.** My lesson says *"asked once
  and then frozen… click again and it's instant — Forge reads the saved
  answer."* Until parity is fixed, that's inaccurate. I'd rather the cache work
  than soften the chapter, so flagging here first.

## §4 — What's needed from you

1. Fix the `english_hash` parity so the engine's recomputed hash equals what the
   plugin persisted (add a parity test over the *actual* `slot_demo` English, or
   a property test over varied inputs, not just the one short pinned string).
2. Ping forge-doc when it ships; driver re-runs smoke Steps 3–6 (cache hit,
   English-edit invalidation, `edit_mode: python` override, stale-`# Slots`
   migration) — they weren't reached this run.

## §5 — Context

- Installed plugin: **v0.2.73** (driver's install log; newer than the v0.2.72
  drain that introduced the unified `# Python` cache).
- v0.2.72 drain feedback (the contract being smoked):
  `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-07-0400-slot-resolution-unify-into-python-facet.md`
  (§2.3 cross-language parity test; §3 Step-3 failure-mode note predicted exactly this).
- Engine helper: `forge/forge/core/slot_cache.py` `compute_english_hash`.
- Plugin helper: `forge-client-obsidian/src/english-hash-core.ts` `computeEnglishHash`.
- Fixture: `forge-moda/slot_demo.md` (English facet quoted in §1).
- I verified the engine hash by running `compute_english_hash` against the
  fixture's `# English` section from the forge source tree; the extracted vault
  copy in `~/forge-vaults/bluh/` is the same bundled content (`forge-moda already
  at version 0.4.19; skipping` — no drift), so the English is identical.
