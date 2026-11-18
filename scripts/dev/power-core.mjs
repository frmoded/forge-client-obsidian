// 2026-11-18-1200 - pure parts of the matrix's power guard (read by scripts/dev/power-check.mjs, which scripts/drain-matrix.sh runs before it creates anything). Measured 2026-11-18 (drain 1000): a matrix started on battery power at 10 %
// charge, the Mac slept during it twice, nested process tests timed out at their 300 s limit, one run hung for hours and the machine sat at a load average near 100 until the tree was killed. A matrix that cannot tell "slow" from "asleep" cannot
// be trusted either way. THE DRIVER'S RULE (2026-11-18, overriding the first version of this guard, which refused on any battery power and below 30 % even on AC): "not block things due to power if the battery has 20 % or more" - the matrix refuses ONLY on battery power below 20 % charge; on AC power it
// never refuses (no floor), and a battery at 20 % or more runs. Same stance as the strain check (mem-core.mjs): a reading that is missing is silence, never a refusal.

export const MIN_CHARGE_PERCENT = 20;

/** `pmset -g batt` text -> { source: 'ac' | 'battery' | 'unknown', percent: number | null }.
 *  "Now drawing from 'AC Power'" / "'Battery Power'"; the charge is the first "NN%" on an InternalBattery line (a desktop Mac has no such line: percent null). Anything else, an empty string or a non-string is unknown. */
export function parsePmsetBatt(text) {
  if (typeof text !== 'string') return { source: 'unknown', percent: null };
  const from = /Now drawing from '([^']*)'/.exec(text);
  const source = from === null ? 'unknown' : /^AC Power$/i.test(from[1]) ? 'ac' : /^Battery Power$/i.test(from[1]) ? 'battery' : 'unknown';
  if (source === 'unknown') return { source, percent: null };
  const pct = /InternalBattery[^\n]*?(\d{1,3})%/.exec(text);
  return { source, percent: pct === null ? null : Number(pct[1]) };
}

/** { ok, reason }: refuse ONLY on battery power below `min` percent ('low-battery'); AC power never refuses; a battery whose charge cannot be read, and a machine that cannot be read at all, never refuse. */
export function powerVerdict(reading, min = MIN_CHARGE_PERCENT) {
  if (reading.source === 'battery' && reading.percent !== null && reading.percent < min) return { ok: false, reason: 'low-battery' };
  return { ok: true, reason: null };
}

/** The one sentence the matrix prints when it refuses ('' when nothing is refused): what was read, why it matters, what to do, and the one switch. */
export function refusalSentence(reading, verdict, min = MIN_CHARGE_PERCENT) {
  if (verdict.ok) return '';
  return `the Mac is on battery below ${min} % (${reading.percent} % charge): the matrix is not started, because a flat Mac sleeps or dies and times the tests out or hangs the run for hours; plug in the charger and run it again (FORGE_POWER_GUARD=off runs it anyway)`;
}

/** The line the matrix logs when it is allowed to start. */
export function powerLine(reading) {
  if (reading.source === 'ac') return reading.percent === null ? 'power: on AC power' : `power: on AC power, ${reading.percent} % charge`;
  if (reading.source === 'battery') return reading.percent === null ? 'power: on battery' : `power: on battery, ${reading.percent} % charge`;
  return 'power: not readable, not checked';
}
