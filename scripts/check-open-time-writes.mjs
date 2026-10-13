#!/usr/bin/env node
// Drain 2026-10-13-2100 §2/§5 — which shipped notes the plugin would rewrite WITHOUT the user editing them (on open, or on Run).
//
// A bundled library note that the plugin rewrites loses its place in the bundle: the manifest reads it as "edited", so it stops
// auto-updating (a `.bundled` sidecar appears instead) and shows up as a git diff in the source vault. This reports which notes do
// that, using the plugin's own functions (see check-open-time-writes-core.mjs), and FAILS only for the notes listed in
// scripts/open-time-readonly.txt — a ratchet: add a note there once it ships fully derived, and it can never regress silently.
//
//   node scripts/check-open-time-writes.mjs                 gate: assets/vaults/*, required list from scripts/open-time-readonly.txt
//   node scripts/check-open-time-writes.mjs --report        list EVERY note that would write (exit 0 regardless)
//   node scripts/check-open-time-writes.mjs --report <dir>… same, for specific vault directories (e.g. a source vault repo)
//   node scripts/check-open-time-writes.mjs --require <vault>/<path>.md <dir>…   gate named directories for the named notes only
//
// Exit codes: 0 ok (or --report), 1 a required note would be written, 2 usage / missing directory / required note not found.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditVault, parseRequiredList } from "./check-open-time-writes-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const report = argv.includes("--report");
const required = [];
const dirs = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--report") continue;
  if (argv[i] === "--require") { required.push(argv[++i]); continue; }
  dirs.push(argv[i]);
}
const explicitDirs = dirs.length > 0;
if (dirs.length === 0) {
  const vaults = path.join(ROOT, "assets", "vaults");
  if (fs.existsSync(vaults)) {
    for (const d of fs.readdirSync(vaults, { withFileTypes: true })) {
      if (d.isDirectory() && !d.name.startsWith(".")) dirs.push(path.join(vaults, d.name));
    }
  }
}
for (const d of dirs) {
  if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) {
    console.error(`check-open-time-writes: not a directory: ${d}`);
    process.exit(2);
  }
}
// The standing required list describes the BUNDLE (assets/vaults/*); it is not applied when the caller names directories.
if (!report && !explicitDirs) {
  const list = path.join(ROOT, "scripts", "open-time-readonly.txt");
  if (fs.existsSync(list)) required.push(...parseRequiredList(fs.readFileSync(list, "utf8")));
}

const writing = new Map(); // "<vault>/<rel>" -> { open, run }
let applicable = 0;
for (const dir of dirs) {
  const r = await auditVault(dir);
  applicable += r.applicable;
  for (const w of r.writing) writing.set(`${path.basename(dir)}/${w.path}`, w);
}

if (report) {
  for (const [p, w] of [...writing].sort()) {
    const parts = [];
    if (w.open.length) parts.push(`OPEN: ${w.open.join("; ")}`);
    if (w.run.length) parts.push(`RUN: ${w.run.join("; ")}`);
    console.log(`${p}\n    ${parts.join("\n    ")}`);
  }
  console.log(`\ncheck-open-time-writes: ${writing.size} of ${applicable} action note(s) would be rewritten by the plugin without a user edit`);
  process.exit(0);
}

let failed = 0;
for (const req of required) {
  const present = dirs.some((d) => fs.existsSync(path.join(d, req.split("/").slice(1).join("/"))) && path.basename(d) === req.split("/")[0]);
  if (!present) {
    console.error(`  MISSING ${req}  (listed in open-time-readonly.txt but not in the scanned vaults)`);
    process.exit(2);
  }
  const w = writing.get(req);
  if (w) {
    failed++;
    console.error(`  WRITES  ${req}`);
    for (const x of w.open) console.error(`      on open: ${x}`);
    for (const x of w.run) console.error(`      on run:  ${x}`);
  }
}
if (failed > 0) {
  console.error(
    `\ncheck-open-time-writes: ${failed} note(s) that must ship read-only would be rewritten by the plugin.\n`
    + `A rewritten library note stops auto-updating (the manifest reads it as edited) and dirties the source vault.\n`
    + `Make the note ship exactly what the plugin would write (a fully derived # Python + hashes), at the SOURCE vault, then re-sync.\n`
    + `See what is written for EVERY note:  node scripts/check-open-time-writes.mjs --report`,
  );
  process.exit(1);
}
console.log(`check-open-time-writes: ok (${required.length} required read-only note(s); ${writing.size} other note(s) are reported by --report)`);
