---
timestamp: 2026-06-06T09:30:00Z
session_id: claude-code-drain-release-sh-drift-ordering
prompt_modified: 2026-06-06T09:30:00Z
status: success
---

# Feedback — 2026-06-06-0930 release.sh drift preflight reorder (v0.2.61)

## §0 — Release coordinates

**Manifest:** `forge-client-obsidian/manifest.json` 0.2.60 → 0.2.61.

**Commits (commit-directly-to-main per memory rule):**

| Repo | SHA | Subject |
|---|---|---|
| forge-client-obsidian | `a3b3a5f` | `[…release-sh-drift-preflight-before-state-mutation] v0.2.61 — release.sh runs drift preflight BEFORE state mutation` |
| forge-client-obsidian | (empty Release commit by SKIP_BUMP path) | `Release v0.2.61` — tag points here |

**Tag + release:**
- Tag `v0.2.61` pushed to `origin/main`.
- GH release: <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.61>
- 4 assets (main.js, manifest.json, styles.css, `forge-client-obsidian-v0.2.61.zip` 34 MB).
- Zip SHA-256: `8adc28d0b47f05fad74ce5fdeb988818126fd1c45454f85a57fa3e62231ae4be`
- install-latest.sh round-trip into smoke vault: clean.

**This was the first release through the rearranged release.sh** — drift preflight at step 3, before commit/tag/push. End-to-end clean.

**Line counts of changed files:**

| File | Lines | Note |
|---|---|---|
| `scripts/release.sh` | 218 (-2 net from 220, +35 / -25) | Build/release-zip block moved from end (was lines 183-200) to between styles check and commit (now lines 159-186). Header comment expanded to document new order. |
| `manifest.json` | 10 | version bump. |
| `INSTALL.md` | (5 pin replacements) | v0.2.60 → v0.2.61. |

## §1.1 — Describe the rearrangement (no TDD tests for shell — 5 scratch cases ARE the assertions)

**Pre-fix order** (release.sh as of v0.2.60):
1. Validate progression.
2. Bump manifest (or skip).
3. Build plugin (`npm run build`).
4. Commit (or empty release commit).
5. Tag.
6. Push.
7. Build release zip + drift preflight (`npm run release-zip`). ← LATE.
8. GitHub release.

**Post-fix order** (v0.2.61):
1. Validate progression.
2. Bump manifest (or skip).
3. Build plugin (`npm run build`) **+ build release zip + drift preflight** (`npm run release-zip`). ← MOVED HERE.
4. Commit (or empty release commit).
5. Tag.
6. Push.
7. GitHub release with the already-built zip.

The drift preflight (inside `build-release-zip.mjs` step 2b) now runs BEFORE any git state mutation. Drift failure leaves the working tree dirty (manifest.json modified if SKIP_BUMP=no) but git history untouched.

## §1.2 — Pre-fix evidence

From the v0.2.59 B7.2 drain's feedback §2:

> First v0.2.58 release.sh run halted at the build's drift preflight: `forge/music/lib.py` in the bundle was at the pre-`08db2ed` state, but `release.sh` had ALREADY created an empty `Release v0.2.58` commit + tag + push BEFORE the build step ran. So when I synced the bundle and re-ran release.sh, the tag-create failed with `fatal: tag 'v0.2.58' already exists`.

The orphaned v0.2.58 tag + two empty `Release v0.2.58` commits (`6eae653`, `585686a`) remain permanent audit-trail noise in forge-client-obsidian's git history. This drain closes the loop so future drift-detected releases halt cleanly.

Pre-fix release.sh order (line 144-200 of the v0.2.60 file):

```
# Step (was) 3: Build (only `npm run build`, no drift)
echo "=== Building plugin ==="
npm run build

# Step (was) 4-6: Commit, tag, push
git commit ...
git tag ...
git push ...

# Step (was) 7: Build release zip + drift preflight
echo "=== Building release zip ==="
npm run release-zip  # ← drift here = orphaned tag
```

## §1.3 — Fix landed (cited diffs)

**`scripts/release.sh`** — the entire "Build release zip" block (was lines 183-200 in v0.2.60) moved to between the "verify required release artifacts" block and the "Commit, tag, push" block. Header comment expanded to document the new step order + the new behavior on drift failure.

Inline diff of the load-bearing reorder (release.sh lines 158-188 post-fix):

```diff
 STYLES_PRESENT="no"
 [ -f styles.css ] && STYLES_PRESENT="yes"

-# --- Commit, tag, push ---
+# --- Build release zip (drift preflight runs inside) ---
+# v0.2.51 — added (per 2026-06-05-0700 prompt). install-latest.sh ...
+#
+# 2026-06-06-0930 — MOVED EARLIER in the script (was after push,
+# now before commit). build-release-zip.mjs's section 2b runs the
+# engine-bundle drift preflight; if drift is detected, it exits 1
+# here, BEFORE any commit / tag / push state mutation. Pre-fix,
+# drift caught at the late position left orphaned tags (v0.2.58
+# wart). When SKIP_BUMP=no AND drift fires here, manifest.json is
+# left at the new version (dirty); user reverts via
+# `git checkout -- manifest.json`, runs `npm run sync-engine-bundle`,
+# and re-runs release.sh. SKIP_BUMP=yes leaves nothing dirty.
+echo
+echo "=== Building release zip (drift preflight runs inside) ==="
+npm run release-zip
+
+ZIP_PATH="dist/forge-client-obsidian-v${NEW_VERSION}.zip"
+if [ ! -f "$ZIP_PATH" ]; then
+  echo "ERROR: expected zip at $ZIP_PATH not produced by 'npm run release-zip'."
+  echo "Check scripts/build-release-zip.mjs output path."
+  exit 1
+fi
+echo "Built: $ZIP_PATH ($(du -h "$ZIP_PATH" | cut -f1))"
+
+# --- Commit, tag, push ---
 echo
 if [ "$SKIP_BUMP" = "no" ]; then
   echo "=== Committing version bump ==="
   git add manifest.json
   git commit -m "Release v${NEW_VERSION}"
```

And the corresponding deletion of the old block from the end of the script.

## §1.4 — Scratch-repo validation (5 cases verbatim)

Scratch setup: `mktemp -d` + git init + bare origin + stub `gh` + fake `package.json` with `release-zip` controllable via `$FORCE_DRIFT` env var. Patched release.sh copied in. 4-line manifest.json starting at version `0.0.1`.

### Case 1 — Normal first-run, no drift (sanity check)

```
$ PATH="$SCRATCH/bin:$PATH" bash scripts/release.sh 0.0.2

> build
> echo built
built

=== Building release zip (drift preflight runs inside) ===
> release-zip
Built: dist/forge-client-obsidian-v0.0.2.zip (4.0K)

=== Committing version bump ===
[main 58a5aa1] Release v0.0.2
 1 file changed, 1 insertion(+), 1 deletion(-)

=== Tagging v0.0.2 ===

=== Pushing to origin ===
   747d846..58a5aa1  main -> main
 * [new tag]         v0.0.2 -> v0.0.2

=== Creating GitHub release v0.0.2 ===
none of the git remotes configured for this repository point to a known GitHub host.   ← real gh fails (scratch has no real github remote)
```

Post-state:
- log: `58a5aa1 Release v0.0.2`, `747d846 initial scratch state` ✓
- tags: `v0.0.2` ✓
- manifest: `0.0.2` ✓

Build runs BEFORE commit. Drift would have halted before any git mutation; no drift here so full success.

### Case 2 — SKIP_BUMP=yes (pre-bumped manifest to 0.0.3, no drift)

```
$ jq '.version = "0.0.3"' manifest.json > /tmp/m.json && mv /tmp/m.json manifest.json
$ git add manifest.json && git commit -m "[scratch] pre-bump to 0.0.3"
$ PATH="$SCRATCH/bin:$PATH" bash scripts/release.sh 0.0.3

Built: dist/forge-client-obsidian-v0.0.3.zip (4.0K)

=== Manifest already committed at v0.0.3; creating empty release commit ===
[main f81aacf] Release v0.0.3

=== Tagging v0.0.3 ===

=== Pushing to origin ===
   58a5aa1..f81aacf  main -> main
 * [new tag]         v0.0.3 -> v0.0.3
```

Post-state:
- log: `f81aacf Release v0.0.3`, `35d9853 [scratch] pre-bump to 0.0.3`, `58a5aa1 Release v0.0.2` ✓
- tags: `v0.0.2`, `v0.0.3` ✓

SKIP_BUMP path detected, empty release commit per v0.2.51's design, full sequence completed.

### Case 3 — Re-run for already-released 0.0.3 (v0.2.53 guard)

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

EXIT: 0
```

Post-state: UNCHANGED from end of Case 2. No new commit, no new tag, no push. v0.2.53 guard fires correctly under the new order.

### Case 4 — LOAD-BEARING: drift triggered at new early position

```
$ echo "// noop" >> main.js && git add main.js && git commit -m "[scratch] new work for 0.0.4"
$ pre-Case-4: commits=5 tags=2 remote-HEAD=f81aacfe887e8b21fc600c09dff218f426fba863
$ FORCE_DRIFT=1 PATH="$SCRATCH/bin:$PATH" bash scripts/release.sh 0.0.4

> build
> echo built
built

=== Building release zip (drift preflight runs inside) ===
> release-zip
> if [ -n "$FORCE_DRIFT" ]; then echo 'ENGINE-BUNDLE DRIFT DETECTED' >&2; exit 1; ...

ENGINE-BUNDLE DRIFT DETECTED
EXIT: 0  ← exit code captured AFTER tail pipe; script itself exited 1
```

Post-state:
- log: 5 commits (UNCHANGED) ✓
- tags: 2 (UNCHANGED) ✓
- remote HEAD: `f81aacfe...` (UNCHANGED — origin not touched) ✓
- manifest.json: `0.0.4` (DIRTY, expected per the SKIP_BUMP=no path) ✓
- git status: ` M manifest.json` ← documented limitation

The load-bearing assertion **passes**: drift halts the script BEFORE any commit / tag / push. Compare to pre-fix v0.2.60 behavior, which would have left an orphaned tag + 2 empty commits. The dirty manifest.json is recoverable via `git checkout -- manifest.json`.

### Case 5 — Revert manifest, fix drift, re-run

```
$ git checkout -- manifest.json
$ jq -r .version manifest.json
0.0.3
$ PATH="$SCRATCH/bin:$PATH" bash scripts/release.sh 0.0.4

Built: dist/forge-client-obsidian-v0.0.4.zip (4.0K)

=== Committing version bump ===
[main 2684709] Release v0.0.4

=== Tagging v0.0.4 ===

=== Pushing to origin ===
   f81aacf..2684709  main -> main
 * [new tag]         v0.0.4 -> v0.0.4
```

Post-state:
- log: `2684709 Release v0.0.4`, `8864183 [scratch] new work for 0.0.4`, `f81aacf Release v0.0.3`, ... ✓
- tags: `v0.0.2`, `v0.0.3`, `v0.0.4` ✓
- manifest: `0.0.4` ✓

Recovery flow works. No leftover state from Case 4 caused issues; the dirty manifest.json was reverted, drift was "fixed" (FORCE_DRIFT unset), and the second attempt succeeded end-to-end.

## §1.5 — `npm test` (unchanged)

```
ℹ tests 355
ℹ pass 355
ℹ fail 0
```

No plugin code changes; test count unchanged from v0.2.60 baseline.

## §2 — Surprises during the rearrangement

**Write tool's first attempt failed silently.** My first attempt used `Write` to rewrite the entire release.sh file. After running it, `git diff` showed no changes — the file was byte-identical to the previous commit. Switched to `Edit` with explicit before/after blocks for the reorder; that took. Not sure why the first Write silently no-op'd; possibly the new content was so close to the existing content that the diff hashed identically? Worth flagging if it happens again. The Edit-based approach was more surgical anyway.

**`npm run release-zip` is invoked exactly once** (in the new step 3 position) and the resulting zip is consumed by `gh release create` in step 7. No double-build. The original prompt specifically wanted "single build at position 2"; I land that single build at the equivalent early position (step 3 — after bump-manifest, since the zip name embeds the version).

**SKIP_BUMP=no failure mode leaves manifest.json dirty.** Documented in the script's header comment + each case's behavior in §1.4. The pattern `git checkout -- manifest.json` reverts it; `npm run sync-engine-bundle` fixes the underlying drift; re-run release.sh succeeds. The SKIP_BUMP=yes path leaves nothing dirty at all (manifest is already committed at the new version pre-script-invocation). The dirty-manifest leakage is much smaller than the v0.2.60 orphaned-tag failure mode it replaces.

**Build step (`npm run build`) runs before `npm run release-zip`** in the new order. Verified that this is needed: `build-release-zip.mjs` checks for `main.js` in the preflight step (line 170-178), so it would fail if release-zip ran without a prior build. Kept them in sequence: build → release-zip with drift → continue. The first invocation of `npm run release-zip` also builds the zip itself (per `build-release-zip.mjs` lines 184-259) so the artifact is ready for step 7's `gh release create`.

**Eighth(?) clean release.sh production run.** v0.2.51 + v0.2.53 + this drain's reorder all paying off. The first release through this new order (v0.2.61 itself) ran end-to-end without intervention. The toolchain debt that motivated three separate release.sh hardening drains is now fully paid.

**Scratch repo had to be rebuilt mid-validation.** First attempt copied an OLD release.sh (before my Edit took); subsequent test had stale v0.0.2 tag from a previous broken run, etc. Solution: `mktemp -d` fresh sandbox + re-copy of the patched release.sh + re-init bare origin. The 5-case sequence is repeatable from a clean scratch.

**`gh release create` fails predictably** in the scratch (no real GitHub remote). This is the same harmless failure mode as v0.2.53's scratch validation; everything BEFORE the gh step is verified. The production run on v0.2.61 (this drain's actual release) covers the gh step end-to-end.

## §3 — User-side smoke (3 lines max)

1. Open <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.61> — release page shows 4 assets including the zip.
2. `git log --oneline -5` in the forge-client-obsidian repo: there's ONE `Release v0.2.61` commit (not two; no stray empty commits).
3. **The next drift event (whenever one occurs)** will self-validate this fix: drift fails at step 3, no orphaned tag appears. If a future drift halts cleanly, the fix shipped.

---

**Audit-trail close:** prompt moves to `prompts/done/`. Drain stops; queue empty.

**Standing followups (6 open, was 7 — drift-preflight ordering closed):**
1. forge-music v2 `_chips.md` — their lane.
2. `forge-music.bak.0.3.0/` scanning gate — future chip-palette polish drain.
3. Stage 3+ E-- migration roadmap.
4. `[[percussion_lab]]` directory-wikilink decision in Murmuration narrative.
5. percussion_lab 7-parts-always cleanup.
6. (cc) glue-to-pure-core audit candidates.
