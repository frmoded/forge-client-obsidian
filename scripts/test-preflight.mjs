#!/usr/bin/env node
// Drain 2026-10-20-1100 §5 — `pretest`: a bare clone gets ONE clear message instead of dozens of import errors. See test-preflight-core.mjs.
// FORGE_TEST_PREFLIGHT=off (exactly that) skips it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preflightProblems } from "./test-preflight-core.mjs";

if (process.env.FORGE_TEST_PREFLIGHT === "off") process.exit(0);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { message } = preflightProblems({
  gitignore: fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8"),
  exists: (f) => fs.existsSync(path.join(ROOT, f)),
});
if (message) {
  console.error(message);
  process.exit(1);
}
