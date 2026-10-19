#!/usr/bin/env node
// Drain 2026-10-20-1100 §2 — re-derive shipped library notes from the real engine's recorded Python. Run it in the SOURCE vault repo.
//
//   node scripts/rederive-library-note.mjs [--recording FILE] <note.md>…           rewrite each note whose Python is not the engine's
//   node scripts/rederive-library-note.mjs --check [--recording FILE] <note.md>…   list the notes that WOULD change; exit 1 if any; writes nothing
//
// The recording defaults to test/fixtures/engine-transpile/shipped-notes.json (scripts/record-engine-transpile.py writes it). A note's key in it is
// `<vault name from the vault's forge.toml>/<path inside the vault, no .md>`. Exit codes: 0 ok / nothing to do, 1 --check found notes that would
// change, 2 usage, a missing file, or a REFUSAL (no recorded Python, a different Recipe, a stub, a Python-source note). See rederive-library-note-core.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rederiveNote } from "./rederive-library-note-core.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const check = argv.includes("--check");
const ri = argv.indexOf("--recording");
const recordingFile = ri >= 0 ? argv[ri + 1] : path.join(here, "..", "test", "fixtures", "engine-transpile", "shipped-notes.json");
const files = argv.filter((a, i) => a !== "--check" && a !== "--recording" && !(ri >= 0 && i === ri + 1));
if (files.length === 0) {
  console.error("usage: rederive-library-note.mjs [--check] [--recording FILE] <note.md>…");
  process.exit(2);
}
const recording = JSON.parse(fs.readFileSync(recordingFile, "utf8"));

/** `<vault name>/<path inside the vault, posix, no .md>` — the vault is the nearest ancestor with a forge.toml, named by its `name = "…"`. */
function relFor(file) {
  let dir = path.dirname(path.resolve(file));
  while (!fs.existsSync(path.join(dir, "forge.toml"))) {
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  const name = /^name\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(dir, "forge.toml"), "utf8"))?.[1] ?? path.basename(dir);
  return `${name}/${path.relative(dir, path.resolve(file)).split(path.sep).join("/").replace(/\.md$/, "")}`;
}

let wouldChange = 0;
for (const f of files) {
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) {
    console.error(`rederive-library-note: no such file: ${f}`);
    process.exit(2);
  }
  const rel = relFor(f);
  if (rel === null) {
    console.error(`rederive-library-note: ${f}: not inside a vault (no forge.toml above it)`);
    process.exit(2);
  }
  const r = await rederiveNote(fs.readFileSync(f, "utf8"), { rel, recording });
  if (r.ok === false) {
    console.error(`rederive-library-note: ${f}: ${r.reason}`);
    process.exit(2);
  }
  if (!r.changed) continue;
  wouldChange++;
  if (check) { console.log(f); continue; }
  fs.writeFileSync(f, r.next);
  console.log(`re-derived ${f}`);
}
if (check && wouldChange > 0) {
  console.error(`rederive-library-note: ${wouldChange} note(s) would change`);
  process.exit(1);
}
