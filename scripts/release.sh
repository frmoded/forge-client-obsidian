#!/usr/bin/env bash
# release.sh — automate the BRAT-installable release for forge-client-obsidian.
#
# Bumps manifest.json's version, rebuilds main.js, commits the manifest bump,
# tags, pushes, and creates a GitHub release with main.js + manifest.json +
# styles.css attached as assets. BRAT picks it up on next "Check for updates."
#
# Usage:
#   bash scripts/release.sh                  # auto-bump patch (0.1.2 → 0.1.3)
#   bash scripts/release.sh 0.2.0            # explicit version
#   bash scripts/release.sh 0.2.0 "Reason"   # explicit version + tag message
#
# Requirements:
#   - git working tree clean (or only manifest.json modified)
#   - logged into `gh` CLI (run `gh auth login` once if not)
#   - npm + esbuild work (i.e., `npm run build` succeeds)
#
# When called for a version that's ALREADY been released (i.e., the
# previous commit is already `Release vX.Y.Z` for the same version),
# the script exits gracefully without creating a stray empty commit.
# v0.2.53 — added (per 2026-06-05-1000 prompt). Pre-fix, running
# release.sh twice in a row for the same version produced two empty
# `Release vX.Y.Z` commits side-by-side (the second one orphaned
# because the tag already pointed at the first). To intentionally
# re-release (e.g. to update assets), drop the existing tag first
# via `git tag -d vX.Y.Z && git push origin :vX.Y.Z`.

set -euo pipefail

# Drain 2550 — flags. Parsed BEFORE positional args so `--dry-run` can
# appear anywhere on the command line.
#   --dry-run  Run every preflight (build, drift, zip) without any
#              filesystem-visible side effects: no commit, no tag, no
#              push, no gh release. Manifest.json is bumped
#              temporarily during the run so all version-baked checks
#              still fire, and reverted to the previous value on exit.
#              Use for verifying a release will succeed before
#              committing to it.
DRY_RUN="no"
POSITIONAL=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN="yes" ;;
    -h|--help)
      grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//' | head -30
      exit 0
      ;;
    *) POSITIONAL+=("$arg") ;;
  esac
done
set -- "${POSITIONAL[@]+"${POSITIONAL[@]}"}"

# Make sure brew-installed binaries (npm, gh) are on PATH.
if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

# Drain 2550 — auto-revert manifest.json on early exit. The script
# bumps manifest.json BEFORE running preflights (build, drift check,
# zip build). If a preflight fails, `set -e` used to leave manifest at
# the new version — driver was then stuck with a "half-released" state
# (v0.2.290/291/292 all shipped this way, then had to be recovered by
# hand). Auto-revert keeps the tree consistent so a re-run picks up
# where the previous try failed.
#
# The trap only fires on non-zero exit AND after the manifest was
# bumped in-script (guarded by MANIFEST_BUMPED). The final `exit 0`
# path resets the trap explicitly so a successful release doesn't
# revert the bump.
MANIFEST_BUMPED="no"

# Drain 2026-08-21-1410 — revert every TRACKED file the build rewrites,
# not just manifest.json.
#
# `npm run build` also writes `assets/.bundle-version` (the sentinel
# restore-inlined-assets.ts compares against BUNDLED_ASSETS_VERSION).
# It is the only other tracked build output — main.js and the three
# src/*.generated.ts files are gitignored, so they cannot dirty the
# tree. Before this, --dry-run left the sentinel modified despite its
# banner promising "no filesystem-visible side effects", and the NEXT
# invocation aborted on the clean-tree guard: the dry run broke the
# script it was rehearsing.
_revert_build_artifacts() {
  git checkout -- manifest.json 2>/dev/null || true
  git checkout -- assets/.bundle-version 2>/dev/null || true
}

_cleanup_on_error() {
  local ec=$?
  if [ "$ec" -ne 0 ] && [ "$MANIFEST_BUMPED" = "yes" ]; then
    echo
    echo "=== Release aborted (exit code $ec) — reverting manifest.json bump ==="
    _revert_build_artifacts
    echo "Manifest + build artifacts reverted. Fix the underlying failure and re-run release.sh."
  fi
  return $ec
}
trap _cleanup_on_error EXIT

# --- Sanity: required tools ---
for cmd in git npm jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: missing required command: $cmd"
    [ "$cmd" = "jq" ] && echo "  Install with: brew install jq"
    exit 1
  fi
done

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI (gh) not installed."
  echo "  Install with: brew install gh"
  echo "  Then: gh auth login"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh CLI not authenticated. Run: gh auth login"
  exit 1
fi

# --- Drain 2026-08-03-1335 — auto-sync bundled vaults ---
#
# Runs FIRST, before the clean-tree preflight, because the sync writes
# into assets/vaults/ and would otherwise trip that check itself.
#
# Pre-drain, bundled-vault drift cost the driver a four-step round
# trip: release.sh aborts with a drift error naming the files → run
# sync-bundled-vault.mjs by hand → git add + commit its output → re-run
# release.sh. The drift preflight in build-release-zip.mjs knew the fix
# (its own message says which command to run) but wouldn't apply it.
#
# One `--all` call, not a per-vault loop: sync-bundled-vault.mjs
# already iterates its own KNOWN_VAULTS. Naming the vaults here would
# be a second copy of that list, free to drift from the real one.
#
# The commit is GATED on the bump check passing (see below). A release
# script that commits and then fails its own preflight is worse than
# the friction it removes.
if [ "$DRY_RUN" = "yes" ]; then
  echo
  echo "=== Auto-sync bundled vaults (SKIPPED — dry run) ==="
  echo "  --dry-run promises no filesystem-visible side effects, and the"
  echo "  sync writes into assets/vaults/. If drift is present, the drift"
  echo "  preflight below will fire; that is the dry run reporting real"
  echo "  state, not a bug. Run without --dry-run to auto-resolve it."
else
  echo
  echo "=== Auto-sync bundled vaults ==="
  node scripts/sync-bundled-vault.mjs --all

  if [ -n "$(git status --porcelain assets/vaults/ || true)" ]; then
    echo
    echo "  sync produced changes — validating before commit"

    # The bump rule (assets/vaults content change ⇒ forge.toml version
    # bump in the same vault) is enforced later at the
    # check-bundled-vault-bump.mjs preflight, against baseline..HEAD.
    # If we committed the sync output blind and it violated the rule,
    # that preflight would abort a release whose offending commit was
    # already on main — recoverable only by reset or revert.
    #
    # So run the same check now, in --worktree mode, while the sync
    # output is still just working-tree edits. A failure here is undone
    # with `git checkout -- assets/vaults/`.
    if ! node scripts/check-bundled-vault-bump.mjs --worktree; then
      echo
      echo "ERROR: the bundled-vault sync produced content changes that"
      echo "       violate the forge.toml bump rule (see above)."
      echo "       Nothing was committed. Resolve in the source vault and"
      echo "       re-run release.sh."
      exit 1
    fi

    git add assets/vaults/
    git commit -q -m "sync bundled vaults (release-prep)"
    echo "  ✓ committed: $(git log -1 --pretty=%h) sync bundled vaults (release-prep)"
  else
    echo "  ✓ bundled vaults already in sync (nothing to commit)"
  fi
fi

# --- Current version ---
CURRENT_VERSION="$(jq -r '.version' manifest.json)"
echo "Current version: $CURRENT_VERSION"

# --- New version ---
if [ $# -ge 1 ]; then
  NEW_VERSION="$1"
else
  # Auto-bump patch: 0.1.2 → 0.1.3
  IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
  NEW_VERSION="${major}.${minor}.$((patch + 1))"
fi
echo "New version:     $NEW_VERSION"

# Validate format
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: version '$NEW_VERSION' is not semver (X.Y.Z)."
  exit 1
fi

# Validate progression. Pre-bumped manifest is a tolerated case
# (common when an upstream commit bumped manifest as part of the
# same change set — multi-repo prompts where the manifest bump
# rides on the main work commit). v0.2.51 — fixed (per
# 2026-06-05-0700 prompt). Pre-fix, this hard-rejected and CC had
# to drive 10+ releases by hand.
if [ "$NEW_VERSION" = "$CURRENT_VERSION" ]; then
  echo "Manifest already at $NEW_VERSION — skipping bump + commit step."
  echo "(Common when an upstream commit bumped manifest as part of"
  echo " the same change set.)"
  SKIP_BUMP="yes"
else
  SKIP_BUMP="no"
fi

# Don't allow release on a dirty tree (except manifest.json itself,
# which release.sh may modify in the bump step). When SKIP_BUMP=yes
# the manifest is already committed too, so a fully clean tree is
# required.
if [ "$SKIP_BUMP" = "yes" ]; then
  DIRTY="$(git status --porcelain || true)"
else
  DIRTY="$(git status --porcelain | grep -v '^.. manifest.json$' || true)"
fi
if [ -n "$DIRTY" ]; then
  echo "ERROR: working tree has uncommitted changes:"
  echo "$DIRTY"
  echo "Commit or stash before releasing."
  exit 1
fi

# Detect "already released this version" and exit cleanly. Guards
# against running release.sh twice in succession for the same version
# (common during smoke / debugging). Pre-fix, the second invocation
# created a stray empty `Release vX.Y.Z` commit before failing at
# the duplicate-tag step — see v0.2.51 history (47fe3ed/cba97d1).
# v0.2.53 — added (per 2026-06-05-1000 prompt). Only fires on the
# SKIP_BUMP path because that's the only path where the prior commit
# could already be the release marker without intermediate work.
LAST_COMMIT_MSG="$(git log -1 --pretty=%s)"
if [ "$SKIP_BUMP" = "yes" ] && [ "$LAST_COMMIT_MSG" = "Release v${NEW_VERSION}" ]; then
  echo
  echo "=== Already released v${NEW_VERSION} (previous commit is the release marker) ==="
  echo "Nothing to do. The tag + GH release exist; install-latest.sh works."
  echo
  echo "If you intended to re-run the release for some reason (e.g., asset"
  echo "update), drop the existing tag with:"
  echo "  git tag -d v${NEW_VERSION} && git push origin :v${NEW_VERSION}"
  echo "and run release.sh again."
  exit 0
fi

# Tag message
TAG_MSG="${2:-Release v${NEW_VERSION}}"

# --- Bump manifest (skipped when pre-bumped upstream) ---
if [ "$SKIP_BUMP" = "no" ]; then
  echo
  echo "=== Bumping manifest.json: $CURRENT_VERSION → $NEW_VERSION ==="
  tmp="$(mktemp)"
  jq --arg v "$NEW_VERSION" '.version = $v' manifest.json > "$tmp" && mv "$tmp" manifest.json
  # Drain 2550 — mark for the EXIT trap so a preflight failure
  # between here and the commit rolls the bump back automatically.
  MANIFEST_BUMPED="yes"
fi

# --- Build ---
echo
echo "=== Building plugin ==="
npm run build

# --- Verify required release artifacts ---
for f in main.js manifest.json; do
  if [ ! -f "$f" ]; then
    echo "ERROR: required release asset missing: $f"
    exit 1
  fi
done

# --- v0.2.133 — inlined-version drift preflight (per v0.2.131 §4 #1) ---
# scripts/inline-plugin-version.mjs bakes manifest.json's version
# into main.js at build time as PLUGIN_VERSION_AT_BUILD. The v0.2.131
# onload self-check compares this against the on-disk manifest.json
# and surfaces a Notice on mismatch — defending the cohort against
# BRAT update-without-main.js failures.
#
# Belt-and-suspenders: catch a build-script ordering regression
# BEFORE publishing a release where the two values would silently
# drift. If inline-plugin-version.mjs didn't run (or ran with stale
# data), this guard fires and the release stops.
INLINED_VERSION="$(grep -o 'PLUGIN_VERSION_AT_BUILD[[:space:]]*=[[:space:]]*"[^"]*"' main.js | head -1 | sed 's/.*"\(.*\)"/\1/')"
if [ -z "$INLINED_VERSION" ]; then
  echo "ERROR: PLUGIN_VERSION_AT_BUILD not found in compiled main.js."
  echo "Likely cause: scripts/inline-plugin-version.mjs didn't run before"
  echo "esbuild, or the constant was renamed without updating this check."
  exit 1
fi
if [ "$INLINED_VERSION" != "$NEW_VERSION" ]; then
  echo "ERROR: main.js inlined version ($INLINED_VERSION) != manifest version ($NEW_VERSION)"
  echo "Likely cause: inline-plugin-version.mjs ran against an older manifest,"
  echo "or build step ordering was broken (must run AFTER manifest bump)."
  exit 1
fi
echo "✓ Inlined version $INLINED_VERSION matches manifest"

# --- v0.2.144 — bundled-vault bump preflight (per v0.2.141 §5.1) ---
# Enforces cc-prompt-queue.md HARD RULE (line 356): any bundled-vault
# content change MUST be accompanied by a forge.toml version bump in
# the same vault. Catches the v0.2.135 §C class of violation BEFORE
# it ships (that drain modified bundled forge-tutorial _meta/_chips.md
# without bumping its forge.toml; cohort users never received the
# fix until v0.2.141 corrected the omission).
if ! node scripts/check-bundled-vault-bump.mjs; then
  echo "ERROR: bundled-vault bump check failed. See output above."
  exit 1
fi

STYLES_PRESENT="no"
[ -f styles.css ] && STYLES_PRESENT="yes"

# --- Build release zip (drift preflight runs inside) ---
# v0.2.51 — added (per 2026-06-05-0700 prompt). install-latest.sh
# downloads forge-client-obsidian-vX.Y.Z.zip from the release
# assets; pre-fix this script only uploaded main.js + manifest.json
# + styles.css, so install-latest.sh hit 404 on every release until
# CC manually ran npm run release-zip + gh release upload (10
# releases handled manually before this patch).
#
# 2026-06-06-0930 — MOVED EARLIER in the script (was after push,
# now before commit). build-release-zip.mjs's section 2b runs the
# engine-bundle drift preflight; if drift is detected, it exits 1
# here, BEFORE any commit / tag / push state mutation. Pre-fix,
# drift caught at the late position left orphaned tags (v0.2.58
# wart). When SKIP_BUMP=no AND drift fires here, manifest.json is
# left at the new version (dirty); user reverts via
# `git checkout -- manifest.json`, runs `npm run sync-engine-bundle`,
# and re-runs release.sh. SKIP_BUMP=yes leaves nothing dirty.
echo
echo "=== Building release zip (drift preflight runs inside) ==="
npm run release-zip

ZIP_PATH="dist/forge-client-obsidian-v${NEW_VERSION}.zip"
if [ ! -f "$ZIP_PATH" ]; then
  echo "ERROR: expected zip at $ZIP_PATH not produced by 'npm run release-zip'."
  echo "Check scripts/build-release-zip.mjs output path."
  exit 1
fi
echo "Built: $ZIP_PATH ($(du -h "$ZIP_PATH" | cut -f1))"

# --- Commit, tag, push ---
# Drain 2550 — in dry-run mode, we've verified everything works but
# stop before mutating any git or GitHub state. Manifest bump is
# reverted by the EXIT trap because we bail with exit 0 AFTER clearing
# MANIFEST_BUMPED — actually the reverse: we want to revert the bump
# EVEN on success in dry-run, so leave MANIFEST_BUMPED=yes and use a
# separate DRY_RUN_SUCCESS signal that the trap honors.
if [ "$DRY_RUN" = "yes" ]; then
  echo
  echo "=== DRY-RUN COMPLETE — all preflights passed, no state mutation ==="
  echo "  ✓ manifest bumped $CURRENT_VERSION → $NEW_VERSION (will revert on exit)"
  echo "  ✓ build succeeded"
  echo "  ✓ inlined version drift check passed"
  echo "  ✓ bundled-vault bump check passed"
  echo "  ✓ release zip built: $ZIP_PATH ($(du -h "$ZIP_PATH" | cut -f1))"
  echo "  ✓ engine-bundle + bundled-vault drift checks clean"
  echo
  echo "To actually release, re-run without --dry-run:"
  echo "  bash scripts/release.sh $NEW_VERSION"
  # Force manifest revert on the successful dry-run path.
  # (MANIFEST_BUMPED still 'yes' → trap fires on exit; force nonzero so trap engages.)
  _revert_build_artifacts
  echo "Manifest + build artifacts reverted."
  MANIFEST_BUMPED="no"   # tell the trap: nothing more to revert
  trap - EXIT             # disable trap so a clean exit doesn't misfire
  exit 0
fi

echo
if [ "$SKIP_BUMP" = "no" ]; then
  echo "=== Committing version bump ==="
  git add manifest.json
  git commit -m "Release v${NEW_VERSION}"
  # Drain 2550 — commit is committed; the version bump is now
  # permanent. Clear MANIFEST_BUMPED so any later failure doesn't
  # try to `git checkout` the (now-committed) file.
  MANIFEST_BUMPED="no"
else
  echo "=== Manifest already committed at v${NEW_VERSION}; creating empty release commit ==="
  # Empty commit preserves the "Release vX.Y.Z" marker in
  # `git log --oneline`, matching the non-skip path's shape. The
  # tag itself is the canonical release marker, but the consistent
  # commit shape keeps `git log` patterns predictable.
  git commit --allow-empty -m "Release v${NEW_VERSION}"
fi

echo
echo "=== Tagging v${NEW_VERSION} ==="
git tag -a "v${NEW_VERSION}" -m "${TAG_MSG}"

echo
echo "=== Pushing to origin ==="
git push origin main
git push origin "v${NEW_VERSION}"

# --- Create GitHub release with assets ---
echo
echo "=== Creating GitHub release v${NEW_VERSION} ==="

ASSETS=(main.js manifest.json)
[ "$STYLES_PRESENT" = "yes" ] && ASSETS+=(styles.css)
ASSETS+=("$ZIP_PATH")

# v0.2.179 — also upload every vendored wheel as an individual asset.
# pyodide-host.ts's wheel CDN fallback (v0.2.174) fetches each wheel
# by name from the release URL when local assets/ is absent (the
# 100% case for BRAT users — BRAT only ships main.js + manifest.json
# + styles.css). Pre-v0.2.179, wheels were uploaded manually for
# v0.2.174 and never re-uploaded; v0.2.175–178 releases had no wheels
# attached, so the CDN fallback 404'd and music-domain snippets
# (murmuration) failed with `name 'play_at_offsets' is not defined`.
# This loop auto-adds every assets/wheels/*.whl to the release.
if [ -d "assets/wheels" ]; then
  for whl in assets/wheels/*.whl; do
    [ -f "$whl" ] && ASSETS+=("$whl")
  done
fi

# BRAT Phase 1 (drain 2026-08-19-0900) — the Pyodide runtime joins the
# wheels as individual assets. A BRAT install gets no `assets/` at all,
# so both binary buckets have to be fetchable per-file from THIS
# version's release; src/asset-manifest.generated.ts bakes the sha256 of
# every file uploaded here, and the client refuses anything that does
# not match.
#
# Loose files rather than one pyodide-runtime.zip: the plugin has no
# client-side unzip (fflate is not a dependency), wheels are already
# per-file so the fetch loop exists either way, and a failed 8 MB wasm
# then retries alone instead of dragging 14 MB behind it.
if [ -d "assets/pyodide" ]; then
  for pyf in assets/pyodide/*; do
    [ -f "$pyf" ] && ASSETS+=("$pyf")
  done
fi

gh release create "v${NEW_VERSION}" \
  --title "v${NEW_VERSION} — ${TAG_MSG}" \
  --notes "Release v${NEW_VERSION}. BRAT users: run 'Check for updates' to pull main.js. Fresh installs: use install-latest.sh against the attached zip." \
  "${ASSETS[@]}"

# CW-release-script-gap (2026-07-16): post-upload verification. `gh release
# create` returning 0 does NOT guarantee every asset in the ASSETS array
# was actually uploaded — v0.2.296 shipped with only main.js + manifest.json
# despite the full ASSETS list; the zip was silently dropped. This check
# fetches the release's remote asset list and asserts every expected file
# is present. Fires a loud diagnostic on any missing asset so the driver
# can re-upload with `gh release upload` before install-latest.sh users
# start hitting 404s.
echo
echo "=== Verifying uploaded assets ==="
REMOTE_ASSETS="$(gh release view "v${NEW_VERSION}" --json assets --jq '.assets[].name' 2>/dev/null || true)"
MISSING=()
for f in "${ASSETS[@]}"; do
  # Match on basename since gh strips paths on upload.
  base="$(basename "$f")"
  if ! grep -qFx "$base" <<< "$REMOTE_ASSETS"; then
    MISSING+=("$base")
  fi
done
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "WARNING: ${#MISSING[@]} expected asset(s) missing from the release:"
  for m in "${MISSING[@]}"; do
    echo "  - $m"
  done
  echo
  echo "Re-upload the missing assets with:"
  for m in "${MISSING[@]}"; do
    local_path=""
    for f in "${ASSETS[@]}"; do
      if [ "$(basename "$f")" = "$m" ]; then local_path="$f"; break; fi
    done
    echo "  gh release upload v${NEW_VERSION} \"$local_path\" --clobber"
  done
  echo
  echo "Do NOT skip this — install-latest.sh users hit 404 without them."
else
  echo "✓ All ${#ASSETS[@]} expected assets uploaded successfully."
fi

echo
echo "=== Done ==="
echo "Release v${NEW_VERSION} published."
echo "BRAT users: Settings → BRAT → Check for updates → pulls the new main.js."
echo "  styles.css included: $STYLES_PRESENT"
echo "  zip:                 $ZIP_PATH"

# Drain 2550 — happy path complete. Clear the EXIT trap so a shell
# exit doesn't accidentally revert a successful release commit.
trap - EXIT
