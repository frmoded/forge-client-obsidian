// scripts/build-main.mjs
//
// Bundles src/main.ts -> main.js. Replaces the inline `npx esbuild ...` that used to live in
// package.json's `build` script; the esbuild options are unchanged (bundle, node platform, the
// Obsidian/CodeMirror externals, cjs), plus ONE addition: edition selection.
//
//   FORGE_EDITION=lean   (default)  today's build: no music21, no score rendering, no MIDI player.
//   FORGE_EDITION=music             also bundles src/music-edition.full.ts (Verovio, html-midi-player,
//                                   the music input widgets).
//
// How: every music-only feature is reached through src/music-edition-selected.ts, which is committed
// pointing at music-edition.lean.ts. For the music edition this plugin redirects that ONE module to
// music-edition.full.ts. In the lean build music-edition.full.ts (and through it verovio /
// html-midi-player and their transitive audio chain) is never imported by anything reachable from
// main.ts, so it cannot end up in main.js — no dead-code elimination involved. See
// src/music-edition.ts, and scripts/build-main.test.mjs for the check that proves it.
//
// esbuild is pinned at 0.17.3; this uses only its stable `build` + onResolve plugin API.
//
// Usage:
//   node scripts/build-main.mjs
//   FORGE_EDITION=music node scripts/build-main.mjs
//   (programmatic, for tests) import { buildMain } from './build-main.mjs'

import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const EDITIONS = ["lean", "music"];

export function resolveEdition(value) {
  const edition = value === undefined || value === "" ? "lean" : value;
  if (!EDITIONS.includes(edition)) {
    throw new Error(
      `FORGE_EDITION must be one of ${EDITIONS.join(" | ")} (default lean); got ${JSON.stringify(value)}`,
    );
  }
  return edition;
}

export function editionPlugin(edition) {
  return {
    name: "forge-music-edition",
    setup(b) {
      b.onResolve({ filter: /(^|\/)music-edition-selected(\.ts)?$/ }, () => ({
        path: path.join(ROOT, "src", edition === "music" ? "music-edition.full.ts" : "music-edition.lean.ts"),
      }));
    },
  };
}

export async function buildMain({ edition, outfile = path.join(ROOT, "main.js") } = {}) {
  const ed = resolveEdition(edition ?? process.env.FORGE_EDITION);
  await build({
    entryPoints: [path.join(ROOT, "src", "main.ts")],
    bundle: true,
    platform: "node",
    external: ["obsidian", "@codemirror/view", "@codemirror/state", "@codemirror/language"],
    format: "cjs",
    outfile,
    plugins: [editionPlugin(ed)],
    logLevel: "info",
  });
  return { edition: ed, outfile };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildMain().then(
    ({ edition }) => console.log(`[build-main] edition=${edition}`),
    (e) => { console.error(String(e?.message ?? e)); process.exit(1); },
  );
}
