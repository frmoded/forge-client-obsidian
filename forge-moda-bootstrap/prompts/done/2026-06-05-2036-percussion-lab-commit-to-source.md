<!-- author: forge-music-cowork
     second-pass review: not requested — Level-1 promotion of a previewed decomposition
     focus: commit + tag forge-music v0.3.9; explicitly NOT bundling into plugin -->

# Percussion Lab — Level-1 promote: commit to forge-music source vault (NOT plugin bundle)

## CRITICAL: Level-1 promote — source-vault commit ONLY, no plugin bundle, no plugin release

The percussion_lab preview drain (`2026-06-04-2228-percussion-lab-decompose-murmuration.md`) shipped uncommitted working-tree changes in `forge-music/`. The user verified Path A (forge-music opened as a vault directly) — listened to refactored Murmuration, confirmed behavior preservation, reviewed dynamic marks, MusicXML round-trip in MuseScore. All pass.

But the **cross-subdir resolution gap** (preview drain §4) blocks the Level-2 promotion (bundle into plugin + plugin release): in the production bundled-library-subdir distribution shape per constitution A5.3, bare references like `context.compute("solitary")` from Murmuration's Python facet fail because the resolver's A4.1 caller-scoped probe only checks the caller's own subdirectory, not sibling subdirs of the same vault.

This prompt does **Level 1 only**:

- Commit the working-tree changes to `forge-music/` (8 section snippets + Murmuration refactor).
- Commit the test file to `forge/tests/music/`.
- Bump `forge-music/forge.toml` to v0.3.9.
- Tag `v0.3.9` on `forge-music` repo.
- Push commits + tag to `origin`.

**Level 2 is explicitly DEFERRED** until forge-core ships an A4.1 extension (or equivalent) enabling cross-subdir bare-reference resolution within a single vault. When that lands, a future drain will bundle forge-music v0.3.9 into the plugin and cut a plugin release.

DO NOT in this drain:
- DO NOT modify `forge-client-obsidian/` in any way (no bundle sync, no manifest bump, no INSTALL.md edit, no plugin commit, no plugin tag, no plugin release).
- DO NOT run `npm run sync-engine-bundle` or any bundle script.
- DO NOT touch the constitution.
- DO NOT amend percussion_lab content (the preview is what gets committed; no last-minute polish).
- DO NOT fix the `_instrument_key` collision in lib.py (that's a separate follow-up).
- DO NOT modify any other forge-music content (blues, percussion/loom or phase_*, etc.).

## Why

User signaled "promot" after smoking Path A successfully (forge-music opened as vault directly, Murmuration computed, audio identical to v0.2.37 baseline, dynamic marks visible per section on kick stave, MusicXML rendered cleanly in MuseScore). The decomposition is artistically validated; behavior is preserved.

Level-1 promote (source commit) preserves the validated artifact in the repo's history and tags it for future bundling. It does not yet ship to users via the plugin bundled-vault path — that requires the cross-subdir resolution gap to close first. The two-level split lets the decomposition not bit-rot in working-tree state while the architectural fix progresses.

The audit trail matters: committing now ties the decomposition to the v0.2.37 baseline that validated it (per the smoke). If the A4.1 extension lands months later, the bundling drain still references this commit as the artistic ground truth.

## Files to commit (in `forge-music/`)

All paths absolute. Current working-tree state (verified via `git status` at drain start):

- `percussion_lab/README.md` (NEW)
- `percussion_lab/solitary.md` (NEW)
- `percussion_lab/companions.md` (NEW)
- `percussion_lab/gathering.md` (NEW)
- `percussion_lab/swarming.md` (NEW)
- `percussion_lab/peak.md` (NEW)
- `percussion_lab/dispersing.md` (NEW)
- `percussion_lab/threading.md` (NEW)
- `percussion_lab/resting.md` (NEW)
- `percussion/murmuration.md` (MODIFIED — Python facet refactored to thin orchestrator)

## Files to commit (in `forge/`)

- `tests/music/test_percussion_lab.py` (NEW)

The `forge/` commit does NOT include changes to `docs/specs/constitution.md` (that's a pre-existing uncommitted state from a different drain — forge-core territory) or `docs/specs/chips-schema.md` (same — forge-core territory). CC must explicitly `git add` only `tests/music/test_percussion_lab.py` from the new untracked files; the pre-existing modifications stay untouched.

## Files to modify (version bumps)

- `/Users/odedfuhrmann/projects/forge-music/forge.toml` — bump `version = "0.3.8"` → `version = "0.3.9"`. Within-vault, concrete number (no cross-vault placeholders needed since the plugin is NOT being bumped in this drain).

## Implementation steps

### In `forge-music/`

1. Verify `git status` shows the expected uncommitted state:
   - `M percussion/murmuration.md`
   - `?? percussion_lab/` (9 new files)
   - Plus pre-existing untracked `.forge/` and `.obsidian/` — leave alone.
2. Bump `forge.toml` to `version = "0.3.9"`.
3. `git add percussion/murmuration.md percussion_lab/ forge.toml`. Do NOT `git add .forge/` or `.obsidian/`.
4. `git commit -m "[2026-06-05-2036-percussion-lab-commit-to-source] v0.3.9 — decompose Murmuration into 8 percussion_lab section snippets"`. Body: brief sentence about behavior preservation + cross-subdir Level-2 deferral.
5. `git tag v0.3.9`.
6. `git push origin main --tags`.

### In `forge/`

1. Verify `git status` shows the expected state:
   - `M docs/specs/constitution.md` (PRE-EXISTING — leave alone)
   - `?? docs/specs/chips-schema.md` (PRE-EXISTING — leave alone)
   - `?? tests/music/test_percussion_lab.py` (this drain's contribution)
2. `git add tests/music/test_percussion_lab.py`. Do NOT touch the constitution.md modification or the chips-schema.md file — those are forge-core's responsibility in a separate drain.
3. `git commit -m "[2026-06-05-2036-percussion-lab-commit-to-source] add test_percussion_lab.py — 8 cases for the section-snippet vocabulary"`. Body: brief.
4. `git push origin main`. No tag on forge — engine commits don't get version tags; only forge-music vault releases do.

### Tests

Run `pytest -q tests/music/test_percussion_lab.py -v` in `/Users/odedfuhrmann/projects/forge/` — confirm all 8 pass (this re-runs the preview drain's tests; they should still pass against the committed state).
Run `pytest -q` (full forge suite) — confirm no regressions. Report pass/skip count.

DO NOT run `npm test` in the plugin — explicitly out of scope.
DO NOT run `npm run sync-engine-bundle` — explicitly out of scope.
DO NOT build a release zip — explicitly out of scope.

## Out of scope (HARD)

- Plugin work of any kind (no `forge-client-obsidian/` changes, no version bump, no bundle sync, no release).
- Constitution amendments (forge-core territory).
- Chips-schema.md authoring (forge-core territory).
- `_instrument_key` lib.py fix (separate follow-up).
- A4.1 extension work (forge-core territory).
- Phase 4 sister piece (deferred until Level 2 path is clear).
- Renaming percussion_lab/ to anything else (the name was chosen during preview; not re-litigated here).
- Amending the section snippets' content (no polish; the preview state is what gets committed).

## Report when done

Write feedback to `/Users/odedfuhrmann/projects/forge-moda-bootstrap/prompts/feedback/2026-06-05-2036-percussion-lab-commit-to-source.md`:

0. **Level-1 confirmation.** Explicit checklist: ✓ forge-music commit + tag + push; ✓ forge commit + push; ✗ no forge-client-obsidian changes; ✗ no plugin version bump; ✗ no bundle sync; ✗ no plugin release.
1. **forge-music commit.** SHA + commit message + verified push to origin. Tag v0.3.9 SHA. Tag pushed to origin verified via `git ls-remote --tags origin v0.3.9`.
2. **forge commit.** SHA + commit message + verified push. Confirm constitution.md and chips-schema.md were NOT touched (`git log -1 --stat` showing only `tests/music/test_percussion_lab.py` in the changed-files list).
3. **Tests.** Full pytest output (re-run from clean working tree).
4. **Working tree post-drain.** `git status` output for forge-music + forge + forge-client-obsidian. Expected: forge-music clean, forge has only the pre-existing constitution.md/chips-schema.md state, forge-client-obsidian fully clean.
5. **Deferred items explicitly named.** A4.1 extension (forge-core), `_instrument_key` lib.py fix (forge-music/forge-core), Phase 4 sister piece (forge-music), Level-2 bundle drain (waits on A4.1).

## Don'ts

- Don't run `git add .` anywhere. Use explicit paths so no pre-existing untracked files get swept in.
- Don't amend the commit messages with auto-tooling signatures or co-author lines unless the repo's existing commit style already has them.
- Don't sign tags (`-s` flag) unless the repo already uses signed tags — check `git tag -v` on recent tags to verify the convention.
- Don't trigger any other repo's release flow.
- Don't bump forge-music to 0.4.x — patch bump is correct (additive content, no breaking changes to the existing snippets).
- Don't force-push.
