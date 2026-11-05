#!/usr/bin/env node
// 2026-10-31-1125 - what the memory budget allows, for the shell scripts that cannot import mem-core.mjs.
//   node scripts/dev/mem-plan.mjs                   the budget, the heap cap, and what they allow, in words
//   node scripts/dev/mem-plan.mjs strain                    the machine's load, swap and free memory in one line, and, only when swap is over 85 % used or the 1-minute load is over 4 per core, the thrashing sentence
//   node scripts/dev/mem-plan.mjs matrix-files [--legs n]   the number for `node --test --test-concurrency=<n>` in one matrix leg (stdout: just the number)
// FORGE_MEM_BUDGET_MB (default: half the RAM, at least 2048) is the budget; FORGE_MATRIX_FILE_MB (default 600: measured 2026-11-02, 16 test files at once = 8.3 GB of tooling RSS, about 520 MB each, and the machine fell to 1.5 GB honestly available; on 2026-10-31 34 at once = 11.5 GB) is what one
// matrix test file is assumed to need; FORGE_TEST_HEAP_MB (default 1024) is the mutation runner's per-test-process heap cap.
import os from 'node:os';
import { machineStrain, matrixFileConcurrency, memBudgetMb, readMachine, readingsLine, readSystemMemory, testHeapMb, testRssCapMb, thrashingSentence } from './mem-core.mjs';

export const DEFAULT_MATRIX_FILE_MB = 600;
export const matrixFileMb = (env = process.env) => Number(env.FORGE_MATRIX_FILE_MB) || DEFAULT_MATRIX_FILE_MB;

export function plan(env = process.env, totalBytes = os.totalmem(), cores = os.cpus().length, legs = 2, availableMb = readSystemMemory(env).availableMb) {
  const budgetMb = memBudgetMb(env, totalBytes, availableMb), heapMb = testHeapMb(env), fileMb = matrixFileMb(env);
  return { budgetMb, heapMb, fileMb, legs, cores, matrixFiles: matrixFileConcurrency({ budgetMb, heapMb: fileMb, legs, cores }), rssCapMb: testRssCapMb(env), mutateChildren: Math.max(1, Math.floor(budgetMb / Math.max(heapMb, testRssCapMb(env)))) };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'strain') {          // 2026-11-05-1176: the matrix's first lines: the readings, and (only then) the sentence that says the legs will not run at once. Always exit 0: the machine's state is never a reason to fail.
    const m = readMachine(process.env);
    console.log(readingsLine(m));
    if (machineStrain(m).thrashing) console.log(thrashingSentence(m));
    process.exit(0);
  }
  const li = rest.indexOf('--legs');
  const p = plan(process.env, os.totalmem(), os.cpus().length, li >= 0 ? Number(rest[li + 1]) : 2);
  if (cmd === 'matrix-files') console.log(p.matrixFiles);
  else console.log(`memory budget ${p.budgetMb} MB (FORGE_MEM_BUDGET_MB); mutation test processes at most ${p.mutateChildren} at once (heap cap ${p.heapMb} MB, FORGE_TEST_HEAP_MB; a test process tree is killed over ${p.rssCapMb} MB, FORGE_TEST_RSS_MB); matrix: ${p.matrixFiles} test files per leg with ${p.legs} legs (assumed ${p.fileMb} MB a file, FORGE_MATRIX_FILE_MB)`);
}
