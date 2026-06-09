# Two small CI/release fixes: publish-vault.sh auto-bump duality + pytest collection errors

## Scope

Two independent small fixes in two different repos. Bundled because both are CI/release hygiene with no design implications. Each is its own commit.

1. **forge-registry — `publish-vault.sh` auto-bump duality.** When the author has pre-bumped a vault's `forge.toml` version in their source commit (e.g. 0.4.10 → 0.4.11), the script today reads `current_version=0.4.11` and bumps again to 0.4.12, creating a phantom "Release v0.4.12" commit on top of the author's source commit. Source commit referencing 0.4.11 becomes a lie. Fix: detect pre-bump by comparing `current_version` to the registry's `latest`, honor the author's version, skip the redundant commit + bump-on-disk.

2. **forge — pytest collection errors on two moda integration test files.** `tests/moda/test_chains_integration.py` and `tests/moda/test_go_snapshot.py` import `from tests.moda.conftest import ...`, which requires `tests/__init__.py` and `tests/moda/__init__.py` — neither exists, so pytest can't collect them. Fix: add the two empty `__init__.py` files. Unlocks those test files' coverage.

Both are surgical. No coupling between them.

Does NOT:
- Touch the constitution.
- Touch any vault content.
- Refactor either script or test infrastructure beyond the minimum needed.
- Bundle in any design changes deferred from earlier sessions (postMessage forwarding, mass-driven physics, etc).

## Why

Both came up in the immediately-prior session:

- The auto-bump duality has produced a phantom release commit on every forge-moda publish since v0.4.10. Source commits ref versions that never made it to the registry. Cosmetic but it's been bothering you and the script touches the release path, where lying git history compounds.
- The collection errors silently keep two integration test files out of every CI run. CC discovered them when running the full pytest suite during the C7/A7 tightening — 387 passed, but two test files contribute zero. Fix surfaces existing coverage we already have.

## Files to modify

### Phase 1 — `forge-registry/scripts/publish-vault.sh`

In `publish_one()` (around line 124):

- **After** reading `current_version=$(read_vault_version "$vault_dir")` and the existing emptiness check.
- **Add** a lookup of `registry_latest` for this vault from `INDEX_JSON`:
  ```bash
  local registry_latest
  registry_latest=$(jq -r --arg n "$vault_name" '.vaults[$n].latest // ""' "$INDEX_JSON")
  ```
- **Change** the version-selection block (around line 163–167) to:
  ```bash
  if [ -n "$explicit_version" ]; then
    new_version="$explicit_version"
  elif [ -n "$registry_latest" ] && [ "$current_version" != "$registry_latest" ]; then
    # Author pre-bumped — honor the source commit's version.
    new_version="$current_version"
  else
    new_version=$(bump_patch "$current_version")
  fi
  ```
- **Gate** the `write_vault_version` + the `Release v…` commit on whether a bump actually happened:
  ```bash
  if [ "$new_version" != "$current_version" ]; then
    echo "Bumping ${vault_name}/forge.toml..."
    write_vault_version "$vault_dir" "$new_version"
    (
      cd "$vault_dir"
      git add forge.toml
      git commit -m "Release v${new_version}"
    )
  else
    echo "Author pre-bumped to ${new_version}; tagging existing HEAD."
  fi
  ```
- The tag + push block (`git tag -a "v${new_version}" …`) stays unchanged — runs regardless of whether a fresh commit landed.
- The existing equality check (`if [ "$new_version" = "$current_version" ]`) currently errors out — that error path is now wrong, because pre-bump is the legitimate equal case. Reshape: error only if `explicit_version` was passed and equals current. The auto-detect cases handle equality cleanly.

Update the top-of-file comment block to document the new behavior: "Author may pre-bump `forge.toml` in their source commit; the script detects this and publishes at the source version without creating a second 'Release v…' commit."

### Phase 2 — `forge/tests/__init__.py` and `forge/tests/moda/__init__.py`

- Create `/Users/odedfuhrmann/projects/forge/tests/__init__.py` (empty file).
- Create `/Users/odedfuhrmann/projects/forge/tests/moda/__init__.py` (empty file).
- Confirm the import line in `tests/moda/test_chains_integration.py` and `tests/moda/test_go_snapshot.py` now resolves (run pytest, verify collection succeeds).
- If either file collects but has runtime failures (e.g. fixture drift, stale assumptions), report concretely. Don't paper over — the goal is to surface what's there, not to make the count look good.

If pytest's rootdir discovery picks them up some other way (e.g. via `pyproject.toml` `[tool.pytest.ini_options]` having `pythonpath` set), use the simplest path that works.

## Implementation notes

### Phase 1 risks

- The `jq` lookup needs to handle the "vault not in registry yet" case. `.vaults[$n].latest // ""` returns empty string when the vault key doesn't exist, which the `-n` test catches.
- The `git commit` step today always runs because `write_vault_version` always changes forge.toml. After the fix, in the pre-bump case forge.toml has no diff to commit. The `git add forge.toml` would still work (no-op); but `git commit` with no changes would fail under `set -e`. That's why the entire bump+commit block is gated. Confirm this works on dry-run.

### Phase 1 verification

No automated tests exist for `publish-vault.sh` (or they're hard to write — shell scripts touching real git + real GitHub aren't unit-testable cheaply). Verify by dry-running against a sandbox vault. Two scenarios to walk:

1. **Pre-bump case.** In a sandbox vault dir, edit forge.toml to bump version manually, commit. Run `bash publish-vault.sh <sandbox-vault>`. Verify: no second "Release v…" commit appears; tag `v<version>` points at the author's source commit; registry index.json updates correctly.
2. **No pre-bump case.** In a different sandbox vault, do NOT bump forge.toml. Run `bash publish-vault.sh <sandbox-vault>`. Verify: script auto-bumps, creates "Release v…" commit, tags it, registry updates.

If sandbox vaults don't exist, document what was tested (or not). Per release-path safety, **do not run against `forge-moda` or any production vault** for verification — that would create real publishes.

### Phase 2 risks

- Adding `__init__.py` files might break some import paths that today work via pytest's rootdir-as-package behavior. Run the full suite after the change and verify the previous 387 still pass (no regression), plus see what the two newly-collected test files contribute.

## Tests

- **Phase 1:** dry-run against sandbox vault(s). No automated test suite to run.
- **Phase 2:** `pytest -q` full suite from `~/projects/forge`. Report new pass/skip/fail count. Was 387/4-skipped before; expect higher (or surface real failures in the unlocked files).

## Out of scope

- Refactoring `publish-vault.sh` beyond the auto-bump fix. No restructure, no new modes, no improved error handling beyond what the fix needs.
- Adding new pytest configuration (e.g., switching to `pyproject.toml` `[tool.pytest.ini_options]`) unless it's the simplest path.
- Touching the test files themselves (`test_chains_integration.py`, `test_go_snapshot.py`). Only the `__init__.py` files are added.
- Vault content, constitution, engine code, iframe, plugin.
- Stale-shadow cleanup or anything else from the deferred list.

## Report when done

- **Phase 1 diff** — the script changes verbatim. Snippets of the before/after blocks suffice.
- **Phase 1 verification** — what sandbox vault(s) you exercised (if any), and the observed behavior on the pre-bump and no-pre-bump cases. If no sandbox available, say so and flag manual verification as a follow-up for the user.
- **Phase 2 diff** — the two new files (paths, both empty).
- **Phase 2 test results** — full pytest pass/skip/fail count. Highlight what changed vs the 387 baseline.
- **Commit SHAs** — one for forge-registry (Phase 1), one for forge (Phase 2).
- **Any deviation and why.**
- **Anything surfaced by the unlocked test files** worth flagging — pre-existing test failures, fixture drift, stale assertions.

## Commits + push

Two commits, two repos:

- `forge-registry`: "publish-vault.sh: honor author pre-bumped versions"
- `forge`: "tests: add __init__.py for moda integration test collection"

Push both to `main`.

## Don'ts

- **Don't run the script against `forge-moda` or any production vault for verification.** Sandbox-only or skip the live test.
- **Don't refactor `publish-vault.sh` beyond the auto-bump fix.** The script has other warts (unpushed-commit checks, error messaging) that are out of scope.
- **Don't modify the existing test files.** Only the `__init__.py` files are added.
- **Don't add new pytest configuration** unless the simple `__init__.py` approach doesn't work. If it doesn't, route to questions/ with the specifics.
- **Don't bundle anything from the deferred list** (postMessage forwarding, mass-driven physics, codec registry, etc).
