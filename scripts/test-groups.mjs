// 2026-11-05-1184 - THE ONE RULE for which test files run a NESTED RUNNER: a test file that spawns `node --test`, the mutation runner (mutate.mjs), the matrix (drain-matrix.sh), the memory watcher that wraps them (mem-watch.mjs), or the
// inner-suite helper (src/test-support/inner-suite-run.ts) or this runner itself. Such a file starts its own process tree, which on a thrashing machine stalls minutes inside one shared `node --test` (measured 2026-11-04: seven
// of them each stalled 5 to 16 minutes, each green alone in 3 to 30 s; `spawnSync` cannot kill grandchildren that hold its pipes), so scripts/run-tests.mjs runs them AFTER the rest, one at a time, each under a hard group timeout.
// A COMPUTED rule, never a list: a new test file that spawns a runner joins the group by what it does. Pure: no process is started here; the file texts are injected.
import fs from 'node:fs';
import path from 'node:path';

/** Calls that start a child process. */
const SPAWNS = /\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync|fork)\s*\(/;
/** What marks the child as a runner (any one of these in a file that also spawns). */
const MARKERS = [
  /mutate\.mjs|mutate-\w+\.mjs/,           // the mutation runner (and its siblings)
  /drain-matrix/,                          // the matrix
  /mem-watch\.mjs/,                        // the memory watcher: it wraps a command, which is a test run
  /['"`]--test['"`]/,                      // `spawn('node', ['--test', ...])`
];
/** The inner-suite helper and this runner are themselves the spawn: a file that uses either needs no spawn call of its own. */
const IS_THE_SPAWN = [/inner-suite-run/, /run-tests\.mjs/];

/** The text without the comments that start a line (a `//` or a block that opens at the start of a line). Deliberately NOT a tokenizer: a glob string such as 'forge/**\/*.py' must never be taken for a comment. */
export function withoutLineComments(text) {
  return text.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** Does this test file's text run a nested runner? */
export function spawnsNestedRunner(text) {
  const code = withoutLineComments(text);
  if (IS_THE_SPAWN.some((m) => m.test(code))) return true;
  return SPAWNS.test(code) && MARKERS.some((m) => m.test(code));
}

/** Split `files` into the plain files and the nested-runner group (each list in the order given). `readText(file)` returns a file's text. */
export function partitionTestFiles(files, readText) {
  const rest = [], nested = [];
  for (const f of files) (spawnsNestedRunner(readText(f)) ? nested : rest).push(f);
  return { rest, nested };
}

/** The files `npm test` has always run, in the order the shell expanded them: src/*.test.ts, then scripts/*.test.mjs (each sorted). Paths are relative to `root`. */
export function defaultTestFiles(root) {
  const list = (dir, ext) => fs.readdirSync(path.join(root, dir)).filter((n) => n.endsWith(ext)).sort().map((n) => `${dir}/${n}`);
  return [...list('src', '.test.ts'), ...list('scripts', '.test.mjs')];
}
