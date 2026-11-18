// 2026-11-18-1200 - `node scripts/dev/power-check.mjs`: exit 1 and ONE sentence on stderr only when the Mac is on battery power below 20 % charge (the driver's rule, 2026-11-18; AC power and a battery at 20 % or more run) (scripts/drain-matrix.sh runs it before it creates a worktree), else exit 0 and one line on stdout.
// It reads `pmset -g batt`; FORGE_POWER_READ_FILE names a file holding that text instead (the tests' stand-in for the machine); FORGE_POWER_GUARD=off skips the check. A machine with no pmset, or text it cannot parse, is silence (exit 0).
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

import { parsePmsetBatt, powerLine, powerVerdict, refusalSentence } from './power-core.mjs';

if (process.env.FORGE_POWER_GUARD === 'off') { console.log('power: the guard is off (FORGE_POWER_GUARD=off), not checked'); process.exit(0); }
let text = '';
try {
  if (process.env.FORGE_POWER_READ_FILE) text = fs.existsSync(process.env.FORGE_POWER_READ_FILE) ? fs.readFileSync(process.env.FORGE_POWER_READ_FILE, 'utf8') : '';
  else { const r = spawnSync('pmset', ['-g', 'batt'], { encoding: 'utf8', timeout: 5000 }); text = r.status === 0 ? r.stdout : ''; }
} catch { text = ''; }
const reading = parsePmsetBatt(text), verdict = powerVerdict(reading);
if (!verdict.ok) { console.error(refusalSentence(reading, verdict)); process.exit(1); }
console.log(powerLine(reading));
