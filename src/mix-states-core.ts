// 2026-11-12-1201 - how many DIFFERENT results a mix of two bars can give, by vote and by path (pure: no Obsidian, no engine).
//
// A vote mix (`mix_rhythm` in forge/music/lib.py) can only give: bar a, bar b, their union, their intersection (and, with ghost notes on, the quiet hits between). With bars
// that are a subset of one another the union is one of them and the intersection the other, so the Weight slider of such a mix gives 2 results at every weight and threshold.
// A path mix (`morph_rhythm`, one hit changed at a time) gives d + 1 states, d being the number of cells (channel, step) that have a hit in exactly one bar (`morphEditCount`).
// The strip says so under a vote mix whose pair gives fewer than three results.
//
// The vote's placement rule is MIRRORED here (a pure port of the loop in `mix_rhythm`), and a real-engine sweep (mix-states-core.test.ts) pins the count to the engine's own bars over the whole
// grid, hit for hit. What is counted is WHICH steps sound (a hit, a ghost hit, a rest per channel and step): velocities are not (a bar with numeric velocities changes velocity with the weight, which
// is a change of loudness, not of rhythm; the playground's bars are plain true/false).
import { morphEditCount, type MixMode } from './phrase-core.ts';
import type { RhythmData } from './rhythm-edit-core.ts';

/** The Weight and Threshold sliders' grid: 0 to 1 in steps of 0.05 (21 stops each), as the strip writes them (two decimals). */
export const MIX_GRID = Array.from({ length: 21 }, (_, i) => Math.round(i * 5) / 100);
/** `mix_rhythm`'s slack for comparing a mixed presence with a threshold (1 - 0.9 is 0.09999999999999998 in floats). */
const EPSILON = 1e-9;
/** The fewest different results a vote mix may give before the strip points at the path. */
export const MIX_FEW_STATES = 3;

const isHit = (v: unknown): boolean => v !== false && v !== 0 && v !== null && v !== undefined;

/** One mixed bar's rhythm as a string: per channel (a's first, then b's new ones) and step, `1` a hit, `g` a ghost hit, `.` a rest. Mirrors the placement loop of `mix_rhythm`: v = weight * a + (1 - weight) * b
 *  (each 1 for a hit, 0 for a rest); placed when v > 0 and v >= threshold; with ghost on, a step that fails the threshold but has v > 0 and v >= threshold / 2 is a ghost hit. */
export function votePattern(a: RhythmData, b: RhythmData, weight: number, threshold: number, ghost: boolean): string {
  const names = Array.from(new Set([...Object.keys(a.channels), ...Object.keys(b.channels)]));
  let out = '';
  for (const name of names) {
    const ra = a.channels[name] as unknown[] | undefined; const rb = b.channels[name] as unknown[] | undefined;
    for (let i = 0; i < a.steps; i++) {
      const v = (isHit(ra?.[i]) ? weight : 0) + (isHit(rb?.[i]) ? 1 - weight : 0);
      out += v > 0 && v >= threshold - EPSILON ? '1' : ghost && v > 0 && v >= threshold / 2 - EPSILON ? 'g' : '.';
    }
    out += '|';
  }
  return out;
}

/** How many different results the mix of two bars can give: by `'vote'`, the distinct rhythms over the whole Weight x Threshold grid (the ghost setting as given); by `'path'`, d + 1. */
export function mixStateCount(a: RhythmData, b: RhythmData, method: MixMode, ghost = false): number {
  if (method === 'path') return morphEditCount(a, b) + 1;
  const seen = new Set<string>();
  for (const w of MIX_GRID) for (const t of MIX_GRID) seen.add(votePattern(a, b, w, t, ghost));
  return seen.size;
}

/** The one line under a vote mix's controls when the pair gives too few results, or null: no hint when the vote gives three or more, or when the path would not give more. */
export function mixStatesHint(vote: number, path: number): string | null {
  if (vote >= MIX_FEW_STATES || path <= vote) return null;
  return `These two bars can only give ${vote} different result${vote === 1 ? '' : 's'} by vote. Try Path: ${path} step${path === 1 ? '' : 's'}.`;
}
