// 2026-11-19-0993 (THE LIST MODEL, stage 3: BARS) - the PURE half of a bar's list: replay (lines -> the bar's data, byte for byte), the diff (what a Beat Box message says in sentences), the plan of an append (cell replacement, in-place settings, the redundant
// line left out), the gesture merge, the undo stack that never takes a head. Written RED first (the modules did not exist). The widget's own functions (toggle, transforms, move ring, grid change) are the ORACLE for what a gesture does to a bar: a property
// test runs random gestures through them and demands, after EVERY one, that the replay of the list equals the bar the widget now holds (11d.4: "the replay result must equal the grid").
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { BAR_BASE, baselineList, barUndoStack, diffBarData, mergeGestureSentences, planBarAppend, replayBar } from './bar-list-core.ts';
import { applyBarLine, headSentence, parseBarSentence } from './bar-grammar-core.ts';
import { RHYTHM_STARTER } from './new-note-core.ts';
import { extractJsonBlock, formatRhythmJson, readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';
import { stopNotice } from './sentence-list-core.ts';
import { PLAYGROUND_BARS, SANDBOX_BARS } from './test-support/bar-list-fixtures.ts';
import { WIDGET_FILE } from './test-support/rhythm-widget-harness.ts';

const row = (...on: number[]) => Array.from({ length: 16 }, (_, i) => on.includes(i));
const BAR: RhythmData = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 118, channels: { kick: row(0, 8), snare: row(4, 12), hihat: row() } };
const HEAD = headSentence(BAR)!;
const json = (d: RhythmData): string => formatRhythmJson(d);
const plan = (list: string[], ...typed: string[]) => planBarAppend(list, typed);
const okPlan = (list: string[], ...typed: string[]) => { const p = plan(list, ...typed); assert.equal(p.ok, true, JSON.stringify(p)); return p as Extract<ReturnType<typeof planBarAppend>, { ok: true }>; };

// ---- replay ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('an EMPTY list replays to the bar "New bar" writes today (the starter groove), and BAR_BASE is that bar', () => {
  const r = replayBar([]);
  assert.deepEqual(r.data, RHYTHM_STARTER);
  assert.deepEqual(BAR_BASE, RHYTHM_STARTER);
  assert.equal(r.applied, 0); assert.equal(r.stop, null); assert.deepEqual(r.list, []);
  assert.notEqual(r.data, RHYTHM_STARTER, 'a copy: replaying never hands out the constant itself');
});

test('lines are applied in order on the bar before them; a head replaces everything; the list comes back as it went in', () => {
  const list = [HEAD, 'Hit hihat on steps 1, 3, 5 and 7.', 'Clear kick on step 1.', 'Set the tempo to 100.', 'Set the swing to 25 percent.', 'Add the channel bell.'];
  const r = replayBar(list);
  assert.equal(r.stop, null); assert.equal(r.applied, 6); assert.deepEqual(r.list, list);
  assert.deepEqual(r.data.channels.hihat, row(0, 2, 4, 6)); assert.deepEqual(r.data.channels.kick, row(8));
  assert.equal(r.data.tempo_bpm, 100); assert.equal(r.data.swing_pct, 25); assert.deepEqual(Object.keys(r.data.channels), ['kick', 'snare', 'hihat', 'bell']);
  const again = replayBar([...list, 'Start with 8 steps in 4/4 at 90 beats per minute: snare on step 3.']);
  assert.deepEqual(again.data, { time_signature: '4/4', steps: 8, group_size: 2, swing_pct: 0, tempo_bpm: 90, channels: { snare: [false, false, true, false, false, false, false, false] } });
  assert.deepEqual(replayBar(['Hit kick on step 2.']).data.channels.kick, RHYTHM_STARTER.channels.kick.map((v, i) => (i === 1 ? true : v)), 'no head: lines apply to the new-bar groove');
});

test('an unreadable line is KEPT, the replay stops before it, and it is named in plain words (11a.4); a line that cannot be applied stops it the same way', () => {
  const list = [HEAD, 'Hit hihat on step 3.', 'this is not a sentence', 'Hit hihat on step 5.'];
  const r = replayBar(list);
  assert.equal(r.applied, 2); assert.deepEqual(r.list, list);
  assert.equal(r.stop?.index, 2); assert.equal(r.stop?.reason, 'unreadable'); assert.equal(r.stop?.line, 3);
  assert.deepEqual(r.data.channels.hihat, row(2), 'the note shows lines 1 and 2');
  assert.match(stopNotice(r.stop!, r.applied), /^Line 3 is not a sentence I can read; the note shows lines 1 and 2\./);
  const refused = replayBar([HEAD, 'Hit cowbell on step 1.']);
  assert.equal(refused.applied, 1); assert.equal(refused.stop?.index, 1);
  const outside = replayBar([HEAD, 'Hit kick on step 17.']);
  assert.equal(outside.applied, 1); assert.match(outside.stop!.message, /beyond/);
  assert.equal(replayBar(['x']).applied, 0);
});

test('replay never throws, whatever the list is made of', () => {
  let x = 7; const rnd = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  const pieces = [HEAD, 'Hit kick on step 1.', 'Clear kick.', 'Mirror every channel.', 'Use 8 steps in 4/4.', 'Remove the channel kick.', 'Remove the channel snare.', 'Remove the channel hihat.', '', ' ', 'Hit', '😀', 'Set the tempo to', 'Add the channel kick.'];
  for (let k = 0; k < 300; k++) {
    const list = Array.from({ length: Math.floor(rnd() * 8) }, () => pieces[Math.floor(rnd() * pieces.length)]);
    const r = replayBar(list);
    assert.ok(r.applied <= list.length); assert.deepEqual(r.list, list);
    assert.equal(r.data.steps, r.data.channels[Object.keys(r.data.channels)[0]].length, 'the data is always a whole bar');
  }
  assert.equal(replayBar(null as never).applied, 0);
  assert.equal(replayBar([null, 5, undefined] as never).applied, 0);
});

// ---- the golden: every bar there is -------------------------------------------------------------------------------------------------------------------------------------------------------------------

function bundledNotes(): Array<{ id: string; text: string }> {
  const root = path.join(process.cwd(), 'assets', 'vaults');
  assert.ok(fs.existsSync(root), `${root} must exist: this golden test never skips`);
  const out: Array<{ id: string; text: string }> = [];
  const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.md')) { const t = fs.readFileSync(p, 'utf8'); if (/^content_type: json$/m.test(t)) out.push({ id: path.relative(root, p), text: t }); } } };
  walk(root);
  return out;
}
const corpus = (): Array<{ id: string; text: string }> => [
  ...Object.entries(PLAYGROUND_BARS).map(([k, t]) => ({ id: `music-playground/bars/${k}`, text: t })),
  ...Object.entries(SANDBOX_BARS).map(([k, t]) => ({ id: `music-sandbox/bars/${k}`, text: t })),
  ...bundledNotes().filter((n) => readRhythmNote(n.text).ok).map((n) => ({ id: `bundled/${n.id}`, text: n.text })),
];

test('GOLDEN: the replay of the head of EVERY bar and rhythm note there is (playground, sandbox, the bundled vaults) is the stored json, byte for byte', () => {
  const all = corpus();
  assert.equal(Object.keys(PLAYGROUND_BARS).length, 8); assert.equal(Object.keys(SANDBOX_BARS).length, 8);
  assert.deepEqual(PLAYGROUND_BARS, SANDBOX_BARS, 'the two dev vaults hold the same eight bars today');
  assert.ok(all.filter((n) => n.id.startsWith('bundled/')).length >= 8, 'the bundled vaults\' rhythm notes were found');
  const seen = { velocities: false, three: false, five: false, twelveEight: false, many: false };
  for (const { id, text } of all) {
    const note = readRhythmNote(text); assert.equal(note.ok, true, id);
    const data = (note as Extract<typeof note, { ok: true }>).value.data;
    const head = headSentence(data); assert.ok(head, `${id} has a head`);
    const r = replayBar([head!]);
    assert.equal(r.stop, null, id);
    const block = extractJsonBlock(text) as Extract<ReturnType<typeof extractJsonBlock>, { ok: true }>;
    assert.equal(json(r.data), text.slice(block.contentStart, block.contentEnd).replace(/\r\n/g, '\n'), `${id}: the replay is the stored json, byte for byte`);
    assert.deepEqual(Object.keys(r.data.channels), Object.keys(data.channels), `${id}: channel order is data`);
    if (Object.values(data.channels).some((rw) => rw.some((v) => typeof v === 'number'))) seen.velocities = true;
    if (data.time_signature === '3/4') seen.three = true; if (data.time_signature === '5/4') seen.five = true; if (data.time_signature === '12/8') seen.twelveEight = true;
    if (Object.keys(data.channels).length >= 4) seen.many = true;
  }
  assert.deepEqual(seen, { velocities: true, three: true, five: true, twelveEight: true, many: true }, 'the corpus covers velocities, 3/4, 5/4, 12/8 and four channels');
});

test('GOLDEN: the FIRST write of an existing bar synthesizes the head, then appends: the result is the bar with just that cell changed (every bar, every first cell)', () => {
  for (const { id, text } of corpus()) {
    const data = (readRhythmNote(text) as { value: { data: RhythmData } }).value.data;
    const ch = Object.keys(data.channels)[0];
    const toggled = JSON.parse(JSON.stringify(data)) as RhythmData;
    toggled.channels[ch][1] = toggled.channels[ch][1] === false ? true : false;
    const base = baselineList(data); assert.ok(base, id);
    const sentences = diffBarData(data, toggled); assert.equal(sentences.length, 1, id);
    const p = plan(base!, ...sentences) as Extract<ReturnType<typeof planBarAppend>, { ok: true }>;
    assert.equal(p.ok, true, id);
    assert.equal(p.list.length, 2, `${id}: the head and the one line`);
    assert.equal(json(p.replay.data), json(toggled), id);
  }
});

// ---- the diff: a Beat Box message in sentences ----------------------------------------------------------------------------------------------------------------------------------------------------

test('what each widget gesture says: one sentence, the words of 11d.3', () => {
  const d = BAR;
  const set = (f: (x: RhythmData) => void): RhythmData => { const c = JSON.parse(JSON.stringify(d)) as RhythmData; f(c); return c; };
  assert.deepEqual(diffBarData(d, set((c) => { c.channels.kick[2] = true; })), ['Hit kick on step 3.']);
  assert.deepEqual(diffBarData(d, set((c) => { c.channels.kick[0] = false; })), ['Clear kick on step 1.']);
  assert.deepEqual(diffBarData(d, set((c) => { c.tempo_bpm = 119; })), ['Set the tempo to 119.']);
  assert.deepEqual(diffBarData(d, set((c) => { c.swing_pct = 20; })), ['Set the swing to 20 percent.']);
  assert.deepEqual(diffBarData(d, set((c) => { c.channels.bell = row(); })), ['Add the channel bell.']);
  assert.deepEqual(diffBarData(d, set((c) => { delete c.channels.hihat; })), ['Remove the channel hihat.']);
  assert.deepEqual(diffBarData(d, set((c) => { c.channels = { snare: c.channels.snare, kick: c.channels.kick, hihat: c.channels.hihat }; })), ['Move the snare channel one place earlier.']);
  assert.deepEqual(diffBarData(d, set((c) => { c.time_signature = '3/4'; c.steps = 12; c.group_size = 4; for (const k of Object.keys(c.channels)) c.channels[k] = new Array(12).fill(false); })), ['Use 12 steps in 3/4.']);
  assert.deepEqual(diffBarData(d, set((c) => { c.steps = 8; c.group_size = 2; for (const k of Object.keys(c.channels)) c.channels[k] = new Array(8).fill(false); })), ['Use 8 steps in 4/4.']);
  assert.deepEqual(diffBarData(d, set((c) => { c.channels.kick = [...c.channels.kick.slice(1), c.channels.kick[0]]; c.channels.snare = [...c.channels.snare.slice(1), c.channels.snare[0]]; })), ['Shift every channel one step to the left.']);
  const lopsided = set((c) => { c.channels.kick = row(0, 1, 8); });            // a mirror of the symmetric default bar is also a shift: the oracle uses a bar where only one of them fits
  assert.deepEqual(diffBarData(lopsided, ((): RhythmData => { const c = JSON.parse(JSON.stringify(lopsided)) as RhythmData; for (const k of Object.keys(c.channels)) c.channels[k] = [...c.channels[k]].reverse(); return c; })()), ['Mirror every channel.']);
  assert.deepEqual(diffBarData(d, set((c) => { c.channels.snare = [c.channels.snare[15], ...c.channels.snare.slice(0, 15)]; })), ['Rotate the snare channel one step to the right.']);
  assert.deepEqual(diffBarData(d, d), []);
  assert.deepEqual(diffBarData(d, set((c) => { c.channels.kick[3] = 80; })), ['Hit kick on step 4 at velocity 80.']);
  assert.deepEqual(diffBarData(d, set((c) => { c.channels.kick[1] = 0 as never; })), [], 'a rest written 0 is a rest: the widget reads it so');
});

test('a message that says two things, or something no sentence says, is said as a new head (the replay still equals the bar)', () => {
  const after: RhythmData = { ...BAR, tempo_bpm: 99, channels: { ...BAR.channels, kick: row(1, 2, 3, 4, 5) } };
  const s = diffBarData(BAR, after);
  assert.ok(s.length >= 1);
  const r = replayBar([HEAD, ...s]); assert.equal(json(r.data), json(after));
  const odd: RhythmData = { ...BAR, tempo_bpm: 300 };                           // a tempo the Beat Box does not play: no "Set the tempo" sentence says it, a head does
  const s2 = diffBarData(BAR, odd); assert.equal(s2.length, 1); assert.match(s2[0], /^Start with .* at 300 beats per minute/);
  assert.equal(json(replayBar([HEAD, ...s2]).data), json(odd));
  const grid: RhythmData = { ...BAR, time_signature: '5/4', steps: 20, channels: { kick: new Array(20).fill(true) } };
  const s3 = diffBarData(BAR, grid); assert.equal(json(replayBar([HEAD, ...s3]).data), json(grid), 'a grid and a row at once is said in a few sentences, and it replays');
});

// ---- the widget as the oracle: random gestures, and the replay equals the grid after every one ---------------------------------------------------------------------------------------------------

function widget(): any {
  assert.ok(WIDGET_FILE, 'rhythm_box.html must be found (sibling or bundled vault): this test never skips');
  const script = (/<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync(WIDGET_FILE!, 'utf-8')) ?? [])[1];
  const mod: { exports: any } = { exports: {} };
  new Function('module', script)(mod);
  return mod.exports;
}
function rng(seed: number) { let x = seed >>> 0 || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }

/** One random gesture, done the way the widget does it (its own functions), on a copy of the bar. */
function gesture(w: any, d: RhythmData, rnd: () => number): RhythmData {
  const c = JSON.parse(JSON.stringify(d)) as RhythmData;
  const rows = Object.keys(c.channels);
  const pick = Math.floor(rnd() * 100);
  const ch = rows[Math.floor(rnd() * rows.length)];
  if (pick < 50) { const s = Math.floor(rnd() * c.steps); c.channels[ch][s] = w.toggleCell(c.channels[ch][s]); return c; }
  if (pick < 58) { c.tempo_bpm = w.clampBpm(c.tempo_bpm + (rnd() < 0.5 ? -1 : 1)); return c; }
  if (pick < 64) { c.swing_pct = Math.floor(rnd() * 101); return c; }
  if (pick < 76) { const id = ['shiftLeft', 'shiftRight', 'mirror', 'rotateCcw', 'rotateCw'][Math.floor(rnd() * 5)]; c.channels = JSON.parse(JSON.stringify(w.applyTransform(id, c.channels, rows, c.steps, ch))); return c; }
  if (pick < 82) { const next = w.moveRing(rows, ch, rnd() < 0.5 ? -1 : 1) as string[]; c.channels = Object.fromEntries(next.map((k) => [k, c.channels[k]])); return c; }
  if (pick < 90) { const free = (w.CHANNELS as string[]).filter((k) => !rows.includes(k)); if (free.length > 0) c.channels[free[Math.floor(rnd() * free.length)]] = new Array(c.steps).fill(false); return c; }
  if (pick < 95) { if (rows.length > 1) delete c.channels[ch]; return c; }
  const keys = Object.keys(w.MENU_GRIDS); const g = w.MENU_GRIDS[keys[Math.floor(rnd() * keys.length)]];
  c.time_signature = g.timeSig; c.steps = g.steps; c.group_size = g.groupSize;
  for (const k of Object.keys(c.channels)) c.channels[k] = new Array(g.steps).fill(false);
  return c;
}

test('PROPERTY (the widget is the oracle): after EVERY random gesture the replay of the list equals the bar the widget holds; the list stays small; undo walks back through every state', () => {
  const w = widget();
  for (let seed = 1; seed <= 60; seed++) {
    const rnd = rng(seed * 7919);
    let widgetBar: RhythmData = JSON.parse(JSON.stringify(seed % 2 === 0 ? BAR : RHYTHM_STARTER));
    let list: string[] = seed % 3 === 0 ? [] : baselineList(widgetBar)!;
    if (seed % 3 === 0) widgetBar = JSON.parse(JSON.stringify(RHYTHM_STARTER));
    const stack = barUndoStack(); const states: Array<{ list: string[]; bar: RhythmData }> = [{ list: [...list], bar: JSON.parse(JSON.stringify(widgetBar)) }];
    let gestures = 0;
    for (let k = 0; k < 40; k++) {
      const next = gesture(w, widgetBar, rnd);
      const sentences = diffBarData(widgetBar, next);
      if (sentences.length === 0) continue;
      const p = planBarAppend(list, sentences);
      assert.equal(p.ok, true, `seed ${seed} gesture ${k}: ${sentences.join(' | ')} -> ${JSON.stringify(p)}`);
      const pp = p as Extract<typeof p, { ok: true }>;
      assert.equal(json(pp.replay.data), json(next), `seed ${seed} gesture ${k}: ${sentences.join(' ')}`);
      assert.equal(pp.replay.stop, null);
      stack.push({ before: list, after: pp.list, added: pp.added, replaced: pp.replaced });
      list = pp.list; widgetBar = next; gestures++;
      states.push({ list: [...list], bar: JSON.parse(JSON.stringify(widgetBar)) });
    }
    assert.ok(list.length <= gestures + 1, `seed ${seed}: the list never grows by more than one line a gesture (${list.length} lines, ${gestures} gestures)`);
    for (let i = states.length - 2; i >= 0; i--) {                                    // undo, all the way back: each step is the state before the gesture
      const r = stack.undo(list); assert.ok(r, `undo ${i}`);
      list = r!.list;
      assert.deepEqual(list, states[i].list, `seed ${seed} undo to state ${i}`);
      assert.equal(json(replayBar(list).data), json(states[i].bar), `seed ${seed} undo ${i}: the bar`);
    }
  }
});

// ---- the plan of an append ----------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('a gesture adds one line; the head is never edited', () => {
  const p = okPlan([HEAD], 'Hit kick on step 3.');
  assert.deepEqual(p.list, [HEAD, 'Hit kick on step 3.']); assert.deepEqual(p.added, ['Hit kick on step 3.']); assert.deepEqual(p.replaced, []); assert.equal(p.unchanged, false);
  const q = okPlan(p.list, 'Clear kick on step 1.');
  assert.deepEqual(q.list, [HEAD, 'Hit kick on step 3.', 'Clear kick on step 1.'], 'a cell the head set: the Clear is a line (the head stays as the bar was)');
  assert.deepEqual(q.replay.data.channels.kick, row(8, 2));
});

test('a line that touches a cell an earlier line set REPLACES that cell\'s mention: the step leaves the earlier line, an emptied line is dropped, a redundant line is not added (11d.4)', () => {
  const hit3 = okPlan([HEAD], 'Hit kick on step 3.').list;
  const clear3 = okPlan(hit3, 'Clear kick on step 3.');
  assert.deepEqual(clear3.list, [HEAD], 'hit then clear the same cell: both lines are gone');
  assert.deepEqual(clear3.added, []); assert.deepEqual(clear3.replaced, [{ index: 1, sentence: 'Hit kick on step 3.' }]); assert.equal(clear3.unchanged, false);
  const withClear = okPlan([HEAD], 'Clear kick on step 1.').list;
  assert.deepEqual(okPlan(withClear, 'Hit kick on step 1.').list, [HEAD], 'clear then hit the head\'s own cell: back to the head');
  const two = okPlan([HEAD, 'Hit kick on steps 3 and 4.'], 'Hit kick on steps 2 and 3.');
  assert.deepEqual(two.list, [HEAD, 'Hit kick on step 4.', 'Hit kick on steps 2 and 3.'], 'step 3 leaves the earlier line (it is said once, in the new one)');
  assert.deepEqual(two.replaced, [{ index: 1, sentence: 'Hit kick on steps 3 and 4.' }]);
  const vel = okPlan([HEAD, 'Hit hihat on step 2 at velocity 80.'], 'Hit hihat on step 2 at velocity 100.');
  assert.deepEqual(vel.list, [HEAD, 'Hit hihat on step 2 at velocity 100.']);
  const other = okPlan([HEAD, 'Hit hihat on step 2.'], 'Hit snare on step 2.');
  assert.deepEqual(other.list, [HEAD, 'Hit hihat on step 2.', 'Hit snare on step 2.'], 'another channel is another cell');
});

test('tempo and swing replace the earlier line IN PLACE; a grid line replaces in place only when that gives the same bar', () => {
  const t = okPlan([HEAD, 'Set the tempo to 100.', 'Hit kick on step 3.'], 'Set the tempo to 120.');
  assert.deepEqual(t.list, [HEAD, 'Set the tempo to 120.', 'Hit kick on step 3.']); assert.deepEqual(t.replaced, [{ index: 1, sentence: 'Set the tempo to 100.' }]); assert.deepEqual(t.added, ['Set the tempo to 120.']);
  const s = okPlan([HEAD, 'Set the swing to 10 percent.', 'Hit kick on step 3.'], 'Set the swing to 30 percent.');
  assert.deepEqual(s.list, [HEAD, 'Set the swing to 30 percent.', 'Hit kick on step 3.']);
  assert.deepEqual(okPlan([HEAD], 'Set the tempo to 120.').list, [HEAD, 'Set the tempo to 120.'], 'no earlier line: a new one');
  const g = okPlan([HEAD, 'Hit kick on step 3.', 'Use 8 steps in 4/4.'], 'Use 12 steps in 3/4.');
  assert.deepEqual(g.list, [HEAD, 'Hit kick on step 3.', 'Use 12 steps in 3/4.']);
  const g2 = okPlan([HEAD, 'Use 8 steps in 4/4.', 'Hit kick on step 3.'], 'Use 12 steps in 3/4.');
  assert.deepEqual(g2.list, [HEAD, 'Use 8 steps in 4/4.', 'Hit kick on step 3.', 'Use 12 steps in 3/4.'], 'the hit in between would survive an in-place replace: appended instead');
  assert.equal(json(g2.replay.data), json(replayBar(g2.list).data));
});

test('compaction is only ever taken when it replays to the same bar (a transform in between is a barrier)', () => {
  const list = [HEAD, 'Hit kick on step 14.', 'Mirror every channel.'];
  const p = okPlan(list, 'Hit kick on step 14.');
  assert.equal(json(p.replay.data), json(replayBar([...list, 'Hit kick on step 14.']).data), 'the bar is what appending the line gives');
  assert.deepEqual(p.list, [...list, 'Hit kick on step 14.']);
});

test('the same sentence twice changes nothing: "unchanged", the list is returned as it was', () => {
  const l = okPlan([HEAD], 'Hit kick on step 3.').list;
  const again = okPlan(l, 'Hit kick on step 3.');
  assert.equal(again.unchanged, true); assert.deepEqual(again.list, l);
  const same = okPlan([HEAD], 'Set the tempo to 118.');
  assert.equal(same.unchanged, true); assert.deepEqual(same.list, [HEAD]);
  assert.equal(okPlan([HEAD], 'Hit kick on step 1.').unchanged, true, 'a cell that is already hit');
});

test('typed text: several sentences are several lines; a typed sentence that cannot be read or applied is refused in words, nothing is half-added', () => {
  const p = okPlan([HEAD], 'Hit kick on step 3.', 'Hit snare on step 7.', 'Set the tempo to 100.');
  assert.deepEqual(p.added, ['Hit kick on step 3.', 'Hit snare on step 7.', 'Set the tempo to 100.']);
  const a = plan([HEAD], 'Hit kick on step 3.', 'Hit kick on steps');
  assert.equal(a.ok, false); assert.equal((a as { reason: string }).reason, 'unreadable'); assert.equal((a as { line: number }).line, 2);
  const b = plan([HEAD], 'Hit kick on step 3.', 'Hit cowbell on step 1.');
  assert.equal(b.ok, false); assert.equal((b as { reason: string }).reason, 'unreadable');
  const c = plan([HEAD], 'Hit kick on step 3.', 'Clear conga_low on step 1.');
  assert.equal(c.ok, false); assert.equal((c as { reason: string }).reason, 'refused'); assert.match((c as { message: string }).message, /no conga_low channel/);
  const e = plan([HEAD]);
  assert.equal(e.ok, false); assert.equal((e as { reason: string }).reason, 'empty');
});

test('a list with a line nobody can read blocks a typed sentence (fix or undo that line first), in the words of 11a.4', () => {
  const p = plan([HEAD, 'nonsense here'], 'Hit kick on step 3.');
  assert.equal(p.ok, false); assert.equal((p as { reason: string }).reason, 'blocked'); assert.match((p as { message: string }).message, /^Line 2 is not a sentence I can read; the note shows line 1\./);
});

test('"Use 16 steps." typed: said in full with the signature of the moment; a typed head replaces the whole bar', () => {
  const p = okPlan([HEAD], 'Use 8 steps.');
  assert.deepEqual(p.added, ['Use 8 steps in 4/4.']);
  const h = okPlan([HEAD], 'start with 8 steps in 4/4 at 90 beats per minute: snare on step 3');
  assert.equal(h.replay.data.steps, 8); assert.equal(h.list.length, 2);
});

// ---- gestures: a press, a drag across cells, a release is ONE line ------------------------------------------------------------------------------------------------------------------------------

test('a drag across 8 cells is ONE line: the gesture\'s cell sentences merge (same channel, hit or clear, a velocity); the last word on a cell wins', () => {
  const eight = Array.from({ length: 8 }, (_, i) => `Hit kick on step ${i + 1}.`);
  assert.deepEqual(mergeGestureSentences(eight), ['Hit kick on steps 1, 2, 3, 4, 5, 6, 7 and 8.']);
  assert.deepEqual(mergeGestureSentences(['Hit kick on step 1.', 'Hit snare on step 2.', 'Hit kick on step 3.']), ['Hit kick on steps 1 and 3.', 'Hit snare on step 2.']);
  assert.deepEqual(mergeGestureSentences(['Hit kick on step 1.', 'Clear kick on step 1.']), ['Clear kick on step 1.']);
  assert.deepEqual(mergeGestureSentences(['Clear kick on step 1.', 'Clear kick on step 2.']), ['Clear kick on steps 1 and 2.']);
  assert.deepEqual(mergeGestureSentences(['Hit kick on step 1 at velocity 80.', 'Hit kick on step 2 at velocity 80.', 'Hit kick on step 3.']), ['Hit kick on step 3.', 'Hit kick on steps 1 and 2 at velocity 80.']);
  assert.deepEqual(mergeGestureSentences(['Set the tempo to 100.', 'Hit kick on step 1.']), ['Set the tempo to 100.', 'Hit kick on step 1.'], 'anything that is not a cell sentence is left as it is');
  const merged = okPlan([HEAD], ...mergeGestureSentences(eight));
  assert.equal(merged.list.length, 2); assert.equal(merged.added.length, 1);
});

// ---- undo never takes a head -------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('undo: the stack gives back the list before; with no memory (a restart) it removes the last LINE but never the head; an empty new bar has nothing to undo', () => {
  const st = barUndoStack();
  assert.equal(st.canUndo([]), false); assert.equal(st.undo([]), null);
  assert.equal(st.canUndo([HEAD]), false, 'the head is the bar as it was: nothing to take back');
  assert.equal(st.undo([HEAD]), null);
  assert.equal(st.canUndo([HEAD, 'Hit kick on step 3.']), true);
  const r = st.undo([HEAD, 'Hit kick on step 3.']);
  assert.deepEqual(r?.list, [HEAD]); assert.deepEqual(r?.removed, ['Hit kick on step 3.']);
  assert.equal(st.canRedo([HEAD]), true);
  assert.deepEqual(st.redo([HEAD])?.list, [HEAD, 'Hit kick on step 3.']);
  const fresh = barUndoStack();
  assert.deepEqual(fresh.undo(['Hit kick on step 3.'])?.list, [], 'a new bar (an empty list to start with): the last line comes off, the groove stays');
  assert.equal(barUndoStack().canUndo(['Start with 8 steps in 4/4 at 90 beats per minute: snare on step 3.']), false, 'a head typed by hand is a head too');
});

test('a coalesced gesture REPLACES the top undo entry (one undo for a drag whose cells came in one by one)', () => {
  const st = barUndoStack();
  st.push({ before: [HEAD], after: [HEAD, 'Hit kick on step 1.'], added: ['Hit kick on step 1.'], replaced: [] });
  st.replaceTop({ before: [HEAD], after: [HEAD, 'Hit kick on steps 1 and 2.'], added: ['Hit kick on steps 1 and 2.'], replaced: [] });
  const r = st.undo([HEAD, 'Hit kick on steps 1 and 2.']);
  assert.deepEqual(r?.list, [HEAD]);
  assert.equal(st.canUndo([HEAD]), false, 'one undo took the whole drag back');
});

// =====================================================================================================================================================================================================
// 2026-11-19-0993 MUTATION SURVIVORS (triage of ~/.forge-mem-evidence/p0993/mutate-bar-list-core.log): every test below FAILS against the mutant it names (checked on a scratch copy of the source) and passes on the real code.
// =====================================================================================================================================================================================================

const applied = (d: RhythmData, sentence: string): RhythmData => { const p = parseBarSentence(sentence); assert.equal(p.ok, true, sentence); const r = applyBarLine(d, (p as { line: Parameters<typeof applyBarLine>[1] }).line); assert.equal(r.ok, true, sentence); return (r as { data: RhythmData }).data; };
const clone = (d: RhythmData): RhythmData => JSON.parse(JSON.stringify(d)) as RhythmData;
const edit = (d: RhythmData, f: (c: RhythmData) => void): RhythmData => { const c = clone(d); f(c); return c; };
const emptyRows = (d: RhythmData, steps: number): RhythmData['channels'] => Object.fromEntries(Object.keys(d.channels).map((k) => [k, new Array(steps).fill(false)]));
/** What the diff says when no sentence says it: ONE new head, which replays to the bar. */
const asHead = (before: RhythmData, after: RhythmData): void => {
  const said = diffBarData(before, after);
  assert.deepEqual(said, [headSentence(after)!]);
  assert.equal(json(replayBar(said).data), json(after));
};

// 2026-11-19-0993 mutation survivor: bar-list-core.ts:22 boundary ">=" -> ">", "<=" -> "<", number+1 "1" -> "2", "127" -> "128" (the widget's normalizeCell, as the diff reads a cell)
test('the diff reads a cell as the widget does: velocities 1 and 127 are cells, 0 and 128 are rests (a 128 does not make two bars different)', () => {
  for (const v of [1, 2, 64, 126, 127]) assert.deepEqual(diffBarData(BAR, edit(BAR, (c) => { c.channels.kick[3] = v; })), [`Hit kick on step 4 at velocity ${v}.`], `velocity ${v}`);
  assert.deepEqual(diffBarData(BAR, edit(BAR, (c) => { c.channels.kick[3] = 128 as never; })), [], 'a 128 reads as a rest: no difference');
  assert.deepEqual(diffBarData(BAR, edit(BAR, (c) => { c.tempo_bpm = 119; c.channels.kick[3] = 128 as never; })), ['Set the tempo to 119.'], 'a 128 beside a real change is still a rest');
  assert.deepEqual(diffBarData(BAR, edit(BAR, (c) => { c.tempo_bpm = 119; c.channels.kick[3] = 2.5 as never; })), ['Set the tempo to 119.'], 'a fraction is a rest');
});

// 2026-11-19-0993 mutation survivor: bar-list-core.ts:39 bool-flip, empty-string, number+1; :40 if-false; :42 empty-string, plus-minus, number+1 x2 (the STOP a replay names)
test('the stop of a replay is exact: its index, its reason, its words, its line and its column (a line that is not text, cannot be read, or cannot be applied)', () => {
  const stopOf = (list: unknown[]) => replayBar(list as string[]).stop;
  assert.deepEqual(stopOf([HEAD, 5]), { index: 1, reason: 'unreadable', message: 'This line is not text.', line: 2, column: 1 });
  assert.deepEqual(stopOf([null]), { index: 0, reason: 'unreadable', message: 'This line is not text.', line: 1, column: 1 });
  assert.deepEqual(stopOf([HEAD, 'Hit cowbell on step 1.']), { index: 1, reason: 'unreadable', message: 'cowbell is not a channel; the channels are kick, snare, hihat, bell, claves, conga_high and conga_low.', line: 2, column: 5 });
  assert.deepEqual(stopOf([HEAD, 'Hit kick on step 3.', 'Hit kick on steps']), { index: 2, reason: 'unreadable', message: 'I could not read "Hit kick on steps". For example: Hit kick on steps 1, 5 and 9.', line: 3, column: 1 });
  assert.deepEqual(stopOf([HEAD, 'Hit kick on step 17.']), { index: 1, reason: 'unreadable', message: 'Step 17 is beyond this bar\'s 16 steps.', line: 2, column: 1 });
  assert.deepEqual(stopOf(['Hit snare on step 3.', 'Hit kick on step 17.']), { index: 1, reason: 'unreadable', message: 'Step 17 is beyond this bar\'s 16 steps.', line: 2, column: 1 });
  assert.equal(stopOf([HEAD, 'Hit kick on step 3.']), null);
});

// 2026-11-19-0993 mutation survivor: bar-list-core.ts:83 logic x2 (a grid said when only the signature, only the steps, or only the group changed)
test('a grid change is said when ONE of signature, steps or group changes (not only when all do)', () => {
  const only = (f: (c: RhythmData) => void, rows: number): RhythmData => edit(BAR, (c) => { f(c); c.channels = emptyRows(c, rows); });
  assert.deepEqual(diffBarData(BAR, only((c) => { c.steps = 8; c.group_size = 4; }, 8)), ['Use 8 steps in 4/4 in groups of 4.'], 'the steps (and the group that goes with them)');
  const eightTwo = only((c) => { c.steps = 8; c.group_size = 2; }, 8);
  assert.deepEqual(diffBarData(eightTwo, only((c) => { c.steps = 8; c.group_size = 4; }, 8)), ['Use 8 steps in 4/4 in groups of 4.'], 'the group alone');
  assert.deepEqual(diffBarData(only((c) => { c.steps = 8; c.group_size = 4; }, 8), eightTwo), ['Use 8 steps in 4/4.'], 'the group back to the default one');
  const fourFour12 = only((c) => { c.steps = 12; c.group_size = 4; }, 12);
  assert.deepEqual(diffBarData(fourFour12, edit(fourFour12, (c) => { c.time_signature = '3/4'; })), ['Use 12 steps in 3/4.'], 'the signature alone');
});

// 2026-11-19-0993 mutation survivor: bar-list-core.ts:84 :87 :88 :95 :(explain) "return null;" -> "return;" (a sentence that cannot be said sends the diff to the head, never to nothing)
test('a bar no gesture sentence can say is said as a HEAD: an unloadable grid, a last channel replaced, a swing with a fraction; a bar the Beat Box would refuse is said as nothing', () => {
  asHead(BAR, edit(BAR, (c) => { c.steps = 10; c.group_size = 2; c.channels = emptyRows(c, 10); }));
  asHead({ ...BAR, channels: { kick: row(0, 8) } }, { ...BAR, channels: { snare: row(4, 12) } });
  asHead(BAR, edit(BAR, (c) => { c.swing_pct = 20.5; }));
  assert.match(diffBarData(BAR, edit(BAR, (c) => { c.swing_pct = 20.5; }))[0], /with 20\.5 percent swing/);
  assert.deepEqual(diffBarData(BAR, { ...BAR, channels: { ...BAR.channels, cowbell: row() } }), [], 'a channel the Beat Box does not know has no sentence and no head');
  assert.deepEqual(diffBarData(BAR, { ...BAR, tempo_bpm: 1e-7 }), [], 'a tempo with no plain spelling has no head');
});

// 2026-11-19-0993 mutation survivor: bar-list-core.ts:95 number+1 "0" -> "1" x2 (a bar with no swing key is a bar with swing 0)
test('a missing swing is swing 0 on either side of the diff (it is not a change)', () => {
  const { swing_pct: _s, ...noSwing } = BAR; void _s;
  assert.deepEqual(diffBarData(noSwing as RhythmData, { ...BAR, swing_pct: 0, tempo_bpm: 119 }), ['Set the tempo to 119.']);
  assert.deepEqual(diffBarData({ ...BAR, swing_pct: 0 }, { ...noSwing, tempo_bpm: 119 } as RhythmData), ['Set the tempo to 119.']);
  assert.deepEqual(diffBarData(noSwing as RhythmData, { ...BAR, swing_pct: 20 }), ['Set the swing to 20 percent.']);
});

// 2026-11-19-0993 mutation survivor: bar-list-core.ts:100 number+1 "1" -> "2" (two changed cells are not "no change we can say")
test('two changed cells are said in ONE sentence (not a head)', () => {
  assert.deepEqual(diffBarData(BAR, edit(BAR, (c) => { c.channels.kick = row(0, 2, 3, 8); })), ['Hit kick on steps 3 and 4.']);
  assert.deepEqual(diffBarData(BAR, edit(BAR, (c) => { c.channels.kick = row(8); c.channels.snare = row(4); })), ['Clear kick on step 1.', 'Clear snare on step 13.']);
});

// 2026-11-19-0993 mutation survivor: bar-list-core.ts:101 empty-string #4 ('right' of the Shift) and #7 ('left' of the Rotate)
test('every transform is said in ITS words: shift left / right, mirror, rotate left / right of any channel', () => {
  const lopsided = edit(BAR, (c) => { c.channels = { kick: row(0, 1, 8), snare: row(4, 12, 13), hihat: row() }; });
  const sayings: Array<[string, string]> = [
    ['Shift every channel one step to the left.', 'Shift every channel one step to the left.'], ['Shift every channel one step to the right.', 'Shift every channel one step to the right.'],
    ['Mirror every channel.', 'Mirror every channel.'], ['Rotate the kick channel one step to the left.', 'Rotate the kick channel one step to the left.'],
    ['Rotate the kick channel one step to the right.', 'Rotate the kick channel one step to the right.'], ['Rotate the snare channel one step to the left.', 'Rotate the snare channel one step to the left.'],
    ['Rotate the snare channel one step to the right.', 'Rotate the snare channel one step to the right.'],
  ];
  for (const [typed, said] of sayings) {
    const after = applied(lopsided, typed);
    assert.deepEqual(diffBarData(lopsided, after), [said], typed);
  }
});

// 2026-11-19-0993 mutation survivor: bar-list-core.ts:103 if-true; :106 eq-flip; :107 eq-flip, bool-flip, plus-minus, number+1; :108 if-false/if-true/boundary/number+1/logic/drop-not/empty-string; :109 eq-flip x3, bool-flip x3, number+1, plus-minus
//   :110 if-false/if-true/drop-not/empty-string/eq-flip x3/plus-minus/number+1/bool-flip  (the per-channel sentences of a message no transform explains)
test('a message that says several things in several channels is said channel by channel: the clears of a channel, then its plain hits, then each velocity from the lowest', () => {
  const after = edit(BAR, (c) => {
    c.channels.kick = row(2); c.channels.kick[4] = 90; c.channels.kick[5] = 40; c.channels.kick[6] = 90;                 // clear 1 and 9; hit 3; velocity 90 on 5 and 7; velocity 40 on 6
    c.channels.snare = row(1, 12);                                                                                       // clear 5; hit 2
  });
  const said = diffBarData(BAR, after);
  assert.deepEqual(said, ['Clear kick on steps 1 and 9.', 'Hit kick on step 3.', 'Hit kick on step 6 at velocity 40.', 'Hit kick on steps 5 and 7 at velocity 90.', 'Clear snare on step 5.', 'Hit snare on step 2.']);
  assert.equal(json(replayBar([HEAD, ...said]).data), json(after), 'and it replays to the bar');
  const hitsOnly = edit(BAR, (c) => { c.channels.kick = row(0, 2, 8, 9); c.channels.hihat = row(3, 6); });
  assert.deepEqual(diffBarData(BAR, hitsOnly), ['Hit kick on steps 3 and 10.', 'Hit hihat on steps 4 and 7.'], 'a channel with no clear says no clear');
  const clearsOnly = edit(BAR, (c) => { c.channels.kick = row(); c.channels.snare = row(4); });
  assert.deepEqual(diffBarData(BAR, clearsOnly), ['Clear kick on steps 1 and 9.', 'Clear snare on step 13.'], 'a channel with only clears says no hit');
  const oneClearOneHit = edit(BAR, (c) => { c.channels.kick = row(8, 2); });
  assert.deepEqual(diffBarData(BAR, oneClearOneHit), ['Clear kick on step 1.', 'Hit kick on step 3.']);
  const velocities = edit(BAR, (c) => { c.channels.hihat = row(); c.channels.hihat[0] = 100; c.channels.hihat[1] = 40; c.channels.hihat[2] = 70; c.channels.hihat[3] = true; });
  assert.deepEqual(diffBarData(BAR, velocities), ['Hit hihat on step 4.', 'Hit hihat on step 2 at velocity 40.', 'Hit hihat on step 3 at velocity 70.', 'Hit hihat on step 1 at velocity 100.'], 'plain first, then the velocities from the lowest');
  // a plain hit is before EVERY velocity, the lowest (1) included, wherever its step is (a plain hit must not be sorted as the number 1)
  const lowAfterPlain = edit(BAR, (c) => { c.channels.hihat = row(); c.channels.hihat[0] = 1; c.channels.hihat[1] = 2; c.channels.hihat[2] = true; });
  assert.deepEqual(diffBarData(BAR, lowAfterPlain), ['Hit hihat on step 3.', 'Hit hihat on step 1 at velocity 1.', 'Hit hihat on step 2 at velocity 2.']);
  const plainThenLow = edit(BAR, (c) => { c.channels.hihat = row(); c.channels.hihat[0] = true; c.channels.hihat[1] = 1; });
  assert.deepEqual(diffBarData(BAR, plainThenLow), ['Hit hihat on step 1.', 'Hit hihat on step 2 at velocity 1.']);
  const lowThenPlain = edit(BAR, (c) => { c.channels.hihat = row(); c.channels.hihat[0] = 1; c.channels.hihat[1] = true; });
  assert.deepEqual(diffBarData(BAR, lowThenPlain), ['Hit hihat on step 2.', 'Hit hihat on step 1 at velocity 1.']);
});

// 2026-11-19-0993 mutation survivor: bar-list-core.ts:139 plus-minus "-" -> "+" (the velocities of a merged gesture, lowest first)
// :144 drop-statement "run = null;"; :153 drop-statement "flush();" (a gesture ends at the first line that is not a cell sentence, and what follows is a new gesture)
test('mergeGestureSentences: velocities lowest first; a line that is not a cell sentence ENDS the gesture (what came before is said before it, what comes after starts again)', () => {
  assert.deepEqual(mergeGestureSentences(['Hit kick on step 1 at velocity 100.', 'Hit kick on step 2 at velocity 40.', 'Hit kick on step 3 at velocity 70.']), ['Hit kick on step 2 at velocity 40.', 'Hit kick on step 3 at velocity 70.', 'Hit kick on step 1 at velocity 100.']);
  assert.deepEqual(mergeGestureSentences(['Hit kick on step 1.', 'Set the tempo to 100.']), ['Hit kick on step 1.', 'Set the tempo to 100.'], 'the cells come before the line that ended the gesture');
  assert.deepEqual(mergeGestureSentences(['Hit kick on step 1.', 'Set the tempo to 100.', 'Hit snare on step 2.']), ['Hit kick on step 1.', 'Set the tempo to 100.', 'Hit snare on step 2.'], 'the second gesture does not carry the first one\'s cells');
  assert.deepEqual(mergeGestureSentences(['Hit kick on step 1.', 'Hit kick on step 2.', 'Mirror every channel.', 'Hit kick on step 3.', 'Hit kick on step 4.']), ['Hit kick on steps 1 and 2.', 'Mirror every channel.', 'Hit kick on steps 3 and 4.']);
  assert.deepEqual(mergeGestureSentences(['Clear kick.', 'Hit kick on step 1.']), ['Clear kick.', 'Hit kick on step 1.'], 'Clear of a whole channel is not a cell sentence');
  assert.deepEqual(mergeGestureSentences(['not a sentence', 'Hit kick on step 1.']), ['not a sentence', 'Hit kick on step 1.']);
  assert.deepEqual(mergeGestureSentences([]), []);
});

// 2026-11-19-0993 mutation survivor: bar-list-core.ts:177 logic#1 and logic#2 "||" -> "&&" (which earlier lines a new cell line REPLACES: only those of its own channel that say one of its steps)
test('an earlier line is replaced only when it says the SAME cell: a redundant line of another channel stays where it is', () => {
  const redundantClear = okPlan([HEAD, 'Clear hihat on step 2.'], 'Hit snare on step 2.');
  assert.deepEqual(redundantClear.list, [HEAD, 'Clear hihat on step 2.', 'Hit snare on step 2.']); assert.deepEqual(redundantClear.replaced, []); assert.deepEqual(redundantClear.added, ['Hit snare on step 2.']);
  const pair = okPlan([HEAD, 'Hit hihat on step 2.', 'Clear hihat on step 2.'], 'Hit snare on step 2.');
  assert.deepEqual(pair.list, [HEAD, 'Hit hihat on step 2.', 'Clear hihat on step 2.', 'Hit snare on step 2.']); assert.deepEqual(pair.replaced, []);
  const sameChannelOtherStep = okPlan([HEAD, 'Hit hihat on step 2.', 'Clear hihat on step 2.'], 'Hit hihat on step 3.');
  assert.deepEqual(sameChannelOtherStep.list, [HEAD, 'Hit hihat on step 2.', 'Clear hihat on step 2.', 'Hit hihat on step 3.'], 'the same channel, another step');
  const sameCell = okPlan([HEAD, 'Hit hihat on step 2.', 'Clear hihat on step 2.'], 'Hit hihat on step 2.');
  assert.equal(sameCell.replaced.length >= 1, true, 'the same cell: the lines that said it are replaced');
  assert.equal(json(sameCell.replay.data), json(replayBar([...sameCell.list]).data));
});

// 2026-11-19-0993 mutation survivor: bar-list-core.ts:189 plus-minus "-" -> "+", boundary ">=" -> ">", number+1 "0" -> "1" (the search for the line to replace reaches line 1 of a list that has no head)
test('a tempo, swing or grid line replaces the earlier one in place even when it is the FIRST line of the list (a new bar has no head)', () => {
  const t = okPlan(['Set the tempo to 100.'], 'Set the tempo to 120.');
  assert.deepEqual(t.list, ['Set the tempo to 120.']); assert.deepEqual(t.replaced, [{ index: 0, sentence: 'Set the tempo to 100.' }]); assert.deepEqual(t.added, ['Set the tempo to 120.']);
  const s = okPlan(['Set the swing to 10 percent.', 'Hit kick on step 3.'], 'Set the swing to 30 percent.');
  assert.deepEqual(s.list, ['Set the swing to 30 percent.', 'Hit kick on step 3.']);
  const g = okPlan(['Use 8 steps in 4/4.'], 'Use 12 steps in 3/4.');
  assert.deepEqual(g.list, ['Use 12 steps in 3/4.']); assert.deepEqual(g.replaced, [{ index: 0, sentence: 'Use 8 steps in 4/4.' }]);
  const last = okPlan(['Set the tempo to 100.', 'Hit kick on step 3.', 'Set the tempo to 110.'], 'Set the tempo to 120.');
  assert.deepEqual(last.list, ['Set the tempo to 100.', 'Hit kick on step 3.', 'Set the tempo to 120.'], 'the LAST such line is the one replaced');
});

// 2026-11-19-0993 mutation survivor: bar-list-core.ts:202 empty-string, number+1 x2; :214 plus-minus, number+1 x2; :212 (all five); :220 (all four); :222 (all four)
test('a refusal of the plan says WHERE: the line of the typed text and the column (empty, unreadable, refused, blocked), and what a plan that throws says', () => {
  assert.deepEqual(plan([HEAD]), { ok: false, reason: 'empty', message: 'There is no sentence to add.', line: 1, column: 1 });
  assert.deepEqual(plan([HEAD], '', '   ', '.'), { ok: false, reason: 'empty', message: 'There is no sentence to add.', line: 1, column: 1 });
  assert.deepEqual(plan([HEAD], 'Hit kick on step 3.', 'Hit cowbell on step 1.'), { ok: false, reason: 'unreadable', message: 'cowbell is not a channel; the channels are kick, snare, hihat, bell, claves, conga_high and conga_low.', line: 2, column: 5 });
  assert.deepEqual(plan([HEAD], 'Hit kick on step 3.', 'Clear conga_low on step 1.'), { ok: false, reason: 'refused', message: 'There is no conga_low channel in this bar; add it first: Add the channel conga_low.', line: 2, column: 1 });
  assert.deepEqual(plan([HEAD], 'Set the tempo to 300.'), { ok: false, reason: 'refused', message: 'The Beat Box plays 40 to 240 beats per minute, not 300.', line: 1, column: 1 });
  const blocked = plan([HEAD, 'nonsense here'], 'Hit kick on step 3.') as { line: number; column: number };
  assert.equal(blocked.line, 2); assert.equal(blocked.column, 1);
  const thrown = planBarAppend([HEAD], null as never);
  assert.equal(thrown.ok, false); assert.equal((thrown as { reason: string }).reason, 'refused'); assert.equal((thrown as { line: number }).line, 1); assert.equal((thrown as { column: number }).column, 1);
  assert.match((thrown as { message: string }).message, /^That could not be planned: /);
  // a step too big to be written in digits again (22 digits: "1e+21") is read, but its canonical sentence is not: the refusal names the typed sentence's place
  const huge = plan([HEAD], 'Hit kick on step 3.', 'Hit kick on step 1000000000000000000000.');
  assert.equal(huge.ok, false); assert.equal((huge as { reason: string }).reason, 'unreadable'); assert.equal((huge as { line: number }).line, 2); assert.equal((huge as { column: number }).column, 1);
});
