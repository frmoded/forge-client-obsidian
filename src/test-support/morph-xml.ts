// Test support (drain 2026-10-24-1230): a minimal MusicXML for a Score of several bars, in the shape the plugin's tying code reads — one <part> per channel in canonical order, one <measure> per bar, every step a
// one-division note or rest (so a step is one division), the bar's tempo in the first part's <sound>. Not what Verovio engraves from; what `annotateMorphXml` scans. The real engine's own MusicXML is used in
// phrase-morph-engine.test.ts.
import { CANONICAL_CHANNELS, type RhythmDataLike } from '../provenance-core.ts';

export const isHitCell = (v: unknown): boolean => v === true || (typeof v === 'number' && v > 0);

export function morphXml(bars: readonly RhythmDataLike[], tempi: readonly number[] = [], opts: { tied?: Array<{ bar: number; channel: string; step: number }> } = {}): string {
  const channels = CANONICAL_CHANNELS.filter((c) => bars.some((b) => Object.prototype.hasOwnProperty.call(b.channels, c)));
  const part = (channel: string, index: number): string => {
    const measures = bars.map((bar, b) => {
      const row = bar.channels[channel] ?? [];
      const tails = new Set((opts.tied ?? []).filter((t) => t.bar === b + 1 && t.channel === channel).map((t) => t.step + 1));
      const notes = Array.from({ length: bar.steps }, (_, i) => {
        if (tails.has(i)) return '<note><unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched><duration>1</duration><tie type="stop"/></note>';
        return isHitCell(row[i])
          ? '<note><unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched><duration>1</duration></note>'
          : '<note><rest/><duration>1</duration></note>';
      }).join('');
      const attrs = b === 0 ? '<attributes><divisions>4</divisions></attributes>' : '';
      const tempo = index === 0 ? `<direction><sound tempo="${tempi[b] ?? 100}"/></direction>` : '';
      return `<measure number="${b + 1}">${attrs}${tempo}${notes}</measure>`;
    }).join('');
    return `<part id="P${index + 1}">${measures}</part>`;
  };
  return `<score-partwise>${channels.map(part).join('')}</score-partwise>`;
}
