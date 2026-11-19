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

// ---- 2026-11-19-0975: the mark and the tempo control tell ONE story --------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The Score's row has a tempo control (a PERCENT of the written speed, 50..200, score-transport-core.ts). The mark above a bar says the written tempo (`♩=118`). Weekly 2026-11-18, sandbox step 7: the control read 105 % and the mark stayed
// `♩=118`, two statements about speed that disagreed. The mark now shows the EFFECTIVE tempo, the one that is playing: written x percent / 100. The rule, in one place:
//   - at 100 % the mark is exactly the text Verovio engraved (a written 103.5 stays "103.5": nothing is rounded when nothing changed);
//   - at any other percent it is the nearest WHOLE number, a half going UP (118 at 105 % = 123.9 = 124; 110 at 105 % = 115.5 = 116), never below 1;
//   - what is not a plain number (a word, "60-72") is left as it is.
// The note, the MusicXML, the export and the MIDI are never touched: the mark follows the control, the control does not follow the mark.

/** The tempo that plays when a mark written `written` bpm is played at `pct` percent (see the rule above). Whole bpm, at least 1. */
export function effectiveBpm(written: number, pct: number): number {
  const exact = Number(((written * pct) / 100).toFixed(6));           // 110 x 105 / 100 = 115.5, not 115.49999999999999: the rounding sees the decimal the person would write
  return Math.max(1, Math.round(exact));
}

/** The number text of a mark, `written` as engraved, at `pct` percent: the engraved text itself at 100 %, else the effective whole bpm; text that is not a plain number comes back unchanged. */
export function markNumberAt(written: string, pct: number): string {
  const m = /^\s*(\d+(?:\.\d+)?)\s*$/.exec(written);
  if (m === null || !Number.isFinite(pct) || pct === 100) return written;
  return String(effectiveBpm(Number(m[1]), pct));
}
