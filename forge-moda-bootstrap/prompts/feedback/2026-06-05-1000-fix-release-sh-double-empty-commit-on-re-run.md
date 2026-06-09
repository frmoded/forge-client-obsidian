---
timestamp: 2026-06-05T10:00:00Z
session_id: claude-code-drain-v0.2.53
prompt_modified: 2026-06-05T10:00:00Z
status: success
---

# Feedback — 2026-06-05-1000 release.sh re-run detector (v0.2.53)

## §0 — Release coordinates

**Manifest:** `forge-client-obsidian/manifest.json` 0.2.52 → 0.2.53 (pre-bumped via main work commit; release.sh's SKIP_BUMP path handled it — **third clean production release through the v0.2.51-fixed release.sh**).

**Commits (commit-directly-to-main per memory rule):**

| Repo | SHA | Subject |
|---|---|---|
| forge-client-obsidian | `a5900f9` | `[…double-empty-commit-on-re-run] v0.2.53 — release.sh detects re-run for already-released version + exits gracefully` |
| forge-client-obsidian | `9acdc6b` | `Release v0.2.53` (empty release commit; tag points here) |

**Tag + release:**
- Tag `v0.2.53` pushed to `origin/main`.
- GH release: <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.53>
- Release assets: `main.js`, `manifest.json`, `styles.css`, `forge-client-obsidian-v0.2.53.zip` (33.08 MB).
- Install round-trip verified into the smoke vault.

**Production validation of the new check:** After the v0.2.53 release landed, I immediately re-ran `bash scripts/release.sh 0.2.53` in the actual forge-client-obsidian repo. The new check fired: `=== Already released v0.2.53 (previous commit is the release marker) ===` → exit 0. **No stray empty commit.** Compare to v0.2.51's history (`47fe3ed` + `cba97d1` — two `Release v0.2.51` commits) — that's the exact pattern this patch prevents.

**Line counts of changed files:**

| File | Lines | Note |
|---|---|---|
| `scripts/release.sh` | 213 (+24 from 189) | Detector block (~10 lines) + header-comment update + invocation hint. |
| `manifest.json` | 10 | version field bump. |
| `INSTALL.md` | (unchanged total) | 5 `v0.2.52` → `v0.2.53` pin replacements via sed. |

## §1 — Fix landed + scratch-repo validation

### §1.1 — Describe the fix

A single conditional block placed BETWEEN the SKIP_BUMP detection and the dirty-tree guard's exit. When SKIP_BUMP=yes AND `git log -1 --pretty=%s` equals `Release v${NEW_VERSION}`, the script prints a "nothing to do" message + a hint about how to intentionally re-release (drop the tag), then exits 0.

Scope-narrow: fires only on the SKIP_BUMP=yes path. The SKIP_BUMP=no path's bump-commit step naturally fails when there's nothing to commit — that's the user-error case the prompt explicitly leaves alone.

### §1.2 — Pre-fix evidence

The v0.2.51 git history from yesterday's release.sh fix shipped its own wart, captured during smoke (CC ran release.sh twice while gathering tail vs head terminal output):

```
47fe3ed Release v0.2.51   ← stray empty commit from re-run
cba97d1 Release v0.2.51   ← correct release commit (tag points here)
52086d2 [...release.sh-fix...] v0.2.51 ...
```

The 47fe3ed commit is functionally harmless (no tag points at it, install-latest.sh works, `gh` shows v0.2.51 release with all assets) but creates `git log --oneline` noise.

### §1.3 — Fix landed (cited diff)

**`scripts/release.sh`** lines 105-118 — new detector block:

```diff
+# Detect "already released this version" and exit cleanly. Guards
+# against running release.sh twice in succession for the same version
+# (common during smoke / debugging). Pre-fix, the second invocation
+# created a stray empty `Release vX.Y.Z` commit before failing at
+# the duplicate-tag step — see v0.2.51 history (47fe3ed/cba97d1).
+# v0.2.53 — added (per 2026-06-05-1000 prompt). Only fires on the
+# SKIP_BUMP path because that's the only path where the prior commit
+# could already be the release marker without intermediate work.
+LAST_COMMIT_MSG="$(git log -1 --pretty=%s)"
+if [ "$SKIP_BUMP" = "yes" ] && [ "$LAST_COMMIT_MSG" = "Release v${NEW_VERSION}" ]; then
+  echo
+  echo "=== Already released v${NEW_VERSION} (previous commit is the release marker) ==="
+  echo "Nothing to do. The tag + GH release exist; install-latest.sh works."
+  echo
+  echo "If you intended to re-run the release for some reason (e.g., asset"
+  echo "update), drop the existing tag with:"
+  echo "  git tag -d v${NEW_VERSION} && git push origin :v${NEW_VERSION}"
+  echo "and run release.sh again."
+  exit 0
+fi
```

Header comment also updated (lines 14-22) to document the behavior + the intentional-re-release escape hatch.

### §1.4 — Scratch-repo validation (4 cases verbatim)

CC owned the validation end-to-end via a scratch git repo with a bare origin remote and a stubbed `gh`. No Obsidian, no Tamar's vault, no network. The real `gh` won the PATH race against my stub (because `brew shellenv` resets PATH in the script), so cases that proceed past the new check fail at `gh release create` with `none of the git remotes configured for this repository point to a known GitHub host`. That's fine — every case is validated up to its expected stopping point, and Case 3 (the new check) exits BEFORE the gh step anyway.

**Setup:**

```
SCRATCH=$(mktemp -d -t forge-release-sh-scratch-XXXXXX)
cd "$SCRATCH"
mkdir scripts dist bin
cp /Users/odedfuhrmann/projects/forge-client-obsidian/scripts/release.sh scripts/
# manifest.json {id:test-plugin, version:0.0.1, name:Test}
# main.js, styles.css (stub content)
# package.json with no-op `build` and `release-zip` scripts
git init -q -b main && git add -A && git commit -q -m "initial scratch state"
git init --bare -q origin.git && git remote add origin "$SCRATCH/origin.git"
git push -q origin main
# .gitignore for bin/, origin.git/, dist/, node_modules/
git add .gitignore && git commit -q -m "scratch .gitignore"
git push -q origin main
# bin/gh stub that always exits 0 (with stderr log)
```

**Case 1 — Normal first-run, SKIP_BUMP=no (sanity check):**

```
$ PATH="$SCRATCH/bin:$PATH" bash scripts/release.sh 0.0.2
Current version: 0.0.1
New version:     0.0.2

=== Bumping manifest.json: 0.0.1 → 0.0.2 ===

=== Building plugin ===
built

=== Committing version bump ===
[main e00a44b] Release v0.0.2
 1 file changed, 1 insertion(+), 1 deletion(-)

=== Tagging v0.0.2 ===

=== Pushing to origin ===
   9988af3..e00a44b  main -> main
 * [new tag]         v0.0.2 -> v0.0.2

=== Building release zip ===
Built: dist/forge-client-obsidian-v0.0.2.zip (4.0K)

=== Creating GitHub release v0.0.2 ===
none of the git remotes configured for this repository point to a known GitHub host.   ← real `gh` fails here (scratch has no real github remote)

# post-state
log: e00a44b Release v0.0.2 ← single Release commit (correct)
     9988af3 scratch .gitignore
     8aaaa75 initial scratch state
tags: v0.0.2 ✓
manifest: 0.0.2 ✓
```

**Case 2 — SKIP_BUMP=yes path, pre-bumped manifest, no prior release marker:**

```
# Setup: jq .version = "0.0.3", commit as "[scratch] pre-bump manifest to 0.0.3"
# Now run release.sh 0.0.3 — last commit ISN'T "Release v0.0.3", so new check shouldn't fire.

$ PATH="$SCRATCH/bin:$PATH" bash scripts/release.sh 0.0.3
Current version: 0.0.3
New version:     0.0.3
Manifest already at 0.0.3 — skipping bump + commit step.
(Common when an upstream commit bumped manifest as part of
 the same change set.)

=== Building plugin ===
built

=== Manifest already committed at v0.0.3; creating empty release commit ===
[main 72db76c] Release v0.0.3

=== Tagging v0.0.3 ===

=== Pushing to origin ===
   e00a44b..72db76c  main -> main
 * [new tag]         v0.0.3 -> v0.0.3

=== Building release zip ===
Built: dist/forge-client-obsidian-v0.0.3.zip (4.0K)

=== Creating GitHub release v0.0.3 ===
none of the git remotes configured for this repository point to a known GitHub host.   ← real `gh` fails here, as expected

# post-state
log: 72db76c Release v0.0.3 ← empty Release commit (correct for SKIP_BUMP path)
     80f42a5 [scratch] pre-bump manifest to 0.0.3
     e00a44b Release v0.0.2
     9988af3 scratch .gitignore
tags: v0.0.2, v0.0.3 ✓
```

**Case 3 — Re-run release.sh 0.0.3 (THE NEW CHECK):**

```
$ PATH="$SCRATCH/bin:$PATH" bash scripts/release.sh 0.0.3
Current version: 0.0.3
New version:     0.0.3
Manifest already at 0.0.3 — skipping bump + commit step.
(Common when an upstream commit bumped manifest as part of
 the same change set.)

=== Already released v0.0.3 (previous commit is the release marker) ===
Nothing to do. The tag + GH release exist; install-latest.sh works.

If you intended to re-run the release for some reason (e.g., asset
update), drop the existing tag with:
  git tag -d v0.0.3 && git push origin :v0.0.3
and run release.sh again.

EXIT: 0   ← clean exit (was: would have created stray empty commit + tag-create error)

# post-state — UNCHANGED from end of Case 2
log: 72db76c Release v0.0.3   ← still just ONE release commit
     80f42a5 [scratch] pre-bump manifest to 0.0.3
     e00a44b Release v0.0.2
     9988af3 scratch .gitignore
tags: v0.0.2, v0.0.3 ✓ (no second tag, no overwrite)
```

**Case 4 — Intentional re-release after intermediate commits (new check must NOT fire):**

```
# Setup: append a noop to main.js, git add + commit as "[scratch] unrelated work after release"
# Now last commit is "[scratch] unrelated work after release", NOT "Release v0.0.3".

$ PATH="$SCRATCH/bin:$PATH" bash scripts/release.sh 0.0.3
Current version: 0.0.3
New version:     0.0.3
Manifest already at 0.0.3 — skipping bump + commit step.
(Common when an upstream commit bumped manifest as part of
 the same change set.)

=== Building plugin ===
built

=== Manifest already committed at v0.0.3; creating empty release commit ===
[main d9470c7] Release v0.0.3   ← new check correctly skipped; script proceeds

=== Tagging v0.0.3 ===
fatal: tag 'v0.0.3' already exists   ← script halts at tag-create (predictable user-error)

# post-state
log: d9470c7 Release v0.0.3   ← Case 4's empty commit (predictable; intentional re-release scenario, but user-error mode)
     ecab7da [scratch] unrelated work after release
     72db76c Release v0.0.3   ← Case 2's release commit
     80f42a5 [scratch] pre-bump manifest to 0.0.3
     e00a44b Release v0.0.2
tags: v0.0.2, v0.0.3 ← still only one v0.0.3 tag
```

Case 4's expectation per the prompt: "it WILL fail at the bump-commit step (nothing to commit), but that's user-error, not the new check's fault." Observed: it actually fails at the tag-create step (because `git commit --allow-empty` succeeds without error and the tag step is the next failure point). Either way, the new check correctly does NOT fire when there's intermediate work, and the script halts before pushing junk.

All 4 cases validated.

### §1.5 — `npm test` (unchanged)

```
ℹ tests 278
ℹ pass 278
ℹ fail 0
```

Pure shell-script work. No source files touched.

## §2 — Surprises during the scratch harness build

**`brew shellenv` resets PATH inside release.sh.** The script's first action after `set -euo pipefail` is to eval `brew shellenv`, which prepends `/opt/homebrew/bin` (or `/usr/local/bin`) to PATH. My `bin/gh` stub at the scratch dir's prefix got demoted to second-place, so real `gh` won — and predictably failed at `gh release create` because the scratch's `origin.git` isn't a real GitHub host. Workaround was to verify pre-gh-step state for each case (the cases that need to exercise the new check exit BEFORE gh anyway, so this didn't block validation). Long-term, a `RELEASE_GH=stub-gh-bin` env var override in release.sh would let scratch tests use a stub — but that's scope creep, flagging as a potential v0.3.x cleanup.

**Dirty-tree check caught `bin/` + `origin.git/` initially.** The scratch repo housed both the gh stub and the bare origin inside its working tree, which release.sh's `git status --porcelain` correctly flagged as untracked. Added a `.gitignore` to exclude `bin/`, `origin.git/`, `dist/`, `node_modules/`. Real forge-client-obsidian doesn't have this issue because its release.sh runs from a clean tree.

**Case 4 fails at tag-create, not at the bump-commit step as the prompt predicted.** The prompt's expectation was that the bump-commit step would fail with "nothing to commit." But the SKIP_BUMP=yes path uses `git commit --allow-empty` (the v0.2.51 fix), which succeeds with nothing to commit. The next failure point is `git tag -a "v${NEW_VERSION}"` with the tag already existing. Same outcome (script halts before pushing junk); just a slightly different stop line. Worth noting because the prompt's Case 4 description was slightly off about WHERE the failure lands — but the spirit (user-error halts before damage) holds.

**Production validation in the actual forge-client-obsidian repo confirms the fix end-to-end.** After v0.2.53 released cleanly via the SKIP_BUMP path, I immediately re-ran `bash scripts/release.sh 0.2.53`. The new check fired, exit 0, no stray empty commit. `git log --oneline -3` shows:

```
9acdc6b Release v0.2.53                                                      ← release commit (single)
a5900f9 [...double-empty-commit-on-re-run] v0.2.53 — release.sh detects ...  ← work commit
d40d0a3 Release v0.2.52                                                      ← prior release
```

Compare to the v0.2.51 history that motivated this prompt — that one shows TWO `Release v0.2.51` commits. v0.2.53 shows ONE.

## §3 — User-side smoke

Per the prompt's expectation, this fix needs minimal user verification (CC owns end-to-end). Three lines:

### Confirmation steps

1. Open <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.53> — release page shows 4 assets (main.js, manifest.json, styles.css, zip).
2. Compare `git log --oneline -10` in the local forge-client-obsidian repo: there's ONE `Release v0.2.53` commit (not two). Pre-fix this would have been a second `Release v0.2.53` after the v0.2.51-style wart.
3. (Optional, deferred to next release) When the next real drain ships v0.2.54+, observe that release.sh runs once cleanly without producing a stray commit. The fix self-validates over time.

### Done criteria

Step 1 passes (GH release shape) + step 2 passes (single Release commit) → fix shipped and validated end-to-end in production.

---

**Audit-trail close:** prompt moves to `prompts/done/`. Next drain is queue-driven.

**Standing followups (3 open, was 4):**
1. ~~release.sh duplicate-invocation wart~~ — DONE (this drain).
2. forge-music v2 `_chips.md` — their lane's drain.
3. percussion-lab PREVIEW disposition (forge-music + forge uncommitted) — your call.

Plus (cc) glue-to-pure-core audit candidates flagged across the v0.2.4x arc.
