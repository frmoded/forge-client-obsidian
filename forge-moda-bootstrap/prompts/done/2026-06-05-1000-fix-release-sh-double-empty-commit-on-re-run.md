# Fix release.sh — don't create a stray empty `Release vX.Y.Z` commit on re-run

## Scope

`scripts/release.sh` in `forge-client-obsidian` creates an empty `Release vX.Y.Z` commit in its SKIP_BUMP path (the v0.2.51 fix for pre-bumped manifest). If release.sh is run a SECOND time for the same version (a common case during end-to-end smoke), a second empty commit gets created — the v0.2.51 release history shows this:

```
47fe3ed Release v0.2.51   ← stray (from re-run during smoke)
cba97d1 Release v0.2.51   ← correct (tag points here)
52086d2 [...release.sh-fix...] v0.2.51 ...
```

The stray commit is functionally harmless (no tag points at it; install-latest.sh works; CI unaffected) but creates audit-trail noise — `git log --oneline` shows "Release v0.2.51" twice, which reads as a hiccup.

This prompt fixes release.sh to detect "previous commit is already `Release vX.Y.Z` for this version" and exit gracefully with a "nothing to do" message instead of creating another empty commit.

What this prompt does NOT do:
- Touch the SKIP_BUMP logic itself (v0.2.51's fix is correct on the FIRST run).
- Touch the zip-build or asset-upload paths.
- Rewrite release.sh in JS/TS.
- Make idempotency work for "non-empty-commit + same-version" cases (those are user error and should fail clearly).

## Why

Per Mission's speed-as-tiebreaker: clean git log is one of the cheapest forms of audit-trail hygiene. The fix is small (~5-10 lines of bash), CC can validate it end-to-end without any Obsidian / UI involvement, and the result is a permanently cleaner release history.

## Files to modify

- **`~/projects/forge-client-obsidian/scripts/release.sh`** — add the detector + graceful exit.
- **`~/projects/forge-client-obsidian/manifest.json`** — `{CURRENT} → {NEXT_PATCH}` placeholder.
- **`~/projects/forge-client-obsidian/INSTALL.md`** — version pin update.

(No constitution or protocol touch. Pure script fix.)

## Files to read first

- `~/projects/forge-client-obsidian/scripts/release.sh` — current state (v0.2.51 fix is the baseline; build on it).
- The git history around `47fe3ed` and `cba97d1` to confirm the "two consecutive empty Release commits" pattern.

## Implementation notes

### The detector

After the SKIP_BUMP detection but BEFORE creating the empty commit:

```bash
# Detect "already released this version" — skip the empty commit + tag attempt.
# This guards against running release.sh twice in succession for the same
# version (common during smoke). The tag itself is idempotent (gh accepts
# the same tag being re-pushed) but the empty commit accumulates.
LAST_COMMIT_MSG="$(git log -1 --pretty=%s)"
if [ "$SKIP_BUMP" = "yes" ] && [ "$LAST_COMMIT_MSG" = "Release v${NEW_VERSION}" ]; then
  echo
  echo "=== Already released v${NEW_VERSION} (previous commit is the release marker) ==="
  echo "Nothing to do. The tag + GH release exist; install-latest.sh works."
  echo "If you intended to re-run the release for some reason (e.g. asset update),"
  echo "drop the existing tag with 'git tag -d v${NEW_VERSION} && git push origin :v${NEW_VERSION}'"
  echo "and run release.sh again."
  exit 0
fi
```

This sits between the SKIP_BUMP detection (current line ~83) and the bump-or-skip-bump-commit block (current line ~115).

### Edge cases CC should handle

- **Tag exists but the previous commit ISN'T the release marker** (e.g., you tagged then made another commit): the script should still proceed — the user is intentionally trying to re-release with new content. Don't block.
- **SKIP_BUMP=no but previous commit is already `Release vX.Y.Z`**: this is the rarer case where someone bumped manifest, ran release.sh, then bumped manifest AGAIN to the same version, and ran again. The check above won't trigger because SKIP_BUMP=no. That's fine — the bump-commit step will detect the no-op (`git commit` with no changes) and fail with a clear error.
- **`gh release create` is idempotent only if the tag is**: when SKIP_BUMP=yes triggers the early-exit, the tag already exists and `gh release create` doesn't re-run. Correct shape.

### Notes update

Update the script's header comment (around line 4-15) to document the new behavior:

```bash
# When called for a version that's ALREADY been released (i.e., the previous
# commit is already `Release vX.Y.Z` for the same version), the script exits
# gracefully without creating a stray empty commit. To intentionally re-release
# (e.g., to update assets), drop the existing tag first.
```

## Tests

### Auto-verifiable by CC — and CC owns this end-to-end

**Crucial point**: this fix can and SHOULD be validated entirely without the user. No Obsidian, no Tamar's vault, no fresh laptop. Pure shell + git work in a scratch directory. CC runs the validation themselves; the user just sees the §3 results.

CC builds a scratch test harness for the script:

```bash
# Set up a scratch git repo with a release.sh, a fake manifest.json, etc.
SCRATCH=$(mktemp -d)
cd "$SCRATCH"
git init
mkdir scripts
cp ~/projects/forge-client-obsidian/scripts/release.sh scripts/

# Create a fake manifest.json + main.js / styles.css to satisfy release.sh's
# expectations. Set version to "0.0.1".
cat > manifest.json <<'EOF'
{
  "id": "test-plugin",
  "version": "0.0.1",
  "name": "Test"
}
EOF
echo "// fake main.js" > main.js
echo "/* fake styles.css */" > styles.css

# Create a fake package.json with a no-op release-zip script so `npm run
# release-zip` doesn't break (or stub it via PATH manipulation).
cat > package.json <<'EOF'
{ "name": "test-plugin", "scripts": { "build": "echo built", "release-zip": "mkdir -p dist && echo zip > dist/test-plugin-v0.0.1.zip" } }
EOF

git add -A
git commit -m "initial scratch state"
# Set up a fake "origin" remote to satisfy the push step (in CI, --dry-run; locally, NO).
```

Then run the validation cases:

**Case 1 — Normal first-run with auto-bump (sanity check, must still work):**
```bash
# Start with manifest.json at 0.0.1; expect bump to 0.0.2 + Release commit + tag.
# In a no-network scratch repo, the gh + push steps will fail; verify the
# in-repo state up to that failure point.
```

**Case 2 — Pre-bumped manifest (the v0.2.51 SKIP_BUMP fix, must still work):**
```bash
# Pre-bump manifest to 0.0.2, commit, then run release.sh.
# Verify SKIP_BUMP path taken; empty Release commit created; tag created.
```

**Case 3 — Re-run for the same version (THE NEW FIX):**
```bash
# After Case 2, run release.sh again for 0.0.2.
# Verify: "Already released v0.0.2 (previous commit is the release marker)" message.
# Verify: NO second empty commit created (`git log -1 --pretty=%s` still shows "Release v0.0.2", only one of them).
# Verify: script exits 0.
```

**Case 4 — Intentional re-release after manual commits (must NOT block):**
```bash
# After Case 2, make some other commit (not "Release v0.0.2"), then run release.sh
# for 0.0.2 again. Verify the script proceeds (since last commit isn't the release marker).
# Expected: it WILL fail at the bump-commit step (nothing to commit), but that's
# user-error, not the new check's fault. The new check only fires for the specific
# "double-empty-commit" pattern.
```

CC runs each case verbatim and pastes the output in §1.4.

`npm test` in the actual forge-client-obsidian repo → unchanged.

### Deferred to user

For this prompt specifically: **minimal user-side smoke**. Since CC validates end-to-end via the scratch harness above, the user's role is just confirmation:

1. Read §1.4 output — confirm the 4 cases produce the expected behaviors.
2. Optionally re-run case 3 in the actual forge-client-obsidian repo (which DOES have network access to push tags + create GH releases) at the next real release. Verify no stray empty commit appears.
3. That's it. The fix doesn't need any user-side Obsidian interaction.

This is the ideal shape for fixes that are pure-toolchain — minimal user time required.

## Out of scope

- Refactoring release.sh into a multi-script pipeline (premature).
- Handling `gh release create` rate limits or auth re-prompts.
- Adding a `--force` flag for "I really mean to re-release."
- Touching the install path or any downstream consumer.

## Don'ts

- Don't change the behavior of the first-run path (`SKIP_BUMP=no`) — that's the bump-and-commit-and-tag path; correct as-is.
- Don't add network calls in the new check (it's purely local git inspection).
- Don't break Case 4 (intentional re-release after legitimate work commits).
- Don't bump versions concretely — use `{CURRENT} → {NEXT_PATCH}` placeholder.

## Report when done

Standard §0–§3 per cc-prompt-queue.md:

- **§0** — manifest before/after, commit SHA, push, tag, release URL, SHA round-trip, line counts.
- **§1.1** — describe the fix (no TDD test cases for shell-script work; the 4 scratch-repo cases ARE the assertions).
- **§1.2** — pre-fix evidence: the git history around `47fe3ed` and `cba97d1` showing the doubled Release commits in v0.2.51.
- **§1.3** — fix landed: cited line-number diff in release.sh.
- **§1.4** — full scratch-repo validation output (4 cases verbatim).
- **§1.5** — `npm test` in forge-client-obsidian (unchanged).
- **§2** — surprises during the scratch-repo harness building; any quirks discovered about release.sh's other paths.
- **§3** — minimal user-side smoke (the confirmation steps above; SHOULD be a 3-line checklist max).
