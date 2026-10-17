// Drain 2026-10-14-1200 — Beat Box CIRCLE mode (a "rhythm necklace" view of the SAME rhythm data) and the 8-step 4/4 signature.
//
// Layers, as in rhythm-box-widget.test.ts: (1) the widget's pure core evaluated in plain node (geometry, rotation, grid resolution);
// (2) the page in happy-dom with a fake host window whose postMessage is a spy. The widget is read from the SOURCE vault (or the file
// named by RHYTHM_BOX_WIDGET_FILE) — see test-support/rhythm-widget-harness.ts.
//
// THE invariants this pins (the prompt's own):
//   - the circle is a second DISPLAY of the same data: no data-format change, `view` never reaches a save payload;
//   - every edit — a dot, a rotate — goes through commitChange(): a save in note-edit mode, `edited` only in a playground, no confirm bar;
//   - Grid is the default; Score / JSON modes (the plugin's tab modes) are not touched by anything here.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadWidget, fakeAudio, skip, widgetHtml, widgetScript, type Harness } from './test-support/rhythm-widget-harness.ts';

function pureCore(): any {
  const mod: { exports: any } = { exports: {} };
  new Function('module', widgetScript)(mod);
  return mod.exports;
}

const SON_3_2 = [true, false, false, true, false, false, true, false, false, false, true, false, true, false, false, false];
const hitsOf = (row: unknown[]) => row.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
const data = (channels: Record<string, unknown[]>, over: Record<string, unknown> = {}) => ({
  time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels, ...over,
});
const CLAVE = () => data({ claves: SON_3_2.slice() });
const ROCK = () => data({
  kick: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
  snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
  hihat: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
});
const load = (d: unknown, noteName = 'rhythm_pattern_test', mode?: string, view?: string) =>
  ({ type: 'forge-rhythm-load', data: d, noteName, ...(mode ? { mode } : {}), ...(view ? { view } : {}) });
const types = (h: Harness, t: string) => h.posted.filter((m) => m && m.type === t);
const dots = (h: Harness, ch?: string) => [...h.doc.querySelectorAll(`#circle circle.dot${ch ? `[data-channel="${ch}"]` : ''}`)];
const lastSave = (h: Harness) => types(h, 'forge-rhythm-save').at(-1)?.data;

async function editing(d: unknown = ROCK(), view?: string): Promise<Harness> {
  const h = await loadWidget(true);
  await h.send(load(d, 'rhythm_pattern_test', undefined, view));
  return h;
}
async function playground(d: unknown = ROCK(), view?: string): Promise<Harness> {
  const h = await loadWidget(true);
  await h.send(load(d, 'rhythm_pattern_test', 'playground', view));
  return h;
}
async function toCircle(h: Harness) { h.el('bViewCircle').click(); await new Promise((r) => setTimeout(r, 5)); }

// ======================================================================================================================
// pure core
// ======================================================================================================================

test('geometry: step 0 sits at 12 o\'clock and the steps run CLOCKWISE', { skip }, () => {
  const w = pureCore();
  for (const n of [6, 8, 12, 16, 20]) {
    const g = w.circleGeometry(n, 1, 460);
    const p0 = g.points[0][0];
    assert.ok(Math.abs(p0.x - g.cx) < 1e-6 && p0.y < g.cy, `N=${n}: step 0 straight up`);
    if (n % 4 === 0) {
      const q = g.points[0][n / 4];                    // a quarter turn clockwise: 3 o'clock
      assert.ok(q.x > g.cx && Math.abs(q.y - g.cy) < 1e-6, `N=${n}: step N/4 at 3 o'clock`);
      const h = g.points[0][n / 2];                    // half turn: 6 o'clock
      assert.ok(Math.abs(h.x - g.cx) < 1e-6 && h.y > g.cy, `N=${n}: step N/2 at 6 o'clock`);
    }
  }
});

test('geometry: N steps are N EQUALLY spaced points on every ring', { skip }, () => {
  const w = pureCore();
  const g = w.circleGeometry(12, 3, 460);
  for (let r = 0; r < 3; r++) {
    const angles = g.points[r].map((p: any) => Math.atan2(p.x - g.cx, g.cy - p.y));
    const gaps = angles.map((a: number, i: number) => ((angles[(i + 1) % 12] - a) + 2 * Math.PI) % (2 * Math.PI));
    for (const gap of gaps) assert.ok(Math.abs(gap - (2 * Math.PI) / 12) < 1e-9);
  }
});

test('geometry: one concentric ring per channel, OUTERMOST first, all inside the frame', { skip }, () => {
  const w = pureCore();
  const g = w.circleGeometry(16, 3, 460);
  assert.equal(g.ringRadii.length, 3);
  assert.ok(g.ringRadii[0] > g.ringRadii[1] && g.ringRadii[1] > g.ringRadii[2]);
  assert.ok(g.ringRadii[0] + g.targetRadius <= g.size / 2, 'the outer ring fits');
  assert.ok(g.ringRadii[2] - g.targetRadius > 0, 'the inner ring does not collapse');
});

test('geometry: hit targets are >= 24 px across for N <= 16 (up to 4 rings, at the default size) and NEVER overlap, for any N', { skip }, () => {
  const w = pureCore();
  const minGap = (g: any) => {
    let best = Infinity;
    const all = g.points.flat();
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      best = Math.min(best, Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y));
    }
    return best;
  };
  for (const n of [4, 6, 8, 12, 16]) for (const rings of [1, 2, 3, 4]) {
    const g = w.circleGeometry(n, rings, 460);
    assert.ok(g.targetRadius * 2 >= 24, `N=${n} rings=${rings}: target ${g.targetRadius * 2}px`);
    assert.ok(minGap(g) >= g.targetRadius * 2 - 1e-6, `N=${n} rings=${rings}: targets overlap (gap ${minGap(g)})`);
  }
  for (const n of [20, 24, 32]) for (const rings of [1, 4]) {
    const g = w.circleGeometry(n, rings, 460);
    assert.ok(minGap(g) >= g.targetRadius * 2 - 1e-6, `N=${n} rings=${rings}: targets overlap`);
    assert.ok(g.targetRadius > 0);
  }
});

test('geometry: step numbers are shown for small N and hidden when crowded', { skip }, () => {
  const w = pureCore();
  assert.equal(w.circleGeometry(8, 1, 460).labels.visible, true);
  assert.equal(w.circleGeometry(16, 4, 460).labels.visible, true);
  assert.equal(w.circleGeometry(20, 1, 460).labels.visible, false);
  assert.equal(w.circleGeometry(32, 1, 460).labels.visible, false);
});

test('rotate: right moves every hit one step later (wrapping); left is the inverse; velocities and rests survive', { skip }, () => {
  const w = pureCore();
  const pattern = { kick: [112, false, true, 0, 72, false, false, 36], hihat: [true, false, false, false, false, false, false, false] };
  const right = w.rotatePattern(pattern, ['kick', 'hihat'], 8, 1);
  assert.deepEqual(right.kick, [36, 112, false, true, false, 72, false, false]);
  assert.deepEqual(right.hihat, [false, true, false, false, false, false, false, false]);
  const left = w.rotatePattern(right, ['kick', 'hihat'], 8, -1);
  assert.deepEqual(left.kick.map((v: unknown) => w.normalizeCell(v)), pattern.kick.map((v) => w.normalizeCell(v)));
  assert.deepEqual(left.hihat, pattern.hihat);
  assert.equal(pattern.kick[0], 112, 'the input is not mutated');
});

test('rotate: it shifts EVERY shown channel and leaves channels that are not shown untouched', { skip }, () => {
  const w = pureCore();
  const p = w.emptyPattern(8);
  p.kick[0] = true; p.snare[1] = true; p.bell[2] = true;
  const r = w.rotatePattern(p, ['kick', 'snare'], 8, 1);
  assert.equal(r.kick[1], true); assert.equal(r.snare[2], true);
  assert.equal(r.bell[2], true, 'bell is not a row of this note');
  // non-mutating, and the result shares no array with the input (a later in-place toggle on one must not reach the other)
  assert.notEqual(r.bell, p.bell, 'a channel that is not shown is copied, not aliased');
  r.bell[5] = true;
  assert.equal(p.bell[5], false);
  assert.equal(p.kick[0], true);
  assert.equal(p.kick[1], false, 'the input is left as it was');
});

test('rotate: son clave 3-2 rotated by half a bar (8 steps) is 2-3 — either way, and 16 steps is the identity', { skip }, () => {
  const w = pureCore();
  let p = { claves: SON_3_2.slice() };
  assert.deepEqual(hitsOf(p.claves), [0, 3, 6, 10, 12]);
  for (let i = 0; i < 8; i++) p = w.rotatePattern(p, ['claves'], 16, 1);
  assert.deepEqual(hitsOf(p.claves), [2, 4, 8, 11, 14], '2-3: the two-side now comes first');
  let q = { claves: SON_3_2.slice() };
  for (let i = 0; i < 8; i++) q = w.rotatePattern(q, ['claves'], 16, -1);
  assert.deepEqual(hitsOf(q.claves), [2, 4, 8, 11, 14]);
  for (let i = 0; i < 8; i++) p = w.rotatePattern(p, ['claves'], 16, 1);
  assert.deepEqual(hitsOf(p.claves), [0, 3, 6, 10, 12]);
});

test('polygon: the hits of the ring, in step order', { skip }, () => {
  const w = pureCore();
  const g = w.circleGeometry(16, 1, 460);
  const pts = w.polygonPoints(g, 0, SON_3_2);
  assert.equal(pts.length, 5);
  assert.deepEqual(pts, [0, 3, 6, 10, 12].map((i) => g.points[0][i]));
  assert.deepEqual(w.polygonPoints(g, 0, new Array(16).fill(false)), []);
});

test('grids: 4/4 accepts 16 steps (group 4) and 8 steps (group 2 or 4, eighth-note resolution); nothing else', { skip }, () => {
  const w = pureCore();
  assert.deepEqual({ ...w.resolveGrid('4/4', 16, 4) }, { steps: 16, groupSize: 4, stepQl: 0.25 });
  assert.deepEqual({ ...w.resolveGrid('4/4', 8, 2) }, { steps: 8, groupSize: 2, stepQl: 0.5 });
  assert.deepEqual({ ...w.resolveGrid('4/4', 8, 4) }, { steps: 8, groupSize: 4, stepQl: 0.5 });
  for (const [sig, steps, group] of [['4/4', 8, 3], ['4/4', 12, 4], ['4/4', 16, 2], ['3/4', 8, 2], ['12/8', 8, 2], ['9/8', 12, 3]] as const) {
    assert.equal(w.resolveGrid(sig, steps, group), null, `${sig}/${steps}/${group}`);
  }
});

test('grids: every existing signature still resolves exactly as it did (non-vacuity for the new table)', { skip }, () => {
  const w = pureCore();
  for (const [sig, steps, group, ql] of [['3/4', 12, 4, 0.25], ['12/8', 12, 3, 0.5], ['6/8', 6, 3, 0.5], ['5/4', 20, 4, 0.25]] as const) {
    assert.deepEqual({ ...w.resolveGrid(sig, steps, group) }, { steps, groupSize: group, stepQl: ql });
  }
});

test('parseRhythmLoad: an 8-step 4/4 note loads (group 2 and group 4), keeps its own group_size, and a bad grid still names the allowed ones', { skip }, () => {
  const w = pureCore();
  for (const group of [2, 4]) {
    const r = w.parseRhythmLoad(data({ kick: [true, false, false, true, false, false, true, false] }, { steps: 8, group_size: group }));
    assert.equal(r.ok, true, `group ${group}`);
    assert.equal(r.state.steps, 8);
    assert.equal(r.state.groupSize, group, 'the note\'s own group_size is carried, not the menu default');
    assert.equal(r.state.stepQl, 0.5);
  }
  const bad = w.parseRhythmLoad(data({ kick: new Array(12).fill(false) }, { steps: 12, group_size: 4 }));
  assert.equal(bad.ok, false);
  assert.match(bad.message, /4\/4 here means 16 steps in groups of 4 \(or 8 steps in groups of 2 or 4\); this pattern has 12 steps in groups of 4\./);
});

test('buildRhythmData: the grid the note was loaded with is what is written back (an 8-step note stays 8 steps / its group_size)', { skip }, () => {
  const w = pureCore();
  const out = w.buildRhythmData('4/4', 0, 100, { kick: [true, false, false, true, false, false, true, false] }, ['kick'], { steps: 8, groupSize: 4 });
  assert.equal(out.steps, 8);
  assert.equal(out.group_size, 4);
  assert.equal(out.channels.kick.length, 8);
  const dflt = w.buildRhythmData('4/4', 0, 100, { kick: [] }, ['kick']);
  assert.equal(dflt.steps, 16); assert.equal(dflt.group_size, 4);
});

// ======================================================================================================================
// the page
// ======================================================================================================================

test('Grid is the default view; Circle is one click away and Grid comes back', { skip }, async () => {
  const h = await editing();
  assert.equal(h.el('bViewGrid').getAttribute('aria-pressed'), 'true');
  assert.equal(h.el('bViewCircle').getAttribute('aria-pressed'), 'false');
  assert.equal(h.el('circleView').hidden, true);
  assert.equal(h.el('gridView').hidden, false);
  await toCircle(h);
  assert.equal(h.el('circleView').hidden, false);
  assert.equal(h.el('gridView').hidden, true);
  assert.equal(h.el('bViewCircle').getAttribute('aria-pressed'), 'true');
  h.el('bViewGrid').click();
  assert.equal(h.el('circleView').hidden, true);
  assert.equal(h.el('gridView').hidden, false);
});

test('Circle: one ring per channel (outermost = first channel), N dots each, hit = filled, rest = open', { skip }, async () => {
  const h = await editing(ROCK());
  await toCircle(h);
  assert.equal(dots(h).length, 3 * 16);
  const radii = ['kick', 'snare', 'hihat'].map((ch) => {
    const d = dots(h, ch)[0];
    return Math.hypot(Number(d.getAttribute('cx')) - 230, Number(d.getAttribute('cy')) - 230);
  });
  assert.ok(radii[0] > radii[1] && radii[1] > radii[2], `kick outermost: ${JSON.stringify(radii)}`);
  const kick = dots(h, 'kick');
  assert.deepEqual(kick.map((d, i) => (d.classList.contains('hit') ? i : -1)).filter((i) => i >= 0), [0, 8]);
  assert.ok(kick.every((d) => d.classList.contains('hit') !== d.classList.contains('rest')), 'each dot is exactly one of hit / rest');
});

test('Circle: meter grouping shows — larger dots and tick marks at group starts (fours in 4/4, threes in 12/8, fours in 5/4)', { skip }, async () => {
  for (const [ts, steps, group] of [['4/4', 16, 4], ['12/8', 12, 3], ['6/8', 6, 3], ['5/4', 20, 4]] as const) {
    const h = await editing(data({ claves: new Array(steps).fill(false) }, { time_signature: ts, steps, group_size: group }));
    await toCircle(h);
    const starts = dots(h, 'claves').map((d, i) => (d.classList.contains('group-start') ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(starts, Array.from({ length: steps / group }, (_, k) => k * group), ts);
    const ticks = [...h.doc.querySelectorAll('#circle line.tick')];
    assert.equal(ticks.length, steps / group, `${ts}: one tick per group start`);
    const r = (d: any) => Number(d.getAttribute('r'));
    assert.ok(r(dots(h, 'claves')[0]) > r(dots(h, 'claves')[1]), `${ts}: a group start is a slightly larger dot`);
  }
});

test('Circle: step numbers are drawn for 16 steps and hidden for 20', { skip }, async () => {
  const h16 = await editing(ROCK());
  await toCircle(h16);
  assert.equal(h16.doc.querySelectorAll('#circle text.step-label').length, 16);
  const h20 = await editing(data({ claves: new Array(20).fill(false) }, { time_signature: '5/4', steps: 20, group_size: 4 }));
  await toCircle(h20);
  assert.equal(h20.doc.querySelectorAll('#circle text.step-label').length, 0);
});

test('Circle: more than 4 instruments falls back with the inline message and keeps Grid active', { skip }, async () => {
  const five = data({
    kick: new Array(16).fill(false), snare: new Array(16).fill(false), hihat: new Array(16).fill(false),
    bell: new Array(16).fill(false), claves: new Array(16).fill(false),
  });
  const h = await editing(five);
  await toCircle(h);
  assert.equal(h.el('bViewGrid').getAttribute('aria-pressed'), 'true', 'Grid stays active');
  assert.equal(h.el('gridView').hidden, false);
  assert.equal(h.el('circleView').hidden, true);
  assert.equal(h.el('viewMsg').textContent, 'Circle view shows up to 4 instruments; use Grid');
  // and four is fine
  const four = data({ kick: new Array(16).fill(false), snare: new Array(16).fill(false), hihat: new Array(16).fill(false), bell: new Array(16).fill(false) });
  const h4 = await editing(four);
  await toCircle(h4);
  assert.equal(h4.el('bViewCircle').getAttribute('aria-pressed'), 'true');
  // Drain 2026-10-15-2230: exactly four rings is allowed, and now says why the circle's Add-instrument control is disabled (it was silent).
  // This pins the MECHANISM (where the message lives); the property — circle at 4 works, at 5 it falls back — is the two asserts above.
  assert.match(h4.el('viewMsg').textContent ?? '', /4 instruments/);
  assert.notEqual(h4.el('viewMsg').textContent, 'Circle view shows up to 4 instruments; use Grid', 'it is the "limit reached" note, not the fallback');
});

test('Polygon: the selected ring\'s hits, in order; default = the first channel; clicking a ring label selects; "Show shape" toggles', { skip }, async () => {
  const h = await editing(ROCK());
  await toCircle(h);
  const poly = () => h.doc.querySelector('#circle .shape');
  const pointsOf = () => String(poly()?.getAttribute('points') ?? '').trim().split(/\s+/).filter(Boolean);
  assert.equal(h.el('bShape').getAttribute('aria-pressed'), 'true', 'shape defaults on');
  assert.equal(pointsOf().length, 2, 'kick has 2 hits');
  assert.equal(h.doc.querySelector('.ring-pick[data-ring="kick"]')!.getAttribute('aria-pressed'), 'true');
  (h.doc.querySelector('.ring-pick[data-ring="hihat"]') as any).click();
  assert.equal(pointsOf().length, 8, 'hihat has 8 hits');
  assert.equal(h.doc.querySelector('.ring-pick[data-ring="hihat"]')!.getAttribute('aria-pressed'), 'true');
  h.el('bShape').click();
  assert.equal(h.el('bShape').getAttribute('aria-pressed'), 'false');
  assert.equal(poly(), null, 'shape hidden');
  assert.equal(types(h, 'forge-rhythm-save').length, 0, 'picking a ring and the shape toggle are NOT data changes');
});

test('Playhead: while playing, a line sweeps through the current step and that step is highlighted — the same transport as the grid', { skip }, async () => {
  const h = await editing(ROCK());
  fakeAudio(h.win);
  await toCircle(h);
  assert.equal(h.doc.querySelector('#circle #playhead')!.getAttribute('data-step'), '', 'no playhead while stopped');
  h.el('bPlay').click();
  (h.win as any).__ctx.currentTime = 0.3;
  await new Promise((r) => setTimeout(r, 200));
  const step = h.doc.querySelector('#circle #playhead')!.getAttribute('data-step');
  assert.match(String(step), /^\d+$/, 'the playhead names a step');
  const lit = dots(h).filter((d) => d.classList.contains('playing'));
  assert.equal(lit.length, 3, 'the current step is lit on every ring');
  assert.ok(lit.every((d) => d.getAttribute('data-step') === step));
  const gridLit = [...h.doc.querySelectorAll('#grid .step.playing')].map((d: any) => d.getAttribute('data-step'));
  assert.ok(gridLit.every((s) => s === step), 'grid and circle agree on the step (one transport)');
  h.el('bPlay').click();
  assert.equal(h.doc.querySelector('#circle #playhead')!.getAttribute('data-step'), '', 'stopped: the playhead is gone');
});

test('Editing: a dot toggles the hit through commitChange — a save in note-edit mode, the whole note\'s data, view not in it', { skip }, async () => {
  const h = await editing(ROCK());
  await toCircle(h);
  const before = types(h, 'forge-rhythm-save').length;
  (dots(h, 'kick')[4] as any).dispatchEvent(new h.win.MouseEvent('click', { bubbles: true }));
  assert.equal(types(h, 'forge-rhythm-save').length, before + 1);
  const saved = lastSave(h);
  assert.equal(saved.channels.kick[4], true, 'the hit is a PLAIN hit (same rule as the grid)');
  assert.deepEqual(Object.keys(saved).sort(), ['channels', 'group_size', 'steps', 'swing_pct', 'tempo_bpm', 'time_signature'], 'no `view` key — the data format is unchanged');
  assert.ok(dots(h, 'kick')[4].classList.contains('hit'), 'the circle redraws');
  assert.ok(h.cell('kick', 4).classList.contains('on'), 'and the grid is the same data');
  (dots(h, 'kick')[4] as any).dispatchEvent(new h.win.MouseEvent('click', { bubbles: true }));
  assert.equal(lastSave(h).channels.kick[4], false);
});

test('Editing: a click on an accented / velocity cell clears it and never invents a velocity (same toggleCell as the grid)', { skip }, async () => {
  const d = ROCK(); (d.channels.kick as any)[0] = 112;
  const h = await editing(d);
  await toCircle(h);
  (dots(h, 'kick')[0] as any).dispatchEvent(new h.win.MouseEvent('click', { bubbles: true }));
  assert.equal(lastSave(h).channels.kick[0], false);
  (dots(h, 'kick')[0] as any).dispatchEvent(new h.win.MouseEvent('click', { bubbles: true }));
  assert.equal(lastSave(h).channels.kick[0], true);
});

test('Editing in a playground: the same click posts `edited` and NEVER a save', { skip }, async () => {
  const h = await playground(ROCK());
  await toCircle(h);
  (dots(h, 'snare')[2] as any).dispatchEvent(new h.win.MouseEvent('click', { bubbles: true }));
  assert.equal(types(h, 'forge-rhythm-save').length, 0);
  assert.equal(types(h, 'forge-rhythm-edited').length, 1);
  assert.equal(h.el('confirmBar').hidden, true, 'a dot never asks for confirmation');
});

test('Rotate: right / left shift every channel one step (wrapping) through commitChange; no confirm bar', { skip }, async () => {
  const h = await editing(ROCK());
  await toCircle(h);
  h.el('bRotRight').click();
  assert.equal(h.el('confirmBar').hidden, true, 'a rotate is a normal edit, not a whole-pattern question');
  let saved = lastSave(h);
  assert.deepEqual(hitsOf(saved.channels.kick), [1, 9]);
  assert.deepEqual(hitsOf(saved.channels.snare), [5, 13]);
  assert.equal(types(h, 'forge-rhythm-save').length, 1, 'ONE save per rotate — the single data path');
  h.el('bRotLeft').click();
  saved = lastSave(h);
  assert.deepEqual(hitsOf(saved.channels.kick), [0, 8]);
  assert.deepEqual(hitsOf(saved.channels.hihat), [0, 2, 4, 6, 8, 10, 12, 14]);
});

test('Rotate with the clave data: eight steps turns 3-2 into 2-3, and the circle shows it', { skip }, async () => {
  const h = await editing(CLAVE());
  await toCircle(h);
  for (let i = 0; i < 8; i++) h.el('bRotRight').click();
  assert.deepEqual(hitsOf(lastSave(h).channels.claves), [2, 4, 8, 11, 14]);
  const shown = dots(h, 'claves').map((d, i) => (d.classList.contains('hit') ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(shown, [2, 4, 8, 11, 14]);
});

// ---- Rotate by a BEAT (drain 2026-10-15-2100 §3): one GROUP of steps — group_size — per press, through the same commitChange().

const onSteps = (row: unknown[]) => row.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);

test('Rotate by a beat: 16 steps / group 4 — one beat is 4 steps, the son clave 3-2 is a 2-3 after TWO beats', { skip }, async () => {
  const h = await editing(CLAVE());
  await toCircle(h);
  h.el('bBeatRight').click();
  assert.deepEqual(hitsOf(lastSave(h).channels.claves), [0, 4, 7, 10, 14], 'one beat later = four steps later, wrapping');
  assert.equal(types(h, 'forge-rhythm-save').length, 1, 'ONE save per press — the single data path');
  assert.equal(h.el('confirmBar').hidden, true, 'a rotate is a normal edit');
  h.el('bBeatRight').click();
  assert.deepEqual(hitsOf(lastSave(h).channels.claves), [2, 4, 8, 11, 14], '2-3');
  h.el('bBeatLeft').click();
  h.el('bBeatLeft').click();
  h.el('bBeatLeft').click();
  assert.deepEqual(hitsOf(lastSave(h).channels.claves), [2, 6, 8, 12, 15], 'three beats back from 2-3 wraps through the start');
});

test('Rotate by a beat: every grid rotates by ITS group — 12/8 by 3, 5/4 by 4, 8-step 4/4 by its own group_size (2 and 4)', { skip }, async () => {
  const cases: Array<[Record<string, unknown>, number]> = [
    [{ time_signature: '12/8', steps: 12, group_size: 3 }, 3],
    [{ time_signature: '6/8', steps: 6, group_size: 3 }, 3],
    [{ time_signature: '5/4', steps: 20, group_size: 4 }, 4],
    [{ time_signature: '4/4', steps: 8, group_size: 2 }, 2],
    [{ time_signature: '4/4', steps: 8, group_size: 4 }, 4],
  ];
  for (const [over, beat] of cases) {
    const steps = over.steps as number;
    const row = new Array(steps).fill(false); row[0] = true; row[steps - 1] = true;
    const h = await editing(data({ claves: row }, over));
    await toCircle(h);
    h.el('bBeatRight').click();
    assert.deepEqual(hitsOf(lastSave(h).channels.claves), [beat - 1, beat].sort((a, b) => a - b), `${over.time_signature}/${steps}/${over.group_size}: right`);
    h.el('bBeatLeft').click();
    assert.deepEqual(hitsOf(lastSave(h).channels.claves), [0, steps - 1], 'and back');
    h.el('bBeatLeft').click();
    assert.deepEqual(hitsOf(lastSave(h).channels.claves), [steps - beat - 1, steps - beat], `${over.time_signature}: left`);
  }
});

test('Rotate by a beat: shifts EVERY shown channel together, keeps velocities, and the one-step buttons are unchanged', { skip }, async () => {
  const rock = ROCK();
  (rock.channels as Record<string, unknown[]>).snare[4] = 110;
  const h = await editing(rock);
  await toCircle(h);
  h.el('bBeatRight').click();
  const saved = lastSave(h);
  assert.deepEqual(hitsOf(saved.channels.kick), [4, 12]);
  assert.deepEqual(hitsOf(saved.channels.snare), [0, 8]);
  assert.equal(saved.channels.snare[8], 110, 'an accented hit keeps its velocity');
  h.el('bRotRight').click();
  assert.deepEqual(hitsOf(lastSave(h).channels.kick), [5, 13], 'the one-step button still moves ONE step');
});

test('Rotate by a beat in a playground is local: `edited`, never a save', { skip }, async () => {
  const h = await playground(CLAVE());
  await toCircle(h);
  h.el('bBeatRight').click();
  assert.equal(types(h, 'forge-rhythm-save').length, 0);
  assert.equal(types(h, 'forge-rhythm-edited').length, 1);
  assert.deepEqual(onSteps(dots(h, 'claves').map((d) => d.classList.contains('hit'))), [0, 4, 7, 10, 14]);
});

test('Rotate by a beat: real, labelled buttons in the tab order, in circle mode only (hidden with the grid)', { skip }, async () => {
  const h = await editing(CLAVE());
  assert.equal(h.el('circleView').hidden, true, 'grid is the default; the beat buttons live in the circle toolbar');
  await toCircle(h);
  for (const [id, label] of [['bBeatLeft', /left.*beat/i], ['bBeatRight', /right.*beat/i]] as const) {
    const el = h.el(id);
    assert.equal(el.tagName, 'BUTTON', id);
    assert.equal(el.disabled, false);
    assert.ok(el.tabIndex >= 0);
    assert.match(`${el.textContent} ${el.getAttribute('aria-label') ?? ''} ${el.title}`, label, id);
  }
});

test('Rotate by a beat is source-pinned to the one data path and to the grid\'s own group', { skip }, () => {
  assert.match(widgetScript, /function rotate\(by\)[\s\S]*?commitChange\(\)/);
  assert.match(widgetScript, /\$\("bBeatRight"\)\.addEventListener\("click", function \(\) \{ rotate\(groupSize\); \}\)/);
  assert.match(widgetScript, /\$\("bBeatLeft"\)\.addEventListener\("click", function \(\) \{ rotate\(-groupSize\); \}\)/);
});

test('Rotate in a playground is local: `edited`, never a save; Reset puts the loaded data back', { skip }, async () => {
  const h = await playground(CLAVE());
  await toCircle(h);
  h.el('bRotRight').click();
  assert.equal(types(h, 'forge-rhythm-save').length, 0);
  assert.equal(types(h, 'forge-rhythm-edited').length, 1);
  assert.deepEqual(dots(h, 'claves').map((d, i) => (d.classList.contains('hit') ? i : -1)).filter((i) => i >= 0), [1, 4, 7, 11, 13]);
  h.el('bReset').click();
  assert.deepEqual(dots(h, 'claves').map((d, i) => (d.classList.contains('hit') ? i : -1)).filter((i) => i >= 0), [0, 3, 6, 10, 12]);
});

test('The view lives in widget state only: the load message may SET the first view, a later reload does not undo the student\'s choice', { skip }, async () => {
  const h = await playground(CLAVE(), 'circle');
  assert.equal(h.el('bViewCircle').getAttribute('aria-pressed'), 'true', 'view: circle on the first load');
  h.el('bViewGrid').click();
  await h.send(load(CLAVE(), 'rhythm_pattern_test', 'playground', 'circle'));   // the host reloads (Reset / note changed)
  assert.equal(h.el('bViewGrid').getAttribute('aria-pressed'), 'true', 'the student\'s choice stands');
  assert.equal(types(h, 'forge-rhythm-save').length, 0);
});

test('A load with an unknown view value is Grid (only the exact strings "circle" / "grid" are honoured)', { skip }, async () => {
  for (const v of ['Circle', 'circle ', 'ring', '', 7]) {
    const h = await loadWidget(true);
    await h.send({ ...load(CLAVE(), 'n', 'playground'), view: v });
    assert.equal(h.el('bViewGrid').getAttribute('aria-pressed'), 'true', JSON.stringify(v));
  }
});

test('Keyboard: the view switch and the rotate buttons are real buttons in the tab order', { skip }, async () => {
  const h = await editing(CLAVE());
  await toCircle(h);
  for (const id of ['bViewGrid', 'bViewCircle', 'bRotLeft', 'bRotRight', 'bShape']) {
    const el = h.el(id);
    assert.equal(el.tagName, 'BUTTON', id);
    assert.equal(el.disabled, false, id);
    assert.ok(el.tabIndex >= 0, `${id} is focusable`);
  }
});

test('Circle works at ~460 px: the SVG scales to its container instead of overflowing', { skip }, async () => {
  const h = await editing(ROCK());
  await toCircle(h);
  const svg = h.doc.querySelector('#circle')!;
  // Drain 2026-10-15-2230: the circle is sized by its ring count (circleSizeFor), no longer a fixed 460 square; in a pane narrower than
  // that, CSS (max-width: 100%) scales it down exactly as before — the property this test is about.
  const w = pureCore();
  assert.equal(svg.getAttribute('viewBox'), `0 0 ${w.circleSizeFor(16, 3)} ${w.circleSizeFor(16, 3)}`);
  assert.ok(w.circleSizeFor(16, 3) <= 460);
  assert.match(widgetHtml, /svg\.circle-svg \{[^}]*max-width: 100%/);
  assert.match(String(svg.getAttribute('class') ?? ''), /circle-svg/);
});

test('8-step 4/4: the widget loads it, shows eight cells, offers it in the meter menu, and a load -> save with no edit is byte-identical', { skip }, async () => {
  const d = data({ kick: [true, false, false, true, false, false, true, false] }, { steps: 8, group_size: 4 });
  const h = await editing(d);
  assert.equal(h.el('loadMsg').textContent, '');
  assert.equal(h.doc.querySelectorAll('#grid .step[data-channel="kick"]').length, 8);
  assert.equal(h.el('timeSig').value, '4/4@8');
  assert.ok([...h.el('timeSig').options].some((o: any) => o.value === '4/4@8' && /eighth/i.test(o.textContent)), 'the menu names the eighth-note option');
  h.cell('kick', 1).click();
  h.cell('kick', 1).click();
  const saved = lastSave(h);
  assert.deepEqual(saved, d, 'toggle twice -> exactly the loaded data (group_size 4 kept, steps 8)');
});

test('8-step 4/4: switching to it from 16 steps is a whole-pattern change — it asks first in a note, and clears', { skip }, async () => {
  const h = await editing(ROCK());
  h.el('timeSig').value = '4/4@8';
  h.el('timeSig').dispatchEvent(new h.win.Event('change', { bubbles: true }));
  assert.equal(h.el('confirmBar').hidden, false, 'a lossy resolution change asks (the existing Random/Clear/time-signature bar)');
  assert.equal(h.el('timeSig').value, '4/4', 'the menu keeps showing what is still in force');
  assert.equal(types(h, 'forge-rhythm-save').length, 0);
  h.el('confirmOk').click();
  const saved = lastSave(h);
  assert.equal(saved.steps, 8);
  assert.equal(saved.time_signature, '4/4');
  assert.equal(saved.group_size, 2, 'a menu-created eighth grid groups in twos (one beat = two eighths)');
  assert.equal(saved.channels.kick.length, 8);
});

test('8-step 4/4 plays at eighth-note speed: a step lasts 0.25 s at 120 BPM', { skip }, async () => {
  const h = await loadWidget(true);
  const log = fakeAudio(h.win);
  await h.send(load(data({ claves: new Array(8).fill(true) }, { steps: 8, group_size: 2, tempo_bpm: 120 }), 'n', 'playground'));
  h.el('bPlay').click();
  (h.win as any).__ctx.currentTime = 0.4;
  await new Promise((r) => setTimeout(r, 90));
  h.el('bPlay').click();
  const times = [...new Set(log.filter((l: any) => l.kind === 'osc').map((l: any) => Math.round((l.t ?? 0) * 1000) / 1000))].sort((a: any, b: any) => a - b) as number[];
  assert.ok(times.length >= 2);
  assert.equal(Math.round((times[1] - times[0]) * 1000) / 1000, 0.25);
});

test('the circle is source-pinned to the single data path: no postMessage of its own, edits end in commitChange()', { skip }, () => {
  assert.match(widgetScript, /function rotate\(by\)[\s\S]*?commitChange\(\)/);
  assert.match(widgetScript, /function toggleStep\(ch, s\)[\s\S]*?commitChange\(\)/);
  const circleRegion = /function renderCircle\([\s\S]*?\n  \}\n/.exec(widgetScript)?.[0] ?? '';
  assert.ok(circleRegion.length > 100, 'renderCircle exists');
  assert.ok(!/postToHost|postMessage/.test(circleRegion), 'drawing never talks to the host');
});
