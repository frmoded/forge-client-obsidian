# Redo the user-side smoke checklists for v0.2.40 and v0.2.41 per the tightened "User-side smoke checklist" protocol

## Scope

Amend the two most-recent feedback files to replace their existing `§3 Smoke` sections with new checklists that follow the expanded **User-side smoke checklist** quality rules in `cc-prompt-queue.md` (rules 1-10, "write for a user who's been awake sixteen hours" paragraph, and the reference-example shape). No code changes. No new commits required (these are doc edits to feedback files).

Feedback files to amend:
1. `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-03-0000-URGENT-freeze-broken-snapshot-capture-missing-in-pyodide.md` — v0.2.40 engine-side auto-qualify fix.
2. `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-03-0100-freeze-via-wikilink-and-graph-view.md` — v0.2.41 wikilink-context-menu freeze.

What this prompt does NOT do:
- Re-run the smoke (the user does that with the new checklists).
- Modify the engineering sections (§0, §1.1–§1.5, §2) of either feedback file. Only §3 (or wherever the smoke checklist lives) gets replaced.
- Touch any code or production files.
- Cut a new release.

## Why

The smoke checklist that landed in the v0.2.41 feedback uses a 6-row table (step / what / expected outcome) packed with jargon ("BRAT update," "DevTools," "Cmd+Q (not Cmd+W)") and assumes the reader remembers the install path, the manifest path, and four independent surfaces for version checks. This is too dense for a tired user.

Concrete style problems with the existing v0.2.41 §3:

- Step 1 ("Trigger BRAT update") is the wrong install path. The project uses `scripts/install-latest.sh`, not BRAT. BRAT only updates `main.js/manifest.json/styles.css` and not `assets/` — wrong for any release that changes bundled content. (v0.2.41 happened to be JS-only, so BRAT would have worked for THIS release, but the smoke-as-written normalizes the wrong path.)
- Step 0a is "Baseline version check via DevTools" with the action embedded in a code cell as `app.plugins.plugins['forge-client-obsidian'].manifest.version`. No instruction to OPEN DevTools first. No expansion of "DevTools." A distracted user has to figure out the prerequisite gesture from context.
- Step 3 is "Four independent version checks — pick at least two" with the four crammed into one cell. This is a decision the user shouldn't have to make.
- Tables are the wrong format for sequential walkthroughs.

The user explicitly flagged this style as harder to follow than the prose-paragraph format with explicit Action / Expected Outcome / Interpretation per step. The cowork-side reviewer's freeze-edge checklist (mid-conversation, pre-protocol-amendment) is the target shape.

## Files to modify

Two feedback files (paths above). No other files.

## Implementation notes

### Step 1: Re-read `cc-prompt-queue.md`

Specifically the "User-side smoke checklist — CC's deliverable, not cowork's (HARD RULE)" section, including:
- The "write for a user who's been awake sixteen hours" framing paragraph.
- The 10 numbered quality requirements.
- The reference-example block (the v0.2.41-style smoke that the protocol points at as the target shape).

This is the protocol that the new checklists must conform to.

### Step 2: Read the existing feedback files

Specifically the engineering sections (§0–§2) so the new §3 references the right paths, behaviors, and version numbers. The new checklist exercises what shipped — not what the prompt asked for.

### Step 3: Read `scripts/install-latest.sh`

Header comment + first ~60 lines. Confirm the script's interface (`VAULT=...` env var, `TAG=v0.2.X` override, default vault path, what it preserves vs replaces). The new checklist invokes this script for installation in place of any BRAT references.

### Step 4: Read `welcome.ts:ensureBundledVault` (or the post-v0.2.38 equivalent)

Specifically the console-log lines emitted on plugin load:
- Match case: `Forge: forge-music already at version 0.3.8; skipping`.
- Drift case: `Forge: forge-music drift detected (extracted 0.3.X → bundled 0.3.Y); backing up + re-extracting`.
- Both messages are part of the smoke's expected console output. The new checklist references these verbatim where relevant.

### Step 5: Write the new §3 for the v0.2.40 URGENT feedback file

Replace whatever currently lives at §3 (smoke section) with a fresh checklist following the 10 quality requirements. Cover:

- Install v0.2.40 via `install-latest.sh`.
- Open `smoke-v0.2.13` vault; expected console log line about forge-music (or noop if not music-relevant).
- Forge-click `hello_random.md` 2-3 times → confirm randomness baseline.
- Cmd+P → Freeze edge → caller=`hello_random`, callee=`random_name` (bare IDs — the bug was that this failed pre-v0.2.40).
- Confirm success Notice (no PythonError this time — the engine-side auto-qualify fix took effect).
- Forge-click `hello_random.md` 2-3 more times → confirm SAME output across calls (freeze took effect).
- Unfreeze → confirm randomness restored.
- On-disk verification: snapshot file at `~/forge-vaults/smoke-v0.2.13/.forge/edges/authoring/hello_random/authoring/random_name.md` exists with `state: frozen` (or `live` post-unfreeze).
- Failure modes section keyed by step.

The bug-fix-prompt exception applies: the first step (after pre-conditions) reproduces the exact failure the user originally reported (Cmd+P → Freeze edge → bare IDs → PythonError) and asserts the fix took effect (Notice instead of PythonError).

### Step 6: Write the new §3 for the v0.2.41 wikilink feedback file

Same shape, exercising the wikilink context-menu surface. Cover:

- Install v0.2.41 via `install-latest.sh`.
- Open `hello_random.md` in `smoke-v0.2.13`.
- Right-click on the `[[random_name]]` wikilink in the body.
- Confirm context menu shows "Freeze edge" / "Unfreeze edge" items (in addition to Obsidian's standard items).
- Click "Freeze edge" → confirm Notice → confirm Forge-click produces identical output across re-runs.
- Click "Unfreeze edge" → confirm randomness restored.
- Negative case 1: right-click a wikilink in a non-snippet markdown note → confirm freeze items DO NOT appear.
- Negative case 2: right-click a wikilink whose target isn't a known snippet → confirm freeze items DO NOT appear.
- Failure modes section keyed by step.

Both new §3 sections must include a top-of-checklist note: "Supersedes the prior §3 in this file per protocol update 2026-06-03; preserved git history shows the original table-format version."

### Step 7: Spot-check against the reference example

Before submitting feedback (which for this prompt is the amended feedback files themselves), CC reads through each new §3 and verifies:

- [ ] Numbered steps in execution order, no table-of-steps anywhere.
- [ ] Each step has Action + Expected Outcome explicitly (Interpretation where load-bearing).
- [ ] Pre-conditions section at top names terminal/cwd/Obsidian-state/vault prerequisites.
- [ ] `install-latest.sh` is used, NOT BRAT.
- [ ] Auto re-extract console log lines referenced verbatim where the smoke crosses a bundled-vault load.
- [ ] Outcomes are specific and observable (no "it works," "look for success," etc.).
- [ ] Concrete paths and identifiers (no "the vault," "the freeze command").
- [ ] "Failure modes to watch for" section at end, keyed by step number.
- [ ] End-state cleanup section if there are persistent artifacts (snapshot files left behind).
- [ ] Acronyms expanded on first use (`Cmd+Opt+I` macOS, what DevTools means, why Cmd+Q vs Cmd+W matters if mentioned).
- [ ] Reads as if writing for a tired distracted reader.

## Tests

### Auto-verifiable by CC

- Both feedback files exist post-edit.
- Both feedback files contain a `## §3` (or `## §3 User-side smoke checklist`) section after the edit.
- The new §3 sections do NOT contain the strings `BRAT` (case-sensitive) or `| Step |` (table separator) or `manifest.version` (the DevTools-incantation style) in their step bodies — quick grep checks that the rewrite landed.
- Both new §3 sections DO contain the string `install-latest.sh` (the canonical install path).

### Deferred to user

The user reads both new §3 sections and runs them. The point of this prompt is to produce better checklists for the user to execute; running them is the user's job.

## Out of scope

- Modifying any code, tests, or production files.
- Cutting a new release.
- Touching the prompt files themselves (`prompts/done/2026-06-03-0000-...` and `prompts/done/2026-06-03-0100-...`).
- Updating §0–§2 or §1.1–§1.5 of the existing feedback. Only §3 (smoke section) is replaced.

## Don'ts

- **Don't ship a smoke checklist using BRAT.** Wrong install path; the project uses `install-latest.sh`.
- **Don't ship a table-format step list.** Numbered prose paragraphs only.
- **Don't omit the auto re-extract console log lines.** If the smoke crosses a plugin-load that should trigger or skip auto-re-extract, the smoke must reference the expected log line verbatim.
- **Don't assume the reader remembers what was in the prior smoke version.** The new §3 is self-contained.
- **Don't pre-spec failure modes that weren't observed.** The "Failure modes to watch for" section should be plausible-but-not-fanciful. Keep it to 3-5 entries per checklist.

## Report when done

This prompt's feedback file is itself short — the deliverable is the two AMENDED feedback files, not new artifacts. Standard §0–§1 lightweight:

- **§0** — paths of the two amended feedback files; SHA of the commit that contains the amendments (single commit acceptable; commit message references both files).
- **§1** — brief description of what was rewritten in each (one sentence each).
- **§2** — anything surprising during the rewrite. Specifically: did the existing §0–§2 of either feedback file contain enough engineering detail to reconstruct the smoke without guessing? If not, flag the gap for cowork.
- **§3** — N/A for this prompt (the prompt's deliverable IS the §3 sections elsewhere).
