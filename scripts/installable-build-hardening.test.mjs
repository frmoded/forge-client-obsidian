// 2026-10-27-1000 (FULL-profile hardening of what shipped under DEMO): the survivors of the mutation pass over scripts/check-installable-build.mjs (the 1700 edition guard). The guard is what stops a LEAN main.js from being installed into
// a MUSIC vault, so its edges are pinned: that the stamp is the very first thing in main.js, what the default edition is, the exact fix it tells, that importing it runs nothing, and that the CLI reads `--edition` and `--root`.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { installableProblems, readRoot, stampedEdition } from "./check-installable-build.mjs";

const SCRIPT = path.resolve(import.meta.dirname, "check-installable-build.mjs");
const STAMP = "/* forge-edition: music */";
const MUSIC_VAULTS = ["forge-moda", "music-theory", "forge-tutorial", "music-core"];
const LEAN_VAULTS = ["forge-moda", "forge-tutorial"];

test("the stamp is the very first thing in main.js: anywhere else it is not a stamp", () => {
  assert.equal(stampedEdition(STAMP + "\nvar a;"), "music");
  assert.equal(stampedEdition(" " + STAMP), null);
  assert.equal(stampedEdition("var a; " + STAMP), null);
});

test("with no edition given the check is for MUSIC; the fix it names is the one command for that edition", () => {
  const forMusic = installableProblems({ mainJsText: "/* forge-edition: lean */", vaultDirs: LEAN_VAULTS });
  assert.ok(forMusic.some((p) => /LEAN edition, not MUSIC/.test(p) && p.endsWith("rebuild with `npm run build:music`")), forMusic.join(" | "));
  const forLean = installableProblems({ mainJsText: "/* forge-edition: music */", vaultDirs: MUSIC_VAULTS }, "lean");
  assert.ok(forLean.some((p) => /MUSIC edition, not LEAN/.test(p) && p.endsWith("rebuild with `npm run build`")), forLean.join(" | "));
  const noStamp = installableProblems({ mainJsText: undefined, vaultDirs: MUSIC_VAULTS }, "lean");
  assert.deepEqual(noStamp, ["main.js has no edition stamp (built before 2026-10-26-1700, or not built): rebuild with `npm run build`"]);
  const missing = installableProblems({ mainJsText: "/* forge-edition: lean */", vaultDirs: ["forge-moda"] }, "lean");
  assert.deepEqual(missing, ["assets/vaults/forge-tutorial is missing for the lean edition: rebuild with `npm run build`"]);
});

function fakeRoot({ main, vaults }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-installable-"));
  if (main !== null) fs.writeFileSync(path.join(root, "main.js"), main);
  fs.mkdirSync(path.join(root, "assets", "vaults"), { recursive: true });
  for (const v of vaults) fs.mkdirSync(path.join(root, "assets", "vaults", v));
  return root;
}

test("readRoot reads main.js as TEXT, only its first 400 characters, and lists the vault folders; a root with neither says so with empty values", () => {
  const root = fakeRoot({ main: STAMP + "\n" + "x".repeat(1000), vaults: ["a", "b"] });
  try {
    const r = readRoot(root);
    assert.equal(typeof r.mainJsText, "string");
    assert.equal(r.mainJsText.length, 400);
    assert.ok(r.mainJsText.startsWith(STAMP));
    assert.deepEqual([...r.vaultDirs].sort(), ["a", "b"]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "forge-installable-empty-"));
  try { assert.deepEqual(readRoot(empty), { mainJsText: "", vaultDirs: [] }); } finally { fs.rmSync(empty, { recursive: true, force: true }); }
});

test("importing the module runs nothing (no output, no exit); it is a check only when it is the script that was run", () => {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", `import ${JSON.stringify("file://" + SCRIPT)}; console.log("imported")`], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "imported", "nothing but the importer's own line");
});

test("the CLI: --edition and --root are read; the default edition is music; a problem is a line on stderr and exit 1, a clean root is one ok line and exit 0", () => {
  const lean = fakeRoot({ main: "/* forge-edition: lean */\n", vaults: LEAN_VAULTS });
  const music = fakeRoot({ main: STAMP + "\n", vaults: MUSIC_VAULTS });
  try {
    const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
    const okLean = run("--edition", "lean", "--root", lean);
    assert.equal(okLean.status, 0, okLean.stderr);
    assert.equal(okLean.stdout.trim(), "check-installable-build: ok (main.js and assets/vaults are the lean edition)");
    const okMusic = run("--root", music);
    assert.equal(okMusic.status, 0, okMusic.stderr);
    assert.match(okMusic.stdout, /are the music edition/);
    const bad = run("--root", lean);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /^check-installable-build: main\.js is the LEAN edition, not MUSIC: rebuild with `npm run build:music`$/m);
    assert.equal(bad.stdout, "");
    const wrongEdition = run("--edition", "lean", "--root", music);
    assert.equal(wrongEdition.status, 1, "the music root is not installable as lean");
  } finally { fs.rmSync(lean, { recursive: true, force: true }); fs.rmSync(music, { recursive: true, force: true }); }
});

test("run with no arguments at all the check still runs (on the repo root, as music) and says something either way", () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.ok(r.status === 0 || r.status === 1, String(r.status));
  assert.match(r.stdout + r.stderr, /^check-installable-build: /m);
});
