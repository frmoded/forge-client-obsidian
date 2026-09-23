// Mechanism-pinning (drain 2026-09-23-2100): `npm run build` must generate
// the gitignored *.generated.ts modules BEFORE it typechecks. On a truly
// clean checkout those modules do not exist yet, so a typecheck that runs
// first fails with TS2307 — which is exactly how the directory's official
// release review's own build failed for 0.5.3. Local builds never showed it
// because a prior build had left the generated files on disk.
//
// This reads package.json's real `build` string and pins ORDER, not the exact
// command text. If a generator is renamed or a new one added, update the
// GENERATORS list — that is the intended tripwire.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const steps = pkg.scripts.build.split("&&").map((s) => s.trim());

const GENERATORS = [
  "scripts/inline-plugin-version.mjs", // -> version-constant.generated.ts
  "scripts/build-asset-manifest.mjs", // -> asset-manifest.generated.ts
  "scripts/inline-bundled-assets.mjs", // -> bundled-assets.generated.ts
];

const idx = (needle) => steps.findIndex((s) => s.includes(needle));

test("every generator step exists in the build script", () => {
  for (const g of GENERATORS) assert.ok(idx(g) >= 0, `build script has no step for ${g}`);
});

test("typecheck runs after every generator of a *.generated.ts module", () => {
  const tc = idx("npm run typecheck");
  assert.ok(tc >= 0, "build script has no typecheck step");
  for (const g of GENERATORS) {
    assert.ok(idx(g) < tc, `${g} must run BEFORE typecheck (clean checkouts have no generated modules yet)`);
  }
});

test("the generated modules stay gitignored (the reason order matters)", () => {
  const gi = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
  for (const f of ["bundled-assets", "version-constant", "asset-manifest"]) {
    assert.ok(gi.includes(`src/${f}.generated.ts`), `${f}.generated.ts no longer gitignored — this test's premise changed`);
  }
});
