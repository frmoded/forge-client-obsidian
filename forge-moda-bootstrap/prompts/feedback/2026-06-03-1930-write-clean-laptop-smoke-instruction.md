---
timestamp: 2026-06-03T20:30:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-06-03T19:30:00Z
status: success
---

# CLEAN-LAPTOP-SMOKE.md authoring — feedback

## §0 Commit pointers

- **Doc path:** `~/projects/forge-client-obsidian/CLEAN-LAPTOP-SMOKE.md` (top-level alongside `INSTALL.md`)
- **Commit:** `75264da` on `main`
- **Push:** `origin/main` (bf157e4..75264da)
- **Line count:** 515 (target was 200-500; over-written threshold was 800; lands comfortably in the "good coverage" band)
- No release; no version bump; no code change. `npm test` stays at 215/215.

### Auto-verified grep gates (per prompt §Tests, all clear)

```
'v0.2.44'           count: 11  (≥3 expected)
'Cmd-P|Cmd+P'       count:  3  (≥1 expected)
'transpile'         count: 18  (≥2 expected)
'forge-music'       count: 19  (≥2 expected)
'Failure mode'      count:  3  (≥1 expected)
'| Step |'          count:  0  (no tables, expected 0)
'BRAT'              count:  0  (forbidden, expected 0)
'install-latest.sh' count:  0  (forbidden, expected 0)
'forge-installer'   count:  0  (forbidden, expected 0)
```

## §1.1 Section headings (in order)

```
# Clean-Laptop Smoke — End-to-End Forge Validation
## Pre-conditions
## Phase 1 — Install Obsidian
## Phase 2 — Install the Forge plugin
## Phase 3 — Token setup
## Phase 4 — Verify base install (moda simulator)
## Phase 5 — Author + Forge-click a Greet snippet
## Phase 6 — Music domain (stretch but recommended for V1)
## Phase 7 — Freeze affordance (stretch but recommended for V1)
## Failure modes — keyed to specific steps
## End-state cleanup
## Doc version pin
```

Each phase has numbered sub-steps (e.g. `Step 1.1`, `Step 1.2`, `Step 1.3`). Failure modes are keyed `F1` through `F8`, each named to its originating step.

## §1.2 INSTALL.md cross-references — verbatim vs paraphrased

- **Phase 2 (plugin install) — paraphrased + augmented.** INSTALL.md's steps 1-4 are mirrored in shape (download, find plugin dir, unzip, enable) but each step has an explicit "Expected:" assertion that INSTALL.md omits (e.g., expected zip size ~33 MB; expected file-tree shape after unzip with subdirectory breakdown). The phase also includes the "nested-twice" gotcha inline rather than relegating it to a Troubleshooting section.
- **Phase 3 (token setup) — paraphrased + augmented with persistence verification.** INSTALL.md's `1.-4.` enumerated steps become Steps 3.1, 3.2, 3.3. Step 3.3 (verify persistence by closing + reopening Settings) is new — not in INSTALL.md — because the clean-laptop smoke's audience explicitly wants to confirm token persistence works, which is a concrete failure mode for new students.
- **Phase 4 (moda simulator) — paraphrased.** INSTALL.md's "Verifying it works" section is condensed to two steps (Open + Run); the expected outcome ("three distinct ink dispersions overlaid on the water") quotes INSTALL.md verbatim because the visual is the load-bearing observable.
- **The Greet snippet content (Phase 5.2) — quoted verbatim** from `forge/tests/vault/greet.md`. The whole snippet body is in a fenced code block so the validator can copy-paste without retyping the YAML and Python.
- **Network requirements (Phase 6.5 audio caveat) — paraphrased** from INSTALL.md's "Network requirements" section.

Justification for paraphrasing vs verbatim: the clean-laptop smoke is the validator-facing artifact; INSTALL.md is the student-facing artifact. Verbatim repetition would create drift risk (both files have to update in lockstep). Paraphrasing with the expected-outcome assertions on each step keeps the smoke distinct in tone (validator-mode) and resilient against minor INSTALL.md edits.

## §1.3 N/A (doc-only — no fix)

## §2 Drafting surprises + INSTALL.md drift flags

### Drift between INSTALL.md and welcome.ts log lines

INSTALL.md's "Verifying it works" section makes no mention of the v0.2.38 auto-re-extract log lines. The new CLEAN-LAPTOP-SMOKE quotes them verbatim (e.g., `Forge: forge-music already at version 0.3.8; skipping`). If a future drain adds a similar log-line reference section to INSTALL.md, the two should agree — flagged for cowork awareness.

### Drift between INSTALL.md and current Phase-4 default state

INSTALL.md says the simulator panel opens with `~500 small pale-blue water particles in a rectangle.` Source check (`forge-moda/setup.md`) confirms; quote stays verbatim. No drift.

### Drift between INSTALL.md and current command names

CC surveyed all `addCommand({ name: ... })` entries in `main.ts` to confirm command-name spellings (Cmd+P references). All current commands match the names quoted in the smoke (e.g., `Forge: Open MoDa simulation`, `Forge: Run only (active snippet)`, `Forge: Freeze edge`). No drift.

### The "lived" verb wart in Phase 7.6

The doc notes the cosmetic `Forge: lived ...` notice text (verb constructed as `${verb}d` from state name `live`). This is documented in the v0.2.41 + v0.2.44 commit bodies as a known minor wart. Including it here lets the validator know what to expect — they won't flag it as a bug.

### Smoke-automation feedback applied (eager-nightingale meta-note)

This drain follows the smoke-automation feedback I shipped earlier this session to `forge-core/feedback-cc-smoke-automation-default.md`. The split:

**Auto-verified by CC:**
- Located doc-home (top-level, alongside INSTALL.md).
- Read source-of-truth files in parallel (manifest.json, forge-music/forge.toml, welcome.ts notice patterns, main.ts addCommand entries, forge/tests/vault/greet.md) in one Bash call.
- Confirmed line count (515) is in the "good coverage" band.
- Ran all grep gates per the prompt's auto-verify checklist (9 gates, all clear).
- Verified `npm test` is unchanged at 215/215.
- Committed + pushed.

**Deferred to user (user-side meta-smoke):**
- Visual GitHub render check of the new doc.
- Confirm sections render in order and the embedded code block (the verbatim Greet snippet in Phase 5.2) renders cleanly as nested-fenced markdown.
- Spot-check that failure modes are clearly numbered F1-F8 and key back to specific step numbers.

Five lightweight user-side steps in §3 below. Amendment B (typical 3–8 step bound) honored.

## §3 User-side meta-smoke

> The CLEAN-LAPTOP-SMOKE.md document IS the deliverable; the meta-smoke confirms it landed correctly and renders properly. The full smoke itself (Phases 1-7) is the work the document is for, run separately when a clean laptop is available.

**Pre-conditions:** browser access to GitHub.

1. **Confirm the file is on GitHub at the expected path.** Browser → https://github.com/frmoded/forge-client-obsidian/blob/main/CLEAN-LAPTOP-SMOKE.md
   Expected: the file loads (no 404), renders with markdown formatting (headings, numbered steps, code blocks all styled).

2. **Confirm the seven Phase headings appear in order.** Scroll through the rendered page. The "Phase 1 — Install Obsidian" heading should appear early; "Phase 7 — Freeze affordance" should appear late, before the "Failure modes" section.
   Expected: all 7 phases present in the rendered TOC (left-side outline if GitHub shows one).

3. **Confirm the Greet snippet content in Phase 5.2 renders as a nested code block.** Scroll to Step 5.2. The pasted snippet content (YAML frontmatter + English + Python facet) is inside a fenced code block. The Python facet inside it uses ` ```python ... ``` ` — nested fences.
   Expected: the outer fence holds the whole snippet as a code block; the inner Python fence renders as code-within-code (GitHub typically shows this as a flat code block — that's fine).
   Interpretation: if the inner Python fence "breaks out" and the rest of the doc renders as plain text past Phase 5.2, the nested fencing didn't escape correctly. Fix follow-up.

4. **Confirm the Failure modes section is keyed by step number.** Scroll to the `## Failure modes` section near the bottom. Each entry should start with `**FN (Phase X.Y) — ...**` where N is 1-8 and X.Y is the originating step number.
   Expected: 8 failure-mode entries, each with the `FN (Phase X.Y)` prefix.

5. **Confirm no tables-of-steps anywhere.** Visually scan the entire document. There should be NO table format `| col | col |` representing sequential steps.
   Expected: only numbered prose paragraphs for sequential walkthroughs. (Inline tables for non-step content — e.g., none in this document — would be acceptable but aren't present.)

### Failure modes to watch for

- **Step 3 — Greet snippet code block renders broken, the rest of the doc shows as plain text past Phase 5.2** → nested fence escape didn't survive GitHub's markdown renderer. Fix: change the inner `` ```python `` fence to a different delimiter, or replace the outer fence with indented code, or use HTML escape for the nested triple-backticks.
- **Step 4 — Failure mode entries lack the `FN (Phase X.Y)` prefix** → drafting error during phase numbering; cross-check the section against §1.2 of this feedback.

### End-state cleanup

The document persists in the repo and is the long-lived artifact. No cleanup needed. The next time this document needs an update, follow the **Doc version pin** instructions at the document's bottom (refresh version numbers, log-line samples, etc.).
