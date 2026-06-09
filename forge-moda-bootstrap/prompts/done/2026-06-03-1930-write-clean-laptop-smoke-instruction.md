# Write `CLEAN-LAPTOP-SMOKE.md` — end-to-end validation instructions for a fresh laptop

## Scope

Author a new document `~/projects/forge-client-obsidian/CLEAN-LAPTOP-SMOKE.md` (alongside `INSTALL.md`) that walks a validator through every step of getting Forge working on a mint laptop — fresh OS user account, no Obsidian installed, no prior Forge state — with explicit expected outcomes at each step. The audience is the user (or anyone validating Forge before V1 closed-beta ship), running on a borrowed laptop or a fresh macOS user account.

The doc is the deliverable. CC writes it as a doc-only commit. No code changes.

What this prompt does NOT do:
- Replace or rewrite `INSTALL.md` (that's the canonical student-facing install guide; the smoke doc is a separate validator-facing document that may cross-reference INSTALL.md).
- Introduce new install paths (BRAT, install-latest.sh, forge-installer). The current closed-beta path per `INSTALL.md` is direct zip download. The smoke doc mirrors that — no historical paths.
- Cut a release.
- Add anything to `forge.toml`, `manifest.json`, or any other production file.

## Why

V1-audit item (aa): the onboarding flow on a dev machine masks gaps that closed-beta students will hit. Every prior smoke ran against the dev machine where `~/projects/forge-client-obsidian` exists, the install script's defaults happen to work, etc. A student's mint laptop has NONE of this. Before V1 closed-beta ships, the full onboarding must be validated on a fresh machine.

The document is the artifact that makes the smoke repeatable: anyone (you, a friend, future-you on a different machine) can pick it up and validate Forge end-to-end without re-deriving the gates from scratch each time.

## Files to create

- **`~/projects/forge-client-obsidian/CLEAN-LAPTOP-SMOKE.md`** — new file, top-level of the repo (alongside `INSTALL.md`).

## Files to read first (for accuracy)

CC reads these before drafting to keep the smoke aligned with current behavior:

- `~/projects/forge-client-obsidian/INSTALL.md` — source-of-truth for install steps; cross-reference verbatim where helpful.
- `~/projects/forge-client-obsidian/manifest.json` — current pinned version (should be v0.2.44 at drain time; CC reads to confirm).
- `~/projects/forge-client-obsidian/src/welcome.ts` — the v0.2.13 first-run UX + v0.2.38 auto-extract behavior. The smoke needs to reference what notices the user will see at first plugin load.
- `~/projects/forge-client-obsidian/src/main.ts` — registered commands (search for `addCommand` / Cmd-P entries) and the freeze-edge modal. The smoke needs to reference exact command names.
- `~/projects/forge-music/forge.toml` — current vault version (likely 0.3.8) for the music domain check.
- `~/projects/forge/tests/vault/greet.md` — the canonical greet snippet shape, to know what content to author in the smoke.

## Document structure

The doc follows the **User-side smoke checklist** quality bar from `cc-prompt-queue.md` (numbered prose paragraphs, no tables, copy-pasteable commands, expected outcomes per step, failure modes keyed by step). It's a longer document than a per-drain smoke because it covers the full onboarding arc, but the per-step shape is the same.

Suggested section structure (CC adjusts as needed):

### Top matter

- **Title + intent paragraph**: one paragraph explaining what the doc is for, who runs it, and the success criterion ("when you finish step N, Forge is fully validated for V1 closed-beta on this machine").
- **Pre-conditions**: list what the validator needs before starting — a mint laptop or fresh user account, internet, the transpile token (which they should have via email per INSTALL.md), the link to the v0.2.44 release zip.
- **Estimated time**: rough wall-clock estimate, e.g. "20-30 minutes if everything works; 1-2 hours if you hit issues."

### Phase 1 — Install Obsidian

- Step 1: download Obsidian from obsidian.md, expected version note.
- Step 2: launch Obsidian for the first time; expected first-run modal / vault picker.
- Step 3: create a new vault (suggest a name like `forge-clean-smoke`); expected state after.

### Phase 2 — Install the Forge plugin

- Mirror INSTALL.md's steps 1-4 verbatim (download zip, find plugin dir, unzip, enable). Each step has the expected-outcome assertion that INSTALL.md omits.
- Add explicit checkpoints: "if at this point you see X, the install is fine; if Y, see failure mode below."

### Phase 3 — Token setup

- Mirror INSTALL.md's "Token setup" section with explicit "expected" assertions.
- Step: paste token into Settings → Forge Client → Transpile service token. Expected: token field shows ●●●● (masked).

### Phase 4 — Verify base install

- Cmd-P → "Forge: Open MoDa simulation" (per INSTALL.md "Verifying it works"). Expected: panel opens with simulation canvas (per INSTALL.md's text).
- Optional: run the simulation; expected behavior.

### Phase 5 — Author + Forge-click a Greet snippet

- The load-bearing core workflow validation.
- Step: in the vault, create a new note `greet.md` (or similar) with the exact frontmatter + body shape from `forge/tests/vault/greet.md`. Quote the content verbatim in the doc so the validator can copy-paste.
- Step: Forge-click the snippet. Expected: an LLM round-trip happens (transpile token in play), Python facet generates, output panel shows `Hello world` (or whatever default).
- Failure mode references: token missing, network blocked, transpile service down.

### Phase 6 — Music domain (stretch but recommended for V1)

- Edit `<vault>/forge.toml`: add `domains = ["music"]`.
- Quit Obsidian completely (Cmd+Q, not Cmd+W — explain why) and reopen.
- Expected console log line on plugin load: `Forge: extracted forge-music into vault` (first install) OR `Forge: forge-music already at version 0.3.8; skipping` (if re-running).
- Expected file tree: `<vault>/forge-music/` directory with blues content, percussion content, lib.
- Open `forge-music/blues/song.md`. Forge-click. Expected: a rendered score appears in the output panel. Audio playback widget shows.
- Audio caveat: per v1-audit item (x), the SoundFont fetches from `storage.googleapis.com` on first play. Validator should NOTE this — it's a known closed-beta network dependency.

### Phase 7 — Freeze affordance (stretch but recommended for V1)

- In a snippet with `# Dependencies` and wikilinks (validator may need to add a `# Dependencies\n\n[[callee]]\n` block to a snippet manually per the v0.2.41 gotcha — cross-reference the doc-gotcha file if it exists by drain time).
- Right-click a wikilink in the body. Expected: "Forge: Freeze edge {caller} → {callee}" item in the context menu.
- Click it. Expected: Notice "Edge frozen" or similar. Subsequent Forge-clicks of the caller show stable output.
- Right-click → Unfreeze. Expected: Notice; subsequent Forge-clicks show fresh output again.

### Failure modes — keyed to specific steps

Aggregated section at the end (per protocol). Each entry: "Step N expected X but you see Y → likely cause Z; check W."

Examples to populate:
- Step 2 (first Obsidian launch) hangs: macOS Gatekeeper may be blocking the unsigned download; right-click the app → Open.
- Step 4 (find vault folder via Settings → About) shows no "Open vault folder": you may not have created a vault yet (Phase 1 step 3).
- Step 5 (token paste) field disappears after pasting: the input may be masked but not saved; click outside the field then re-open Settings to verify persistence.
- Step Phase-5-Forge-click produces `Error: transpile failed`: network blocked, token invalid, or transpile service down. Check devtools console; check token value; try a curl to the service URL.
- Step Phase-6 plugin reload doesn't show music auto-extract log: check `forge.toml` actually got saved with `domains = ["music"]`; check Obsidian actually fully quit (not just window closed).
- (etc — 6-8 entries total)

### End-state cleanup

- The smoke vault is reusable for re-smokes.
- The transpile token persists across vault reopens.
- Optional: delete `<vault>/forge-music.bak.*` directories if they accumulated from prior version drifts.

### Doc-internal version pin

- The smoke is pinned to a specific Forge version (v0.2.44 at drain time). When future versions ship, this doc needs an update — note that explicitly.

## Tests

### Auto-verifiable by CC

- `~/projects/forge-client-obsidian/CLEAN-LAPTOP-SMOKE.md` exists post-edit.
- The file is reasonably-sized (200-500 lines suggests good coverage; under 100 means missing sections; over 800 means over-written).
- Grep checks for the load-bearing identifiers:
  - `grep -c "v0.2.44" CLEAN-LAPTOP-SMOKE.md` ≥ 3 (version pinned in multiple places).
  - `grep -c "Cmd-P" CLEAN-LAPTOP-SMOKE.md` ≥ 1 (command palette reference expanded).
  - `grep -c "transpile" CLEAN-LAPTOP-SMOKE.md` ≥ 2 (token setup covered).
  - `grep -c "forge-music" CLEAN-LAPTOP-SMOKE.md` ≥ 2 (music domain covered).
  - `grep -c "Failure mode" CLEAN-LAPTOP-SMOKE.md` ≥ 1 (failure-modes section exists).
- No tables of steps anywhere (`grep -c "| Step |" CLEAN-LAPTOP-SMOKE.md` = 0).
- No BRAT references in install instructions (`grep -ic "BRAT" CLEAN-LAPTOP-SMOKE.md` = 0).
- `npm test` in forge-client-obsidian → unchanged (no code changes).

### Deferred to user

The smoke document IS the user-side smoke for this prompt. There's no separate smoke-of-the-smoke; the user will exercise the doc the next time they have a clean laptop to run it on.

Per the protocol's user-side-smoke rule, CC writes a §3 in the feedback with a meta-checklist: confirm the file landed, confirm sections N through M exist, etc. Lightweight since the doc IS the deliverable.

## Out of scope

- Modifying INSTALL.md (separate concern; if INSTALL.md needs the same explicit-outcome assertions, that's a future drain).
- Adding any code, tests, or production-file changes.
- Implementing a "smoke runner" script (the smoke is human-driven by design — clean-laptop validation can't be automated by CC).
- Replacing existing smoke checklists in feedback files.
- Touching `~/projects/forge-installer/` (forge-installer is not part of the current closed-beta path per current INSTALL.md).

## Don'ts

- **Don't reference BRAT** as an install path — it's not in the current closed-beta flow per INSTALL.md.
- **Don't reference `install-latest.sh`** — that's a dev convenience, not a student path.
- **Don't reference `forge-installer`** — historical meta-plugin not in current flow.
- **Don't use tables of steps.** Numbered prose paragraphs only.
- **Don't assume the validator remembers what Forge is.** First paragraph briefly orients (one sentence: "Forge is an LLM-augmented snippet authoring system delivered as an Obsidian plugin").
- **Don't cut a release** — doc-only commit + push.
- **Don't bump versions.**
- **Don't write the smoke as if running on the dev machine.** The whole point is fresh-machine validation; assume `~/projects/...` doesn't exist on the validator's laptop.

## Report when done

Standard feedback structure (doc-only, lightweight):

- **§0** — chosen doc path (`CLEAN-LAPTOP-SMOKE.md` top-level confirmed); single commit SHA; push branch; line count.
- **§1.1** — section headings of the new doc, in order.
- **§1.2** — any places where INSTALL.md was cross-referenced verbatim vs paraphrased; rationale for the choice.
- **§1.3** — N/A (no fix here, doc-only).
- **§2** — surprises during drafting: any place where INSTALL.md was ambiguous or where the actual welcome.ts / main.ts behavior didn't match what INSTALL.md implies. Flag any drift between INSTALL.md and current code (cowork may want to follow up).
- **§3** — User-side meta-smoke: confirm the doc landed at the right path, sections render correctly in GitHub's markdown preview, the failure-modes section is keyed to specific step numbers, no tables of steps. ~5 lightweight steps.
