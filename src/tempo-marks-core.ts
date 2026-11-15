// 2026-11-15-2101 - the Score writes a tempo mark above a bar only when the tempo CHANGES: the first mark, and any bar whose tempo differs from the one before it. Unchanged tempo: nothing above the bar.
// The engine (music21) writes a MetronomeMark at every bar of every staff (`rhythm_bars_to_stream` keeps each bar's own mark through the join), so the MusicXML that reaches Verovio carries one `<direction>` per bar per
// part. This is the one place that thins them, on the MusicXML text, before it is engraved: a phrase, an arrangement and a composition all draw through the same Verovio call, so they all follow the same rule.
//   - the CARRIER is the first part that has any tempo mark; only it keeps marks, and it keeps only the first and the ones that differ from the running tempo (a change back shows again); a bar with no mark inherits;
//   - every other part loses its tempo marks (they repeat the carrier's: the staves of one Score share a tempo);
//   - a direction that holds other things (a dynamic, a word) keeps them: only its tempo part goes; a direction that held nothing else is removed whole. The tempo of the bars that lose their mark does not change: it is the running tempo.
// Pure: text in, text out. No obsidian import.
const PART = /<part\b[^>]*>[\s\S]*?<\/part>/g;
const DIRECTION = /<direction\b[^>]*>[\s\S]*?<\/direction>/g;
const DIRECTION_TYPE = /<direction-type\b[^>]*>[\s\S]*?<\/direction-type>/g;

/** What a tempo mark says, as a comparable string ("quarter|100", "quarter.|60"), or null when the direction holds no metronome. */
export function tempoSignature(direction: string): string | null {
  const m = /<metronome\b[^>]*>([\s\S]*?)<\/metronome>/.exec(direction);
  if (!m) return null;
  const unit = /<beat-unit>\s*([^<\s]+)\s*<\/beat-unit>/.exec(m[1])?.[1] ?? '';
  const dots = (m[1].match(/<beat-unit-dot\b/g) ?? []).length;
  const per = /<per-minute>\s*([^<]*?)\s*<\/per-minute>/.exec(m[1])?.[1] ?? '';
  const n = Number(per);
  return `${unit}${'.'.repeat(dots)}|${Number.isFinite(n) && per !== '' ? String(n) : per}`;
}

/** The direction without its tempo: the other direction-types stay; '' when nothing else was in it. */
function withoutTempo(direction: string): string {
  const rest = direction.replace(DIRECTION_TYPE, (t) => (/<metronome\b/.test(t) ? '' : t));
  return /<direction-type\b/.test(rest) ? rest : '';
}

export function dedupeTempoMarks(xml: string): string {
  if (typeof xml !== 'string' || !xml.includes('<metronome')) return xml;
  let carrierSeen = false;
  return xml.replace(PART, (part) => {
    if (!part.includes('<metronome')) return part;
    const isCarrier = !carrierSeen; carrierSeen = true;
    let running: string | null = null;
    return part.replace(DIRECTION, (direction) => {
      const sig = tempoSignature(direction);
      if (sig === null) return direction;
      if (isCarrier && (running === null || sig !== running)) { running = sig; return direction; }
      return withoutTempo(direction);
    });
  });
}
