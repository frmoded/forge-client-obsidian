#!/usr/bin/env node
// Drain 2026-10-18-1200 §2 — restamp shipped library notes to exactly what the plugin would write. Run it in the SOURCE vault repo.
//
//   node scripts/restamp-library-notes.mjs <note.md>…           rewrite each note that is not already a fixed point
//   node scripts/restamp-library-notes.mjs --check <note.md>…   list the notes that WOULD change; exit 1 if any, 0 if none; writes nothing
//
// Exit codes: 0 ok, 1 --check found notes that would change, 2 usage / missing file / a note that does not settle.
// See restamp-library-notes-core.mjs for what it does and, importantly, what it does not (it never transpiles).
import fs from "node:fs";
import { restampNote } from "./restamp-library-notes-core.mjs";

const argv = process.argv.slice(2);
const check = argv.includes("--check");
const files = argv.filter((a) => a !== "--check");
if (files.length === 0) {
  console.error("usage: restamp-library-notes.mjs [--check] <note.md>…");
  process.exit(2);
}
let wouldChange = 0;
for (const f of files) {
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) {
    console.error(`restamp-library-notes: no such file: ${f}`);
    process.exit(2);
  }
  let r;
  try {
    r = await restampNote(fs.readFileSync(f, "utf8"));
  } catch (e) {
    console.error(`restamp-library-notes: ${f}: ${e.message}`);
    process.exit(2);
  }
  if (!r.changed) continue;
  wouldChange++;
  if (check) { console.log(f); continue; }
  fs.writeFileSync(f, r.next);
  console.log(`restamped ${f}`);
}
if (check && wouldChange > 0) {
  console.error(`restamp-library-notes: ${wouldChange} note(s) would change`);
  process.exit(1);
}
