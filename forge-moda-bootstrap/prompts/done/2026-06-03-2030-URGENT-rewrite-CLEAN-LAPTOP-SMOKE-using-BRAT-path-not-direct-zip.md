# URGENT — Rewrite `CLEAN-LAPTOP-SMOKE.md` to use the BRAT install path (not direct zip)

## Scope

The v0.2.44 `CLEAN-LAPTOP-SMOKE.md` shipped in commit `75264da` uses the **direct-zip-download** install path. This is **wrong**: the canonical closed-beta install path is **BRAT → `frmoded/forge-installer` → auto-downloads forge-client-obsidian → reload → paste token**, as documented in `~/projects/forge-moda-bootstrap/closed-beta-onboarding.md` and in `~/projects/forge-installer/README.md`. Rewrite Phases 2-4 (the install sections) of `CLEAN-LAPTOP-SMOKE.md` to match the BRAT path. Leave Phases 5+ (token, verify, greet, music, freeze) substantially intact — they don't depend on install path.

The original prompt (2026-06-03-1930) included a hard "don't reference BRAT" rule. **That rule was wrong** (cowork error, based on misreading INSTALL.md as the canonical student path when it's actually the manual/fallback). This correction prompt supersedes it.

What this prompt does NOT do:
- Touch any code, tests, or other production files.
- Cut a release.
- Modify `INSTALL.md` itself (separate question; INSTALL.md describes the manual fallback path which is valid for cohort operators / developers who can't use BRAT).
- Modify `closed-beta-onboarding.md` (the canonical student-facing doc; the smoke document derives from it, not the other way around).
- Touch the prompt's existing Phases 5 onward beyond cross-reference fixes (e.g., references to "the zip you downloaded in Phase 2" need to change to reference the BRAT-installed path, but the substantive Phase 5+ content stays).

## Why

`CLEAN-LAPTOP-SMOKE.md` as currently shipped will lead a validator through a non-canonical install path. A V1-ship gate validation that doesn't exercise the canonical student path provides false confidence — the path students actually take goes untested. Cowork (forge-core) error in the original 1930 prompt; correcting now before anyone runs the bad smoke.

## Files to modify

- **`~/projects/forge-client-obsidian/CLEAN-LAPTOP-SMOKE.md`** — rewrite Phases 2-4 (the install sections) per the BRAT path detailed below. Adjust cross-references in Phases 5+ as needed.

## Files to read first (for accuracy)

- `~/projects/forge-moda-bootstrap/closed-beta-onboarding.md` — the canonical student-facing install doc. The smoke's BRAT-path sections derive from this. Read sections 3.1 through 3.4 verbatim; the smoke's install steps mirror these with added expected-outcome assertions.
- `~/projects/forge-installer/README.md` — confirms BRAT path is the production flow ("One-paste BRAT-installable bootstrap"); also names the Notices the user sees during install ("Forge Installer: downloading v0.X.Y …" then "Forge Client installed — fresh → vX.Y.Z").
- `~/projects/forge-installer/src/` (skim) — confirm the actual Notice strings + the commands registered (e.g., "Check for Forge Client updates now").

## Rewrite spec

### Phase 2 — currently "Get the Forge plugin zip", rewrite to "Turn on Community plugins + install BRAT"

Mirrors closed-beta-onboarding §3.1 + §3.2. Numbered steps:

- Step: open Settings → Community plugins.
- Step: if "Turn on community plugins" button present, click it; accept warning.
- Step: Browse → search "BRAT" → install "Obsidian42 - BRAT" → enable.

Expected outcomes per step (BRAT install completes, plugin appears in Installed list with toggle ON).

### Phase 3 — currently "Find Obsidian's plugin directory" (irrelevant for BRAT path), rewrite to "Install Forge via BRAT → Forge Installer"

Mirrors closed-beta-onboarding §3.3 + §3.4. Numbered steps:

- Step: Cmd-P → **BRAT: Add a beta plugin to install** → paste `frmoded/forge-installer` → confirm.
- Step: wait for "Forge Installer: downloading v0.X.Y …" Notice (~few seconds).
- Step: wait for "Forge Client installed — fresh → vX.Y.Z" Notice (~10-30 seconds).
- Step: Cmd-P → "Reload app without saving" → confirm both Forge Installer AND Forge Client appear in Settings → Community plugins with toggles ON.

Expected outcomes per step + a footnote about GitHub rate-limit retry via "Check for Forge Client updates now" command (per forge-installer README's "Re-running" section).

### Phase 4 — currently "Install the Forge plugin" (now redundant), DELETE this phase entirely

The BRAT path handles install via Phase 3. Renumber subsequent phases (originally 5-9) to 4-8.

### Phases 4-8 (formerly 5-9) — substantive content stays

These phases (Token setup, Verify base install, Author + Forge-click Greet, Music domain, Freeze affordance) don't depend on install path. Keep their substantive content. The only changes:

- Cross-reference updates: any reference to "the zip you downloaded" or specific paths under `Downloads/` should be removed.
- Pre-conditions block at top updates: remove "the v0.2.44 release zip" line; replace with the transpile token requirement only.
- Version pinning: since BRAT installs latest by default (and forge-installer can pin via its settings tab), soften the "pinned to v0.2.44" framing — the smoke targets "current latest stable" with v0.2.44 as the floor. The validator can pin to a specific version via Forge Installer's settings tab if they want cohort-consistency.

### Failure modes section update

Add new failure modes for the BRAT-specific gates:

- BRAT install fails (Obsidian version too old; spelling mismatch).
- Forge Installer downloads but "Forge Client installed" Notice never appears (GitHub API rate-limit; retry via "Check for Forge Client updates now").
- After reload, Forge Client doesn't appear in Installed plugins (partial unzip; re-run Forge Installer update flow).

Remove failure modes that were specific to the direct-zip path (steps about finding `.obsidian/plugins/`, manual unzip issues, etc.).

### Doc header note

Add a "Revision history" footnote at the bottom:

> **2026-06-03**: rewrote Phases 2-4 to use the canonical BRAT → Forge Installer install path. Earlier version (commit `75264da`) used direct-zip download which is the manual/fallback path, not the student flow.

## Tests

### Auto-verifiable by CC

- `~/projects/forge-client-obsidian/CLEAN-LAPTOP-SMOKE.md` line count stays within 200-500 (target band; the BRAT path is shorter than direct-zip so net change is likely a decrease).
- Grep checks for the corrected identifiers:
  - `grep -ic "BRAT" CLEAN-LAPTOP-SMOKE.md` ≥ 4 (BRAT is referenced in multiple Phase 2-3 steps and failure modes).
  - `grep -c "forge-installer" CLEAN-LAPTOP-SMOKE.md` ≥ 3 (the plugin name appears in install steps, settings reference, failure modes).
  - `grep -c "Forge Installer: downloading" CLEAN-LAPTOP-SMOKE.md` ≥ 1 (verbatim Notice from forge-installer README).
  - `grep -c "Cmd-P|Cmd+P" CLEAN-LAPTOP-SMOKE.md` ≥ 2 (BRAT command palette + reload command).
  - `grep -c "transpile" CLEAN-LAPTOP-SMOKE.md` ≥ 2 (token setup phase intact).
  - `grep -c "forge-music" CLEAN-LAPTOP-SMOKE.md` ≥ 2 (music phase intact).
  - `grep -c ".obsidian/plugins/forge-client-obsidian/" CLEAN-LAPTOP-SMOKE.md` should DROP relative to commit 75264da (most refs to the manual install path go away; only the post-install data.json reference might remain).
  - `grep -ic "download.*zip\|unzip\|\.dmg" CLEAN-LAPTOP-SMOKE.md` should drop substantially (only Obsidian's `.dmg` in Phase 1 stays).
  - `grep -c "| Step |" CLEAN-LAPTOP-SMOKE.md` = 0 (no tables of steps).
- `npm test` in forge-client-obsidian → unchanged (no code changes).

### Deferred to user

Per protocol, CC writes the user-side smoke checklist in §3 of the feedback. For this drain it's a meta-smoke: confirm the rewrite landed, sections render correctly in GitHub markdown preview, install path is BRAT throughout.

## Out of scope

- Modifying `INSTALL.md` (which is the manual fallback path for cohort operators / developers — separate concern; if INSTALL.md needs alignment with closed-beta-onboarding.md that's a future drain).
- Touching `closed-beta-onboarding.md`.
- Adding any code, tests, or production-file changes.
- Modifying forge-installer.

## Don'ts

- **Don't preserve any reference to "direct zip download" as a student-recommended path.** It's the manual fallback for operators, not for students; the smoke document is for V1-ship validation of the student path.
- **Don't add `install-latest.sh` references** — that's a dev convenience for the dev machine, separate from both BRAT and direct-zip.
- **Don't pin to v0.2.44** rigidly in the rewritten install sections — BRAT pulls latest by default. Mention the version in the pre-conditions as "current minimum v0.2.44 expected" and let BRAT/forge-installer fetch latest.
- **Don't use tables of steps.** Numbered prose paragraphs only (existing doc already complies; preserve).
- **Don't cut a release** — doc-only commit + push.
- **Don't bump versions.**

## Report when done

Standard feedback (doc-only, lightweight):

- **§0** — single commit SHA; push branch; line count before/after (target: 200-500 band post-rewrite).
- **§1.1** — section headings of the rewritten doc, in order.
- **§1.2** — diff summary: which phases were rewritten, which were preserved, which deleted.
- **§1.3** — N/A (no fix, doc rewrite).
- **§2** — surprises during the rewrite: any drift discovered between `closed-beta-onboarding.md` and `forge-installer/README.md` (e.g., one mentions a Notice the other doesn't); any awkward cross-references that needed careful handling.
- **§3** — minimal user-side meta-smoke: confirm rewrite landed, install path is BRAT throughout, GitHub markdown preview renders correctly.
