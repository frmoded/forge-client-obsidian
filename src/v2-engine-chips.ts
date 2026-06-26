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

/** Music-domain chips — `forge.music.lib`. */
const MUSIC_CHIPS: AlphaDependencyInfo[] = [
  { snippet_id: 'kick', description: 'Kick drum instrument token (percussion).', inputs: [] },
  { snippet_id: 'snare', description: 'Snare drum instrument token (percussion).', inputs: [] },
  { snippet_id: 'closed_hihat', description: 'Closed hi-hat instrument token.', inputs: [] },
  { snippet_id: 'open_hihat', description: 'Open hi-hat instrument token.', inputs: [] },
  { snippet_id: 'pedal_hihat', description: 'Pedal hi-hat instrument token.', inputs: [] },
  { snippet_id: 'low_tom', description: 'Low tom instrument token.', inputs: [] },
  { snippet_id: 'mid_tom', description: 'Mid tom instrument token.', inputs: [] },
  { snippet_id: 'high_tom', description: 'High tom instrument token.', inputs: [] },
  { snippet_id: 'crash_cymbal', description: 'Crash cymbal instrument token.', inputs: [] },
  { snippet_id: 'ride_cymbal', description: 'Ride cymbal instrument token.', inputs: [] },
  {
    snippet_id: 'play_at_beats',
    description: 'Schedule an instrument to play at the given beat positions (1-indexed beats within a bar).',
    inputs: ['instrument', 'beats'],
  },
  {
    snippet_id: 'play_at_offsets',
    description: 'Schedule an instrument hit at the given offsets (in quarter-note units) within each bar; supports duration, bars, velocity, mark_dynamics.',
    inputs: ['instrument', 'offsets', 'duration', 'bars', 'velocity', 'mark_dynamics'],
  },
  {
    snippet_id: 'show_score',
    description: 'Render a score in the Forge output panel.',
    inputs: ['score'],
  },
  {
    snippet_id: 'sequence',
    description: 'Sequence multiple sections (variadic) into a single score.',
    inputs: [],
  },
  {
    snippet_id: 'sequence_list',
    description: 'Sequence a list of sections into a single score.',
    inputs: ['sections'],
  },
  {
    snippet_id: 'repeat',
    description: 'Repeat a section n times.',
    inputs: ['section', 'n'],
  },
  {
    snippet_id: 'bar',
    description: 'Build a single bar of music.',
    inputs: ['voices'],
  },
  {
    snippet_id: 'voices',
    description: 'Compose multiple voices into a Stream.',
    inputs: [],
  },
  {
    snippet_id: 'voices_canonical',
    description: 'Compose percussion voices into the canonical 7-part layout (kp, sp, hp, lp, mp, hp_high, crashp).',
    inputs: ['kp', 'sp', 'hp', 'lp', 'mp', 'hp_high', 'crashp'],
  },
  {
    snippet_id: 'with_velocity',
    description: 'Apply a velocity (0-127) to every note in a part.',
    inputs: ['part', 'velocity'],
  },
  {
    snippet_id: 'minor_pentatonic',
    description: 'Build a minor pentatonic scale starting at the given root.',
    inputs: ['root'],
  },
  {
    snippet_id: 'major_pentatonic',
    description: 'Build a major pentatonic scale starting at the given root.',
    inputs: ['root'],
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
