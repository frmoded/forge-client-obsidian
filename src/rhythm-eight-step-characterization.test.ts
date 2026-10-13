// Drain 2026-10-14-0900 §5 — CHARACTERIZATION, not a requirement: what an 8-step, group_size 4, 4/4 rhythm note (an "eighth-note
// grid" tresillo: kick on 0, 3, 6) does today in the Rhythm Box widget and in the Score.
//
//   Score  (the engine's rhythm_data_to_stream): HANDLES it. step length = bar / steps = an eighth, so the kick is written 3+3+2
//          eighths = dotted quarter, dotted quarter, quarter — a correct tresillo.
//   Widget (rhythm_box.html parseRhythmLoad):   REFUSES it, with a message: it knows only a fixed menu of signatures
//          (4/4 = 16 steps in groups of 4, 3/4 = 12, 12/8 = 12 / 3, 6/8 = 6 / 3, 5/4 = 20 / 4), so "4/4 with 8 steps" is not on it.
//
// This pins CURRENT behavior so a later request for an 8-step tresillo starts from a measured fact. It is a mechanism-level pin of
// a limitation: if the widget learns 8-step grids, the widget test SHOULD go red — reassess and update, do not "fix" it back.
// The data note `rhythm_pattern_tresillo` itself is unchanged (16 steps, kick on 0/6/12), as instructed.
import assert from 'node:assert/strict';
import { test as baseTest } from 'node:test';

import { loadWidget, skip as widgetSkip } from './test-support/rhythm-widget-harness.ts';
import { WHEELS_PRESENT, engine, compute } from './test-support/real-rhythm-engine.ts';

const EIGHT_STEP_TRESILLO = {
  time_signature: '4/4', steps: 8, group_size: 4, swing_pct: 0, tempo_bpm: 100,
  channels: { kick: [true, false, false, true, false, false, true, false] },
};

baseTest('widget: an 8-step 4/4 pattern is REFUSED with the signature menu\'s own message — not silently re-gridded', { skip: widgetSkip }, async () => {
  const h = await loadWidget(true);
  await h.send({ type: 'forge-rhythm-load', mode: 'playground', noteName: 'rhythm_pattern_tresillo_8', data: EIGHT_STEP_TRESILLO });
  assert.equal(
    h.el('loadMsg').textContent,
    'Could not load this note: 4/4 here means 16 steps in groups of 4; this pattern has 8 steps in groups of 4.',
  );
});

baseTest('Score: the engine engraves the 8-step pattern as a percussion score (one Kick part), through the plugin\'s own compute path', {
  skip: WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels', timeout: 300_000,
}, async () => {
  const py = await engine();
  const r = compute(py, EIGHT_STEP_TRESILLO, 'tresillo (8 steps)');
  assert.equal(r.type, 'musicxml');
  assert.equal(r.has_percussion, true);
  const names = [...String(r.multi_staff_content).matchAll(/<part-name>([^<]*)<\/part-name>/g)].map((m) => m[1]);
  assert.deepEqual(names, ['Kick']);
  // 3 + 3 + 2 eighths = dotted quarter, dotted quarter, quarter: three <note>s whose durations are 1.5, 1.5, 1.0 quarters
  const durations = [...String(r.multi_staff_content).matchAll(/<note[ >][\s\S]*?<duration>(\d+)<\/duration>/g)].map((m) => Number(m[1]));
  const divisions = Number(/<divisions>(\d+)<\/divisions>/.exec(String(r.multi_staff_content))?.[1]);
  assert.ok(divisions > 0);
  assert.deepEqual(durations.map((d) => d / divisions), [1.5, 1.5, 1.0]);
});
