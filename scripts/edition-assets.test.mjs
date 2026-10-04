// Music-edition Phase 2 — the asset-selection guarantee, tested BEHAVIORALLY: the real generator
// scripts are copied into a throwaway project that has music wheels and music vaults ON DISK, and are
// run for each edition. The load-bearing property:
//
//   A LEAN build is byte-identical whether or not the music assets happen to exist on the build
//   machine. Edition membership comes from FORGE_EDITION, never from directory contents.
//
// (Before scripts/editions.mjs, build-manifest.mjs, inline-bundled-assets.mjs and the release zip all
// walked the directory and would have shipped whatever was present.)

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assetInEdition, editionConfig, listEditionAssets, vaultsFor, resolveEdition } from "./editions.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MUSIC_FILES = {
  "wheels/music21-8.3.0-py3-none-any.whl": "WHEEL-BYTES",
  "vaults/music-theory/forge.toml": 'name = "MUSIC-THEORY-SENTINEL"',
  "vaults/music-theory/note.md": "MUSIC-THEORY-NOTE",
  "vaults/music-core/forge.toml": 'name = "MUSIC-CORE-SENTINEL"',
};
const BASE_FILES = {
  "pyodide/pyodide.asm.wasm": "wasm",
  "engine/forge/x.py": "x = 1",
  "iframe/index.html": "<html></html>",
  "welcome/w.md": "welcome",
  "vaults/forge-moda/forge.toml": 'name = "forge-moda"',
  "vaults/forge-tutorial/forge.toml": 'name = "forge-tutorial"',
};

function makeProject({ withMusicOnDisk }) {
  // realpath: on macOS os.tmpdir() is a symlink, and build-asset-manifest.mjs's "am I the entry point"
  // guard compares import.meta.url (real path) with argv[1] — it silently does nothing otherwise.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "forge-edition-")));
  fs.cpSync(path.join(REPO, "scripts"), path.join(root, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify({ version: "9.9.9" }));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  const files = withMusicOnDisk ? { ...BASE_FILES, ...MUSIC_FILES } : BASE_FILES;
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, "assets", rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return root;
}

function run(root, script, edition) {
  return execFileSync(process.execPath, [path.join(root, "scripts", script)], {
    cwd: root,
    env: { ...process.env, FORGE_EDITION: edition },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** The three generator steps of `npm run build`, in order; returns their outputs as text. */
function generate(root, edition) {
  run(root, "build-manifest.mjs", edition);
  run(root, "build-asset-manifest.mjs", edition);
  run(root, "inline-bundled-assets.mjs", edition);
  return {
    manifest: fs.readFileSync(path.join(root, "assets", "manifest.json"), "utf8"),
    hydratable: fs.readFileSync(path.join(root, "src", "asset-manifest.generated.ts"), "utf8"),
    inlined: fs.readFileSync(path.join(root, "src", "bundled-assets.generated.ts"), "utf8"),
  };
}

test("assetInEdition: wheels and music vaults belong to music only; everything else to both", () => {
  const lean = editionConfig("lean");
  const music = editionConfig("music");
  assert.equal(assetInEdition("wheels/music21-8.3.0-py3-none-any.whl", lean), false);
  assert.equal(assetInEdition("wheels/music21-8.3.0-py3-none-any.whl", music), true);
  assert.equal(assetInEdition("vaults/music-theory/forge.toml", lean), false);
  assert.equal(assetInEdition("vaults/music-theory/forge.toml", music), true);
  assert.equal(assetInEdition("vaults/music-core/x/y.md", lean), false);
  assert.equal(assetInEdition("vaults/forge-moda/forge.toml", lean), true);
  assert.equal(assetInEdition("vaults/forge-tutorial/01-hello/Hello.md", lean), true);
  for (const ed of [lean, music]) {
    assert.equal(assetInEdition("pyodide/pyodide.asm.wasm", ed), true);
    assert.equal(assetInEdition("engine/forge/music/lib.py", ed), true, "the engine's music/ dir ships in BOTH editions");
    assert.equal(assetInEdition("iframe/index.html", ed), true);
  }
});

test("editionConfig: lean = pyodide-only hydration, no wheels; music = wheels + pyodide; unknown value throws", () => {
  assert.deepEqual(editionConfig("lean").hydratableDirs, ["pyodide"]);
  assert.deepEqual(editionConfig("music").hydratableDirs, ["wheels", "pyodide"]);
  assert.equal(editionConfig("lean").wheels, false);
  assert.equal(editionConfig("music").wheels, true);
  assert.deepEqual(vaultsFor("lean"), ["forge-moda", "forge-tutorial"]);
  assert.deepEqual(vaultsFor("music"), ["forge-moda", "music-theory", "forge-tutorial", "music-core"]);
  assert.equal(resolveEdition(undefined), "lean");
  assert.throws(() => editionConfig("full"), /FORGE_EDITION must be one of/);
});

test("listEditionAssets: a tree holding music assets lists them for music, never for lean", () => {
  const root = makeProject({ withMusicOnDisk: true });
  const lean = listEditionAssets(path.join(root, "assets"), editionConfig("lean"));
  const music = listEditionAssets(path.join(root, "assets"), editionConfig("music"));
  assert.equal(lean.some((f) => f.startsWith("wheels/") || f.includes("music-")), false);
  assert.equal(music.some((f) => f.startsWith("wheels/")), true);
  assert.equal(music.some((f) => f.startsWith("vaults/music-theory/")), true);
  assert.ok(music.length > lean.length);
});

test("LEAN generator output is BYTE-IDENTICAL with or without music assets on disk (the headline guarantee)", () => {
  const withMusic = generate(makeProject({ withMusicOnDisk: true }), "lean");
  const without = generate(makeProject({ withMusicOnDisk: false }), "lean");
  assert.equal(withMusic.manifest, without.manifest, "assets/manifest.json differs");
  assert.equal(withMusic.hydratable, without.hydratable, "asset-manifest.generated.ts differs");
  assert.equal(withMusic.inlined, without.inlined, "bundled-assets.generated.ts differs");
});

test("lean output contains none of the music assets even though they are on disk", () => {
  const out = generate(makeProject({ withMusicOnDisk: true }), "lean");
  for (const text of [out.manifest, out.hydratable, out.inlined]) {
    assert.equal(text.includes("music21"), false, "a music wheel leaked into a lean artifact");
    assert.equal(text.includes("music-theory"), false);
    assert.equal(text.includes("music-core"), false);
    assert.equal(text.includes("SENTINEL"), false);
  }
  assert.equal(out.inlined.includes("forge-moda"), true, "lean must still inline its own vaults");
});

test("MUSIC generator output contains the wheels (manifest + baked hashes) and both music vaults", () => {
  const out = generate(makeProject({ withMusicOnDisk: true }), "music");
  assert.equal(JSON.parse(out.manifest).wheels.length, 1);
  assert.equal(out.hydratable.includes("music21-8.3.0-py3-none-any.whl"), true, "wheel hash not baked for music");
  assert.equal(out.inlined.includes("MUSIC-THEORY-SENTINEL"), true);
  assert.equal(out.inlined.includes("MUSIC-CORE-SENTINEL"), true);
});

test("an unknown FORGE_EDITION fails every generator step loudly instead of falling through to lean", () => {
  const root = makeProject({ withMusicOnDisk: false });
  for (const script of ["build-manifest.mjs", "build-asset-manifest.mjs", "inline-bundled-assets.mjs"]) {
    assert.throws(() => run(root, script, "bogus"), undefined, `${script} accepted FORGE_EDITION=bogus`);
  }
});

test("the release zip applies the edition filter (wiring pin — the zip script has side effects and is not run here)", () => {
  const src = fs.readFileSync(path.join(REPO, "scripts", "build-release-zip.mjs"), "utf8");
  assert.match(src, /assetInEdition\(entry\.name, EDITION_CFG\)/);
  assert.match(src, /MUSIC_REQUIRED_FILES/);
  assert.match(src, /if \(EDITION_CFG\.edition === "music"\) REQUIRED_FILES\.push/);
});
