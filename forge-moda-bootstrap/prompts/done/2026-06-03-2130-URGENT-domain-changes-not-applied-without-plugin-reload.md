# URGENT — Domain changes via EditVaultDomainsModal don't take effect without plugin reload (mint-laptop V1-ship blocker)

## Scope

When the user changes domains via `EditVaultDomainsModal`, two things SHOULD happen but DON'T:

1. **Commands gated on the newly-added domain don't register.** Example: vault starts with `domains = []`. User uses the modal to add "moda". Modal writes `forge.toml` with `domains = ["moda"]`. But `Cmd-P → Forge: Open MoDa simulation` still doesn't appear in the command palette. The command was guarded at plugin `onload()` (`main.ts:343`); since moda wasn't active then, it was never registered, and `reloadActiveDomains()` only refreshes the data — it does not re-register commands.
2. **Bundled vaults for the newly-added domain don't extract.** Example: vault adds "music" via the modal. `ensureBundledForgeMusic` (`welcome.ts:160`) only runs at plugin `onload()`; since music wasn't active then, the bundled forge-music vault never extracts. User sees no `forge-music/` directory in their vault.

Both gaps share the same root cause: state set at `onload()` is never refreshed in response to user-triggered domain changes. Surfaced by the mint-laptop smoke (2026-06-03 evening): both gaps invisible on the dev machine because all dev vaults already had domains declared BEFORE first plugin load.

Fix shape (two acceptable approaches, CC's call):

**Approach A (lightweight, ship today)**: amend `EditVaultDomainsModal.applyDiff` to issue a clear post-save Notice instructing the user to fully quit (Cmd-Q) and reopen Obsidian, naming this as the required step for new domains to activate. Updates the existing "Reopen the Forge menu" Notice (which is misleading — reopening the menu doesn't help) to "Quit Obsidian (Cmd-Q) and reopen for new domain actions to appear." Doc-only / one-line code change. Solves the surfaced UX failure ("user added moda, doesn't see why nothing happened") without changing architecture.

**Approach B (proper fix, more code)**: make `EditVaultDomainsModal.applyDiff` responsively re-run the relevant `onload` paths:
- Call `ensureBundledForgeMusic` (and any other domain-gated extraction helpers) for each newly-added domain.
- Re-evaluate command registration for each newly-added domain — either by tracking which commands belong to which domain and conditionally `addCommand`-ing them, or by exposing a new `registerDomainCommands(domain)` helper that `onload` and `applyDiff` both call.
- Optionally also handle removal (un-register domain commands when removed; this may be deferred per the modal's current "files stay on disk" semantics for removals).

What this prompt does NOT do:
- Touch the underlying domain gating logic (`isDomainActive` itself is correct).
- Change the modal's UX for choosing domains.
- Auto-trigger Obsidian's full restart (no Obsidian API for that; user does it themselves).
- Change the welcome-flow stub that writes `domains = []` in fresh vaults.

## Reproduction

User's mint-laptop smoke (2026-06-03):

1. Fresh vault `~/Documents/forge-clean-smoke/` created in Obsidian.
2. Forge plugin installed via BRAT → forge-installer flow (per `closed-beta-onboarding.md`).
3. Plugin loaded; `forge.toml` either absent or `domains = []` (per v0.2.14 stub).
4. `Cmd-P → Forge` does NOT show "Open MoDa simulation". (Expected: it should appear; the bundled forge-moda content extracted unconditionally per `welcome.ts:131`, so the command should logically be available.)
5. User uses the Edit-vault-domains modal to add `moda`. `forge.toml` updates to `domains = ["moda"]`. Modal Notice says "Reopen the Forge menu for the new domain actions."
6. User reopens `Cmd-P → Forge`. **Command still missing.**
7. Workaround: user fully quits Obsidian (Cmd-Q), reopens. Command now appears (registered at fresh onload).

Same shape for music domain addition: modal writes `domains = ["music"]`, but `ensureBundledForgeMusic` never fires → forge-music vault never extracts → user can't access music snippets even though their `forge.toml` says they should.

## Files likely to touch

For Approach A:
- `~/projects/forge-client-obsidian/src/forge-action.ts:489` (`applyDiff` method's closing Notice text).

For Approach B (recommended for proper fix):
- `~/projects/forge-client-obsidian/src/forge-action.ts:applyDiff` — call new helpers after `reloadActiveDomains()`.
- `~/projects/forge-client-obsidian/src/main.ts` — extract `registerDomainCommands(domain)` from the current inline onload registration. Expose on the `host` object.
- `~/projects/forge-client-obsidian/src/welcome.ts` — expose `ensureBundledFor(domain)` or similar that dispatches to the right ensureBundled* helper.
- **NEW: `src/domain-activation-core.ts`** — pure-core helper that, given (old domains, new domains, set of known domains with their command + extraction obligations), returns a list of `{type: 'extract', domain: 'music'}` / `{type: 'register-commands', domain: 'moda'}` actions. Pure-core extraction No. 13. Tests target this; the Obsidian-coupled glue stays a thin shim.
- `~/projects/forge-client-obsidian/manifest.json` — `{CURRENT} → {NEXT_PATCH}` per the late-binding placeholder convention.

## Phase shape — investigation-before-design rider applies

Even though the root cause is clear from static code reading, I want CC to confirm with a small investigation step before designing the fix:

### Phase 1 — investigation (small)

1. Confirm by reading `main.ts:onload` flow: is there ANY hook (event listener, debounce, etc.) that already responds to `forge.toml` domain field changes? If yes, the fix may be smaller than expected.
2. Confirm `ensureBundledForgeMusic` is the only domain-gated bundled-vault helper, or if others exist (forge-image, future).
3. Pick Approach A or B based on findings; if B, sketch the `registerDomainCommands(domain)` extraction shape.

Land Phase 1 as its own commit with `# FORGE-DEBUG investigation v0.2.45` markers if any are needed for diagnostic prints (probably not for this one — static code reading is sufficient).

### Phase 2 — fix (TDD discipline)

Failing test first against `domain-activation-core.ts` (if going with Approach B):

1. `old=[], new=["moda"] → returns [{register-commands: 'moda'}]` (moda is unconditionally-extracted, so no extract action).
2. `old=[], new=["music"] → returns [{extract: 'music'}, {register-commands: 'music'}]` (music IS bundled-extracted on activation).
3. `old=["moda"], new=["moda", "music"] → returns only the music actions (moda already active, no-op).
4. `old=["music"], new=[] → returns [{unregister-commands: 'music'}]` (or no-op if removal not handled in v1).
5. `old=null, new=["moda"] → returns []` (null = back-compat all-active; adding a specific domain doesn't trigger anything new because it was already active).

5 cases minimum. Run before fix → all fail (helper doesn't exist). Implement. Re-run → pass. Full suite.

If going with Approach A: no new tests needed (one-line Notice text change). Just verify the new Notice text appears in `forge-action.ts:applyDiff`. Document the deliberate choice to defer Approach B in §2 of the feedback.

## Out of scope

- Auto-triggering Obsidian restart programmatically (no API).
- Changing domain-gating semantics (`isDomainActive` correctness).
- Changing the welcome flow that writes the initial `domains = []` stub.
- Re-architecting how domains are declared (forge.toml format stays).
- Touching `forge-music` or `forge-moda` content.

## Don'ts

- Don't ship Approach B without the pure-core extraction. The Obsidian-coupled glue gets a thin shim; tests target the pure core.
- Don't bump versions concretely — use `{CURRENT} → {NEXT_PATCH}` placeholder.
- Don't batch feedback at end of multi-phase drain.
- Don't claim Approach B is "complete" if removal-side (unregister + un-extract) is deferred — flag that scope honestly in §2.
- Don't change `welcome.ts:ensureBundledForgeModa` (unconditional extraction) — moda is meant to be always-present.

## Report when done

Standard §0–§3:

- **§0** — manifest before/after, commit SHAs (Phase 1 + Phase 2), push, tag, release URL, SHA round-trip.
- **§1.1** — TDD test cases (if Approach B); one-line diff (if Approach A).
- **§1.2** — Phase 1 investigation findings + chosen approach with reasoning.
- **§1.3** — Fix landed: cited line-number diffs.
- **§1.4** — Post-fix verbatim test output.
- **§1.5** — Full `npm test`.
- **§2** — Anything surprising. If Approach A chosen, explicit note on why Approach B was deferred and what would trigger doing it. If Approach B, explicit note on whether removal-side is in scope.
- **§3** — User-side smoke checklist per the cc-prompt-queue.md "User-side smoke checklist" quality bar. The smoke exercises:
  - Bug reproduction (Approach A): mint vault, add moda via modal, observe new Notice instructs Cmd-Q + reopen. Quit + reopen. Verify command appears.
  - Bug reproduction (Approach B): mint vault, add moda via modal, observe command appears immediately. Add music, observe forge-music extracts immediately.
  - Includes failure modes, end-state cleanup.
