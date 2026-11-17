// 2026-11-17-2000 - the adapter between the Score's one row (score-transport-dom.ts) and html-midi-player's `<midi-player>` element, which keeps playing the sound; its own controls (play button, seek bar,
// time) are not shown any more. No obsidian import: the element is passed in, a test passes a fake. Tempo is applied by playing a STRETCHED copy of the note sequence (score-transport-core.ts), the
// original is kept, so any tempo can be returned to exactly.
import { TEMPO_DEFAULT, clampTempo, clockAfterTempoChange, scaleSequenceTempo, tempoFactor, type PlaybackSequenceLike } from './score-transport-core.ts';
import type { TransportPlayer } from './score-transport-dom.ts';

/** The part of the element the adapter uses (the real one has more). */
export interface MidiElementLike {
  playing: boolean;
  currentTime: number;
  noteSequence: unknown;
  start(): void;
  stop(): void;
  addEventListener(type: 'start' | 'stop', fn: () => void): void;
  removeEventListener(type: 'start' | 'stop', fn: () => void): void;
}
export interface TransportPlayerHandle {
  player: TransportPlayer;
  /** The tempo in percent now playing (the follower reads it to find the note that sounds). */
  tempoPct(): number;
  /** The clock reading for a place `scoreSeconds` into the music, at the tempo now set (click-to-play seeks with it). */
  clockForScoreSeconds(scoreSeconds: number): number;
}

export function createTransportPlayer(el: MidiElementLike, baseSequence: PlaybackSequenceLike, leadIn: number): TransportPlayerHandle {
  let pct = TEMPO_DEFAULT;
  const player: TransportPlayer = {
    get playing() { return !!el.playing; },
    start() { el.start(); },
    stop() { el.stop(); },
    reset() { el.stop(); el.currentTime = 0; },
    setTempo(next: number) {
      const to = clampTempo(next); if (to === pct) return;
      const wasPlaying = !!el.playing; const clock = el.currentTime || 0;
      if (wasPlaying) el.stop();
      el.noteSequence = scaleSequenceTempo(baseSequence, to, leadIn);
      el.currentTime = clockAfterTempoChange(clock, pct, to, leadIn);
      pct = to;
      if (wasPlaying) el.start();
    },
    onStateChange(fn) {
      const onStart = (): void => fn(!!el.playing); const onStop = (): void => fn(!!el.playing);
      el.addEventListener('start', onStart); el.addEventListener('stop', onStop);
      return () => { el.removeEventListener('start', onStart); el.removeEventListener('stop', onStop); };
    },
  };
  return { player, tempoPct: () => pct, clockForScoreSeconds: (s: number) => s * tempoFactor(pct) };
}
