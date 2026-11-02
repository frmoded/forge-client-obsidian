// 2026-10-31-1140 (M16a) - numbers written the way a person writes them, EXACTLY: a leaf with no import, so the words of a bar range and a transform op (phrase-words-core.ts, which phrase-core.ts imports) and the Description grammar (phrase-describe-core.ts) say a
// share, a weight or an amount with ONE definition. Moved here, unchanged, from phrase-describe-core.ts, which re-exports them.

/** A number as plain decimal digits (no exponent), the shortest text that reads back as the same number. `String(n)` writes an exponent only below 1e-6 (a mantissa, then e-N) and from 1e21 (e+N): those are the two shapes undone here. */
export function plain(n: number): string {
  const s = String(n);
  const m = /^(-?)(\d+)(?:\.(\d+))?e([+-])(\d+)$/.exec(s);
  if (!m) return s;
  const digits = m[2] + (m[3] ?? ''), shift = Number(m[5]);
  return m[4] === '-' ? `${m[1]}0.${'0'.repeat(shift - m[2].length)}${digits}` : `${m[1]}${digits}${'0'.repeat(shift - (m[3] ?? '').length)}`;
}
/** Move the decimal point of a non-negative plain decimal (`places` > 0 to the right: 0.7 -> 70; < 0 to the left: 70 -> 0.7), exactly, on the digits. */
export function shiftDecimal(s: string, places: number): string {
  const [i, f = ''] = s.split('.');
  let digits = i + f; let point = i.length + places;
  if (point < 0) { digits = '0'.repeat(-point) + digits; point = 0; }
  if (point > digits.length) digits += '0'.repeat(point - digits.length);
  const int = digits.slice(0, point).replace(/^0+(?=\d)/, '') || '0';
  const frac = digits.slice(point).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}
export const percentOf = (unit: number): string => shiftDecimal(plain(unit), 2);
/** 100 minus a plain non-negative decimal, exactly, on the digits (33.33 -> 66.67; the float 100 - 33.33 would not be). */
export function complementOf100(s: string): string {
  const [i, f = ''] = s.split('.');
  const scale = 10n ** BigInt(f.length);
  const left = 100n * scale - BigInt(i + f);
  return shiftDecimal(`${left / scale}.${String(left % scale).padStart(f.length, '0')}`, 0);          // shiftDecimal drops the trailing zeros (and the point of "70.0")
}

