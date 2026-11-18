// 2026-11-18-1200 - pure parts of the matrix's power guard (read by scripts/dev/power-check.mjs, which scripts/drain-matrix.sh runs before it creates anything). Measured 2026-11-18 (drain 1000): a matrix started on battery power at 10 %
// charge, the Mac slept during it twice, nested process tests timed out at their 300 s limit, one run hung for hours and the machine sat at a load average near 100 until the tree was killed. A matrix that cannot tell "slow" from "asleep" cannot
// be trusted either way, so it does not start on battery or below 30 % charge. Same stance as the strain check (mem-core.mjs): a reading that is missing is silence, never a refusal.

export const MIN_CHARGE_PERCENT = 30;

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

/** { ok, reason }: battery power refuses at any charge; below `min` percent refuses even on AC (a charger that cannot keep up); a reading that is not known never refuses. */
export function powerVerdict(reading, min = MIN_CHARGE_PERCENT) {
  if (reading.source === 'battery') return { ok: false, reason: 'battery' };
  if (reading.source === 'ac' && reading.percent !== null && reading.percent < min) return { ok: false, reason: 'low-charge' };
  return { ok: true, reason: null };
}

/** The one sentence the matrix prints when it refuses ('' when nothing is refused): what was read, why it matters, what to do, and the one switch. */
export function refusalSentence(reading, verdict, min = MIN_CHARGE_PERCENT) {
  if (verdict.ok) return '';
  const charge = reading.percent === null ? 'charge unknown' : `${reading.percent} % charge`;
  const why = 'a sleeping or flat Mac times the tests out and can hang the run for hours';
  const switchOff = '(FORGE_POWER_GUARD=off runs it anyway)';
  if (verdict.reason === 'battery') return `the Mac is on battery power (${charge}): the matrix is not started, because ${why}; plug in the charger and run it again ${switchOff}`;
  return `the Mac is at ${reading.percent} % charge (below ${min} %): the matrix is not started, because ${why}; let it charge to ${min} % and run it again ${switchOff}`;
}

/** The line the matrix logs when it is allowed to start. */
export function powerLine(reading) {
  if (reading.source === 'ac') return reading.percent === null ? 'power: on AC power' : `power: on AC power, ${reading.percent} % charge`;
  return 'power: not readable, not checked';
}
