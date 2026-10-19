// Drain 2026-10-20-1100 §5 — what `npm test` needs on disk that a fresh clone does not have, and the one message that says so.
// The generated modules are the gitignored `src/*.generated.ts` (written by `npm run build`); the list is READ FROM .gitignore, the file that defines what is
// generated, so a new generated module is covered by listing it there — there is no second list to forget.

/** The `src/<name>.generated.ts` entries of a .gitignore (comments and other patterns ignored). */
export function generatedModulesFromGitignore(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^src\/[A-Za-z0-9_.-]+\.generated\.ts$/.test(l));
}

/** One message, for a person who just cloned the repo. */
export function preflightMessage(missing) {
  return [
    `npm test needs generated files that a fresh clone does not have (${missing.length} missing):`,
    ...missing.map((f) => `    ${f}`),
    'They are written by the build. In this order:',
    '    FORGE_EDITION=music node scripts/sync-bundled-vault.mjs --all && node scripts/sync-engine-bundle.mjs   # with the vault repos checked out next to this one',
    '    FORGE_EDITION=music npm run build          # or FORGE_EDITION=lean npm run build for the lean edition',
    '(Sync first: the build runs gates that fail on a stale bundle.) To run the tests anyway, expecting import errors: FORGE_TEST_PREFLIGHT=off npm test',
  ].join('\n');
}

/** `{ missing, message }`; `exists` answers for a repo-relative path. */
export function preflightProblems({ gitignore, exists }) {
  const missing = generatedModulesFromGitignore(gitignore).filter((f) => !exists(f));
  return { missing, message: missing.length ? preflightMessage(missing) : null };
}
