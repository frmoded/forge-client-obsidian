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

test("lean build stays lean in size: far below the music build", async () => {
  const lean = await buildTo("lean");
  assert.ok(lean.length < 3_000_000, `lean main.js grew to ${lean.length} bytes (baseline ~1.8 MB)`);
});
