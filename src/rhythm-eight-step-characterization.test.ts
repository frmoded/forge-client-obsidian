// Drain 2026-10-14-0900 §5 characterized an 8-step, group_size 4, 4/4 rhythm note: the Score handled it and the widget REFUSED it.
// Drain 2026-10-14-1200 closed the widget half: 4/4 + 8 steps + group_size 2 or 4 (eighth-note resolution) is now a valid grid.
//
// What stays pinned here is the PAIRING, which is the property: the Score (the engine's rhythm_data_to_stream) and the widget agree on what an
// eighth-note-resolution 4/4 bar is. The detailed widget behavior (load, menu, save round trip, playback speed) is in rhythm-box-circle.test.ts.
// The data note `rhythm_pattern_tresillo` is unchanged (16 steps) — no existing data note was converted.
import assert from 'node:assert/strict';
import { test as baseTest } from 'node:test';

import { loadWidget, skip as widgetSkip } from './test-support/rhythm-widget-harness.ts';
import { WHEELS_PRESENT, engine, compute } from './test-support/real-rhythm-engine.ts';

const EIGHT_STEP_TRESILLO = {
  time_signature: '4/4', steps: 8, group_size: 4, swing_pct: 0, tempo_bpm: 100,
  channels: { kick: [true, false, false, true, false, false, true, false] },
};

baseTest('widget: an 8-step 4/4 pattern LOADS (it was refused before 2026-10-14-1200) and shows eight cells', { skip: widgetSkip }, async () => {
  for (const group of [2, 4]) {
    const h = await loadWidget(true);
    await h.send({ type: 'forge-rhythm-load', mode: 'playground', noteName: 'rhythm_pattern_tresillo_8', data: { ...EIGHT_STEP_TRESILLO, group_size: group } });
    assert.equal(h.el('loadMsg').textContent, '', `group ${group}: no refusal`);
    assert.equal(h.doc.querySelectorAll('#grid .step[data-channel="kick"]').length, 8);
  }
});

baseTest('widget: a 4/4 grid that is neither 16 nor 8 steps is still refused, now naming BOTH allowed grids', { skip: widgetSkip }, async () => {
  const h = await loadWidget(true);
  await h.send({ type: 'forge-rhythm-load', mode: 'playground', noteName: 'x', data: { ...EIGHT_STEP_TRESILLO, steps: 12, channels: { kick: new Array(12).fill(false) } } });
  assert.equal(
    h.el('loadMsg').textContent,
    'Could not load this note: 4/4 here means 16 steps in groups of 4 (or 8 steps in groups of 2 or 4); this pattern has 12 steps in groups of 4.',
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
