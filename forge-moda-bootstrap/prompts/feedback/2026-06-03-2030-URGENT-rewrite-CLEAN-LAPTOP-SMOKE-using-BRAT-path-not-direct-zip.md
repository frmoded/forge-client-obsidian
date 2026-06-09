---
timestamp: 2026-06-04T00:00:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-06-03T20:30:00Z
status: success
---

# URGENT — CLEAN-LAPTOP-SMOKE.md rewrite to BRAT path — feedback

## §0 Commit pointers

- **Doc path:** `~/projects/forge-client-obsidian/CLEAN-LAPTOP-SMOKE.md`
- **Commit:** `f892499` on `main` (75264da..f892499 pushed)
- **Diff stat:** `+356 / −325` (net `+31` lines)
- **Line count before / after:** 515 → 546 (slightly over the 200-500 target band but well under the 800 over-written threshold; net `+31` attributable to the BRAT-vs-fallback intro paragraph in the top matter and the new Revision-history footnote)
- No release; no version bump; no code change. `npm test` stays at 215/215.

### Auto-verified grep gates (per URGENT prompt §Tests, all clear)

```
'BRAT' (case-insensitive)              count: 23  (≥4 expected)
'forge-installer'                      count:  3  (≥3 expected)
'Forge Installer: downloading'         count:  2  (≥1 expected)
'Cmd-P|Cmd+P'                          count:  4  (≥2 expected)
'transpile'                            count: 15  (≥2 expected)
'forge-music'                          count: 21  (≥2 expected)
'.obsidian/plugins/forge-client-obsidian/': 12 → 3  (DROPPED as expected — only the data.json reference + a backup-path reference remain)
'download.*zip|unzip|\.dmg':             dropped to 4  (only Phase 1 .dmg refs remain, as the prompt expected)
'install-latest.sh'                    count:  0  (forbidden, expected 0)
'| Step |'                             count:  0  (no tables, expected 0)
```

## §1.1 Section headings of the rewritten doc, in order

```
# Clean-Laptop Smoke — End-to-End Forge Validation
## Pre-conditions
## Phase 1 — Install Obsidian                       (3 sub-steps; preserved)
## Phase 2 — Turn on Community plugins + install BRAT  (3 sub-steps; NEW)
## Phase 3 — Install Forge via BRAT → Forge Installer  (4 sub-steps + footnote; NEW)
## Phase 4 — Token setup                            (3 sub-steps; was old Phase 3)
## Phase 5 — Verify base install (moda simulator)   (2 sub-steps; was old Phase 4)
## Phase 6 — Author + Forge-click a Greet snippet   (5 sub-steps; was old Phase 5)
## Phase 7 — Music domain (stretch)                 (5 sub-steps; was old Phase 6)
## Phase 8 — Freeze affordance (stretch)            (7 sub-steps; was old Phase 7)
## Failure modes — keyed F1 through F9
## End-state cleanup
## Doc version pin
## Revision history                                 (NEW)
```

Net: 7 phases → 8 phases. The added Phase 3 (Forge Installer) and the renumbering of Phases 3-7 → 4-8 match the URGENT's rewrite spec.

## §1.2 Diff summary — phase-by-phase

### Rewritten (substantive content replaced)

- **Pre-conditions block** — removed the v0.2.44 release zip URL bullet; added explicit note that air-gapped machines need the manual `INSTALL.md` fallback (since BRAT itself can't reach GitHub).
- **Phase 2** — old "download zip → find plugin dir → unzip" content removed entirely. New content (3 sub-steps): open Community plugins settings → turn on if needed → install + enable BRAT via Browse search. Mirrors `closed-beta-onboarding.md` §3.1-3.2 with explicit expected outcomes per step.
- **Phase 3** — NEW phase, didn't exist in old structure. 4 sub-steps mirroring `closed-beta-onboarding.md` §3.3-3.4: paste `frmoded/forge-installer` via BRAT → wait for "downloading" Notice → wait for install-completion Notice → reload Obsidian. Plus a rate-limit footnote pointing at `forge-installer/README.md` "Re-running" section.

### Renumbered (substantive content preserved)

- **Phase 4 — Token setup** (was old Phase 3). Three sub-steps preserved verbatim except for the persistence note (Step 4.3 now explicitly mentions Forge Installer's `data.json` preservation across upgrades, which is a real BRAT-path property worth noting; per `forge-installer/README.md` "What about data.json?" section).
- **Phase 5 — Verify base install** (was old Phase 4). Preserved verbatim.
- **Phase 6 — Author + Forge-click Greet** (was old Phase 5). Preserved verbatim including the verbatim-quoted Greet snippet body.
- **Phase 7 — Music domain** (was old Phase 6). Preserved verbatim.
- **Phase 8 — Freeze affordance** (was old Phase 7). Preserved verbatim.

### Deleted

- The entire old Phase 2.2 ("Find the vault's plugin directory") and Phase 2.3 ("Unzip into the plugins directory") — irrelevant on the BRAT path because Forge Installer handles plugin directory location and zip unpacking automatically.
- Old failure mode entries F2, F3 (the zip-specific "vault folder not found" / "nested-twice unzip" gotchas).
- The "If after the move the path reads `.obsidian/plugins/forge-client-obsidian/forge-client-obsidian/main.js` (nested twice)..." inline gotcha — never applicable on the BRAT path.

### Failure modes — diff

- **F1 (Phase 1.2) — Gatekeeper block on first Obsidian launch.** Preserved.
- **F2 (Phase 3.2) — "Forge Installer: downloading …" Notice never appears.** NEW BRAT-specific (replaces old F2 about Settings → About).
- **F3 (Phase 3.3) — "Forge Installer failed: GitHub API: …" or install-completion Notice never appears.** NEW BRAT-specific (rate-limit retry via "Check for Forge Client updates now").
- **F4 (Phase 3.4) — Forge Client missing from Settings → Community plugins after reload.** NEW BRAT-specific (toggle Community plugins off+on; disable+re-enable Forge Installer).
- **F5 (Phase 5.2) — Moda canvas static.** Preserved (was old F4); fix path now references "disable + re-enable Forge Installer to re-fetch" instead of "re-do the unzip carefully".
- **F6 (Phase 6.4) — Transpile error or no output.** Preserved (was old F5).
- **F7 (Phase 7.3) — No `forge-music` extract log.** Preserved (was old F6).
- **F8 (Phase 7.4) — SnippetResolutionError on song.md Forge-click.** Preserved (was old F7); failure-tree now cross-references F3 (incomplete BRAT install).
- **F9 (Phase 8.3) — Right-click missing freeze items.** Preserved (was old F8).

Net: 8 failure modes → 9 failure modes (one new BRAT-specific entry net; two zip-specific dropped).

### Revision history footnote (NEW at bottom)

Added per URGENT spec, explaining the path correction with reference to commit `75264da` (the previous version) and citing both `closed-beta-onboarding.md` and `cc-prompt-queue.md` as the documents whose framing was misaligned.

## §1.3 N/A (doc rewrite — no fix)

## §2 Surprises during the rewrite

### **Protocol-document drift — flagged for cowork attention.**

`~/projects/forge-moda-bootstrap/cc-prompt-queue.md` (the standing protocol document) explicitly states in its "User-side smoke checklist" quality requirements section:

> **3. Use the project's install scripts, NOT BRAT or manual zip downloads.** Forge's canonical install path is `bash ~/projects/forge-client-obsidian/scripts/install-latest.sh` ... BRAT only ships `main.js/manifest.json/styles.css` (not `assets/`) and is wrong for any release where bundled vaults / wheels / engine code changed. **Smoke that says "trigger BRAT update" is a bug in the smoke itself.**

This protocol rule is **out-of-date** relative to `closed-beta-onboarding.md` and `forge-installer/README.md`. The actual canonical paths are:

1. **`install-latest.sh`** — dev convenience for Forge maintainers working on the dev machine (where `~/projects/forge-client-obsidian` exists). NOT for students.
2. **BRAT → Forge Installer → auto-fetched release zip** — canonical student path per `closed-beta-onboarding.md`. The reason BRAT alone fails (which the protocol's rule correctly identifies — `assets/` are too large) is exactly why `forge-installer` exists: it's a ~20 KB bootstrap that BRAT *can* carry and that fetches the full release zip itself.
3. **Direct zip download** (INSTALL.md) — power-user / debugging fallback, explicitly relegated by `closed-beta-onboarding.md`.

The protocol's rule correctly observes that BRAT alone is broken; what it misses is that `forge-installer` exists specifically to bridge that gap, and the closed-beta student path IS via BRAT (with the forge-installer indirection).

**Concrete impact during this drain:**

- The previous 1930 prompt's "Don't reference BRAT" instruction was based on this stale protocol rule.
- The smoke-rewrite-on-protocol-amendment from earlier this session (the 1830 prompt) also moved smoke checklists FROM BRAT TO install-latest.sh, reinforcing the stale rule.
- This URGENT prompt corrects only the CLEAN-LAPTOP-SMOKE.md document; it does NOT amend the protocol itself.

**Recommendation for cowork:** amend `cc-prompt-queue.md` "User-side smoke checklist" requirement 3 to distinguish between:
- The dev convenience (install-latest.sh) for Forge maintainers,
- The canonical student path (BRAT → forge-installer) for closed-beta cohorts,
- The manual fallback (INSTALL.md direct-zip) for operators / debugging.

Each path has its own valid use case; current smoke prompts default to install-latest.sh because that's what the protocol says, but the V1-ship gate validation needs the BRAT path (which is what this URGENT corrects).

### Drift between `closed-beta-onboarding.md` and `forge-installer/README.md`

Both docs were checked for the Notice strings they reference. They agree exactly:
- `Forge Installer: downloading v0.X.Y …` (download-start)
- `Forge Client installed — fresh → v0.X.Y` (install-completion)

No drift; both are quoted verbatim in the rewrite.

### The "lived" Notice wart in Phase 8.6

Preserved from the previous version's doc. Worth knowing about; not a bug.

### Line count overshoot (+46 over 500)

The 200-500 band was suggestive per the URGENT prompt; the over-written threshold from the 1930 prompt was 800. The rewrite came in at 546, which is in the "comprehensive but not over-written" band. If a future drain wants it tighter, the candidates for trimming would be:
- The intro paragraphs explaining install-path choice (~15 lines).
- The doc-version-pin section's commentary (~10 lines).

Net: I didn't trim because the explanatory content is load-bearing for a fresh validator (who needs to understand WHY they're using BRAT, not just HOW).

### Smoke-automation feedback applied (eager-nightingale meta-note)

This drain follows the smoke-automation feedback I shipped earlier this session. The split:

**Auto-verified by CC:**
- Verified BOTH cited evidence documents (`closed-beta-onboarding.md`, `forge-installer/README.md`) exist before rewriting.
- Read both verbatim to confirm the URGENT prompt's claim about canonical install path.
- Surveyed the old doc structure to identify which phases get rewritten / renumbered / preserved.
- Drafted the rewrite in one Write call.
- Ran 9 grep gates per the URGENT prompt's auto-verify list — adjusted text twice to satisfy the `forge-installer` (kebab-case) ≥3 gate that initially scored 1.
- Confirmed line count (546) is within the over-written threshold.
- Verified `npm test` is unchanged at 215/215.
- Committed + pushed.

**Deferred to user (user-side meta-smoke):**
- Visual GitHub render check.
- Spot-check failure-modes numbering and `FN (Phase X.Y)` prefixes.

Four lightweight user-side steps in §3 below. Amendment B (typical 3-8 step bound) honored.

## §3 User-side meta-smoke

**Pre-conditions:** browser access to GitHub.

1. **Confirm the file is on GitHub at the expected path.** Open https://github.com/frmoded/forge-client-obsidian/blob/main/CLEAN-LAPTOP-SMOKE.md
   Expected: the file loads (no 404), renders with markdown formatting.

2. **Confirm the eight Phase headings appear in order with BRAT-path framing.** Scroll through the page. The first paragraph should explain the BRAT → Forge Installer path. Phases 2 ("Turn on Community plugins + install BRAT") and 3 ("Install Forge via BRAT → Forge Installer") should be the NEW install-path content. Phase 7 ("Music domain") and Phase 8 ("Freeze affordance") should still be present at the end before Failure modes.
   Expected: 8 phases total, install-path content is BRAT-based, no references to direct-zip download as a student-recommended path.

3. **Confirm the Greet snippet content in Phase 6.2 still renders as a code block.** Scroll to Step 6.2. The pasted snippet content (YAML + English + Python facet) is inside a fenced code block with a nested `` ```python `` fence.
   Expected: the snippet renders as code; the rest of the doc renders as normal markdown past Phase 6.2.

4. **Confirm Failure modes are keyed F1 through F9 with `(Phase X.Y)` prefixes.** Scroll to the `## Failure modes` section.
   Expected: 9 failure modes total (one more than the previous version due to the added BRAT-specific entry). F2/F3/F4 should be BRAT-specific. F5-F9 should reference the renumbered Phases 5-8.

### Failure modes to watch for

- **Step 2 — references to "the zip you downloaded" or `.obsidian/plugins/forge-client-obsidian/main.js` survive in step bodies** → leftover from the old version. Capture line numbers and we'll fix.
- **Step 3 — Greet code block renders broken** → nested fence escape issue (unchanged from the previous CLEAN-LAPTOP-SMOKE meta-smoke; same fix path).
- **Step 4 — Failure modes lack the `FN (Phase X.Y)` prefix** → drafting error; cross-check against §1.2 above.

### End-state cleanup

The document persists in the repo. Refresh per the doc's own Doc version pin + Revision history sections when future versions ship.
