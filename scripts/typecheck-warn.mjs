#!/usr/bin/env node
// v0.2.207 — Build-step hardening (soft gate edition).
//
// Wraps `tsc --noEmit` so the build sees a WARNING when type errors
// appear but doesn't abort. This is the soft-gate ramp:
//
//   - Phase 1 (v0.2.207, this script): soft gate. Captures the type
//     errors at every build so cohort sees them; doesn't block ship.
//     This was the right tradeoff at introduction time because the
//     codebase carried 7 pre-existing type drifts (chips-view
//     InsertResult narrowing, RoutingResult field access in main.ts
//     + moda-dispatch, a number-vs-string mistake in forge-action).
//     Hard-failing the build on day one would have required fixing
//     all 7 in one drain, which the §3 SPLIT GUIDANCE explicitly
//     allows deferring.
//   - Phase 2 (follow-up drain): once the 7 drifts are fixed, swap
//     `typecheck` in package.json to point at `tsc --noEmit` directly
//     and delete this wrapper. The hard gate then catches the
//     v0.2.197 ReferenceError bug class structurally — exactly the
//     drain's goal.
//
// The soft gate is still load-bearing right now: it caught
// `actionTemplate is not defined` (modal.ts) and `midiRender is not
// defined` (output-view.ts) on the first run — both fixed in
// v0.2.207. Without this guard, both would have shipped as silent
// landmines waiting to bite at runtime, same shape as the
// v0.2.197 implicit-locking ReferenceError.

import { spawnSync } from 'node:child_process';

const ANSI_RED = '\x1b[31m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_RESET = '\x1b[0m';

const result = spawnSync('npx', ['tsc', '--noEmit'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  encoding: 'utf8',
});

const stdout = result.stdout ?? '';
const stderr = result.stderr ?? '';
const combined = stdout + stderr;

if (result.status === 0) {
  console.log(`${ANSI_YELLOW}[typecheck]${ANSI_RESET} clean (0 errors)`);
  process.exit(0);
}

// Count error lines (tsc prints "src/path.ts(L,C): error TS####: ...").
const errorLines = combined
  .split('\n')
  .filter(l => /^src\/.*: error TS/.test(l));
const errorCount = errorLines.length;

// Print all errors so the developer can see them.
console.log(combined.trimEnd());
console.log('');
console.log(
  `${ANSI_YELLOW}[typecheck]${ANSI_RESET} `
    + `${errorCount} type error${errorCount === 1 ? '' : 's'} `
    + `(soft gate — build continues)`,
);
console.log(
  `${ANSI_YELLOW}[typecheck]${ANSI_RESET} `
    + `Run \`npm run typecheck:strict\` to invoke tsc with hard-fail. `
    + `When the count reaches 0, swap package.json's "typecheck" to `
    + `"tsc --noEmit" and delete this wrapper.`,
);
// Exit 0 so the build chain proceeds.
process.exit(0);
