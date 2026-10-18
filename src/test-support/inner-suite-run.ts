// Drain 2026-10-18-1500 — run a test file in a CHILD `node --test`, deterministically, and say whether it really ran.
//
// Used by bundle-tests-do-not-write-the-bundle.test.ts, whose measurement ("the suite did not touch the shipped bundle") is only worth
// anything if the child demonstrably executed tests. Everything here exists to take the environment out of that question:
//   - the child's reporter is chosen EXPLICITLY (TAP, to stdout) — never the Node default, which differs by version and by TTY;
//   - the child's env is scrubbed of what changes its output (FORCE_COLOR / NO_COLOR / NODE_DISABLE_COLORS), what makes a nested runner
//     short-circuit (NODE_TEST_CONTEXT), and any reporter smuggled in through NODE_OPTIONS — unrelated NODE_OPTIONS survive;
//   - the summary is parsed tolerantly (ANSI escapes, CR, trailing whitespace; TAP or spec) and an output that cannot be parsed is a
//     LOUD failure showing the tail, never a quiet "0".
import { execFileSync } from 'node:child_process';

export interface InnerSuiteRun { tests: number; pass: number; fail: number }

// CSI sequences (colour, cursor): ESC [ params letter. Built from the code point so no raw escape sits in this source.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, 'g');

/** The env a child suite should run under: `parent` minus everything that changes its output. */
export function innerSuiteEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...parent };
  for (const k of ['FORCE_COLOR', 'NO_COLOR', 'NODE_DISABLE_COLORS', 'NODE_TEST_CONTEXT']) delete env[k];
  if (env.NODE_OPTIONS !== undefined) {
    // drop `--test-reporter=x`, `--test-reporter x`, and the `-destination` pair in both spellings; keep everything else
    const kept = env.NODE_OPTIONS
      .replace(/--test-reporter(?:-destination)?(?:=\S+|\s+\S+)/g, ' ')
      .split(/\s+/).filter(Boolean).join(' ');
    if (kept) env.NODE_OPTIONS = kept; else delete env.NODE_OPTIONS;
  }
  return env;
}

export function innerSuiteArgs(testFile: string): string[] {
  return ['--experimental-strip-types', '--test', '--test-reporter=tap', '--test-reporter-destination=stdout', testFile];
}

/** `{ tests, pass, fail }` from a child run's output, or null when there is no summary to read. TAP (`# pass 7`) or spec (`ℹ pass 7`). */
export function parseInnerSuiteRun(output: string): InnerSuiteRun | null {
  // No CR handling is needed: in a multiline JS regex `$` already matches before `\r`, so CRLF output reads (pinned by the CRLF test).
  const text = output.replace(ANSI, '');
  const count = (name: string): number | null => {
    const m = new RegExp(`^[ \\t]*(?:#|\\u2139)[ \\t]+${name}[ \\t]+(\\d+)[ \\t]*$`, 'm').exec(text);
    return m ? Number(m[1]) : null;
  };
  const tests = count('tests'), pass = count('pass'), fail = count('fail');
  if (tests === null || pass === null || fail === null) return null;
  return { tests, pass, fail };
}

/** Throws unless the output proves the child executed at least one test. The message carries the output TAIL, JSON-quoted so escape codes show. */
export function assertInnerSuiteRan(output: string): InnerSuiteRun {
  const run = parseInnerSuiteRun(output);
  if (run === null || run.tests <= 0) {
    throw new Error(
      'the inner bundle suite did not run (no parsable summary, or zero tests), so this guard proves nothing. '
      + `Last 600 characters of its output, JSON-quoted:\n${JSON.stringify(output.slice(-600))}`,
    );
  }
  return run;
}

/** Run `testFile` as a child suite from `cwd` and return its stdout, whatever its exit status (its own pass/fail is its own run's business). */
export function runInnerSuite(testFile: string, cwd: string, parentEnv: NodeJS.ProcessEnv = process.env): string {
  try {
    return execFileSync(process.execPath, innerSuiteArgs(testFile), { cwd, encoding: 'utf8', env: innerSuiteEnv(parentEnv) });
  } catch (e) {
    return String((e as { stdout?: string }).stdout ?? '');
  }
}
