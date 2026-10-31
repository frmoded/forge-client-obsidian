// 2026-10-31-1115 (CCQA smoke 9's build caveat, CC note 1): the driver's install must never ship CC's half-built working tree. The incident: the vault's main.js was written while M15b was half-built in the client working tree, the driver's Obsidian
// wrote notes in the new shape, and the smoke could only say "at or after 346c75f". scripts/install-local.sh built the CURRENT checkout. Now: the default builds a clean copy of a COMMIT (origin/main after a fetch), `--ref` picks another, `--worktree` is
// the explicit opt-in for the dirty tree; every build records its commit and whether the tree was clean on the first line of main.js; the guard refuses a dirty stamp unless --worktree was given.
// These run the REAL scripts against temp git repos (a bare origin, a clone with a dirty file): the operation under test is executed, not described. They pin the MECHANISM (a scratch copy made with `git archive`, the commit travelling to the build
// as FORGE_BUILD_SHA / FORGE_BUILD_TREE, the stamp read by the guard); if the design moves this SHOULD go red - reassess, do not just rewrite.
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { buildMain, editionStamp } from "./build-main.mjs";
import { installableProblems, stampedBuild, stampedEdition } from "./check-installable-build.mjs";
import { readGitStamp } from "./inline-plugin-version.mjs";
import { prepareSource } from "./install-source.mjs";

const SCRIPTS = import.meta.dirname;
const ROOT = path.resolve(SCRIPTS, "..");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const MUSIC_VAULTS = ["forge-moda", "music-theory", "forge-tutorial", "music-core"];

/** A bare origin and a clone of it: one commit on main ("committed"), pushed; then the clone is made DIRTY (a tracked file edited, an untracked file added) the way CC's working tree was. */
function repoWithDirtyTree() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "forge-install-src-"));
  const origin = path.join(base, "origin.git"), repo = path.join(base, "repo");
  git(base, "init", "--bare", "-b", "main", origin);
  git(base, "clone", origin, repo);
  git(repo, "config", "user.email", "t@example.com"); git(repo, "config", "user.name", "t");
  fs.writeFileSync(path.join(repo, "a.txt"), "committed\n");
  fs.mkdirSync(path.join(repo, "assets", "wheels"), { recursive: true });
  git(repo, "add", "a.txt"); git(repo, "commit", "-m", "first"); git(repo, "push", "origin", "HEAD:main");
  const first = git(repo, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(repo, "a.txt"), "HALF-BUILT\n");                       // tracked, modified
  fs.writeFileSync(path.join(repo, "b.txt"), "untracked\n");
  fs.writeFileSync(path.join(repo, "assets", "wheels", "w.whl"), "wheel");           // ignored in the real repo: a scratch copy must still get it
  return { base, origin, repo, first, done: () => fs.rmSync(base, { recursive: true, force: true }) };
}

test("the stamp carries the commit: editionStamp writes `; sha: <short sha>; tree: clean|dirty`, stampedEdition still reads the edition, stampedBuild reads the commit; an old-format stamp has no build", () => {
  assert.equal(editionStamp("music", { sha: "abc123def", dirty: false }), "/* forge-edition: music; sha: abc123def; tree: clean */");
  assert.equal(editionStamp("lean", { sha: "abc123def", dirty: true }), "/* forge-edition: lean; sha: abc123def; tree: dirty */");
  assert.equal(editionStamp("music"), "/* forge-edition: music */", "no build given: the old line");
  assert.equal(stampedEdition("/* forge-edition: music; sha: abc123def; tree: dirty */\nvar a;"), "music");
  assert.deepEqual(stampedBuild("/* forge-edition: music; sha: abc123def; tree: dirty */\nvar a;"), { sha: "abc123def", tree: "dirty" });
  assert.deepEqual(stampedBuild("/* forge-edition: music; sha: abc123def; tree: clean */"), { sha: "abc123def", tree: "clean" });
  assert.equal(stampedBuild("/* forge-edition: music */"), null);
  assert.equal(stampedBuild("var a; /* forge-edition: music; sha: abc123def; tree: clean */"), null, "only the first line counts");
  assert.equal(stampedEdition("/* forge-edition: music; sha: ; tree: clean */"), null, "a half-written stamp is not a stamp");
  assert.equal(stampedBuild("/* forge-edition: music; sha: abc123def; tree: sparkling */"), null);
});

test("the guard refuses a dirty stamp unless --worktree was given (allowDirty); a clean stamp and an old-format stamp stay installable; the refusal names the commit and both ways out", () => {
  const dirty = { mainJsText: editionStamp("music", { sha: "abc123def", dirty: true }) + "\n", vaultDirs: MUSIC_VAULTS };
  const refused = installableProblems(dirty, "music");
  assert.ok(refused.some((p) => /DIRTY/.test(p) && /abc123def/.test(p) && /--worktree/.test(p) && /install-local\.sh/.test(p)), refused.join(" | "));
  assert.deepEqual(installableProblems(dirty, "music", { allowDirty: true }), [], "--worktree: the person asked for the dirty tree");
  assert.deepEqual(installableProblems({ ...dirty, mainJsText: editionStamp("music", { sha: "abc123def", dirty: false }) }, "music"), []);
  assert.deepEqual(installableProblems({ ...dirty, mainJsText: editionStamp("music") }, "music"), [], "an old-format stamp has no tree: the edition check is all it ever did");
});

test("the guard's command line: exit 1 on a dirty stamp, exit 0 with --allow-dirty", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-root-"));
  try {
    for (const v of MUSIC_VAULTS) fs.mkdirSync(path.join(root, "assets", "vaults", v), { recursive: true });
    fs.writeFileSync(path.join(root, "main.js"), editionStamp("music", { sha: "abc123def", dirty: true }) + "\nvar x;\n");
    const run = (...extra) => spawnSync("node", [path.join(SCRIPTS, "check-installable-build.mjs"), "--root", root, ...extra], { encoding: "utf8" });
    const r = run(); assert.equal(r.status, 1); assert.match(r.stderr, /DIRTY/);
    const ok = run("--allow-dirty"); assert.equal(ok.status, 0, ok.stderr); assert.match(ok.stdout, /check-installable-build: ok/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("the build records its commit: readGitStamp takes FORGE_BUILD_SHA / FORGE_BUILD_TREE (a scratch copy has no .git), else asks git as before; a bad value is not trusted", () => {
  const noGit = () => { throw new Error("not a git repository"); };
  assert.deepEqual(readGitStamp(".", noGit, { FORGE_BUILD_SHA: "abc123def", FORGE_BUILD_TREE: "clean" }), { sha: "abc123def", dirty: false });
  assert.deepEqual(readGitStamp(".", noGit, { FORGE_BUILD_SHA: "abc123def", FORGE_BUILD_TREE: "dirty" }), { sha: "abc123def", dirty: true });
  assert.deepEqual(readGitStamp(".", noGit, { FORGE_BUILD_SHA: "not a sha", FORGE_BUILD_TREE: "clean" }), { sha: "unknown", dirty: false });
  assert.deepEqual(readGitStamp(".", (a) => (a[0] === "rev-parse" ? "904d575c7\n" : ""), {}), { sha: "904d575c7", dirty: false });
});

test("the REAL build writes the commit on the first line of main.js, and the guard reads it back", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-stamp-"));
  try {
    const outfile = path.join(dir, "main.js");
    await buildMain({ edition: "music", outfile, stubInlinedAssets: true, stamp: { sha: "abc123def", dirty: true } });
    const text = fs.readFileSync(outfile, "utf8");
    assert.equal(text.split("\n", 1)[0], "/* forge-edition: music; sha: abc123def; tree: dirty */");
    assert.deepEqual(stampedBuild(text), { sha: "abc123def", tree: "dirty" });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the banner names the commit: (edition: music, <sha>) from the build stamp, in the source main.ts reads", () => {
  const main = fs.readFileSync(path.join(ROOT, "src", "main.ts"), "utf8");
  assert.match(main, /LOADED \(edition: \$\{EDITION\}, \$\{formatBuildSha\(BUILD_STAMP\)\}\)/);
});

test("DEFAULT install: a clean copy of origin/main, NOT the working tree: the dirty file is ignored, the sha is origin/main's, the copy is a throw-away directory, the repo is untouched", async () => {
  const r = repoWithDirtyTree();
  try {
    const headBefore = git(r.repo, "rev-parse", "HEAD"), statusBefore = git(r.repo, "status", "--porcelain");
    const src = await prepareSource({ repo: r.repo });
    try {
      assert.notEqual(src.dir, r.repo);
      assert.equal(fs.readFileSync(path.join(src.dir, "a.txt"), "utf8"), "committed\n", "the committed content, not the half-built edit");
      assert.equal(fs.existsSync(path.join(src.dir, "b.txt")), false, "an untracked file is not in the build");
      assert.equal(fs.existsSync(path.join(src.dir, "assets", "wheels", "w.whl")), true, "the ignored wheels a build needs are carried over");
      assert.equal(src.tree, "clean");
      assert.equal(src.sha, git(r.repo, "rev-parse", "--short=9", "origin/main"));
      assert.equal(src.ref, "origin/main");
      assert.equal(src.loud, null);
      assert.equal(git(r.repo, "rev-parse", "HEAD"), headBefore, "HEAD did not move: no pull, no checkout");
      assert.equal(git(r.repo, "status", "--porcelain"), statusBefore, "the working tree and the index are as they were");
      assert.equal(fs.readFileSync(path.join(r.repo, "a.txt"), "utf8"), "HALF-BUILT\n");
      assert.equal(fs.existsSync(path.join(r.repo, ".git", "index.lock")), false);
    } finally { src.cleanup(); }
    assert.equal(fs.existsSync(src.dir), false, "cleanup removes the scratch copy");
  } finally { r.done(); }
});

test("DEFAULT install fetches first: a commit pushed to origin since the last fetch is the one built (never a push, never a pull)", async () => {
  const r = repoWithDirtyTree();
  const other = path.join(r.base, "other");
  try {
    git(r.base, "clone", r.origin, other); git(other, "config", "user.email", "t@example.com"); git(other, "config", "user.name", "t");
    fs.writeFileSync(path.join(other, "a.txt"), "second\n"); git(other, "commit", "-am", "second"); git(other, "push", "origin", "HEAD:main");
    const second = git(other, "rev-parse", "--short=9", "HEAD");
    assert.notEqual(git(r.repo, "rev-parse", "--short=9", "origin/main"), second, "the clone has not fetched it yet");
    const src = await prepareSource({ repo: r.repo });
    try {
      assert.equal(src.sha, second);
      assert.equal(fs.readFileSync(path.join(src.dir, "a.txt"), "utf8"), "second\n");
      assert.equal(git(r.repo, "rev-parse", "HEAD"), r.first, "the clone's own branch did not move");
    } finally { src.cleanup(); }
    const origHead = git(r.origin, "rev-parse", "HEAD");
    assert.equal(origHead, git(other, "rev-parse", "HEAD"), "and nothing was pushed");
  } finally { r.done(); }
});

test("--ref picks another commit (a sha or a branch); an unknown ref is one sentence naming it and nothing is left behind", async () => {
  const r = repoWithDirtyTree();
  try {
    git(r.repo, "stash", "-u"); fs.writeFileSync(path.join(r.repo, "a.txt"), "local only\n"); git(r.repo, "commit", "-am", "local"); const local = git(r.repo, "rev-parse", "HEAD");
    const bySha = await prepareSource({ repo: r.repo, ref: local });
    try { assert.equal(bySha.sha, local.slice(0, 9)); assert.equal(fs.readFileSync(path.join(bySha.dir, "a.txt"), "utf8"), "local only\n"); assert.equal(bySha.tree, "clean"); } finally { bySha.cleanup(); }
    const byBranch = await prepareSource({ repo: r.repo, ref: "main" });
    try { assert.equal(byBranch.sha, local.slice(0, 9)); } finally { byBranch.cleanup(); }
    const before = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("forge-install-")).length;
    await assert.rejects(() => prepareSource({ repo: r.repo, ref: "no-such-branch" }), /no-such-branch/);
    assert.equal(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("forge-install-")).length, before, "no scratch directory is left by a refusal");
  } finally { r.done(); }
});

test("--worktree builds the working tree itself and says so loudly: the dir is the repo, the tree is dirty when tracked files differ and clean when they do not", async () => {
  const r = repoWithDirtyTree();
  try {
    const src = await prepareSource({ repo: r.repo, worktree: true });
    assert.equal(src.dir, r.repo);
    assert.equal(src.tree, "dirty");
    assert.match(src.loud ?? "", /WORKING TREE/);
    assert.match(src.loud ?? "", /uncommitted/i);
    assert.equal(fs.readFileSync(path.join(src.dir, "a.txt"), "utf8"), "HALF-BUILT\n");
    src.cleanup(); assert.equal(fs.existsSync(r.repo), true, "cleanup never touches the working tree it was told to build");
    git(r.repo, "checkout", "--", "a.txt");
    assert.equal((await prepareSource({ repo: r.repo, worktree: true })).tree, "clean");
  } finally { r.done(); }
});

test("the scratch copy is registered with the reaper: when the process that holds it is gone, the copy is removed even if nothing cleaned it", async () => {
  const r = repoWithDirtyTree();
  try {
    const src = await prepareSource({ repo: r.repo });
    const holder = spawn("node", [path.join(SCRIPTS, "install-source.mjs"), "hold", src.dir, String(process.pid)], { stdio: "ignore", env: { ...process.env, FORGE_HOLD_POLL_MS: "50" } });
    await sleepMs(300);
    assert.equal(fs.existsSync(src.dir), true, "held while its owner (this process) lives");
    holder.kill("SIGKILL");                                                              // the hardest case: the holder is killed with -9 and nothing runs its cleanup
    const t0 = Date.now(); while (fs.existsSync(src.dir) && Date.now() - t0 < 5000) await sleepMs(50);
    assert.equal(fs.existsSync(src.dir), false, "the reaper sidecar removed it");
  } finally { r.done(); }
});

test("install-local.sh: --worktree and --ref are its two options, the default builds a scratch copy of a commit, the commit travels to the build as the stamp, the guard is told --worktree, and the end prints the commit and the tree", () => {
  const sh = fs.readFileSync(path.join(SCRIPTS, "install-local.sh"), "utf8").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  assert.match(sh, /--worktree\) WORKTREE=1/); assert.match(sh, /--ref\) REF=/);
  assert.match(sh, /PREP_ARGS=\(prepare --repo "\$REPO" --ref "\$REF"\)/);
  assert.match(sh, /install-source\.mjs "\$\{PREP_ARGS\[@\]\}"/);
  assert.match(sh, /FORGE_BUILD_SHA="\$SHA" FORGE_BUILD_TREE="\$TREE" FORGE_EDITION="\$EDITION" npm run build/);
  assert.match(sh, /GUARD=\(--edition "\$EDITION" --root "\$SRC"\); \[ "\$WORKTREE" = 1 \] && GUARD\+=\(--allow-dirty\)/, 'the guard is told --allow-dirty only when --worktree was asked for');
  assert.match(sh, /node scripts\/check-installable-build\.mjs "\$\{GUARD\[@\]\}"/);
  assert.match(sh, /install-source\.mjs hold "\$SRC" "\$\$"/, 'the scratch copy is registered with the reaper');
  assert.match(sh, /trap .*cleanup.* EXIT/);
  assert.doesNotMatch(sh, /git (pull|push|checkout|reset|stash)/, "it never moves the checkout it was started in");
});

test("install-local.sh --plan on this repo (no fetch): says the commit it WOULD build and the tree, builds nothing, installs nothing, leaves no scratch copy and does not move HEAD", () => {
  const before = { head: git(ROOT, "rev-parse", "HEAD"), scratch: fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("forge-install-")).length };
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "forge-plan-vault-"));
  try {
    fs.mkdirSync(path.join(vault, ".obsidian", "plugins", JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")).id), { recursive: true });
    const run = (...args) => spawnSync("bash", [path.join(SCRIPTS, "install-local.sh"), ...args], { cwd: ROOT, encoding: "utf8", env: { ...process.env, VAULT: vault, INSTALL_LOCAL_NO_FETCH: "1" } });
    const def = run("--plan", "--ref", "HEAD");
    assert.equal(def.status, 0, def.stderr);
    assert.match(def.stdout, new RegExp(`install-local: building ${git(ROOT, "rev-parse", "--short=9", "HEAD")} \\(HEAD\\), tree clean`));
    assert.doesNotMatch(def.stdout, /WORKING TREE/);
    const wt = run("--plan", "--worktree");
    assert.equal(wt.status, 0, wt.stderr);
    assert.match(wt.stdout, /WORKING TREE/);
    assert.equal(git(ROOT, "rev-parse", "HEAD"), before.head);
    assert.equal(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("forge-install-")).length, before.scratch, "no scratch copy is left");
    assert.equal(fs.readdirSync(path.join(vault, ".obsidian", "plugins", JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")).id)).length, 0, "--plan installs nothing");
    const bad = run("--plan", "--ref", "no-such-branch"); assert.equal(bad.status, 1); assert.match(bad.stderr, /no-such-branch/);
    const unknown = run("--bogus"); assert.equal(unknown.status, 2); assert.match(unknown.stderr, /--bogus/);
  } finally { fs.rmSync(vault, { recursive: true, force: true }); }
});
