// v0.2.144 — pure-core: enforce cc-prompt-queue.md line 356 HARD RULE
// for bundled-vault content + forge.toml bump pairing.
//
// Per v0.2.141 §5.1 retrospective: v0.2.135 §C shipped a chips fix to
// bundled forge-tutorial without bumping its forge.toml. Cohort users
// never received the fix until v0.2.141 corrected the omission. This
// pure-core encodes the rule so the same class of violation can't ship
// again silently.
//
// Pure logic; no I/O. The caller passes:
//   - `changedFiles`: list of vault-relative paths changed since the
//     baseline (typically the last v* git tag).
//   - `getTomlDiff(path)`: a closure that returns the textual diff for
//     the given path. The pure-core only inspects the diff for a
//     `+` / `-` line beginning with `version =` — actual git invocation
//     stays in the CLI wrapper.
//
// Returns `{violations, vaultList}`:
//   - violations: array of { vault, reason, message, contentChanges }.
//     Two reasons:
//       'CONTENT_NO_TOML' — content changed but forge.toml absent from
//         the diff entirely.
//       'TOML_NO_VERSION_BUMP' — forge.toml in the diff but no version
//         line change detected (e.g. only comments changed).
//   - vaultList: deduped list of affected vault names. Used for the
//     "passed" message even when no violations exist (lets the release
//     log show which vaults bumped cleanly).

/** @typedef {{ vault: string, reason: 'CONTENT_NO_TOML' | 'TOML_NO_VERSION_BUMP', message: string, contentChanges: string[] }} Violation */

/** @typedef {{ violations: Violation[], vaultList: string[] }} CheckResult */

/**
 * Check whether bundled-vault content changes are accompanied by a
 * forge.toml version bump in the same vault.
 *
 * @param {string[]} changedFiles - paths changed since the baseline.
 * @param {(tomlPath: string) => string} getTomlDiff - returns the diff
 *   text for the given path (typically `git diff baseline..HEAD -- path`).
 * @returns {CheckResult}
 */
export function checkBundledVaultBump(changedFiles, getTomlDiff) {
  // Group changes by bundled vault name. The regex matches exactly
  // `assets/vaults/{name}/...` so a sibling dir like `assets/vaults_xyz/`
  // doesn't false-positive.
  const vaultChanges = new Map();
  for (const file of changedFiles) {
    const m = file.match(/^assets\/vaults\/([^/]+)\//);
    if (!m) continue;
    const vault = m[1];
    if (!vaultChanges.has(vault)) vaultChanges.set(vault, []);
    vaultChanges.get(vault).push(file);
  }

  /** @type {Violation[]} */
  const violations = [];
  for (const [vault, files] of vaultChanges) {
    const tomlPath = `assets/vaults/${vault}/forge.toml`;
    const contentChanges = files.filter((f) => f !== tomlPath);

    if (contentChanges.length === 0) {
      // The only change in this vault is forge.toml itself (a version-
      // only bump). Nothing to enforce — version bumps are always allowed
      // standalone (e.g., during a coordinated re-extract release).
      continue;
    }

    if (!files.includes(tomlPath)) {
      violations.push({
        vault,
        reason: 'CONTENT_NO_TOML',
        message:
          `Vault '${vault}' has ${contentChanges.length} content change(s) `
          + `since the baseline, but ${tomlPath} is not in the diff.`,
        contentChanges: contentChanges.slice(0, 5),
      });
      continue;
    }

    // forge.toml is in the diff — verify a version line actually
    // changed. The regex permits any whitespace before `version =` and
    // matches lines beginning with `+` or `-` (diff line markers). Comment-
    // only changes to forge.toml won't pass.
    const tomlDiff = getTomlDiff(tomlPath);
    const versionLineChanged = /^[-+]\s*version\s*=/m.test(tomlDiff);
    if (!versionLineChanged) {
      violations.push({
        vault,
        reason: 'TOML_NO_VERSION_BUMP',
        message:
          `Vault '${vault}' has content changes since the baseline, `
          + `${tomlPath} is in the diff, but no version line change detected.`,
        contentChanges: contentChanges.slice(0, 5),
      });
    }
  }

  return {
    violations,
    vaultList: [...vaultChanges.keys()],
  };
}
