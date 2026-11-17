// 2026-11-17-2000 - the Score's one gentle row (design doc checklists/music_tabs_chat_ui_design.md section 4). Pure: no DOM, no obsidian. What the row says and does:
//   Play / Pause (one toggle), Reset (stop, back to the start) | tempo: minus, the value (click to type), plus | one Export icon with a menu of the formats there are.
// The tempo is a PERCENT of the written speed: 100 is as written, 50 half speed, 200 double. Range 50..200 in steps of 5 (there was no playback tempo control in the Score before this row: the
// range and the step are this file's choice, say so to the driver; the player's own progress bar and time are not shown any more, the playhead on the Score is the progress).

export const TEMPO_MIN = 50;
export const TEMPO_MAX = 200;
export const TEMPO_STEP = 5;
export const TEMPO_DEFAULT = 100;

export function clampTempo(pct: number): number {
  if (!Number.isFinite(pct)) return TEMPO_DEFAULT;
  return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(pct)));
}

/** One step of the minus (-1) or plus (+1) button: to the next multiple of the step in that direction (a typed 103 goes to 105 or 100, never to 108), inside the range. */
export function stepTempo(pct: number, direction: -1 | 1): number {
  const now = clampTempo(pct);
  const next = direction === 1 ? (Math.floor(now / TEMPO_STEP) + 1) * TEMPO_STEP : (Math.ceil(now / TEMPO_STEP) - 1) * TEMPO_STEP;
  return clampTempo(next);
}

/** What was typed into the tempo field: "120", "120%", " 120 % " (whole numbers only; a number outside the range is clamped to the nearest end); anything else is not a tempo. */
export function parseTempoText(text: string): { ok: true; pct: number } | { ok: false } {
  const m = /^\s*(\d{1,4})\s*%?\s*$/.exec(String(text ?? ''));
  if (!m) return { ok: false };
  return { ok: true, pct: clampTempo(Number(m[1])) };
}

export function formatTempo(pct: number): string { return `${clampTempo(pct)}%`; }

/** The factor the note times are multiplied by to play at `pct` percent: 50 -> 2 (twice as long), 200 -> 0.5. */
export function tempoFactor(pct: number): number { return TEMPO_DEFAULT / clampTempo(pct); }

export interface PlaybackSequenceLike { notes?: { startTime?: number; endTime?: number }[]; totalTime?: number; [k: string]: unknown }

/** A copy of a note sequence (whose notes were shifted by a silent `leadIn` seconds) played at `pct` percent: the times AFTER the lead-in are stretched, the lead-in itself is not. The input is not touched. */
export function scaleSequenceTempo<T extends PlaybackSequenceLike>(base: T, pct: number, leadIn: number): T {
  const f = tempoFactor(pct);
  const at = (t: number): number => leadIn + (t - leadIn) * f;
  const out = JSON.parse(JSON.stringify(base)) as T;
  for (const n of out.notes ?? []) { if (typeof n.startTime === 'number') n.startTime = at(n.startTime); if (typeof n.endTime === 'number') n.endTime = at(n.endTime); }
  if (typeof out.totalTime === 'number') out.totalTime = at(out.totalTime);
  return out;
}

/** The score time (seconds from the first note) that a player clock reading stands for, at `pct` percent: the follower asks it to find the note that sounds now. */
export function scoreSecondsAt(playerSeconds: number, pct: number, leadIn: number): number {
  return (playerSeconds - leadIn) / tempoFactor(pct);
}

/** The player clock that corresponds to the same place in the music after a tempo change from `fromPct` to `toPct`. */
export function clockAfterTempoChange(playerSeconds: number, fromPct: number, toPct: number, leadIn: number): number {
  if (playerSeconds <= leadIn) return playerSeconds;
  return leadIn + (playerSeconds - leadIn) * (tempoFactor(toPct) / tempoFactor(fromPct));
}

// ---- the words ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const TRANSPORT_LABELS = {
  play: 'Play', pause: 'Pause', reset: 'Back to the start', slower: 'Slower', faster: 'Faster', tempo: 'Tempo, click to type a percent', tempoField: 'Tempo, percent', export: 'Export',
  row: 'Score controls',
} as const;

export function playPauseLabel(playing: boolean): string { return playing ? TRANSPORT_LABELS.pause : TRANSPORT_LABELS.play; }

export interface ExportItem { id: 'musicxml' | 'midi' | 'garageband'; label: string }
/** The formats the Export menu lists, in order: what the Score offered as separate links and buttons before (MusicXML, MIDI, and, on a Mac desktop only, "Open in GarageBand"). */
export function exportItems(opts: { macDesktop: boolean }): ExportItem[] {
  const items: ExportItem[] = [{ id: 'musicxml', label: 'MusicXML' }, { id: 'midi', label: 'MIDI' }];
  if (opts.macDesktop) items.push({ id: 'garageband', label: 'Open in GarageBand' });
  return items;
}

// ---- the icons: our own family (viewBox 0 0 100 100, stroke 6, round caps, currentColor), the same rules as the ribbon icons (music-ribbon-core.ts iconIssues) ----------------------
const S = 'stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"';
const FILL = 'fill="currentColor" stroke="none"';
export interface TransportIcon { id: string; svg: string }
export const TRANSPORT_ICONS: Record<'play' | 'pause' | 'reset' | 'minus' | 'plus' | 'export', TransportIcon> = {
  play: { id: 'play', svg: `<path d="M32 22 L78 50 L32 78 Z" ${S} fill="none"/>` },
  pause: { id: 'pause', svg: `<line x1="36" y1="24" x2="36" y2="76" ${S} fill="none"/><line x1="64" y1="24" x2="64" y2="76" ${S} fill="none"/>` },
  reset: { id: 'reset', svg: `<line x1="26" y1="24" x2="26" y2="76" ${S} fill="none"/><path d="M74 24 L40 50 L74 76 Z" ${S} fill="none"/>` },
  minus: { id: 'minus', svg: `<line x1="26" y1="50" x2="74" y2="50" ${S} fill="none"/>` },
  plus: { id: 'plus', svg: `<line x1="26" y1="50" x2="74" y2="50" ${S} fill="none"/><line x1="50" y1="26" x2="50" y2="74" ${S} fill="none"/>` },
  export: { id: 'export', svg: `<line x1="50" y1="64" x2="50" y2="20" ${S} fill="none"/><path d="M32 38 L50 20 L68 38" ${S} fill="none"/><path d="M22 60 L22 80 L78 80 L78 60" ${S} fill="none"/><circle cx="50" cy="64" r="0.1" ${FILL}/>` },
};
