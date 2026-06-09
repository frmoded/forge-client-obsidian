# V1 Phase 2 — fix iframe load + hand back a clean smoke

## Context

V1 Phase 2 (`0900`, commits `5564d56` plugin + `b1f4025` iframe) shipped the iframe-through-plugin postMessage architecture. User attempted smoke with uvicorn + Vite dev server stopped. Two findings:

1. **Obsidian's CSP blocks nested `app://` resource fetches from iframes.** Original split-asset build (`index.html` referencing `./assets/index-*.js` + `./assets/index-*.css`) produced `ERR_BLOCKED_BY_CLIENT` on the nested CSS/JS fetches even though the top-level `index.html` loaded fine.

2. **Switched iframe to `vite-plugin-singlefile`** to inline everything into a single `index.html` (~210 KB). User confirms:
   - Plugin installed: `npm install --save-dev vite-plugin-singlefile` in forge-moda-client/forge-moda-web.
   - vite.config.ts updated to use `viteSingleFile()` plugin.
   - Build produces single `index.html` at `forge-client-obsidian/assets/iframe/` (no nested `assets/` subdirectory).
   - Plugin rebuilt and Obsidian reloaded.

**But Obsidian is STILL requesting the OLD hashed filenames** (`index-cDX_Ois8.css`, `index-Kqz8IqaR.js`) that no longer exist. Either:
- Electron HTTP cache serving the stale pre-singlefile `index.html`.
- Bluh's plugin dir has orphan stale files that the user's `cp` didn't clean.
- Bluh's plugin dir is symlinked to ~/projects/forge-client-obsidian, AND the user's `Cmd-P → Reload app without saving` doesn't fully invalidate the WebView cache.

## Scope

Three things, in order:

1. **Diagnose** what's actually on disk at the iframe URL Obsidian is serving from, and why the old filenames are being requested.
2. **Fix** whatever's broken so a clean reload loads the new single-file `index.html`.
3. **Hand back** an explicit, step-by-step smoke checklist the user can execute end-to-end — assume zero context, give exact terminal commands, file paths, and Obsidian UI actions. Include any cache-clearing or restart steps required. Be opinionated about which (uvicorn / vite / Obsidian quit / etc.) need to be down at each step.

The user's working-pace protocol now requires explicit copy-pasteable commands at every smoke step. Apply that here.

Does NOT:

- Refactor the architecture. V1 Phase 2's design is in place.
- Touch the engine, the constitution, the registry, or any vault content.
- Add new commands or UI affordances.
- Touch music21 / forge-music. Phase 3.
- Make a strategic decision — this is tactical execution.

## Why

User is doing the live smoke and we're losing too many round-trips on ls/diff/restart cycles. CC can run the diagnostic commands directly, apply fixes, verify CC-side state is correct, and hand the user a clean smoke procedure. Saves the user a multi-hour debugging loop.

## Files / state to inspect

The user's `~/projects/forge-client-obsidian/` is the source repo. Their test vault is `~/forge-vaults/bluh/` with plugin installed at `~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/`.

Possible states to verify:

1. **Symlink vs. directory copy.** Earlier `cp` reported "identical (not copied)" — likely indicates symlink. Verify with `ls -la ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/`.
2. **iframe contents.** Verify `~/projects/forge-client-obsidian/assets/iframe/` has just `index.html`, `favicon.svg`, `icons.svg` (no `assets/` subdir).
3. **iframe content shape.** Verify `index.html` has inlined `<script>` and `<style>` tags (the singlefile-plugin output). If still split, the build was stale.
4. **Stale orphans.** If bluh's plugin dir is a separate copy (not symlinked), it may have orphan `.obsidian/plugins/forge-client-obsidian/assets/iframe/assets/` from an earlier split-asset build that's still being requested.

## Implementation notes

### Diagnostic + fix

Run the diagnostic commands directly. Based on findings, apply the appropriate fix:

- **If bluh has orphan `assets/iframe/assets/` from old split build**: `rm -rf` that subdir, re-copy the populated iframe dir from ~/projects.
- **If symlinked and contents look correct but cache is stale**: instruct the user how to fully quit Obsidian (not Reload), or clear Electron's cache via dev tools.
- **If build still produces split assets** (config didn't actually take): re-verify the vite config, rerun the build.

If anything material is wrong in the build configuration (e.g., the singlefile plugin isn't actually engaging), commit a fix to forge-moda-client. Otherwise no code changes — just disk cleanup + clear smoke instructions.

### Smoke checklist for the user

Produce a checklist that handles the V1 acceptance flow end-to-end. Constraints per the cowork-forge-protocol.md "User's working pace" section:

- Every actionable step has an exact copy-pasteable terminal command (or exact Obsidian UI path).
- Every command includes its working directory (`cd ~/...` prefix).
- Every command has an `Expect:` line describing what success looks like.
- No inference taxes. If a step has ambiguity, eliminate it.
- Numbered steps, sequential.
- The first few steps confirm "we're starting from a clean state" (uvicorn stopped, vite stopped, Obsidian fully quit).
- The mid steps build + install the right state.
- The final step is the V1 acceptance test (Open MoDa simulator → see particles → click Run simulation → see ink dispersions, all with no local servers).
- If anything fails, the user knows exactly what to paste back (which step, which command output).

### Obsidian quit vs reload

The user has been using `Cmd-P → Reload app without saving`. That may not fully invalidate Electron's WebView resource cache. Recommend instead: `Cmd-Q` (or quit via menu) then reopen Obsidian. Document the difference if relevant.

### Risks I anticipate

- **The singlefile plugin's output may differ subtly across Vite versions** — verify the produced index.html has fully-inline `<script>`/`<style>` tags, no external references.
- **Even with single-file iframe, Obsidian may still block `app://` iframe loads** in some edge cases (CSP, sandboxing). If smoke still fails post-fix, route to questions/ with the exact symptoms; that's architecture A breaking down and needs a separate design conversation.
- **The user's plugin dir may genuinely not be symlinked** despite the cp "identical" message — that message can fire for other reasons (e.g., comparing across mount points). Verify properly with `ls -la`.

## Tests

No new code-level tests. The smoke IS the test, and it's user-executed.

## Out of scope

- Music21 / forge-music. Phase 3.
- Architectural changes. The Pyodide + postMessage architecture stays.
- Bigger build pipeline refactors (e.g., monorepo tooling). Whatever is needed to ship a working iframe, no more.
- Community plugin directory submission.
- Tamar physics.
- Hardcoded snippet-ID set fix.
- User-vault shadow regression.

## Report when done

For the user:

1. **What was actually broken** — concrete root cause (cache, orphan, build, etc.).
2. **What CC fixed** — commands run, files changed, any new commits.
3. **The smoke checklist** — explicit numbered steps per the user-pace section above. This is the primary deliverable.
4. **What to paste if it still fails** — exact commands the user should run for diagnostic + which step they failed on.

If CC determines the root cause is architectural (e.g., Obsidian fundamentally won't load iframes from `app://` regardless of single-file structure), route this prompt to questions/ with the specific evidence and let me draft the architectural follow-up.

## Commits + push

If anything code-level changes (vite config tweak, plugin asset-handling refinement, etc.), commit to the appropriate repo(s) and push to main. If only disk cleanup + user instructions, no commits.

## Don'ts

- **Don't change the V1 architecture.** No flip to iframe-hosts-Pyodide or any structural refactor.
- **Don't add new features.** Iframe-load is broken; fix it. No featured buttons, no settings UI changes, no engine changes.
- **Don't expand smoke beyond V1 acceptance.** The smoke checklist verifies moda V1 works without uvicorn + vite. Music V1 (Phase 3) is later.
- **Don't be terse in the smoke checklist.** Explicit commands per the user-pace protocol section. Verbose-on-commands is the explicit value.
- **Don't ship a checklist that requires the user to infer "obvious" steps.** Every Obsidian UI action gets the exact `Cmd-P → ...` path.
- **Don't try to clear Electron's WebView cache programmatically.** Tell the user how to fully quit Obsidian instead.
- **Don't bundle in the iframe asset-handling refactor** (e.g., move to a different bundle scheme). Just the fix needed to unblock V1.
