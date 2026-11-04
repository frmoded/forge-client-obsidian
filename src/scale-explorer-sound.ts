// 2026-11-04-1170 (Scale Explorer 1 of 4) — the sound of the `forge-scale` block: a small WebAudio oscillator, one per note.
// The repo had no pitched audio path (the piano widget only selects keys; the Score plays through html-midi-player), so this is the one module that makes a tone. Nothing here runs at mount: the AudioContext is created on the first `play`
// (which is a person's click, so the browser lets it start) and shared afterwards.

import { playEndMs, type PlayEvent } from './scale-explorer-core.ts';
import type { ScaleSound } from './scale-explorer-dom.ts';

/** The slice of AudioContext the sound uses; the tests hand in a double. */
export interface AudioLike {
  readonly currentTime: number;
  readonly destination: unknown;
  resume?(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
}
export interface OscillatorLike {
  type: string;
  frequency: { value: number };
  connect(to: unknown): unknown;
  disconnect?(): void;
  start(when?: number): void;
  stop(when?: number): void;
}
export interface GainLike {
  gain: { setValueAtTime(v: number, t: number): unknown; linearRampToValueAtTime(v: number, t: number): unknown };
  connect(to: unknown): unknown;
  disconnect?(): void;
}

/** Equal temperament, A4 (midi 69) = 440 Hz. */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** The most notes sounding at once in the plan. */
export function maxOverlap(events: readonly PlayEvent[]): number {
  let max = 0;
  for (const e of events) max = Math.max(max, events.filter((o) => o.startMs <= e.startMs && e.startMs < o.startMs + o.durMs).length);
  return max;
}

/** A quiet level that does not clip when 8 notes sound together. */
export function peakGain(events: readonly PlayEvent[]): number {
  return 0.4 / Math.max(1, maxOverlap(events));
}

const ATTACK_S = 0.015;
const RELEASE_S = 0.06;
const LEAD_S = 0.03;

export interface ScaleSoundEnv {
  getContext(): AudioLike;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export function realScaleSoundEnv(): ScaleSoundEnv {
  let ctx: AudioLike | null = null;
  return {
    getContext: () => {
      if (!ctx) {
        const w = window as unknown as { AudioContext?: new () => AudioLike; webkitAudioContext?: new () => AudioLike };
        const Ctor = w.AudioContext ?? w.webkitAudioContext;
        if (!Ctor) throw new Error('This browser has no WebAudio.');
        ctx = new Ctor();
      }
      return ctx;
    },
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (h) => { window.clearTimeout(h as number); },
  };
}

export function createScaleSound(env: ScaleSoundEnv = realScaleSoundEnv()): ScaleSound {
  let timers: unknown[] = [];
  let nodes: { osc: OscillatorLike; gain: GainLike }[] = [];

  const silence = (): void => {
    for (const t of timers) env.clearTimeout(t);
    timers = [];
    for (const { osc, gain } of nodes) {
      try { osc.stop(); } catch { /* already stopped */ }
      try { osc.disconnect?.(); gain.disconnect?.(); } catch { /* already disconnected */ }
    }
    nodes = [];
  };

  return {
    play(events, hooks) {
      silence();
      let ctx: AudioLike;
      try {
        ctx = env.getContext();
        void ctx.resume?.();
      } catch (e) {
        console.error('Forge: scale explorer — no sound (play):', e);
        return;
      }
      const peak = peakGain(events);
      const t0 = ctx.currentTime + LEAD_S;
      for (const e of events) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = midiToHz(e.midi);
        const on = t0 + e.startMs / 1000;
        const off = on + e.durMs / 1000;
        gain.gain.setValueAtTime(0, on);
        gain.gain.linearRampToValueAtTime(peak, on + ATTACK_S);
        gain.gain.setValueAtTime(peak, Math.max(on + ATTACK_S, off - RELEASE_S));
        gain.gain.linearRampToValueAtTime(0, off);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(on);
        osc.stop(off + 0.02);
        nodes.push({ osc, gain });
        timers.push(env.setTimeout(() => { hooks.onNoteOn(e.midi); }, e.startMs));
        timers.push(env.setTimeout(() => { hooks.onNoteOff(e.midi); }, e.startMs + e.durMs));
      }
      timers.push(env.setTimeout(() => { silence(); hooks.onEnd(); }, playEndMs(events) + 20));
    },
    stop: silence,
  };
}
