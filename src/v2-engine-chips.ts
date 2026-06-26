// v0.2.188 — Engine-chip catalog for the V2 /generate deps payload.
//
// V2 /generate Phase 2 surfaced a UX bug in v0.2.187 smoke: the LLM,
// asked to "Play a kick drum on beat 2 of a single bar.", responded
// with `# missing chip: play_at_offsets` — but `play_at_offsets` DOES
// exist in `forge.music.lib` and the V2 system prompt's Example 5
// uses it. The LLM was being conservative because the deps payload
// only contained vault action notes (markdown files), not engine
// chips (Python functions). With an incomplete catalog the LLM
// defaulted to "missing".
//
// Fix: surface the engine chips here, mirror-style. Each entry is
// shape-compatible with AlphaDependencyInfo so the plugin can splice
// them into the deps array before POST. The system prompt's few-shot
// examples plus this enumeration give the LLM a complete view.
//
// Re-vendor when forge/<domain>/lib.py adds or renames chips. The
// engine-side tests (tests/moda/test_lib_v2_chips.py, tests/music/...)
// pin the canonical names; if a drift hits, those tests would have
// failed first.

import type { AlphaDependencyInfo } from './server';

/** Music-domain chips — `forge.music.lib`. Only signatures that are
 *  callable from V2's kwarg-only `Call [[name]] with k=v` syntax.
 *  Variadic-positional functions (`bar(*items)`, `voices(*streams)`,
 *  `sequence(*streams)`) are intentionally OMITTED because V2 chip
 *  call expressions can't pass positional args. Cohort-direct cases
 *  that need variadic should use the `_list` wrappers (`sequence_list`
 *  exists for this reason; future `bar_list` / `voices_list` would
 *  parallel). */
const MUSIC_CHIPS: AlphaDependencyInfo[] = [
  // Percussion instrument tokens — zero-arg factories.
  { snippet_id: 'kick', description: 'Kick drum instrument (call with no args to get the token).', inputs: [] },
  { snippet_id: 'snare', description: 'Snare drum instrument (no args).', inputs: [] },
  { snippet_id: 'closed_hihat', description: 'Closed hi-hat instrument (no args).', inputs: [] },
  { snippet_id: 'open_hihat', description: 'Open hi-hat instrument (no args).', inputs: [] },
  { snippet_id: 'pedal_hihat', description: 'Pedal hi-hat instrument (no args).', inputs: [] },
  { snippet_id: 'low_tom', description: 'Low tom instrument (no args).', inputs: [] },
  { snippet_id: 'mid_tom', description: 'Mid tom instrument (no args).', inputs: [] },
  { snippet_id: 'high_tom', description: 'High tom instrument (no args).', inputs: [] },
  { snippet_id: 'crash_cymbal', description: 'Crash cymbal instrument (no args).', inputs: [] },
  { snippet_id: 'ride_cymbal', description: 'Ride cymbal instrument (no args).', inputs: [] },

  // Scheduling — build a Part with hits at the given times.
  // NOTE: `play_at_beats` and `play_at_offsets` use DIFFERENT conventions.
  // The descriptions below spell out the indexing because cohort prompts
  // routinely use ordinal phrases like "beat 1 and 3" — the LLM must
  // know which chip to pick AND what numbers to pass.
  {
    snippet_id: 'play_at_beats',
    description: 'Build a Part with quarter-note hits at the given beat positions. `beats` is **1-indexed** — beat 1 is the first beat of the bar. "Beat 1 and 3" of a 4/4 bar = `beats=[1, 3]`. Floats supported for sub-beats: `[1, 1.5, 2, 2.5]` is straight eighths. Pass an empty list `[]` for an instrument-only Part with no hits.',
    inputs: ['instrument', 'beats'],
  },
  {
    snippet_id: 'play_at_offsets',
    description: 'Build a Part with hits at the given offsets (quarter-note units within each bar). Offsets are **0-indexed** — offset 0 is the first beat. "Beat 1 and 3" = `offsets=[0, 2]`. Default duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96. Use this (not play_at_beats) when you need a multi-bar pattern or non-quarter-note durations.',
    inputs: [
      'instrument', 'offsets', 'duration', 'bars',
      'time_signature', 'tempo_bpm', 'velocity', 'mark_dynamics',
    ],
  },

  // Composition + arrangement (kwarg-callable subset).
  {
    snippet_id: 'voices_canonical',
    description: 'Compose percussion Parts into the canonical 7-voice layout (kp=kick, sp=snare, chp=closed-hihat, ohp=open-hihat, ltp=low-tom, mtp=mid-tom, crp=crash-cymbal). Any kwarg may be omitted; missing voices become rests.',
    inputs: ['kp', 'sp', 'chp', 'ohp', 'ltp', 'mtp', 'crp'],
  },
  {
    snippet_id: 'sequence_list',
    description: 'Concatenate a list of sections into one Score, end-to-end. Use this when you have N sections (variadic `sequence(*streams)` is NOT V2-callable; this list wrapper is).',
    inputs: ['sections'],
  },
  {
    snippet_id: 'repeat',
    description: 'Repeat the section `s` `n` times. Returns a Score with the section concatenated n times end-to-end.',
    inputs: ['s', 'n'],
  },
  {
    snippet_id: 'with_velocity',
    description: 'Apply velocity values to a Note sequence per a `pattern`. Patterns: "human" (random ±8 around 75), or an integer (uniform). Mutates in place; returns the list.',
    inputs: ['notes', 'pattern', 'mark_dynamics'],
  },

  // Output (terminal — call as the Return value).
  {
    snippet_id: 'show_score',
    description: 'Render `score` in the Forge output panel as a music-XML score plus MIDI playback. Typically the last call in a music note.',
    inputs: ['score'],
  },

  // Scale / pitch helpers.
  {
    snippet_id: 'minor_pentatonic',
    description: 'Return a list of minor-pentatonic pitches across an octave range. `key_or_tonic` is a music21 Key or a string like "A". `octave_range` defaults to (4, 5). Set `include_blue=True` for the blue-note variant.',
    inputs: ['key_or_tonic', 'octave_range', 'include_blue'],
  },
  {
    snippet_id: 'major_pentatonic',
    description: 'Return a list of major-pentatonic pitches across an octave range. Args mirror `minor_pentatonic` minus `include_blue`.',
    inputs: ['key_or_tonic', 'octave_range'],
  },
];

/** Moda-domain chips — `forge.moda.lib`. */
const MODA_CHIPS: AlphaDependencyInfo[] = [
  { snippet_id: 'temperature_to_speed', description: 'Map "zero"/"low"/"medium"/"high" temperature to a speed constant.', inputs: ['temperature'] },
  { snippet_id: 'create_chamber', description: 'Build an empty ParticleState scaffolding for a chamber of the given dimensions.', inputs: ['width', 'height'] },
  { snippet_id: 'create_water_particles', description: 'Append count water particles at random positions to the state.', inputs: ['state', 'count'] },
  { snippet_id: 'create_ink_particles', description: 'Append count ink particles as a tight cluster at (x, y).', inputs: ['state', 'x', 'y', 'count', 'radius'] },
  { snippet_id: 'advance_positions', description: 'Move every particle one tick forward along its heading; bumps tick.', inputs: ['state', 'dt'] },
  { snippet_id: 'bounce_off_walls', description: 'Reflect particles past chamber bounds back inside.', inputs: ['state'] },
  { snippet_id: 'bounce_off_pairs', description: 'Swap headings for every colliding pair (i, j).', inputs: ['state', 'pairs'] },
  { snippet_id: 'detect_collisions', description: 'Return (M, 2) int64 array of colliding pair row indices (approach-filtered).', inputs: ['state', 'radius'] },
  { snippet_id: 'set_speed_for_type', description: 'Set speeds[types == particle_type] to the given speed; other types untouched.', inputs: ['state', 'particle_type', 'speed'] },
  { snippet_id: 'set_mass_for_type', description: 'Set masses[types == particle_type] to the given mass; other types untouched.', inputs: ['state', 'particle_type', 'mass'] },
  { snippet_id: 'group_clicks_by_tick', description: 'Convert a clicks list to a {tick: [(x, y), ...]} dict.', inputs: ['clicks'] },
  { snippet_id: 'apply_clicks_at_tick', description: 'Apply any clicks scheduled at the given tick via on_click(state, x, y).', inputs: ['state', 'clicks_by_tick', 'tick', 'on_click'] },
  { snippet_id: 'random_name', description: 'Generate a random N-character lowercase ASCII name.', inputs: ['n'] },
  { snippet_id: 'show_simulation', description: 'Render the simulation iframe with the given ParticleState.', inputs: ['state'] },
  { snippet_id: 'tick_range', description: 'Return [0, 1, ..., n-1] — workaround for missing range(N) in V2.', inputs: ['n'] },
];

/** Tutorial / core chips — `forge.core` builtins surfaced as chips. */
const TUTORIAL_CHIPS: AlphaDependencyInfo[] = [
  { snippet_id: 'print', description: 'Print text to stdout (Python builtin).', inputs: ['text'] },
];

/** Get the engine-chip catalog filtered to the active domains.
 *
 *  `activeDomains` semantics match `forge.toml`'s `domains` field:
 *  - `null` → include ALL chips (back-compat with vaults that don't
 *    declare `domains`).
 *  - `[]` → core-only (just tutorial chips).
 *  - `['music', ...]` → those subsets.
 */
export function engineChipsForDomains(
  activeDomains: string[] | null,
): AlphaDependencyInfo[] {
  const include = (domain: string) =>
    activeDomains === null || activeDomains.includes(domain);

  const out: AlphaDependencyInfo[] = [...TUTORIAL_CHIPS];
  if (include('music')) out.push(...MUSIC_CHIPS);
  if (include('moda')) out.push(...MODA_CHIPS);
  return out;
}
