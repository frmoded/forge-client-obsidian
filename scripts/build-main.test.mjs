// Edition-build tests (music-edition project, Phase 1). These BUILD main.ts for real (esbuild, a few
// seconds each) because the property that matters is a property of the bundle, not of the source:
// the lean main.js must not contain the music code or its audio-chain dependencies, and the music
// edition must (otherwise the "lean has none" assertion could pass vacuously).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { buildMain, resolveEdition, editionPlugin, stubInlinedAssetsPlugin } from "./build-main.mjs";

// Strings that only appear when verovio / html-midi-player and their transitive chain
// (@magenta/music -> tone -> standardized-audio-context) are bundled. Each is a package or module
// identifier; none appears in lean main.js today (baseline recorded in the Iteration 49 FEEDBACK).
const MUSIC_CHAIN_MARKERS = [
  "verovio",
  "html-midi-player",
  "standardized-audio-context",
  "@magenta",
];

// 2026-11-04-1170: strings only the Scale Explorer carries (the forge-scale block, its view type, its command, its CSS class in the DOM module). Lean has none of them; music has all (so the lean assertion cannot pass vacuously).
const SCALE_EXPLORER_MARKERS = [
  "forge-scale-explorer",
  "Open Scale Explorer",
  "forge-scale-degree",
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
  for (const marker of SCALE_EXPLORER_MARKERS) {
    assert.equal(js.includes(marker), false, `lean main.js unexpectedly contains the Scale Explorer: ${JSON.stringify(marker)}`);
  }
});

test("music build: DOES contain the music chain (guards the lean assertion against passing vacuously)", async () => {
  const js = await buildTo("music");
  for (const marker of MUSIC_CHAIN_MARKERS) {
    assert.equal(js.includes(marker), true, `music main.js is missing ${JSON.stringify(marker)}`);
  }
  assert.ok(js.length > 5_000_000, `music main.js suspiciously small (${js.length} bytes)`);
  for (const marker of SCALE_EXPLORER_MARKERS) {
    assert.equal(js.includes(marker), true, `music main.js is missing the Scale Explorer: ${JSON.stringify(marker)}`);
  }
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
  // 2026-11-20-1001zz (deliberate): the measure is the MODULE bytes (esbuild's own count of each input's code: see codeSizeOf below), not the output file's size, which moves with the directory esbuild runs from (the same source: 1_515_365 bytes from the repo root, 1_517_225 from scripts/dev, 1_518_155 three levels down; the matrix saw 1_517_461 against 1_515_420 in the working tree). Lean module bytes: 1_504_878 on c4f3061 (music 15_209_748).
  const lean = (await codeSizeOf("lean", SIZE_ROOT)).modules;
  const music = (await codeSizeOf("music", SIZE_ROOT)).modules;
  // 2026-11-19-0997 (deliberate): the cap is BACK at 1_500_000 (the 0992a figure of 1_700_000 is retired). The list model's cores moved behind src/list-model-selected.ts (the lean build gets list-model.lean.ts: stubs, no core): lean code-only measured 1_552_286 bytes on bb17c2e and 1_494_060 after (-58_226), 5_940 under the cap. Nothing the cap protects changed: the music chain stays out of lean, and lean stays more than five times smaller than music. The next lean-reached music code has to go behind the seam too, or move this cap on purpose.
  // 2026-11-19-0992a (deliberate): the cap moves from 1_500_000 to 1_700_000. The matrix on the committed 0993 head (ffc6510) found lean at 1_535_383 bytes (9ae606d, before 0993: 1_478_803; 0993's bar list model added about 56 KB of pure TypeScript reached from the shared composer path), which the cap's own comment ("baseline ~0.64 MB") had long outgrown. What this test protects is unchanged and still asserted below: the music chain (Verovio, the players, the music widgets) stays out of lean, lean is more than five times smaller than music (music is over 5 MB). The list-model cores are music-composer code and belong behind the edition seam; that move is a follow-up (L47 in the 0992a FEEDBACK), not part of this commit.
  // 2026-11-19-0999b (deliberate): the cap moves from 1_500_000 to 1_516_000 (+16_000). Mix and Extend as steps of a phrase (the grammar, the two validators, the engine calls, the words, the Python and the json) grew lean code-only from 1_495_068 to 1_511_326 bytes (+16_258: phrase-core +6.7 KB,
  // phrase-grammar-core +6.2 KB, bar-structure-core +2.7 KB, the rest under 1 KB); it is phrase-machinery code the lean edition carries (the 0997 FEEDBACK: the phrase grammar and core are reached from the shared composer and Score paths, so the list-model seam is the wrong tool for them). The engine runner
  // alone (applyStepsAsync, the three NewBars functions) is about 4.1 KB and could go behind a second selector, which would still leave lean about 6 KB over the old cap; what the cap protects is unchanged and asserted below (the music chain stays out of lean, lean is more than five times smaller than music).
  // 2026-11-20-1002: the cap does NOT move: one Enter applies, "did you mean" and the typed Undo / Redo took lean code-only from 1_513_119 to 1_515_420 bytes (+2_301: the thin shared path, the dialog words, the repair button, the setting); every pure function is behind the seam (did-you-mean-core, typed-step-core).
  // 2026-11-20-1002 (deliberate): the cap moves from 1_516_000 to 1_520_000. The same source measured 1_515_420 bytes in the working tree and 1_517_461 in the matrix's music-leg worktree (the matrix's copy of node_modules is a symlink, so esbuild's per-module path comments are longer there: the code-only size depends on WHERE it is built, by about 2 KB). Earlier drains passed only because their headroom (about 2.9 KB) hid that; 1002 left 580 bytes, so the matrix went red on a size that is not code. The cap is the old headroom restored (about 2.5 KB over the matrix's own measure); the real fix (a size that ignores the build location) is recommended to forge-core, not done here.
  // The cap is the measured module bytes plus a stated margin of 5_122 bytes (0.34 %): 1_504_878 + 5_122 = 1_510_000. The old file-size caps (1_520_000 and before) are retired; they hid a 2 KB working-directory effect inside their headroom.
  // 2026-11-20-1004 (deliberate): the cap moves from 1_510_000 to 1_515_000 (+5_000). The thin hooks of the failed-prompt review queue and of the sentence service (1003) live in the SHARED controller (description-apply.ts: a fp?.call at each place a sentence ends,
  // the request fields, the lines reader's call): lean code grew from 1_504_878 (1001zz) to 1_509_578 on a working tree (+4_700: the thin hooks, the settings toggle's `if (listModel.present)` and the main.ts registration), and the matrix's tree measures 2_041 MORE than a working tree (its generated asset manifest and stamps), so about 1_511_600 there: over the old cap.
  // Everything else of both features is behind the list-model seam (no sentinel in lean: asserted above); the lean stubs add 0.4 KB. The margin is now about 3_400 bytes. The size test should measure with the generated files stubbed so a working tree and the matrix agree (a recommendation sent to forge-core).
  assert.ok(lean < 1_515_000, `lean code grew to ${lean} module bytes (1_504_878 at 2026-11-20-1001zz; the cap moved to 1_515_000 at 2026-11-20-1004)`);
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

// 2026-11-19-0997: the LIST MODEL's cores (the bar list, its grammar, its Beat Box host and note writer, Duplicate) are music-composer code: the lean edition's bundle must not carry them. They are reached
// only through src/list-model-selected.ts (the build points it at list-model.lean.ts for the lean edition; src/list-model.ts is the interface). The sentinel of each core is an exported constant the music edition's
// list-model.full.ts lists in `cores` (so esbuild keeps it there and a vacuous "lean has none" cannot pass); a core a lean build still REACHED but tree-shook to nothing would leave no sentinel, so the test ALSO asks the
// build's metafile which source files lean reached and which it did not.
const LIST_MODEL_CORES = [
  "bar-list-controller", "bar-list-core", "bar-grammar-core", "bar-box-host-core", "bar-list-note-core",
  "duplicate-sentence-core", "duplicate-note-core", "duplicate-undo-core",
  "phrase-steps-lineage-core",          // 2026-11-20-1000 (deliberate): the Inspector through the step lines (a Score-only core)
  "failed-prompt-core", "failed-prompt-store", "failed-prompt-tab-dom", "failed-prompt-setup-core",  // 2026-11-20-1004 (deliberate): the failed-prompt review queue (the record, its store, the review tab's DOM, the setup): composer-only code
  "service-lines-core",  // 2026-11-20-1003 (deliberate): the sentence service as the fluent front end (the grammar table, the lines reader): composer-only code
  "did-you-mean-core", "typed-step-core",  // 2026-11-20-1002 (deliberate): the repairs of a sentence the grammar cannot read, and the typed Undo / Redo reader (composer-only code)
];
const sentinelOf = (core) => `forge-list-model-core:${core}`;

async function metafileOf(edition) {
  const require = createRequire(import.meta.url);
  const { build } = require("esbuild");
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const r = await build({
    entryPoints: [path.join(root, "src", "main.ts")], bundle: true, platform: "node", format: "cjs", write: false, metafile: true, logLevel: "silent",
    external: ["obsidian", "@codemirror/view", "@codemirror/state", "@codemirror/language"],
    plugins: [editionPlugin(edition), stubInlinedAssetsPlugin()],
    outfile: path.join(os.tmpdir(), `forge-meta-${edition}.js`),
  });
  return { inputs: Object.keys(r.metafile.inputs), text: r.outputFiles[0].text };
}

test("0997 lean build: NONE of the list model's cores is in the bundle (no sentinel, and not even a reached-but-empty module)", async () => {
  const { inputs, text } = await metafileOf("lean");
  for (const core of LIST_MODEL_CORES) {
    assert.equal(text.includes(sentinelOf(core)), false, `lean main.js contains the sentinel of ${core}`);
    assert.equal(inputs.includes(`src/${core}.ts`), false, `lean reached src/${core}.ts (a list-model core must only be reached through src/list-model-selected.ts)`);
  }
  assert.equal(inputs.includes("src/list-model.full.ts"), false, "lean reached list-model.full.ts");
  assert.equal(inputs.includes("src/list-model.lean.ts"), true, "lean did not get list-model.lean.ts (the redirect is not in place: vacuous)");
});

test("0997 music build: DOES contain every list-model core (guards the lean assertion against passing vacuously)", async () => {
  const { inputs, text } = await metafileOf("music");
  for (const core of LIST_MODEL_CORES) {
    assert.equal(text.includes(sentinelOf(core)), true, `music main.js is missing the sentinel of ${core}`);
    assert.equal(inputs.includes(`src/${core}.ts`), true, `music did not reach src/${core}.ts`);
  }
  assert.equal(inputs.includes("src/list-model.full.ts"), true);
  assert.equal(inputs.includes("src/list-model.lean.ts"), false, "the music edition got the lean list model");
});

// 2026-11-20-1001zz: the lean size must be a size of CODE, not of where esbuild was run. esbuild writes a path comment before every module (`// src/x.ts`, `// ../../node_modules/y/z.js`), and those comments are as long as the path from the directory the build ran in to the module: the SAME source gives a
// different file size from another working directory (the matrix builds in a worktree whose siblings and node_modules are symlinks: 1_517_461 bytes there, 1_515_420 in the working tree). The measure that does not move is what esbuild itself counts for each input module (`bytesInOutput`, the module's own
// code, no comments, no wrapper): the sum over every input of the one output.
async function codeSizeOf(edition, absWorkingDir) {
  const require = createRequire(import.meta.url);
  const { build } = require("esbuild");
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const r = await build({
    entryPoints: [path.join(root, "src", "main.ts")], bundle: true, platform: "node", format: "cjs", write: false, metafile: true, logLevel: "silent", absWorkingDir,
    external: ["obsidian", "@codemirror/view", "@codemirror/state", "@codemirror/language"],
    plugins: [editionPlugin(edition), stubInlinedAssetsPlugin()],
    outfile: path.join(os.tmpdir(), `forge-size-${edition}.js`),
  });
  const out = Object.values(r.metafile.outputs)[0];
  return { file: Buffer.byteLength(r.outputFiles[0].text), modules: Object.values(out.inputs).reduce((n, i) => n + i.bytesInOutput, 0) };
}
const SIZE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

test("the lean code-only size is the same whichever directory esbuild runs from (the FILE size is not: the path comments move)", async () => {
  const here = await codeSizeOf("lean", SIZE_ROOT);
  const deeper = await codeSizeOf("lean", path.join(SIZE_ROOT, "scripts", "dev"));
  assert.notEqual(here.file, deeper.file, "control: the output FILE changes with the working directory (this is why the file size cannot be the measure)");
  assert.equal(here.modules, deeper.modules, `the module bytes must not depend on the working directory: ${here.modules} from the root, ${deeper.modules} from scripts/dev`);
  assert.ok(here.modules > 1_000_000 && here.modules < here.file, `a plausible module total: ${here.modules} of a ${here.file} byte file`);
});
