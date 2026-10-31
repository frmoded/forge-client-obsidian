// 2026-10-31-1115 (CCQA smoke 9's build caveat): WHAT the driver's install builds. scripts/install-local.sh used to build the CURRENT checkout, so a half-built working tree reached the driver's vault (main.js written while M15b was half
// done; smoke 9 could only say "at or after 346c75f"). This module makes the thing to build: by default a clean copy of a COMMIT (origin/main after a fetch), `ref` picks another, `worktree` is the explicit opt-in for the working tree.
//
// The copy is `git archive` of the commit into a scratch directory: no worktree metadata under .git, no index lock, no checkout, no pull, never a push (only `git fetch`, which writes refs/remotes and nothing in the working tree). The read-only
// calls are `git --no-optional-locks`, so they never take a lock another agent's commit could be waiting for. Things a build needs that git does not track (node_modules, assets/wheels) are linked or cloned in. The directory is registered
// with the reaper sidecar (scripts/dev/reaper.mjs) by `hold`, so it goes even if the installer is killed with -9.
//
//   node scripts/install-source.mjs prepare --repo <dir> [--ref <sha-or-branch>] [--worktree] [--no-fetch]     prints one JSON line {dir, sha, tree, ref, loud, fetched}
//   node scripts/install-source.mjs hold <dir> <pid>        stays alive while <pid> lives, owns the reaper that removes <dir> when this process ends for any reason
//   node scripts/install-source.mjs remove <dir>            removes a scratch copy (refuses a directory that is not one)
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startReaper } from "./dev/reaper.mjs";
import { readGitStamp } from "./inline-plugin-version.mjs";

const SCRATCH_PREFIX = "forge-install-";
export const DEFAULT_REF = "origin/main";
const gitIn = (repo, args, opts = {}) => execFileSync("git", ["--no-optional-locks", "-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();

/** Clone (APFS copy-on-write where there is one) `from` to `to`; a plain recursive copy elsewhere. */
function copyTree(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const clone = spawnSync("cp", process.platform === "darwin" ? ["-cR", from, to] : ["-R", from, to], { stdio: "ignore" });
  if (clone.status !== 0) fs.cpSync(from, to, { recursive: true });
}

/** Make the thing to build. Rejects (one sentence naming the ref) when the ref is not a commit; a failed fetch is not a failure (the last fetched origin/main is used and `fetched` says so). */
export async function prepareSource({ repo, ref = DEFAULT_REF, worktree = false, fetch = process.env.INSTALL_LOCAL_NO_FETCH !== "1", tmp = os.tmpdir() }) {
  repo = path.resolve(repo);
  if (worktree) {
    const stamp = readGitStamp(repo, (args) => gitIn(repo, args));
    return {
      dir: repo, sha: stamp.sha, tree: stamp.dirty ? "dirty" : "clean", ref: "working tree", fetched: "no",
      loud: `install-local: WARNING building the WORKING TREE, not a commit: ${stamp.dirty ? "uncommitted changes are included" : "no uncommitted changes right now"} (sha ${stamp.sha}, tree ${stamp.dirty ? "dirty" : "clean"}). The stamp on main.js will say so.`,
      cleanup() { /* the working tree is not ours to remove */ },
    };
  }
  let fetched = "no";
  if (fetch) {
    try { execFileSync("git", ["-C", repo, "fetch", "--quiet", "origin"], { stdio: ["ignore", "pipe", "pipe"] }); fetched = "yes"; }
    catch (e) { fetched = `failed (${String(e.stderr ?? e.message).trim().split("\n")[0]}); using the last fetched ${ref}`; }
  }
  let full;
  try { full = gitIn(repo, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]); } catch { full = ""; }
  if (!/^[0-9a-f]{40}$/.test(full)) throw new Error(`install-local: "${ref}" is not a commit in ${repo} (give --ref a sha or a branch, or leave it out for ${DEFAULT_REF})`);
  const sha = full.slice(0, 9);
  const dir = fs.mkdtempSync(path.join(tmp, `${SCRATCH_PREFIX}${sha}-`));
  const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* the reaper or the system cleans the temp dir */ } };
  try {
    const archive = spawnSync("git", ["--no-optional-locks", "-C", repo, "archive", "--format=tar", full], { maxBuffer: 1 << 30 });
    if (archive.status !== 0) throw new Error(`install-local: git archive of ${full} failed: ${String(archive.stderr).trim()}`);
    const untar = spawnSync("tar", ["-x", "-C", dir], { input: archive.stdout });
    if (untar.status !== 0) throw new Error(`install-local: could not unpack the commit into ${dir}: ${String(untar.stderr).trim()}`);
    const modules = path.join(repo, "node_modules");
    if (fs.existsSync(modules) && !fs.existsSync(path.join(dir, "node_modules"))) fs.symlinkSync(modules, path.join(dir, "node_modules"));       // read-only use by the build; never copied
    const wheels = path.join(repo, "assets", "wheels");
    if (fs.existsSync(wheels) && !fs.existsSync(path.join(dir, "assets", "wheels"))) copyTree(wheels, path.join(dir, "assets", "wheels"));         // gitignored, and the asset manifest needs them
  } catch (e) { cleanup(); throw e; }
  return { dir, sha, tree: "clean", ref, fetched, loud: null, cleanup };
}

/** Remove a scratch copy made by prepareSource (and only that: the name is checked). */
export function removeScratch(dir) {
  if (!path.basename(dir).startsWith(SCRATCH_PREFIX) || !path.isAbsolute(dir)) throw new Error(`install-source: ${dir} is not a scratch copy`);
  fs.rmSync(dir, { recursive: true, force: true });
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const arg = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  if (cmd === "prepare") {
    prepareSource({ repo: arg("--repo") ?? process.cwd(), ref: arg("--ref") ?? DEFAULT_REF, worktree: rest.includes("--worktree"), fetch: rest.includes("--no-fetch") ? false : undefined })
      .then(({ cleanup, ...info }) => { console.log(JSON.stringify(info)); }, (e) => { console.error(String(e?.message ?? e)); process.exit(1); });
  } else if (cmd === "hold") {
    const [dir, pidText] = rest, pid = Number(pidText);
    if (!dir || !Number.isSafeInteger(pid) || pid <= 1) { console.error("install-source hold: usage: hold <dir> <pid>"); process.exit(2); }
    const reaper = startReaper();
    reaper.addPath(dir);
    const poll = setInterval(() => { if (!alive(pid)) { clearInterval(poll); reaper.stop(); setTimeout(() => process.exit(0), 200); } }, Number(process.env.FORGE_HOLD_POLL_MS ?? 1000));
    for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.once(sig, () => { clearInterval(poll); reaper.stop(); setTimeout(() => process.exit(0), 200); });
  } else if (cmd === "remove") {
    try { removeScratch(path.resolve(rest[0] ?? "")); } catch (e) { console.error(String(e.message)); process.exit(1); }
  } else { console.error("usage: install-source.mjs prepare|hold|remove ..."); process.exit(2); }
}
