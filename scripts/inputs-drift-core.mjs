// scripts/inputs-drift-core.mjs
//
// Drain 2026-08-16-0910 — the decision half of the release preflight's
// `inputs:`-frontmatter drift gate, split out from the subprocess call
// so the suite can exercise every outcome without spawning anything.
//
// The gate itself is a subprocess bridge to `forge/scripts/stamp_inputs.py
// --check`, deliberately: the derivation rule (`derive_inputs_from_recipe`)
// lives in Python, and a JS reimplementation would be a second answer to
// "what counts as an input" — the exact duplicate-implementation pattern
// this ecosystem has spent several drains removing. One implementation,
// one subprocess boundary.
//
// stamp_inputs.py's CLI contract, verified against the script before wiring
// (drain §3):
//
//   exit 0 — no drift (also the answer for a vault with no `Input` notes)
//   exit 1 — at least one note's `inputs:` disagrees with its Recipe;
//            the drifting paths are printed to stdout, one per line
//   exit 2 — usage error: no directory given, or the path isn't a directory

/** Where the check's verdict comes from, for a caller that wants to
 *  branch on cause rather than parse prose. */
export const OUTCOME = {
  CLEAN: 'clean',
  DRIFT: 'drift',
  INTERPRETER_MISSING: 'interpreter-missing',
  SCRIPT_MISSING: 'script-missing',
  USAGE_ERROR: 'usage-error',
  UNKNOWN: 'unknown',
};

/**
 * Which Python to spawn.
 *
 * forge's own virtualenv first when it's there — it is the interpreter the
 * script's imports were resolved against — then whatever `python3` the PATH
 * offers. Returns the venv path only if it actually exists; PATH lookups
 * can't be probed from here, so a missing `python3` surfaces as a spawn
 * ENOENT and is reported by `interpretCheckResult` below.
 */
export function resolveInterpreter(venvPython, exists) {
  return exists(venvPython) ? venvPython : 'python3';
}

/** Drifting note paths, parsed out of the script's stdout. Lines look like
 *  `  DRIFT: /abs/path/to/note.md`; anything else is prose and ignored. */
export function parseDriftingPaths(stdout) {
  const out = [];
  for (const line of String(stdout ?? '').split('\n')) {
    const m = line.match(/^\s*DRIFT:\s*(.+?)\s*$/);
    if (m) out.push(m[1]);
  }
  return out;
}

/**
 * Turn one `spawnSync` result into a preflight verdict.
 *
 * Every failure mode gets a message that names the vault and says what to
 * run next, because a gate whose failure the reader can't act on is a gate
 * they will learn to ignore. A missing interpreter FAILS rather than
 * silently skipping (drain §8): "we couldn't check" and "we checked and it
 * was fine" must never print the same thing.
 */
export function interpretCheckResult({
  vaultName,
  vaultPath,
  status,
  error,
  stdout = '',
  stderr = '',
}) {
  if (error) {
    const code = error.code ?? '';
    if (code === 'ENOENT') {
      return {
        ok: false,
        outcome: OUTCOME.INTERPRETER_MISSING,
        message:
          `Python not found, cannot run the inputs-drift check (${vaultName}).\n`
          + `  Install python3, or create forge's venv at ~/projects/forge/.venv.\n`
          + `  This is a FAILURE, not a skip: an unrun check is not a clean check.`,
      };
    }
    return {
      ok: false,
      outcome: OUTCOME.UNKNOWN,
      message: `inputs-drift check (${vaultName}) could not run: ${error.message ?? code}`,
    };
  }

  if (status === 0) {
    return {
      ok: true,
      outcome: OUTCOME.CLEAN,
      message: `Inputs-frontmatter drift check (${vaultName}): clean.`,
    };
  }

  if (status === 1) {
    const paths = parseDriftingPaths(stdout);
    const listed = paths.length > 0
      ? paths.map(p => `  ✗ ${p}  [inputs: disagrees with its Recipe]`).join('\n')
      : `  ✗ (the check reported drift but named no paths — see its output above)`;
    return {
      ok: false,
      outcome: OUTCOME.DRIFT,
      message:
        `INPUTS-FRONTMATTER DRIFT DETECTED (${vaultName}):\n${listed}\n\n`
        + `Resolve it by running the stamping pass without --check:\n`
        + `  python3 ~/projects/forge/scripts/stamp_inputs.py ${vaultPath}\n`
        + `then commit the restamped notes.`,
    };
  }

  if (status === 2) {
    return {
      ok: false,
      outcome: OUTCOME.USAGE_ERROR,
      message:
        `inputs-drift check (${vaultName}) rejected its arguments (exit 2).\n`
        + `  Path given: ${vaultPath}\n`
        + `  ${String(stderr).trim() || 'The path is probably missing or not a directory.'}`,
    };
  }

  return {
    ok: false,
    outcome: OUTCOME.UNKNOWN,
    message:
      `inputs-drift check (${vaultName}) exited ${status}, which is not a documented\n`
      + `  exit code for stamp_inputs.py (0 clean / 1 drift / 2 usage).\n`
      + `  ${String(stderr).trim()}`,
  };
}
