// Drain 2026-10-09-2200 (rider d): the build stamp the version-inline script writes.
import test from "node:test";
import assert from "node:assert/strict";
import { readGitStamp, renderBuildStamp } from "./inline-plugin-version.mjs";

test("readGitStamp: short sha, clean tree", () => {
  const run = (args) => (args[0] === "rev-parse" ? "904d575c7\n" : "");
  assert.deepEqual(readGitStamp(".", run), { sha: "904d575c7", dirty: false });
});

test("readGitStamp: tracked changes mark the build dirty", () => {
  const run = (args) => (args[0] === "rev-parse" ? "904d575c7\n" : " M src/main.ts\n");
  assert.deepEqual(readGitStamp(".", run), { sha: "904d575c7", dirty: true });
});

test("readGitStamp: no git / not a repo / garbage output never throws and says unknown", () => {
  assert.deepEqual(readGitStamp(".", () => { throw new Error("not a git repository"); }), { sha: "unknown", dirty: false });
  assert.deepEqual(readGitStamp(".", () => "fatal: nope"), { sha: "unknown", dirty: false });
});

test("readGitStamp: a failing status call leaves the SHA and reports not-dirty", () => {
  const run = (args) => { if (args[0] === "rev-parse") return "abc1234\n"; throw new Error("status failed"); };
  assert.deepEqual(readGitStamp(".", run), { sha: "abc1234", dirty: false });
});

test("renderBuildStamp: a TypeScript module exporting BUILD_STAMP with exactly sha, dirty, builtAt", () => {
  const text = renderBuildStamp({ sha: "904d575c7", dirty: true, builtAt: "2026-10-09T20:53:15.964Z" });
  assert.match(text, /export const BUILD_STAMP = \{"sha":"904d575c7","dirty":true,"builtAt":"2026-10-09T20:53:15.964Z"\} as const;/);
  assert.match(text, /GITIGNORED/);
});
