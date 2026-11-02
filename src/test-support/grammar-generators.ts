// 2026-10-30-1030 (M15a) generators, shared since 2026-10-31-1140 (M16a): the Recipe grammar's round trip runs over the SAME seeded params as the Description grammar's, so the two properties are about the same notes.
import { MORPH_ORDERS, PHRASE_STYLES, type TransformOp } from '../phrase-core.ts';
import type { GrammarParams, GrammarVault } from '../phrase-grammar-core.ts';

// ---- a seeded generator --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export function rng(seed: number) {
  let a = seed >>> 0;
  const next = (): number => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (lo: number, hi: number): number => lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)];
  return { next, int, pick, chance: (p: number): boolean => next() < p };
}
export type Rng = ReturnType<typeof rng>;

export const VAULT: GrammarVault = {
  bars: Array.from({ length: 30 }, (_, i) => `bar_${String(i + 1).padStart(3, '0')}`),
  phrases: Array.from({ length: 40 }, (_, i) => `phrase_${String(i + 1).padStart(3, '0')}`),
  arrangements: ['arr_001', 'arr_002', 'arr_003'],
  compositions: ['intro', 'comp_001'],
  kits: ['rock', 'latin', 'jazz', 'funk'],
};
export const ROWS = ['kick', 'snare', 'hihat', 'conga_high', 'clap-2'];

/** A number in 0..1 as the controls and a hand-edit make them: 0, 1, a half, whole percents, four decimals (a path stop), or any double. */
const unit = (r: Rng): number => r.pick([0, 1, 0.5, r.int(0, 100) / 100, r.int(0, 10000) / 10000, r.next(), Number((1 - r.int(1, 7) / 7).toFixed(4))]);
const overridesFor = (r: Rng, max: number): Record<string, string> | undefined => {
  if (!r.chance(0.3)) return r.chance(0.1) ? {} : undefined;
  const out: Record<string, string> = {};
  for (let i = r.int(1, 3); i > 0; i--) out[String(r.int(1, max))] = `bars/${r.pick(VAULT.bars)}`;
  return out;
};
export const GEN: Record<string, (r: Rng) => GrammarParams> = {
  extend: (r) => {
    const bars = r.int(1, 64);
    const pct = r.pick([0, 0, -90, 100, r.int(-90, 100), r.int(-900, 1000) / 10, r.int(-9000, 10000) / 100]);
    const overrides = overridesFor(r, bars);
    return { kind: 'extend', source: r.pick(VAULT.bars), bars, style: r.pick(PHRASE_STYLES), tempo_change_pct: pct, ...(overrides ? { overrides } : {}) };
  },
  mix: (r) => {
    const a = r.pick(VAULT.bars); const b = r.chance(0.1) ? a : r.pick(VAULT.bars);
    const mode = r.pick([undefined, 'vote', 'path'] as const);
    const base = { kind: 'mix' as const, a, b, weight: unit(r), threshold: unit(r), ghost: r.chance(0.5) };
    if (mode !== 'path') return mode === 'vote' ? { ...base, mode: 'vote' } : base;
    const order = r.pick(MORPH_ORDERS);
    return { ...base, mode: 'path', order, seed: order === 'seeded' || r.chance(0.3) ? r.int(0, 1000000) : 0 };
  },
  morph: (r) => {
    const bars = r.pick([1, 1, r.int(2, 64)]);
    const overrides = overridesFor(r, bars);
    return { kind: 'morph', a: r.pick(VAULT.bars), b: r.pick(VAULT.bars), bars, order: r.pick(MORPH_ORDERS), seed: r.chance(0.5) ? 0 : r.int(0, 100000), ...(bars === 1 ? { position: r.int(0, 40) } : {}), ...(overrides ? { overrides } : {}) };
  },
  transform: (r) => {
    const ops: TransformOp[] = [];
    for (let i = r.int(1, 4); i > 0; i--) {
      const first = r.int(1, 20); const last = first + r.int(0, 10); const row = r.chance(0.5) ? r.pick(ROWS) : undefined;
      if (r.chance(0.4)) ops.push({ op: 'double_up', first, last, ...(row !== undefined ? { row } : {}), grid: r.pick([16, 16, 8, 4, 32, r.int(1, 64)]) });
      else if (r.chance(0.4)) ops.push({ op: 'thin_out', first, last, ...(row !== undefined ? { row } : {}), amount: unit(r), keep: 'seeded', seed: r.int(0, 99999) });
      else ops.push({ op: 'thin_out', first, last, ...(row !== undefined ? { row } : {}), amount: unit(r) });
    }
    const overrides = overridesFor(r, 40);
    return { kind: 'transform', source: r.chance(0.2) ? `arrangements/${r.pick(VAULT.arrangements!)}` : r.chance(0.15) ? `compositions/${r.pick(VAULT.compositions!)}` : `phrases/${r.pick(VAULT.phrases)}`, ops, ...(overrides ? { overrides } : {}) };
  },
  composition: (r) => ({
    kind: 'composition',
    sections: Array.from({ length: r.int(1, 6) }, () => {
      const source = r.pick([`phrases/${r.pick(VAULT.phrases)}`, `arrangements/${r.pick(VAULT.arrangements!)}`, `compositions/${r.pick(VAULT.compositions!)}`]);
      return { source, ...(r.chance(0.7) ? { length: r.pick([1, 4, 8, 16, r.int(1, 256)]) } : {}), ...(r.chance(0.3) ? { repeat: r.pick([1, 2, r.int(1, 16)]) } : {}) };
    }),
  }),
  arrangement: (r) => {
    const kits = [...VAULT.kits!].sort(() => r.next() - 0.5).slice(0, r.int(1, 4));
    return { kind: 'arrangement', tracks: kits.map((kit) => ({
      kit, phrase: r.pick(VAULT.phrases),
      ...(r.chance(0.3) ? { mute: r.chance(0.8) } : {}), ...(r.chance(0.3) ? { solo: r.chance(0.8) } : {}), ...(r.chance(0.4) ? { volume: r.pick([0, 100, 70, r.int(0, 100)]) } : {}),
    })) };
  },
};
