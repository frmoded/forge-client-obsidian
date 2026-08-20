// Tests for the BRAT Phase 1 asset-manifest generator (drain 2026-08-19-0900).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { buildEntries, renderModule, sha256, HYDRATABLE_DIRS } from "./build-asset-manifest.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "asset-manifest-"));
  for (const d of HYDRATABLE_DIRS) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "wheels", "b-1.0-py3-none-any.whl"), "BBB");
  fs.writeFileSync(path.join(root, "wheels", "a-1.0-py3-none-any.whl"), "AAA");
  fs.writeFileSync(path.join(root, "pyodide", "pyodide.asm.wasm"), "WASM");
  // Not hydratable: inlined-text buckets must never appear.
  fs.mkdirSync(path.join(root, "vaults"), { recursive: true });
  fs.writeFileSync(path.join(root, "vaults", "note.md"), "# hi");
  return root;
}

test("hashes match a known-good sha256 of the file bytes", () => {
  const root = fixture();
  const e = buildEntries(root).find((x) => x.name === "a-1.0-py3-none-any.whl");
  assert.equal(e.sha256, crypto.createHash("sha256").update("AAA").digest("hex"));
  assert.equal(e.bytes, 3);
  assert.equal(e.relpath, "wheels/a-1.0-py3-none-any.whl");
});

test("covers BOTH hydratable dirs and EXCLUDES inlined-text buckets", () => {
  const names = buildEntries(fixture()).map((e) => e.name);
  assert.ok(names.includes("pyodide.asm.wasm"), "pyodide must hydrate");
  assert.ok(names.includes("a-1.0-py3-none-any.whl"), "wheels must hydrate");
  assert.ok(!names.includes("note.md"), "vaults/ is inlined; downloading it would be waste");
  assert.equal(names.length, 3);
});

test("output is sorted, so a rebuild does not churn main.js", () => {
  const entries = buildEntries(fixture());
  const names = entries.map((e) => e.name);
  assert.deepEqual(names, [...names].sort());
});

test("generation is deterministic — same input, byte-identical module", () => {
  const root = fixture();
  assert.equal(renderModule(buildEntries(root)), renderModule(buildEntries(root)));
});

test("a basename collision across dirs is a hard error, not a silent overwrite", () => {
  // Release assets are flat: two files with one basename cannot both be
  // fetched from .../download/v<ver>/<basename>.
  const root = fixture();
  fs.writeFileSync(path.join(root, "pyodide", "a-1.0-py3-none-any.whl"), "DIFFERENT");
  assert.throws(() => buildEntries(root), /basename collision/);
});

test("the rendered module carries the total byte count for progress UX", () => {
  const mod = renderModule(buildEntries(fixture()));
  assert.match(mod, /HYDRATABLE_TOTAL_BYTES = 10;/);   // "AAA"3 + "BBB"3 + "WASM"4
  assert.match(mod, /HYDRATABLE_ASSETS: Record<string, HydratableAsset>/);
});

test("an absent assets tree yields no entries (main() turns this into a hard failure)", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "asset-manifest-empty-"));
  assert.deepEqual(buildEntries(empty), []);
});

test("sha256 helper is the plain hex digest", () => {
  assert.equal(sha256(Buffer.from("")), crypto.createHash("sha256").update("").digest("hex"));
});
