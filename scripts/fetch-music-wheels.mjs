// scripts/fetch-music-wheels.mjs
//
// Music-edition Phase 2. Populates the gitignored assets/wheels/ with the 11 pinned music21-chain
// wheels the MUSIC edition needs (music21 + certifi, chardet, charset_normalizer, idna, joblib,
// jsonpickle, more_itertools, requests, urllib3, webcolors). Without them `import music21` can never
// succeed in Pyodide ("manifest has 0 wheels … wheels skipped").
//
// Why fetch instead of committing 22.8 MB of binaries to main: this repo keeps binaries out of source
// control (see scripts/setup-assets.mjs), and the lean build — the public default — must not carry
// them. The pin table scripts/music-wheels.json (filename, size, sha256, taken from the pre-strip git
// blobs 787961d^) is what makes a fetch reproducible: EVERY file is verified against it, and a file
// that does not match is never written (or, if already on disk, is replaced).
//
// Sources, tried in order for each wheel (override with --source=existing|git|pypi):
//   1. existing  — a file already in assets/wheels/ whose sha256 matches.
//   2. git       — the pre-strip blob in this repo's own history (offline, byte-identical).
//   3. pypi      — the file URL from https://pypi.org/pypi/<dist>/<version>/json, whose own sha256
//                  digest must ALSO equal our pin.
//
// Usage:  npm run fetch-music-wheels            (or: node scripts/fetch-music-wheels.mjs [--source=pypi])

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WHEELS_DIR = path.join(ROOT, "assets", "wheels");

export function loadPins(file = path.join(ROOT, "scripts", "music-wheels.json")) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** True iff `bytes` is exactly the pinned wheel. */
export function matchesPin(pin, bytes) {
  return bytes.length === pin.bytes && sha256(bytes) === pin.sha256;
}

/** Source: a verified file already on disk. */
export function fromExisting(pin, destDir) {
  const p = path.join(destDir, pin.file);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

/** Source: the pre-strip blob in this repo's git history. */
export function fromGit(pin, sourceCommit, run = (args) => execFileSync("git", args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })) {
  try {
    return run(["show", `${sourceCommit}:assets/wheels/${pin.file}`]);
  } catch {
    return null;
  }
}

/** Source: PyPI. `getJson(url)` and `getBytes(url)` are injectable so this is testable offline. */
export async function fromPyPI(pin, { getJson, getBytes }) {
  const meta = await getJson(`https://pypi.org/pypi/${pin.distribution}/${pin.version}/json`);
  const hit = (meta.urls ?? []).find((u) => u.filename === pin.file);
  if (!hit) return null;
  if (hit.digests?.sha256 !== pin.sha256) {
    throw new Error(`PyPI's own sha256 for ${pin.file} (${hit.digests?.sha256}) differs from our pin (${pin.sha256}) — refusing`);
  }
  return getBytes(hit.url);
}

const defaultNet = {
  getJson: async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); },
  getBytes: async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer()); },
};

/**
 * Ensure one pinned wheel is present and verified in `destDir`. Returns {file, status, source}
 * where status is "ok-existing" | "fetched" | "failed". Never writes bytes that fail the pin.
 */
export async function ensureWheel(pin, { destDir = WHEELS_DIR, source = "auto", sourceCommit = "787961d^", net = defaultNet, gitRun } = {}) {
  const dest = path.join(destDir, pin.file);
  const order = source === "auto" ? ["existing", "git", "pypi"] : [source];
  const problems = [];
  for (const s of order) {
    let bytes = null;
    try {
      if (s === "existing") bytes = fromExisting(pin, destDir);
      else if (s === "git") bytes = fromGit(pin, sourceCommit, gitRun);
      else if (s === "pypi") bytes = await fromPyPI(pin, net);
      else throw new Error(`unknown source ${s}`);
    } catch (e) {
      problems.push(`${s}: ${e.message}`);
      continue;
    }
    if (bytes === null) { problems.push(`${s}: not available`); continue; }
    if (!matchesPin(pin, bytes)) { problems.push(`${s}: bytes do NOT match the pin (got ${bytes.length} B, sha256 ${sha256(bytes).slice(0, 16)}…) — discarded`); continue; }
    if (s === "existing") return { file: pin.file, status: "ok-existing", source: s };
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(dest, bytes);
    return { file: pin.file, status: "fetched", source: s };
  }
  return { file: pin.file, status: "failed", problems };
}

export async function ensureAll(opts = {}) {
  const pins = loadPins(opts.pinsFile).wheels;
  const results = [];
  for (const pin of pins) results.push(await ensureWheel(pin, opts));
  return results;
}

async function main() {
  const arg = process.argv.slice(2).find((a) => a.startsWith("--source="));
  const source = arg ? arg.slice("--source=".length) : "auto";
  const results = await ensureAll({ source });
  for (const r of results) {
    console.log(`${r.status === "failed" ? "FAIL" : "ok  "} ${r.file}${r.source ? `  [${r.source}]` : ""}`);
    for (const p of r.problems ?? []) console.log(`       - ${p}`);
  }
  const failed = results.filter((r) => r.status === "failed");
  console.log(`\n${results.length - failed.length}/${results.length} wheels verified in ${path.relative(ROOT, WHEELS_DIR)}/`);
  if (failed.length) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
}
