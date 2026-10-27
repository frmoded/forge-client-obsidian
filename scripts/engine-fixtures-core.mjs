// Drain 2026-10-27-0710 §4 — the two pinned engine fixtures, their staleness, and the ONE command that re-records them.
//   test/fixtures/engine-transpile/shipped-notes.json      recorded by record-engine-transpile.py; carries engine_bundle_digest (the engine it was recorded against, which must be the engine this plugin BUNDLES)
//   test/fixtures/engine-transpile/rederive-comparison.json  recorded by compare-rederived-output.py --rev music-theory=baf108d; carries engine_sha, which must equal the recording's (src/rederive-comparison.test.ts)
// `rerecord` takes the python runner as a parameter so the tests drive it with a stub; scripts/rerecord-engine-fixtures.mjs passes the real one (the forge engine's own virtualenv).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { engineBundleDigest } from './engine-recording.mjs';

export const RERECORD_COMMAND = 'npm run rerecord-engine-fixtures';
export const FIXTURE_DIR = 'test/fixtures/engine-transpile';
export const COMPARISON_REV = 'music-theory=baf108d';
const SHIPPED = 'shipped-notes.json', COMPARISON = 'rederive-comparison.json';

/** Why a fixture cannot be trusted right now: [{ fixture, why }]; empty = both are fresh. `bundledDigest`: the digest of assets/engine/forge. */
export function fixtureProblems({ shipped, comparison, bundledDigest }) {
  const out = [];
  if (shipped.engine_bundle_digest !== bundledDigest) {
    out.push({ fixture: SHIPPED, why: `recorded against engine bundle ${String(shipped.engine_bundle_digest).slice(0, 12)}… but the bundled engine is now ${bundledDigest.slice(0, 12)}…` });
  }
  if (comparison.engine_sha !== shipped.engine_sha) {
    out.push({ fixture: COMPARISON, why: `it is of engine commit ${comparison.engine_sha} but the recording is of ${shipped.engine_sha}` });
  }
  return out;
}

/** Deep compare ignoring the top-level engine_sha: { only, paths } where paths are the dotted paths that differ. */
export function differsOnlyInEngineSha(a, b) {
  const paths = [];
  const walk = (x, y, p) => {
    if (x && y && typeof x === 'object' && typeof y === 'object' && Array.isArray(x) === Array.isArray(y)) {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], p ? `${p}.${k}` : k);
    } else if (JSON.stringify(x) !== JSON.stringify(y)) paths.push(p);
  };
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (k !== 'engine_sha') walk(a[k], b[k], k);
  return { only: paths.length === 0, paths };
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

/**
 * Re-record both fixtures if either is stale (or `force`). All-or-nothing: both new files are produced in a scratch directory and only installed when both succeeded and the comparison differs from the
 * committed one in engine_sha alone (a pinned comparison that MOVED is a decision for a human, so the candidate is kept and nothing is replaced). Returns { ok, changed, message?, candidate? }.
 * `runPython(scriptName, args)` runs scripts/<scriptName> with the forge engine's python and resolves { status, stderr }.
 */
export async function rerecord({ client, forge, runPython, force = false }) {
  const engineDir = path.join(client, 'assets', 'engine', 'forge');
  const bundled = engineBundleDigest(engineDir);
  const forgeDigest = engineBundleDigest(path.join(forge, 'forge'));
  if (bundled !== forgeDigest) {
    return { ok: false, changed: false, message: `the bundled engine (assets/engine/forge, ${bundled.slice(0, 12)}…) is not the engine at ${forge} (${forgeDigest.slice(0, 12)}…): run node scripts/sync-engine-bundle.mjs first (the first rider), then ${RERECORD_COMMAND}` };
  }
  const fixDir = path.join(client, FIXTURE_DIR);
  const committedShipped = readJson(path.join(fixDir, SHIPPED)), committedComparison = readJson(path.join(fixDir, COMPARISON));
  const problems = fixtureProblems({ shipped: committedShipped, comparison: committedComparison, bundledDigest: bundled });
  if (problems.length === 0 && !force) return { ok: true, changed: false, message: 'both engine fixtures are fresh; nothing to re-record' };

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rerecord-engine-fixtures-'));
  const newShipped = path.join(scratch, SHIPPED), newComparison = path.join(scratch, COMPARISON);
  const run = async (script, args, out) => {
    const r = await runPython(script, [...args, '--out', out]);
    return r.status === 0 && fs.existsSync(out) ? null : `${script} failed (exit ${r.status}): ${String(r.stderr ?? '').trim().split('\n').slice(-6).join('\n')}`;
  };
  let failed = await run('record-engine-transpile.py', ['--forge', forge], newShipped);
  if (!failed) failed = await run('compare-rederived-output.py', ['--forge', forge, '--rev', COMPARISON_REV], newComparison);
  if (failed) { fs.rmSync(scratch, { recursive: true, force: true }); return { ok: false, changed: false, message: failed }; }

  const cmp = readJson(newComparison);
  const moved = differsOnlyInEngineSha(committedComparison, cmp);
  if (!moved.only) {
    const candidate = path.join(os.tmpdir(), `rederive-comparison.candidate-${Date.now()}.json`);
    fs.copyFileSync(newComparison, candidate);
    fs.rmSync(scratch, { recursive: true, force: true });
    return { ok: false, changed: false, candidate, message: `the re-recorded comparison differs from the committed one in more than engine_sha (${moved.paths.slice(0, 8).join(', ')}${moved.paths.length > 8 ? ', ...' : ''}); NOTHING was replaced. Review ${candidate}, then copy both files in by hand if the move is intended` };
  }
  fs.copyFileSync(newShipped, path.join(fixDir, SHIPPED));
  fs.copyFileSync(newComparison, path.join(fixDir, COMPARISON));
  fs.rmSync(scratch, { recursive: true, force: true });
  return { ok: true, changed: true, message: `re-recorded ${SHIPPED} and ${COMPARISON} (engine ${String(cmp.engine_sha).slice(0, 12)}); commit both` };
}
