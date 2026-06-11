# Claude Code — Prompt Queue Convention

Standing instruction. Read this once per session. When invoked with any of the trigger phrases below, follow the protocol exactly.

## Directories

- **Queue (work to do):** `/Users/odedfuhrmann/projects/forge-moda-bootstrap/prompts/`
- **Feedback (reports back, parallel to prompts):** `/Users/odedfuhrmann/projects/forge-moda-bootstrap/prompts/feedback/`
- **Done (successfully completed prompts):** `/Users/odedfuhrmann/projects/forge-moda-bootstrap/prompts/done/`
- **Failed (CC tried, hit a blocker):** `/Users/odedfuhrmann/projects/forge-moda-bootstrap/prompts/failed/`
- **Questions (CC needs disambiguation):** `/Users/odedfuhrmann/projects/forge-moda-bootstrap/prompts/questions/`

Create any missing directories on first invocation.

## Trigger phrases

- `do prompt` / `run prompt` / `next prompt` — process exactly **one** prompt (the oldest).
- `drain prompts` / `do all prompts` — process every pending prompt in oldest-first order, one at a time, stopping only when the queue empties OR a prompt lands in `failed/` or `questions/`.

Any other invocation: behave normally. Do NOT touch the queue unless triggered.

## Per-prompt protocol

1. **Pick.** List `.md` files in `/Users/odedfuhrmann/projects/forge-moda-bootstrap/prompts/` (top level only — do NOT recurse into `feedback/`, `done/`, `failed/`, `questions/`). Sort lexicographically. The first one is the oldest. If the directory has no `.md` files, report `queue empty` and stop.

2. **Read.** Read the prompt file in full. Treat its contents as the complete instruction.

3. **Implement with bias to action.** Do the work. Where the prompt is underspecified, make a reasonable judgment call and **document the assumption** in the feedback file under a "Assumptions" section. Do NOT pause to ask the user mid-prompt unless the ambiguity is genuinely blocking (in which case, route to `questions/` per step 6).

4. **Write feedback.** Create `/Users/odedfuhrmann/projects/forge-moda-bootstrap/prompts/feedback/<same-filename>.md`. Start with a header block:

   ```
   ---
   timestamp: <ISO-8601 UTC>
   session_id: <CC session id if available, else "unknown">
   prompt_modified: <ISO-8601 UTC of the prompt file's mtime>
   status: success | aborted
   ---
   ```

   Then the standard CC report: files modified with line counts, test results, diffs of key changes, deviations from spec, follow-ups noted but not built. Use the prompt's own "Report when done" section if it specifies a shape; otherwise default to the above.

   **Post the same report in chat.** The feedback file is the durable record; the chat message keeps the user in the loop in real time. Both must contain the full report — do NOT summarize in chat and say "see feedback file." Repeat the content. The chat post is the final message of the prompt-queue cycle before stopping (or before picking up the next prompt in drain mode).

   **On retry** (same prompt file resurfaces in the queue after being moved back from `failed/` or `questions/`): **append** a new header + report block to the existing feedback file — do NOT overwrite. Preserves the trail of what failed and what changed. The chat post for a retry is just the new run's report, not the full appended history.

5. **Move on success.** `git mv` (or plain `mv` if the prompt folder isn't a git repo) the prompt from `prompts/` to `prompts/done/`. The feedback file stays in `prompts/feedback/`.

6. **Move on failure or ambiguity.**
   - **`failed/`** — CC tried and hit a blocker that requires user action to resolve (broken test, missing dependency, environment issue, code in unexpected state). Move the prompt to `prompts/failed/`. Prefix the feedback header's `status:` field with `aborted`. The feedback body explains the blocker concretely.
   - **`questions/`** — CC could proceed but needs disambiguation from the user (spec contradicts code state, two valid interpretations, etc.). Move the prompt to `prompts/questions/`. Status `aborted`. Feedback body lists the specific questions.

   In both cases the prompt **leaves** `/prompts/` so the next "do prompt" doesn't re-pick it.

7. **Retry semantics.** When the user resolves the issue and moves a prompt back from `failed/` or `questions/` to `prompts/`, the next "do prompt" picks it up like any other. Feedback file appends rather than overwrites (step 4).

## TDD discipline for bug-fix prompts (HARD RULE)

For any prompt whose purpose is "find and fix bug X" — including investigation prompts, regression hotfixes, and any prompt where a failing user-side smoke motivates the work — TDD is mandatory:

1. **Write a failing test first** that reproduces the bug against current code. Add it to the suite (`src/<name>.test.ts` for plugin/installer; `tests/<name>.py` for engine).
2. **Run the test.** Confirm it fails.
3. **Implement the fix.**
4. **Re-run the test.** Confirm it now passes.
5. **Run the full suite** (`npm test`, `pytest -q`, etc.). Confirm no regressions.
6. **In feedback, use a fixed section structure** so the user knows where to look:
   - **§1 = TDD continuity.** Header reads "TDD discipline (HARD RULE compliance — all 5 checkpoints)".
   - **§1.1** = list of test cases added pre-fix.
   - **§1.2** = verbatim pre-fix run output (the failing test's output, copy-pasted from terminal, including the `tests N pass M fail K` lines).
   - **§1.3** = the fix itself: commit hash + inline code-block diffs of the load-bearing changes. Don't make the user run `git show` to see the fix — paste the before/after snippets directly so the chat-side review can verify shape without context-switching. For pure rename / mechanical refactors a one-sentence description plus the commit hash is enough; for behavioral fixes (the common case), inline diff is mandatory.
   - **§1.4** = verbatim post-fix run output (same tests, all passing now).
   - **§1.5** = full-suite output post-fix (the `ℹ tests N`/`ℹ pass M` block from `npm test`'s tail).

   Don't summarize. Paste raw terminal output. The user runs the same commands locally to verify; if the feedback uses prose like "all 4 cases pass" instead of the actual terminal block, the user can't cross-check without re-running.

**If the failing test passes against current code** — the bug isn't where the prompt hypothesized. Do NOT ship a speculative fix. Either pivot to investigate elsewhere or ship diagnostic instrumentation only. Report the pivot decision explicitly. v0.2.16 validated this pattern (refuted a wrong parser hypothesis in ~700ms, saved a wasted release).

**Investigation-before-design for non-obvious bugs (default, overridable).** When the failure mode isn't obvious from the symptom — e.g., wrong output that could plausibly come from any of three subsystems, library-level behavior whose mechanism is unclear, a quirk where the prompt's literal suggested fix and the actual mechanism might diverge — ship the **investigation step as its own commit before the fix commit**. The investigation commit captures concrete data (inspection script output, library introspection, source-line citation of the actual mechanism), and the fix commit's design follows from that data, not from speculation. If investigation findings contradict the prompt's literal suggested mechanism, the findings win — document the divergence prominently in §2 of the feedback. v0.2.35 (MuseScore percussion-staff fix: investigation isolated the bug to `m21ToXml.py:2801-2810` before designing the monkey-patch) and the v0.2.33 drums spike (MusicXML inspection script pre-answered 2 of 3 unknowns before user eyeball) both validated this pattern. **Sub-pattern: for rendering / output-format spikes, the format-inspection script ships in the same drain as the artifact itself, so the spike report can pre-answer questions the user would otherwise have to manually verify.**

**Override**: the cowork-side prompt can explicitly opt out with phrases like "skip investigation step — symptom is clear" or "the cause is X, just apply fix Y." When opted out, CC proceeds straight to fix-and-test per TDD discipline. The override exists because investigation-first is a defensive practice — it pays off for non-obvious bugs but adds friction for obvious ones, and the cowork has more context than CC about which case applies. In tribute to the gods of speed: when in doubt about whether a bug is "obvious enough" to skip investigation, the prompt's call wins.

**Tests must invoke the production code path, not simulate it from outside.** When a fix is plumbing-only (event hook, debounce, retry, refresh helper), the test must call the plumbing directly — not the end-user surface the plumbing serves. v0.2.18 case (d) was correctly modified during fix application to call `_forge_sync_user_file` instead of bypassing the production hook via `py.FS.writeFile`. When the cowork-side prompt's "preserve the failing test exactly" instruction conflicts with this rider, the rider wins; explain the deviation in feedback.

**Test fixtures that "mirror" production code MUST either dynamically load the production source OR have a static drift-check that fails the suite on divergence.** Inline "verbatim copies" of production Python blocks, helper functions, or shell command strings inside test files are a known drift trap (v0.2.22 was the canonical failure: CC's test fixture defined `_forge_run_snippet` with the correct 4-arg signature claiming to mirror production, but production was the 3-arg buggy version. Suite tests passed against fixture; production stayed broken). When a test needs to exercise inline Python (like the `_forge_*` block in `src/pyodide-host.ts`), the test must either: (a) read the source file at test-start and regex-extract the literal block to feed into Pyodide, or (b) include an explicit string-comparison assertion that fails fast when the fixture diverges from the named lines in the source file. Option (a) is preferred because it makes drift mechanically impossible; option (b) is acceptable when (a) is impractical. The "drift-protection NOTE" comment alone is insufficient — comments aren't checked by the build, and humans don't catch every line-level divergence during code review.

## Test-infrastructure conventions

`node --test` resolves the full import graph of any test file before running. The `obsidian` package on npm is a **types-only stub** — it has no runtime entry point. Any production file that does `import { Plugin, TFile, Notice, requestUrl } from 'obsidian'` will, when transitively imported by a test file, throw `ERR_MODULE_NOT_FOUND` at the test boot step.

This forces a layering convention. **The convention** (validated across 8 extractions in the v0.2.x arc: `closed-beta-ux.ts`, `forge-installer/version.ts`, `forge-installer/zip-paths.ts`, `forge-installer/enable-strategy.ts`, `copy-dir-core.ts`, `forge-toml-stub.ts`, `forge-music-gate.ts`, `memfs-sync-paths.ts`):

- **Pure-core file (`src/<helper-name>.ts` or `src/<helper-name>-core.ts`)**: contains the testable logic. NO imports from `obsidian`. Imports only from other pure-core files, stdlib, or pure-TS deps (fflate, etc.). Define structural-interface types locally for anything the helper consumes (e.g. `CopyAdapter`, `TomlStubAdapter` — narrow shapes the Obsidian `DataAdapter` happens to satisfy at runtime).
- **Obsidian-coupled glue file**: imports from `obsidian`, calls into the pure-core helper. Re-exports the helper if external call sites need it. No test file imports this glue.
- **Test file (`src/<helper-name>.test.ts`)**: imports ONLY from the pure-core file. Constructs stub adapters that satisfy the structural interface. Tests run cleanly under `node --test` without any Obsidian shim.

**When to extract**: whenever a piece of logic in an obsidian-coupled file is non-trivial enough to test. Threshold is approximately "more than one branch" or "more than one observable side-effect." Below that, manual smoke suffices. Above it, extract.

**Naming**: prefer `<concept>-core.ts` when the helper is the kernel of a feature (e.g. `copy-dir-core.ts`); plain `<concept>.ts` when the helper is the whole thing (e.g. `forge-music-gate.ts`). Either is acceptable; pick the one that reads better in import paths.

**Structural adapter types**: when a helper takes a `DataAdapter`-ish param (read/write/exists), declare a narrow interface inline:
```typescript
export interface ForgeAdapter {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
```
Tests construct an in-memory stub satisfying this interface. The real `app.vault.adapter` happens to satisfy it at runtime. If the count of distinct narrow adapter types grows past ~10 across the codebase, consolidate to a single `MinimalAdapter` union — until then, narrow per-helper is clearer.

**Python docstrings inside JS template literals must not use backticks for inline code marks.** Backticks terminate the outer JS template literal mid-Python and produce confusing build errors. Use single quotes (`'inputs'`, `'{}'`) or restructure the docstring to avoid inline-code marks. Hit twice during the v0.2.x arc (v0.2.20 and v0.2.23); codified here to prevent a third occurrence. If CC's mid-drain build fails with a template-literal parse error inside `src/pyodide-host.ts` or similar, the backtick trap is the first thing to check.

**If a prompt introduces a "bundle-subset" pattern — a release artifact that's a curated subset of a source-of-truth somewhere else in the monorepo — the same prompt MUST also ship the drift-detection tooling.** Not "ship the bundle now, add drift detection when it bites later." Both land in one prompt. The tooling includes (1) a source-to-bundle sync script (idempotent, logs changed files), AND (2) a release-pipeline preflight that fails the build on drift with an actionable hint pointing at the sync script. The v0.2.13 plugin engine bundle waited 17 releases before drift detection shipped at v0.2.30, during which 5 files of silent drift accumulated. None caused user-visible bugs but the principle "bundle = source-of-truth subset" was silently violated for 17 releases. Future bundle-subset patterns — vault content sync (v1-audit item j), additional wheel-bundling beyond music21, any plugin asset with a monorepo-source-of-truth — must come with their drift-detection in the same prompt.

**Open infrastructure question** (deferred to v0.3.x / v1.0 audit): a shared `src/test-support/obsidian-shim.ts` that stubs `TFile`, `Plugin`, `Notice`, `requestUrl`, etc. just enough for `node --test` to resolve imports from obsidian-coupled files directly. Would eliminate the per-helper extraction overhead for cases where the production code naturally lives near Obsidian APIs (e.g. plugin class methods). Not closed-beta scope; flagged for v0.3.x infrastructure work in the v1.0 retrospective.

When CC hits the obsidian-import boundary mid-drain, the default response is: extract per the convention above. If a particular drain feels like it would benefit MORE from the shim approach than the extraction approach (e.g. testing a plugin class method that calls 5+ obsidian APIs and would require 5+ extractions), flag it in feedback as a shim-candidate for v0.3.x — don't try to build the shim mid-drain.

The pattern across v0.2.16 / v0.2.17 / v0.2.18 / v0.2.19: write the test → run it → either it refutes the hypothesis (pivot, no fix shipped) or it locks in the bug (apply fix with confidence + permanent regression test). Both outcomes are useful; both are cheap. Front-loaded test cost: ~30 minutes. Saved release-cycle cost: hours.

## Test discipline for NEW-FEATURE prompts (not the same as bug-fix)

TDD-failing-first is the bug-fix rule. For new features (introducing a helper, adding a UI affordance, extending an API), the discipline is different:

- **Tests are still required before declaring done.** Skipping tests because "it's a new feature, there's no bug to reproduce" is not acceptable. Every non-trivial helper, every new wire-format field, every new event hook gets a corresponding pure-core test (extracted per the pure-core convention in the previous section).
- **Failing-first ordering is NOT mandatory.** With new features there's no pre-existing bug to lock in; the "failing test" against not-yet-existent code is just a module-not-found error, which validates nothing. Write the tests incrementally as the feature takes shape, or write all tests after the helper is drafted and before the wiring lands.
- **Coverage target: every observable behavior in the feature spec.** If the prompt says "the helper should handle empty input by returning X," there's a test for that. If the prompt says "the helper preserves declared-first ordering," there's a test for that. Don't fake coverage by testing only the happy path.
- **CC has authorization to decide test scope autonomously for new-feature prompts.** Bug-fix prompts have the hard TDD-checkpoints structure (§1.1 through §1.5); new-feature prompts have a freer test-section shape but still report what was tested and how many cases passed. CC: when in doubt, err toward more coverage — extraction is cheap, future regressions are not.

The boundary is clear in practice: if the prompt describes a known-broken behavior to fix, it's bug-fix (failing-first mandatory). If the prompt describes new capability that doesn't exist yet, it's new-feature (tests mandatory before done, not failing-first).

**Include "no-op should remain no-op" assertions in any test set that exercises an idempotent helper.** When the fix produces an idempotent operation (writeGeneratedCode → MEMFS sync, frontmatter reconciliation, registry refresh, etc.), the bug-fix test alone catches the broken case landing, but doesn't catch a future refactor that turns the fix into its own bug — e.g., "always write the inferred list" instead of "write only when inferred differs from current" would silently churn every file on every Forge-click. Adding one assertion that calls the helper with matching input + asserts the side-effect didn't fire is cheap (~3 lines) and prevents the regression. v0.2.24's test case 3 ("matching current + inferred is a no-op") is the canonical example.

## Smoke automation — maximize what CC verifies, minimize user round-trips

**Default stance:** automate every smoke step you possibly can. The user's wall-clock time is the bottleneck; CC's compute time is cheap by comparison.

For any prompt that has a "Manual smoke" or "Tests" section, before declaring success:

- **Run all builds.** `npm run build`, `npx vite build`, `pytest`, `node --test`, whatever the change calls for. Build failure = not shipped, fix and re-verify.
- **Run all tests.** Don't just claim tests pass — actually run them, paste the pass count in the feedback.
- **Check artifacts on disk.** `ls`, `du -sh`, `head`, `grep` to confirm files landed where expected with the expected shape. Don't trust "the build should have done X" — verify.
- **Hit endpoints with curl.** When a change affects an HTTP path, exercise it from the sandbox. Confirm response codes and JSON shapes.
- **Diff against spec.** When the prompt says "should produce X output," run the path and compare.
- **Verify outputs of build scripts** by running them in the sandbox and inspecting the result. Don't ship a "release zip script" without running it and listing the resulting zip's contents.
- **Run smoke-equivalent unit/integration tests** when they exist. If the prompt's manual smoke maps cleanly to an existing test fixture, run that fixture too as a stand-in.

- **Push EVERY assertion that doesn't require Obsidian UI into the suite.** This is the load-bearing rule that maximizes what CC verifies and minimizes user wall-clock. For any prompt that's not pure docs, add tests that exercise the production code path end-to-end as close to the user-visible UX as the suite environment allows. Examples:
  - User-visible: "click Forge → modal opens with `name` field → type value → Run button → result renders in panel." The UI parts can't be tested. But CC CAN simulate at suite level: mount fake user vault → write Greet.md content → call `_forge_get_input_names` → assert `["name"]` → call the compute helper with kwargs `{name: "world"}` → assert stdout `"hello world\n"`. That's 100% of the UX value-chain except the literal DOM click.
  - User-visible: "after vault.on('modify') hook fires, Pyodide sees fresh body." The Obsidian event itself can't fire in `node --test`, but CC CAN simulate by calling the production hook handler directly with a fake `TFile`-like argument and then asserting `_forge_get_input_names` sees the new content.
  - User-visible: "BRAT installs the plugin and v0.2.X loads." The Electron+BRAT path can't run, but CC CAN unzip the release artifact into a temp directory, verify the file layout matches what forge-installer would produce, and call `_forge_get_input_names` against the bundled engine.

  The default stance: every line of "the user does X, then Y" in the prompt's manual smoke section should have a corresponding suite-level assertion exercising the same code path. The only lines that stay user-side are visual rendering, Obsidian's plugin-loading lifecycle, and user-input event flow. Push hard on what can be simulated.

**What CC CANNOT verify** (these stay in the user's smoke list):
- Live Obsidian UI behavior (no Obsidian instance in CC's sandbox).
- Plugin loading in Electron, iframe rendering inside Obsidian's WebView.
- Visual checks (canvas pixel content, color contrast, layout).
- Mouse/click/keyboard interactions.
- Behavior that depends on Obsidian's `app.vault.adapter`, `metadataCache`, or other Electron-renderer APIs that aren't shimmable in CC's environment.

**In the feedback, report the split explicitly:**

```
## Smoke verification
**Auto-verified by CC:**
- Build succeeds (`npm run build` exited 0).
- Tests pass (42/42 plugin, 4/4 vitest).
- Release zip produced at dist/forge-client-obsidian-v0.2.0.zip, 31.2 MB.
- Zip contents include forge-client-obsidian/main.js + assets/pyodide/...
- ...

**Deferred to user (Obsidian-context):**
- BRAT install + plugin enable in a real vault.
- Open MoDa simulator → canvas renders.
- Run simulation → Pyodide boots, particles disperse.
- ...
```

When the prompt's manual-smoke section lists steps, mark each one as either auto-completed-by-CC OR deferred-to-user. Don't silently skip steps.

**If CC's auto-smoke fails** at any step, fix the underlying issue (or route to failed/) — don't ship a "tests pass but the build script crashes" state. Failing automation is signal that user-side smoke would also fail.

## User-side smoke checklist — CC's deliverable, not cowork's (HARD RULE)

**The user-side smoke checklist is CC's deliverable, written post-implementation, landing in §3 (or equivalent) of the feedback file.** Cowork's prompt names which behaviors are worth smoking; CC writes the concrete checklist after observing what shipped. Rationale: the UX that lands often diverges from the UX that was specified (button placement, modal text, hover behavior emerge during coding). A pre-spec'd checklist can lie about what landed; an after-implementation checklist captures the actual shipped surface.

**Exception for bug-fix prompts**: the checklist's first step is pre-spec'd by the prompt — it MUST be the exact reproduction of the originally-reported failure, so the user can verify the bug is gone via the same gesture that surfaced it. The rest of the checklist (regression checks, UX flow validation, failure modes to watch for) is post-implementation work owned by CC.

**Write for a user who's been awake sixteen hours and last edited Obsidian config three weeks ago.** No assumed knowledge of install paths, no jargon-as-acronyms without expansion, no condensed table formats that pack three things into one cell. Each step is unambiguous, copy-pasteable where possible, and tells the user not just WHAT to do but WHAT THEY'LL SEE and WHAT IT MEANS. The reader is intelligent but distracted; the checklist exists to remove every decision the reader would otherwise have to make.

**Format: numbered steps in prose, NOT tables.** Tables compress information until it's unreadable when tired. Each step is a numbered paragraph (or short paragraph + a fenced code block for commands).

**Each step has three parts** (explicit or implicit):
- **Action.** The exact gesture or command. Copy-pasteable if it's a command; concrete-and-clickable if it's a UI action ("open Developer Tools with Cmd+Opt+I" — NOT "DevTools").
- **Expected outcome.** What the user will see if the step worked. Concrete and observable: a specific notice text, a specific file path that should exist, a specific version string. Not "it works" or "look for success."
- **Quick interpretation** (optional but encouraged). What it means if you see the expected outcome OR if you see something else. Inline failure-mode hint when load-bearing.

**Checklist quality requirements** (the cowork-side reviewer checks for these):

1. **Numbered steps in execution order.** Step N depends only on steps 1..N-1.

2. **Pre-conditions section at the top.** Install version currently running, vault state, terminal-vs-Obsidian context, prerequisites the reader needs to have ready. Example: "You should have a terminal open with `~/projects/forge-client-obsidian` as cwd. Obsidian should be closed at the start of this smoke."

3. **Use the project's install scripts, NOT BRAT or manual zip downloads.** Forge's canonical install path is `bash ~/projects/forge-client-obsidian/scripts/install-latest.sh` (configurable via `VAULT=...`, `TAG=v0.2.X`, etc. — see the script's header for full options). The script handles: GH release fetch, SHA verification, plugin folder replacement, data.json preservation. BRAT only ships `main.js/manifest.json/styles.css` (not `assets/`) and is wrong for any release where bundled vaults / wheels / engine code changed. Smoke that says "trigger BRAT update" is a bug in the smoke itself. Always: `VAULT=~/forge-vaults/test1 bash ~/projects/forge-client-obsidian/scripts/install-latest.sh` (or with `TAG=v0.2.X` to pin a specific version).

4. **Reference the v0.2.38 auto re-extract behavior when relevant.** Since v0.2.38, bundled vaults auto-re-extract on plugin load when the bundled `forge.toml` version differs from the extracted one. Smoke checklists no longer need to instruct manual `rm -rf ~/<vault>/forge-music/` + Cmd-Q + reopen for new bundled content; the plugin handles it on load (with a `forge-music.bak.<old-version>/` backup). Smoke should mention what the user will see in the console log: `Forge: forge-music drift detected (extracted 0.3.7 → bundled 0.3.8); backing up + re-extracting`. If no drift (JS-only release), the user sees `Forge: forge-music already at version 0.3.8; skipping`. Smoke that still tells the user to manually delete the extracted vault dir is out of date — flag and fix.

5. **Each step has an expected outcome that's specific and observable.** "Forge-click `hello_random.md` → output panel shows `Hello <5-lowercase-letters>` (e.g. `Hello qzfmx`)" — not "Forge-click X → it works." When the outcome includes a randomness or session-dependent value, give an example and note what varies vs what stays constant.

6. **Cite concrete paths and identifiers.** `~/forge-vaults/test1/`, `forge-client-obsidian v0.2.40`, `Cmd+P → "Freeze edge"`, `Forge: forge-music drift detected` (verbatim log line). NOT "the test vault" or "the freeze command" or "look for the drift log."

6a. **Every file-inspection or state-check step MUST give a paste-able command, not a description.** The user reads the smoke at midnight after a long day; they should not have to translate "verify the file tree shows both files" into an `ls` command themselves. Format:

   ```
   Run in Terminal:

       ls -la ~/forge-vaults/smoke-v0.2.13/forge-moda/_meta/

   Expected output (order may vary):
       -rw-r--r--  1 user  staff  ...  _chips.md
       -rw-r--r--  1 user  staff  ...  _chips.md.bak.v1

   Pass: both files appear. Pass if the v2 file (`_chips.md`) contains `schema_version: 2` in its frontmatter:

       grep schema_version ~/forge-vaults/smoke-v0.2.13/forge-moda/_meta/_chips.md

   Expected:
       schema_version: 2
   ```

   The bad version of this same step:

   > 1. File tree: `forge-moda/_meta/` has both `_chips.md` (v2) and `_chips.md.bak.v1` (original v1).
   > 2. Pass: log + both files.

   The bad version requires the user to: (a) find the directory, (b) figure out the right command, (c) parse the output, (d) verify v2 indicator. The paste-able version requires the user to: paste, look at output, see "schema_version: 2." 4 steps → 1 step.

   This rule applies to: file existence checks, file content checks, git state checks, version checks (`cat manifest.json | jq .version`), process checks (`ps -ef | grep`), URL fetches (`curl -sI ...`), anything that runs in a shell. UI checks (clicking buttons in Obsidian) stay as prose-instruction; they can't be pasted anyway.

6b. **CC actually runs the smoke before writing the checklist.** To the extent possible — anything that doesn't require Obsidian UI or a fresh-laptop environment — CC executes each step from §3 themselves and confirms the expected output matches what they're telling the user to expect. If a `ls` says "no such file or directory," that's a bug in the smoke (or in the implementation); fix it before shipping the §3 to the user. Don't write smoke steps that haven't been validated; the user shouldn't be the integration tester for the smoke's own correctness.

   When a step CAN'T be run by CC (Obsidian UI click, browser interaction, fresh-laptop install), CC verifies the closest-possible proxy: the file the click would write, the URL the browser would visit, the install artifact the fresh laptop would download. Document what was actually verified vs. what's user-side in §3.

7. **"Failure modes to watch for" section at the end, keyed by step number.** Each plausible breakage mode points at the diagnostic subsystem. Format: "Step N expected X but you see Y → likely cause Z; check W." Examples: "Step 3 shows the SAME 5 letters across multiple clicks → random isn't random; check for snippet-result caching at engine boundary"; "Step 7 freeze submit produces no Notice → modal didn't fire freezeEdge; check devtools console for an exception in `onSubmit`."

8. **End-state cleanup if relevant.** "Backup directory left at `forge-music.bak.0.3.5/` — delete it before next smoke if you want a clean state." Or "Snapshot file at `.forge/edges/hello_random/random_name.md` persists — delete it to reset freeze state for re-smoke."

9. **Never use a table to represent steps.** Tables are the wrong format. A step is a numbered paragraph; a multi-column table compresses it into something un-followable. Tables are fine for non-step content (version-comparison summaries, file-shape catalogs) but never for the user's sequential walkthrough.

10. **Expand acronyms and macOS keystrokes on first use.** "DevTools" → "open Developer Tools with `Cmd+Opt+I` (macOS) / `Ctrl+Shift+I` (Linux/Windows)" on first reference; subsequent references can be "DevTools." Same for "Cmd+Q" → "Quit Obsidian completely with `Cmd+Q` (NOT `Cmd+W` which only closes the window — the plugin doesn't reload until Obsidian itself restarts)."

CC writes this section AFTER the fix lands AND the auto-smoke passes. The checklist exercises what's shipped, not what was planned.

**Reference example — the shape to mirror** (this exact shape is what the cowork-side reviewer compares against):

```markdown
## §3 User-side smoke checklist

**Pre-conditions:**
- Terminal open, cwd ~/projects/forge-client-obsidian.
- Obsidian closed (quit completely with Cmd+Q if open).
- Test vault at ~/forge-vaults/test1/ exists, last used v0.2.40.

1. **Install v0.2.41.** In Terminal:
   ```
   VAULT=~/forge-vaults/test1 bash ~/projects/forge-client-obsidian/scripts/install-latest.sh
   ```
   Expected: the script prints `Resolving latest release of frmoded/forge-client-obsidian ...` → `Target: v0.2.41` → SHA verification messages → `Installed forge-client-obsidian v0.2.41`.
   If you see a SHA mismatch warning: re-run the script; the asset may still be propagating from the GH release. If you see `FATAL: could not resolve latest tag`: check your network, then retry.

2. **Open the vault in Obsidian.** Double-click `~/forge-vaults/test1` in Finder or open it from Obsidian's vault picker.
   Expected: Obsidian opens. The Forge plugin loads silently.
   Open Developer Tools with `Cmd+Opt+I` (macOS). In the Console tab you should see (among other lines): `Forge: forge-music already at version 0.3.8; skipping` (since v0.2.41 didn't change bundled music content, no re-extraction expected).
   If you see `Forge: forge-music drift detected ...` instead: the bundled version changed somewhere; not a bug, just unexpected. If you see `Forge: ensureBundledVault failed`: the auto-extract crashed; copy the full error message and flag for review.

3. **Open `hello_random.md` in the smoke-v0.2.13 vault.** Switch to that vault via the vault-picker or open it in a new Obsidian window.
   Expected: `hello_random.md` appears in the file tree. Open it.

4. **Right-click on the wikilink `[[random_name]]` in the snippet body.**
   Expected: a context menu appears with the items `Freeze edge` and `Unfreeze edge` (among Obsidian's standard menu items).
   If the menu items don't appear: the wikilink might not be detected as a snippet target. Check the DevTools console for any error from the `editor-menu` handler.

5. ... (etc)

**Failure modes to watch for:**

- Step 1 fails with `FATAL: could not resolve latest tag` → GH API unreachable; check network or run with `TAG=v0.2.41` explicit override.
- Step 2 console shows neither "skipping" nor "drift detected" → `ensureBundledVault` didn't run; check whether `forge.toml` declares `domains = ["music"]` (per v0.2.15 gate).
- Step 4 menu items absent → wikilink target may not match a known snippet; verify `random_name.md` exists in the same vault.

**End-state cleanup:** None for this smoke.
```

**Cowork's role**: review the checklist as part of the standard feedback review. If a step is ambiguous, an outcome is vague, an acronym is unexpanded, a table-of-steps appears anywhere, or the install path is BRAT instead of `install-latest.sh`, flag in the review and CC amends.

**Clean-vault smoke before tagging any release.** When a prompt cuts a release (`gh release create`, version bump, tagged push), CC must perform a clean-vault smoke FIRST: set up a fresh test directory (e.g., `~/test-vaults/v1-smoke-<version>/`), download/unzip the release artifact (or copy the local build), verify the install structure (correct top-level dir, all expected subdirs, manifest version), and exercise any non-Obsidian-UI path that can be verified from the sandbox.

The lesson from V1 0.2.0 → 0.2.1 → 0.2.2: development against a long-running vault (with its accumulated forge.toml, hardlinked plugin install, etc.) masks bundle-completeness gaps that the seminar audience WILL hit. The bundle is the unit of distribution; the clean-vault smoke is the only check that catches "bundled subset works in isolation."

This applies to every release-shipping prompt, not just the first V1 ship.

## Drain mode specifics

- Process prompts sequentially, not in parallel.
- After each prompt, write its feedback and move it before picking the next.
- Stop the drain immediately if a prompt lands in `failed/` or `questions/`. Don't continue past an unresolved blocker.
- Final report at end of drain: list of processed prompts with their terminal status (done / failed / questions).

## File naming convention

User authors prompts with the pattern: `YYYY-MM-DD-HHMM-short-name.md`. Lexicographic order = chronological order, so "oldest" is unambiguous and doesn't break when a file is re-saved.

If a prompt file doesn't follow this pattern, still process it (use file mtime as tiebreaker), but flag the non-conformance once in the feedback under "Notes."

## Hard rules

- **Re-read this file at the start of every drain invocation (HARD RULE; first action before anything else).** Even within a long-running interactive CC session, re-read `cc-prompt-queue.md` fresh when the user says "do prompt", "drain prompts", or any equivalent. The file IS amended frequently — new hard rules land between drains based on what the prior drain surfaced (e.g., the 6a/6b paste-able-commands rule landed mid-day 2026-06-05 after the v0.2.52 smoke; the bundled-vault forge.toml bump rule landed the same day after v0.2.48 surfaced the gap). Stale-protocol-context is a real failure mode and several recent drain mistakes can be traced to it. The cost of re-reading is one tool call (one `Read` of this file). Make it the FIRST action of every drain, before reading the prompt itself, before reading any other context. If you find a rule you didn't know existed, that's the rule firing correctly.

  **What "re-read" means specifically**: read the entire file end to end, not just a grep. Rules sometimes interact; the order matters. A skim that misses an amendment is the same failure mode as not re-reading at all.

- **Feedback file is written BEFORE the prompt moves to `done/` (HARD RULE).** The ordering is load-bearing — a prompt sitting in `staged/` is recoverable (next drain re-processes idempotently given the git state); a prompt in `done/` without a feedback file is an audit-trail black hole. Per-prompt sequence: drain → write feedback → THEN move from `staged/` to `done/`. If the session ends mid-drain (out of context, terminated), the prompt is still in `staged/` and the next session can recover. Never the reverse order.

- **Multi-drain feedback discipline (HARD RULE).** When `drain prompts` (plural) processes N prompts, write the feedback for prompt K BEFORE starting prompt K+1. No batched feedback at end of session. Inverted order (drain all N, then write all N feedbacks) loses every prompt past the context-exhaustion line. The forge-music v0.2.34 5-phase drain shipped feedback for each phase before starting the next; the v0.2.38/v0.2.39/smoke-vault drain triple shipped NO feedback because the session batched it at the end. The latter is the failure mode this rule prevents.

- **Locate-failure goes to `questions/`, never `done/` (HARD RULE).** If a prompt requires locating a resource (vault path, file, repo, external service) and the locate step fails or is ambiguous, the prompt MUST move from `staged/` to `prompts/questions/` with the locate-failure noted in the feedback file. NEVER to `done/`. A prompt in `done/` without a successful resource-locate creates a silent failure: the user thinks the work shipped, the audit trail is broken, and the next drain re-uses the cached failure state. A prompt in `questions/` is visible — the user can answer, the prompt moves back to `staged/`, the next drain proceeds. v0.2.40 smoke-vault drain narrowly avoided this trap (vault WAS found and files WERE created), but had it not been found the silent move to `done/` would have been the worst-case state.

- **One prompt per `do prompt` invocation.** "drain prompts" is the only verb that authorizes multi-prompt processing.
- **Never invent work.** Empty queue → report and stop. Don't synthesize prompts from inferred user intent.

- **Interactive polish drives are allowed for tight bug-fix loops.** When the user is running a smoke from an immediately-prior drain and surfaces a small bug worth fixing in-loop (< ~30 min of CC work, same code surface, narrow scope), CC may proceed without a queued prompt file. The pattern is: user says "v0.2.41 hit bug X, fix it" in an interactive CC session → CC fixes, commits, pushes, releases per default-on git ops. **Requirements**:

  1. **Bracket-tag in commit message substitutes for prompt filename.** Use a descriptive slug, not a date prefix: `[freeze-via-wikilink-followup-live-preview-cursor-fix]` is the right shape. The slug establishes audit-trail continuity with the originating drain.
  2. **Commit body is the feedback.** Write a brief but real diagnosis there — what the bug was, root cause cited at line numbers, fix design, test count before/after. v0.2.42 / v0.2.43 / v0.2.44 commit bodies are the canonical example. No separate `prompts/feedback/<file>.md` is required for interactive drives.
  3. **All other hard rules still apply.** TDD discipline, no-op stays no-op, push-every-assertion-into-suite, clean-vault smoke before tagging any release, version-bump sanity check, etc. The interactive mode shortcuts the prompt-file overhead, not the engineering discipline.
  4. **Cowork's review surface shifts to `git log`.** Without a feedback file in `prompts/feedback/`, the cowork-side reviewer reads commit messages directly. CC's commit body needs to support that review — same content quality that would have gone in a §1–§2 feedback structure, just inlined.
  5. **Threshold matters.** "< ~30 min, narrow scope" is the boundary. Anything larger — multi-phase fix, new pure-core extraction beyond a single file, version-spanning behavior change — goes back to the queue. When in doubt, queue.

  This codifies a pattern that already emerged organically during the v0.2.41 → v0.2.44 polish loop and worked well. The queue is overhead during fast iteration on the same surface; the queue is value when work needs to land across sessions or when multiple drains might compete.
- **Git operations are default-on, opt-out per prompt.** CC may commit, push, tag, and create GitHub Releases (via `gh release create` etc.) as part of completing the prompt's work, whenever the change naturally calls for it (bug fix → commit + push; release prompt → commit + push + tag + GH release). The user no longer needs to authorize each separately.

  The prompt can override with explicit phrases like "leave uncommitted for review" or "don't tag yet" — those take precedence. **Destructive operations** (`git push --force`, `git reset --hard`, branch deletion, rebase, history rewrite) remain opt-in and require explicit per-prompt authorization.

  **Commit message convention:** include the prompt filename in brackets at the start of the message header for audit trail, e.g. `[2026-05-24-0000-v1-polish] forge.toml ENOENT cleanup + INSTALL.md link pin`. Body content stays per-change.

  **Version bumps for release-shipping prompts:** CC bumps the plugin/vault version per semver (patch for fixes, minor for additive features) without needing the prompt to specify the exact target version. Prompt overrides if a specific version is mandatory.

  **Version-bump drain-time sanity check (HARD RULE).** Before touching any code, for every file the prompt declares a version bump on (`manifest.json`, `forge.toml`, etc.), CC reads the file's current value and reconciles with the prompt:

  1. **Placeholder syntax** (`{CURRENT} → {NEXT_PATCH}`, `{CURRENT} → {NEXT_MINOR}`): substitute live values, log both in §0 of the feedback file ("manifest.json was 0.2.X at drain start; bumping to 0.2.Y"), proceed.
  2. **Concrete numbers that match reality** (prompt says `0.2.32 → 0.2.33` and file says `0.2.32`): proceed, log the bump in §0 as usual.
  3. **Concrete numbers that DON'T match** (prompt says `0.2.29 → 0.2.30` but file says `0.2.32`): **pause and flag**. One-line message to the user: "Prompt assumes manifest.json at 0.2.29; actual is 0.2.32. Proceed with `0.2.32 → 0.2.33`, or pause for re-authorization?" Wait for explicit answer. Do NOT silently correct. Do NOT bump backward. Do NOT guess intent.

  This rule exists because cross-vault prompts (e.g., a forge-music content prompt that also bumps `forge-client-obsidian/manifest.json` because the bundled vault re-ships) bake in assumptions about the *other* vault's version state at queue time. Those assumptions go stale when unrelated releases drain in between. v0.2.29 collision (sed-rename under duress) and drums-spike's stale `0.2.29 → 0.2.30` (currently in queue while plugin is at 0.2.32) are the two strikes that motivated this rule.

  **Always report:** SHAs, pushed branches, tag names, GH release URLs in the feedback.
- **Bundled-vault content changes MUST bump the vault's `forge.toml` version (HARD RULE).** Any prompt that modifies files under a bundled vault path (`~/projects/forge-moda/`, `~/projects/forge-music/`, future bundled vaults, AND their mirrors in `forge-client-obsidian/assets/vaults/`) must ALSO bump the bundled vault's own `forge.toml` `version` field. The auto re-extract mechanism (v0.2.38) gates re-extract on `forge.toml` version drift between bundled and extracted; without a vault version bump, new content stays trapped in the bundle and existing cohort vaults never see it. The plugin's `manifest.json` bump alone is insufficient — manifest.json is for the plugin, forge.toml is for the vault.

  **Exception (declare explicitly):** the prompt can opt out with a one-line "no re-extract needed because <reason>" in §2 — e.g., "this change is purely additive (new file only); existing vaults work unchanged with the old set." When opting out, CC verifies the claim by checking that no EXISTING bundled-vault file was modified (only new files added).

  v0.2.48 schema-v2 chip migration was the founding instance of this gap: the `_chips.md` migration shipped but the cohort never saw it because forge-moda's `forge.toml` version didn't bump. Fix at v0.2.52 (one-shot detector) + the rule above (prevent recurrence).

- **Log caught runtime errors as `console.error` (HARD RULE).** Any `catch` block that handles an unexpected runtime exception MUST use `console.error` and include the originating method name in the message. `console.warn` and `console.log` are reserved for non-error signals and are NOT acceptable as the surface for caught errors. Three documented silent-skip incidents in the closed-beta arc (v0.2.84 facet-mutex dispatch swallow, v0.2.13 generate-write-failure swallow, v0.2.91 forge-moda re-extract failure swallow) all traced to `console.warn` in a catch block hiding a real error from the next reader of the console. v0.2.94, v0.2.100, v0.2.105 diagnostic builds existed solely because the original error had been buried. Per v0.2.90 §7.1 retrospective.

- **Python-bridge return-shape changes MUST grep call sites across plugin AND engine (HARD RULE).** When a function in `forge-client-obsidian/src/pyodide-host.ts`'s embedded Python block (the `_forge_*` helpers, including `_forge_run_snippet`, `_forge_moda_*`, etc.) changes its return tuple arity or shape, the prompt MUST include a grep across BOTH the plugin's Python block AND the engine's Python source (`~/projects/forge/forge/core/`) for every call site, and update each. The v0.2.77 `_forge_run_snippet` change from 2-tuple to 3-tuple silently broke `_forge_moda_init` / `_forge_moda_compute` / `_forge_moda_click` (three sites, all in the plugin's same file) and was not caught until v0.2.95 — 18 releases later — because no call-site sweep was done at the time of the shape change. Cite v0.2.95 in the feedback when applying this rule.

- **Snippet-id resolution uses path lookup, not basename (HARD RULE).** Any code that maps `snippet_id` → file MUST use `vault.getAbstractFileByPath(`<id>.md`)` (the V1 convention: snippet_id maps to `<id>.md` relative to vault root). Basename matching via `files.find(f => f.basename === id)` is allowed only as a fallback for root-level snippets where the id is provably unqualified. Library-subdir snippets (`forge-moda/*`, `forge-music/*`, `forge-tutorial/*`) return qualified ids like `forge-moda/create_ink_particles` from `/generate`; basename matching returns `undefined` for these and the resulting silent skip was a latent bug for 78 releases (v0.2.26 introduction of qualified ids → v0.2.104 fix). Per v0.2.104 root cause.

- **Path-prefix gates need positive frontmatter signal for BEHAVIORAL routing (HARD RULE).** When code branches on file path (`filePath.startsWith('forge-moda/')`, `filePath.match(/^forge-(\w+)/)`, etc.) to choose between two behaviorally-distinct code paths (e.g., "open simulator iframe" vs. "regenerate Python via LLM"), the gate MUST require a positive frontmatter marker (`featured: true`, `type: simulator`, etc.) in addition to the path-prefix. UI-only filtering — chip palette context defaults, breadcrumb display, etc. — is exempt; document the choice inline in the gate's comment. v0.2.92's path-prefix-only `isModaSnippet` routed every leaf moda snippet to the simulator-auto-open path for 14 releases (v0.2.92 → v0.2.106), silently breaking authoring for every cohort user who edited a forge-moda leaf snippet. Per v0.2.106 root cause.

- **Library re-extract MUST NOT accumulate backup directories (HARD RULE).** When the bundled-vault version mechanism re-extracts a library on version drift, the previous extracted copy MUST be either deleted-on-extract OR overwritten such that no more than one backup directory exists at any time. Unbounded accumulation of `<lib>.bak.<version>/` directories breaks featured-snippet discovery (multiple matches), pollutes vault root, and confuses cohort users. v0.2.106 chose delete-on-extract after the cohort smoke surfaced "featured snippet ambiguity" caused by three coexisting `forge-moda.bak.<x>` dirs.

- **CM6 extension changes MUST include an integration test against `createIntegrationHarness()` (HARD RULE).** New or modified CodeMirror 6 extensions (ViewPlugin, StateField, Facet, transactionFilter, decoration provider, etc.) MUST include at least one integration test that mounts the extension against the v0.2.112 harness and asserts the expected DOM / state behavior. Pure-core tests are insufficient for CM6/Obsidian runtime invariants. Three documented runtime-only surprise classes in the closed-beta arc: v0.2.85-89 (dispatch-during-update forbidden), v0.2.108-110 (ViewPlugin decorations cannot span line breaks), v0.2.110-111 (`workspace.getActiveViewOfType` returns null during initial-mount transaction). All three would have been caught by a half-hour harness test against `makeFrontmatterFoldExtension` or equivalent.

- **CM6 `dispatch` during a ViewUpdate is forbidden — defer with `setTimeout(0)` (HARD RULE).** Code reacting to a CodeMirror 6 ViewUpdate (inside a `ViewPlugin.update`, an `updateListener`, or any transaction-effect handler) MUST NOT call `view.dispatch(...)` synchronously within that update — CM6 forbids re-entrant dispatch and the change is dropped or throws. Defer to a fresh tick: `setTimeout(() => view.dispatch(...), 0)`. The v0.2.85→v0.2.89 facet-mutex saga burned 3 release cycles on dispatch-during-update before the deferred-dispatch fix. This is a distinct footgun from the `getActiveViewOfType`-from-StateField rule below. Per v0.2.89 root cause. (Surfaced as candidate #1 in the 2026-06-09 cohort-arc amendment message; promoted to a standalone HARD RULE in the V2a v10 review per forge-core.)

- **`workspace.getActiveViewOfType` is unsafe from a CM6 StateField (HARD RULE).** Reading Obsidian's workspace state from inside `StateField.create` or `StateField.update` is forbidden — the workspace's active-view pointer does not settle until AFTER the EditorView's initial-mount transaction fires, so the first build emits null and no later transaction re-fires to retry. Read the file's identity from the editor's own state (`state.doc.toString()` + inline frontmatter parsing), not from Obsidian's workspace API. Per v0.2.110→v0.2.111 retrospective.

- **Community-plugin prior-art search BEFORE 3rd novel CM6 mechanism attempt (HARD RULE; threshold tightened 4th→3rd in the V2a v10 review per forge-core — the v0.2.108-115 arc burned 8 cycles, so search earlier).** When the second release-cycle attempt to fix a third-party (Obsidian / CM6) integration problem against the same surface fails, the third action MUST be `grep github.com / forum.obsidian.md / public gists` for community plugins doing similar work — NOT a third novel mechanism attempt. The cohort UX frontmatter-fold arc (v0.2.108 → v0.2.115) burned 8 release cycles attempting CM6 mechanisms (foldEffect, ViewPlugin replace, StateField replace, Prec.highest, block:true) before the v0.2.116 fix was identified via a 5-minute web search to @Boettner-eric's gist at https://gist.github.com/Boettner-eric/e15deae15ccae8605c5fcfc953e55de2. The gist had been public the whole time. Per v0.2.116 root-cause discovery.

- **CSS class gating beats decoration competition when the host owns the renderer (PATTERN).** When a host application (Obsidian) owns the rendering layer with its own decoration providers that silently override plugin decorations, plugin code should NOT compete via decoration precedence (`Prec.highest`, etc.). Instead, toggle a class on a parent DOM element via the host's events (Obsidian: `workspace.on('file-open')`, etc.) + CSS rules targeting the host's runtime DOM classes (`.cm-hmd-frontmatter`, `.metadata-container`, etc.). v0.2.116-118 is the reference implementation for the frontmatter-hide use case. Per v0.2.108-115 dead-end + v0.2.116 cracking.

- **Default-hide + Cmd-P escape hatch + per-file scoping (PATTERN).** When hiding content that some users may want to see later, ship the default-hide AND a discoverable escape hatch (command palette toggle, e.g. `Forge: Toggle frontmatter visibility (active snippet)`) AND per-file scoping (don't persist the toggle across file switches — reopening defaults to hidden). The Cmd-P entry is the discoverability surface; the per-file reset prevents stale state. v0.2.119 is the reference implementation for the frontmatter case.

- **Pure-core dispatch extraction (HARD RULE).** Branching dispatch logic in `main.ts` (or any integration-layer module) longer than ~5 lines or with ≥3 mutually-exclusive branches MUST be extracted to a `*-core.ts` pure-core module with failing-first tests covering the full truth table. The TDD value materializes when test cases catch spec drift — v0.2.124's test #4 found a python-mode-vs-moda precedence latent bug exactly this way (pre-v0.2.124 inline code routed `edit_mode: python` on a featured moda snippet to simulator-auto-open instead of python-mode). Precedent: `route-action-code-regen-core.ts` (v0.2.121), `dependencies-section-core.ts` (v0.2.122), `forge-snippet-routing-core.ts` (v0.2.124). Per v0.2.124 root cause.

- **Defensive fallback for metadataCache reads driving user-perceivable behavior (HARD RULE).** When `app.metadataCache.getFileCache(file)?.frontmatter` drives behavior the user perceives (routing, fold, modal, etc.), supply a `vault.read(file)`-based escape hatch — treat metadataCache as eventually-consistent. The fast path MUST verify that the cached frontmatter actually contains the routing-relevant keys, not merely that the cached object is truthy. Checking `if (cachedFm)` alone is insufficient: a stale-non-null cache missing the relevant keys will short-circuit the fallback and the user-perceivable misbehavior recurs. Reference implementation: `readFrontmatterForRouting` (v0.2.124+ once the fast-path key-presence guard lands). The v0.2.124 ship caught the null/undefined case but missed the stale-non-null case, surfaced by independent review of the same drain. Per v0.2.124 root cause + 21:22 review.

- **Never delete a prompt file.** All terminal states are moves, not deletes. Preserves the audit trail.
- **Respect normal CC safety rules.** The queue convention does not override anything else (no auto-merging PRs, no destructive operations without confirmation, etc.).
