// scripts/vault-head-snapshot.mjs
//
// Drain 2026-08-16-1100 — materialize a source vault's HEAD so the
// bundled-vault gate and sync both read COMMITTED content.
//
// WHY. Both used to read the sibling checkout's working tree. That made a
// release hostage to whatever another agent happened to have half-done:
// during the v0.2.358 cut, wizard's staged-but-uncommitted SVGs and a
// modified-uncommitted note turned the drift gate red, and the only ways
// forward were "wait for them to finish" or "copy uncommitted files into
// an immutable published artifact that can't be rebuilt from any git
// state". Reading HEAD dissolves that: mid-flight work is invisible, and
// whatever ships can be reconstructed from a commit.
//
// ONE module for both consumers, on purpose. A gate that compares HEAD
// while the sync copies the working tree would reopen the same hole one
// layer down, so `vault-head-snapshot.test.mjs` also asserts statically
// that neither script resolves the sibling working tree on its own.
//
// `git archive HEAD | tar -x` rather than `git show HEAD:<path>` per file:
// one subprocess instead of N, and it reproduces the tree shape exactly,
// so the callers' existing directory walks work unchanged against the
// snapshot root.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

/**
 * A read-only view of `vaultPath` as of its last commit.
 *
 * Returns `{ root, dispose() }` — `root` is a temp directory holding the
 * committed tree, `dispose()` removes it and is idempotent. The vault
 * itself is never written to, not even its index.
 *
 * Throws, rather than degrading, on:
 *   - not a git repository
 *   - a repository with no commits
 *
 * Both are deliberate. An empty snapshot would read as "the source has no
 * files", and the sync deletes bundle files the source lacks — so a quiet
 * fallback would wipe a bundled vault. Refusing is the only safe answer,
 * and a release blocked by a clear message beats one that ships empty.
 */
export function snapshotVaultHead(vaultPath) {
  const inside = spawnSync(
    "git", ["-C", vaultPath, "rev-parse", "--is-inside-work-tree"],
    { encoding: "utf-8" },
  );
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    throw new Error(
      `${vaultPath} is not a git repository, so there is no committed state to `
      + `read. The bundled-vault gate and sync only ship committed content.`,
    );
  }

  const head = spawnSync("git", ["-C", vaultPath, "rev-parse", "HEAD"], {
    encoding: "utf-8",
  });
  if (head.status !== 0) {
    throw new Error(
      `${vaultPath} has no commits, so there is nothing committed to ship. `
      + `Commit the vault's content first — refusing rather than treating it `
      + `as an empty vault, which would delete the bundled copy.`,
    );
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-vault-head-"));
  let disposed = false;
  try {
    // Pipe through tar so the snapshot is a real directory tree the
    // callers can walk exactly as they walked the working tree.
    execFileSync(
      "sh",
      ["-c", `git -C "${vaultPath}" archive HEAD | tar -x -C "${root}"`],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  } catch (e) {
    fs.rmSync(root, { recursive: true, force: true });
    throw new Error(
      `could not read ${vaultPath} at HEAD: ${e.stderr?.toString().trim() || e.message}`,
    );
  }

  return {
    root,
    dispose() {
      if (disposed) return;
      disposed = true;
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
