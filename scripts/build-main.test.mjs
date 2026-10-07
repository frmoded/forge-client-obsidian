// Edition-build tests (music-edition project, Phase 1). These BUILD main.ts for real (esbuild, a few
// seconds each) because the property that matters is a property of the bundle, not of the source:
// the lean main.js must not contain the music code or its audio-chain dependencies, and the music
// edition must (otherwise the "lean has none" assertion could pass vacuously).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildMain, resolveEdition } from "./build-main.mjs";

// Strings that only appear when verovio / html-midi-player and their transitive chain
// (@magenta/music -> tone -> standardized-audio-context) are bundled. Each is a package or module
// identifier; none appears in lean main.js today (baseline recorded in the Iteration 49 FEEDBACK).
const MUSIC_CHAIN_MARKERS = [
  "verovio",
  "html-midi-player",
  "standardized-audio-context",
  "@magenta",
];

function buildTo(edition) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `forge-${edition}-`));
  const outfile = path.join(dir, "main.js");
  return buildMain({ edition, outfile }).then(() => fs.readFileSync(outfile, "utf8"));
}

test("resolveEdition: default is lean; lean and music accepted; anything else is an error", () => {
  assert.equal(resolveEdition(undefined), "lean");
  assert.equal(resolveEdition(""), "lean");
  assert.equal(resolveEdition("lean"), "lean");
  assert.equal(resolveEdition("music"), "music");
  assert.throws(() => resolveEdition("Music"), /FORGE_EDITION must be one of/);
  assert.throws(() => resolveEdition("full"), /FORGE_EDITION must be one of/);
});

test("lean build: contains NONE of the music chain and no createElement('script')", async () => {
  const js = await buildTo("lean");
  for (const marker of MUSIC_CHAIN_MARKERS) {
    assert.equal(js.includes(marker), false, `lean main.js unexpectedly contains ${JSON.stringify(marker)}`);
  }
  assert.equal(/createElement\(\s*["']script["']\s*\)/.test(js), false,
    "lean main.js contains a createElement('script') — the Obsidian directory-review Error");
});

test("music build: DOES contain the music chain (guards the lean assertion against passing vacuously)", async () => {
  const js = await buildTo("music");
  for (const marker of MUSIC_CHAIN_MARKERS) {
    assert.equal(js.includes(marker), true, `music main.js is missing ${JSON.stringify(marker)}`);
  }
  assert.ok(js.length > 5_000_000, `music main.js suspiciously small (${js.length} bytes)`);
});

// Phase 5c rider (drain 2026-10-07-0100): this used to measure lean main.js INCLUDING src/bundled-assets.generated.ts — a gitignored build
// artifact holding whichever edition `npm run build` ran for last — so it was green after a lean build and red right after a music build.
// It now builds both editions with the generated assets stubbed out: a CODE-only size, identical whatever was built before.
function buildCodeOnly(edition) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `forge-${edition}-code-`));
  const outfile = path.join(dir, "main.js");
  return buildMain({ edition, outfile, stubInlinedAssets: true }).then(() => fs.statSync(outfile).size);
}

test("lean build stays lean in size: code-only, far below the music build, independent of the last `npm run build`", async () => {
  const lean = await buildCodeOnly("lean");
  const music = await buildCodeOnly("music");
  assert.ok(lean < 1_500_000, `lean main.js code grew to ${lean} bytes (baseline ~0.64 MB)`);
  assert.ok(lean * 5 < music, `lean (${lean}) is no longer far below music (${music})`);
});

test("the size test does not depend on the generated assets: stubbing them changes the build, and the real file is not read", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-lean-stub-"));
  const withStub = path.join(dir, "stub.js");
  await buildMain({ edition: "lean", outfile: withStub, stubInlinedAssets: true });
  const js = fs.readFileSync(withStub, "utf8");
  assert.match(js, /BUNDLED_ASSETS_VERSION\s*=\s*"stub"/, "the stub module is what got bundled");
  assert.equal(js.includes("Domain modules pre-injected into the snippet namespace"), false, "no inlined engine file CONTENT leaked in from the generated module");
});
