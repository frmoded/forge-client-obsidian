// 2026-10-26-1700 (DEMO blocker): the repo-root main.js was the LEAN edition and the install recipe copied it into the MUSIC vault ("Rhythm Box widget was not found", only forge-moda / forge-tutorial searched).
// These pin the MECHANISM (the edition is stamped on main.js's first line by build-main.mjs, and scripts/check-installable-build.mjs reads it); if the stamp moves this SHOULD go red - reassess, don't just rewrite.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { buildMain, editionStamp, readGeneratedBuildStamp } from "./build-main.mjs";
import { installableProblems, stampedEdition } from "./check-installable-build.mjs";

const MUSIC_VAULTS = ["forge-moda", "music-theory", "forge-tutorial", "music-core"];
const LEAN_VAULTS = ["forge-moda", "forge-tutorial"];

test("a lean main.js with lean assets is NOT installable as music (the incident), and says the fix", () => {
  const problems = installableProblems({ mainJsText: editionStamp("lean") + "\nvar x;", vaultDirs: LEAN_VAULTS }, "music");
  assert.ok(problems.some((p) => /LEAN edition, not MUSIC/.test(p) && /npm run build:music/.test(p)), problems.join(" | "));
  assert.ok(problems.some((p) => /assets\/vaults\/music-theory is missing/.test(p)), problems.join(" | "));
});

test("a music main.js with all four music vaults is installable as music; as lean it is not", () => {
  assert.deepEqual(installableProblems({ mainJsText: editionStamp("music") + "\n", vaultDirs: MUSIC_VAULTS }, "music"), []);
  assert.ok(installableProblems({ mainJsText: editionStamp("music") + "\n", vaultDirs: MUSIC_VAULTS }, "lean").some((p) => /MUSIC edition, not LEAN/.test(p)));
});

test("a main.js with no stamp (an old build, or none) is refused with the fix, never trusted", () => {
  assert.ok(installableProblems({ mainJsText: "var a = 1;", vaultDirs: MUSIC_VAULTS }, "music").some((p) => /no edition stamp/.test(p)));
  assert.equal(stampedEdition(""), null);
  assert.equal(stampedEdition("/* forge-edition: music */\n"), "music");
  assert.equal(stampedEdition("/* forge-edition: bogus */"), null);
});

test("the REAL build writes the stamp as the first line, for each edition (the build is run, not described)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-stamp-"));
  try {
    for (const edition of ["lean", "music"]) {
      const outfile = path.join(dir, `${edition}.js`);
      await buildMain({ edition, outfile, stubInlinedAssets: true });
      const first = fs.readFileSync(outfile, "utf8").split("\n", 1)[0];
      assert.equal(first, editionStamp(edition, readGeneratedBuildStamp()), "2026-10-31-1115 (reassessed): the first line is the edition AND the commit the build step recorded");
      assert.equal(stampedEdition(fs.readFileSync(outfile, "utf8")), edition);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the command line: exit 1 with the fix on a lean root, exit 0 on a music root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-root-"));
  try {
    fs.mkdirSync(path.join(root, "assets", "vaults", "forge-moda"), { recursive: true });
    fs.mkdirSync(path.join(root, "assets", "vaults", "forge-tutorial"), { recursive: true });
    fs.writeFileSync(path.join(root, "main.js"), editionStamp("lean") + "\n");
    const run = () => execFileSync("node", [path.join(import.meta.dirname, "check-installable-build.mjs"), "--root", root], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    assert.throws(run, (e) => e.status === 1 && /npm run build:music/.test(String(e.stderr)));
    for (const v of ["music-theory", "music-core"]) fs.mkdirSync(path.join(root, "assets", "vaults", v), { recursive: true });
    fs.writeFileSync(path.join(root, "main.js"), editionStamp("music") + "\n");
    assert.match(run(), /check-installable-build: ok/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
