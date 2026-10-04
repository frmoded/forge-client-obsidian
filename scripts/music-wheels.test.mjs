// Music-edition Phase 2 — the wheel pin table, the fetcher's verification logic, and the music-build
// preflight. Network and git are injected, so none of this touches the network.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { loadPins, matchesPin, ensureWheel, sha256 } from "./fetch-music-wheels.mjs";
import { checkEditionAssets } from "./check-edition-assets.mjs";
import { editionConfig } from "./editions.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "forge-wheels-"));
const GOOD = Buffer.from("the real wheel bytes");
const BAD = Buffer.from("tampered wheel bytes!");
const PIN = { file: "x-1.0-py3-none-any.whl", distribution: "x", version: "1.0", bytes: GOOD.length, sha256: sha256(GOOD) };
const NET_OK = {
  getJson: async () => ({ urls: [{ filename: PIN.file, url: "https://example.invalid/x.whl", digests: { sha256: PIN.sha256 } }] }),
  getBytes: async () => GOOD,
};

test("the pin table: 11 unique wheels incl. music21, well-formed sha256, 22.8 MB total", () => {
  const { wheels } = loadPins();
  assert.equal(wheels.length, 11);
  assert.equal(new Set(wheels.map((w) => w.file)).size, 11);
  assert.ok(wheels.some((w) => w.file === "music21-8.3.0-py3-none-any.whl"));
  for (const w of wheels) {
    assert.match(w.sha256, /^[0-9a-f]{64}$/, `${w.file} sha256 malformed`);
    assert.ok(w.bytes > 0);
    assert.match(w.file, /\.whl$/);
  }
  const total = wheels.reduce((s, w) => s + w.bytes, 0);
  assert.ok(total > 22_000_000 && total < 24_000_000, `total ${total}`);
});

test("matchesPin: exact bytes only (length AND sha256)", () => {
  assert.equal(matchesPin(PIN, GOOD), true);
  assert.equal(matchesPin(PIN, BAD), false);
  assert.equal(matchesPin(PIN, Buffer.concat([GOOD, Buffer.from("x")])), false);
});

test("ensureWheel: an already-correct file is left alone (no rewrite)", async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, PIN.file), GOOD);
  const before = fs.statSync(path.join(dir, PIN.file)).mtimeMs;
  const r = await ensureWheel(PIN, { destDir: dir, net: NET_OK, gitRun: () => { throw new Error("must not be called"); } });
  assert.deepEqual([r.status, r.source], ["ok-existing", "existing"]);
  assert.equal(fs.statSync(path.join(dir, PIN.file)).mtimeMs, before);
});

test("ensureWheel: a CORRUPT existing file is replaced from the git blob", async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, PIN.file), BAD);
  const r = await ensureWheel(PIN, { destDir: dir, gitRun: () => GOOD, net: NET_OK });
  assert.deepEqual([r.status, r.source], ["fetched", "git"]);
  assert.deepEqual(fs.readFileSync(path.join(dir, PIN.file)), GOOD);
});

test("ensureWheel: wrong bytes from git are DISCARDED and PyPI is tried next", async () => {
  const dir = tmp();
  const r = await ensureWheel(PIN, { destDir: dir, gitRun: () => BAD, net: NET_OK });
  assert.deepEqual([r.status, r.source], ["fetched", "pypi"]);
  assert.deepEqual(fs.readFileSync(path.join(dir, PIN.file)), GOOD);
});

test("ensureWheel: PyPI's own digest differing from our pin is refused (never written)", async () => {
  const dir = tmp();
  const net = { getJson: async () => ({ urls: [{ filename: PIN.file, url: "u", digests: { sha256: "0".repeat(64) } }] }), getBytes: async () => GOOD };
  const r = await ensureWheel(PIN, { destDir: dir, gitRun: () => { throw new Error("no git"); }, net });
  assert.equal(r.status, "failed");
  assert.ok(r.problems.some((p) => /differs from our pin/.test(p)), r.problems.join(" | "));
  assert.equal(fs.existsSync(path.join(dir, PIN.file)), false);
});

test("ensureWheel: a source that serves tampered bytes is refused even when its metadata matches", async () => {
  const dir = tmp();
  const net = { getJson: NET_OK.getJson, getBytes: async () => BAD };
  const r = await ensureWheel(PIN, { destDir: dir, source: "pypi", net });
  assert.equal(r.status, "failed");
  assert.ok(r.problems.some((p) => /do NOT match the pin/.test(p)));
  assert.equal(fs.existsSync(path.join(dir, PIN.file)), false, "bad bytes were written to disk");
});

test("ensureWheel: every source failing reports each reason and writes nothing", async () => {
  const dir = tmp();
  const net = { getJson: async () => { throw new Error("offline"); }, getBytes: async () => GOOD };
  const r = await ensureWheel(PIN, { destDir: dir, gitRun: () => { throw new Error("no blob"); }, net });
  assert.equal(r.status, "failed");
  assert.equal(r.problems.length, 3);
  assert.deepEqual(fs.readdirSync(dir), []);
});

// ---- preflight ------------------------------------------------------------------------------------

function musicTree({ wheels = true, vaults = true, corrupt = false } = {}) {
  const root = tmp();
  const pins = loadPins().wheels;
  if (wheels) {
    fs.mkdirSync(path.join(root, "wheels"), { recursive: true });
    for (const p of pins) fs.writeFileSync(path.join(root, "wheels", p.file), corrupt ? "junk" : "unused");
  }
  if (vaults) {
    for (const v of editionConfig("music").vaults) {
      fs.mkdirSync(path.join(root, "vaults", v), { recursive: true });
      fs.writeFileSync(path.join(root, "vaults", v, "forge.toml"), "x");
    }
  }
  return { root, pins };
}

test("preflight: LEAN requires nothing — an empty assets tree is fine", () => {
  assert.deepEqual(checkEditionAssets(tmp(), editionConfig("lean")), []);
});

test("preflight: MUSIC with nothing present names every missing wheel and vault, with the fixing command", () => {
  const problems = checkEditionAssets(tmp(), editionConfig("music"));
  assert.equal(problems.filter((p) => /missing wheel/.test(p)).length, 11);
  assert.equal(problems.filter((p) => /bundled vault .* missing/.test(p)).length, 4);
  assert.ok(problems.some((p) => /npm run fetch-music-wheels/.test(p)));
  assert.ok(problems.some((p) => /sync-bundled-vault\.mjs music-theory/.test(p)));
});

test("preflight: MUSIC passes only when wheels MATCH their pins and every vault has forge.toml", () => {
  // Synthetic pins matching the fixture bytes, so this exercises the logic without real wheels.
  const { root } = musicTree({ wheels: false });
  const pins = loadPins().wheels.map((w) => ({ ...w, bytes: 4, sha256: crypto.createHash("sha256").update("junk").digest("hex") }));
  fs.mkdirSync(path.join(root, "wheels"), { recursive: true });
  for (const p of pins) fs.writeFileSync(path.join(root, "wheels", p.file), "junk");
  assert.deepEqual(checkEditionAssets(root, editionConfig("music"), pins), []);
  fs.writeFileSync(path.join(root, "wheels", pins[0].file), "tampered");
  assert.ok(checkEditionAssets(root, editionConfig("music"), pins).some((p) => /does not match its pin/.test(p)));
});

test("preflight: music vaults missing is a problem even when the wheels are fine", () => {
  const { root, pins } = musicTree({ vaults: false });
  const synth = pins.map((w) => ({ ...w, bytes: 6, sha256: crypto.createHash("sha256").update("unused").digest("hex") }));
  const problems = checkEditionAssets(root, editionConfig("music"), synth);
  assert.equal(problems.filter((p) => /missing wheel|does not match/.test(p)).length, 0);
  assert.equal(problems.filter((p) => /bundled vault/.test(p)).length, 4);
});
