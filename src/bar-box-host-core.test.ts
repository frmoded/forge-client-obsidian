// 2026-11-19-0993 (THE LIST MODEL, stage 3: BARS) - the Beat Box tab's state machine for a bar's list (bar-box-host-core.ts), alone, on fake ports and a fake clock: messages are served one at a time in the order they came; each is the sentences of the difference between the
// bar the widget showed and the bar it shows; the swing slider's burst is ONE write after the quiet time (or at once when anything else comes); a message that is not rhythm data is dropped; a write the replay does not agree with redraws the widget; a bar the list cannot say
// falls back to the old save; a reload (a load) drops what was held for the old bar; the widget's own indicator hears "Saved" or the reason.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SWING_QUIET_MS, createBarBoxHost, type BarBoxPorts } from './bar-box-host-core.ts';
import type { AutosaveStatus } from './rhythm-autosave-core.ts';
import type { RhythmData } from './rhythm-edit-core.ts';

const row = (...on: number[]) => Array.from({ length: 16 }, (_, i) => on.includes(i));
const BAR: RhythmData = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 118, channels: { kick: row(0, 8), snare: row(4, 12) } };
const edit = (f: (d: RhythmData) => void, from: RhythmData = BAR): RhythmData => { const c = JSON.parse(JSON.stringify(from)) as RhythmData; f(c); return c; };

function rig(over: Partial<BarBoxPorts> = {}) {
  const sent: string[] = []; const loads: RhythmData[] = []; const legacy: unknown[] = []; const shown: RhythmData[] = []; const status: AutosaveStatus[] = []; const warns: string[] = [];
  let reloads = 0; const timers: Array<{ fn: () => void; ms: number; live: boolean }> = []; let release: Array<() => void> = []; let hold = false;
  const ports: BarBoxPorts = {
    appendLine: async (s) => { sent.push(s); if (hold) await new Promise<void>((ok) => release.push(ok)); return { ok: true, message: 'Added' }; },
    load: (d) => { loads.push(d); }, reload: async () => { reloads++; }, legacySave: (p) => { legacy.push(p); }, shown: (d) => { shown.push(d); }, status: (s) => { status.push(s); },
    setTimer: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length - 1; }, clearTimer: (h) => { if (timers[h as number]) timers[h as number].live = false; }, warn: (m) => { warns.push(m); },
    ...over,
  };
  const box = createBarBoxHost(BAR, ports);
  const fire = async () => { for (const t of timers) if (t.live) { t.live = false; t.fn(); } await box.flush(); };
  return { box, sent, loads, legacy, shown, status, warns, reloads: () => reloads, timers, fire, holdOn: () => { hold = true; }, holdOff: () => { hold = false; const r = release; release = []; r.forEach((f) => f()); } };
}

test('a message is the sentences of what changed: one appendLine each, in the order they came, and the widget is not redrawn when the replay is the grid', async () => {
  const r = rig();
  const a = edit((d) => { d.channels.kick[2] = true; }); const b = edit((d) => { d.channels.snare[7] = true; }, a); const c = edit((d) => { d.tempo_bpm = 119; }, b);
  r.box.save(a); r.box.save(b); r.box.save(c);
  await r.box.flush();
  assert.deepEqual(r.sent, ['Hit kick on step 3.', 'Hit snare on step 8.', 'Set the tempo to 119.']);
  assert.deepEqual(r.loads, []); assert.deepEqual(r.box.current(), c);
  assert.deepEqual(r.status, [{ state: 'saved' }, { state: 'saved' }, { state: 'saved' }]);
});

test('messages are served ONE AT A TIME: the second is not sent until the first has been written', async () => {
  const r = rig(); r.holdOn();
  r.box.save(edit((d) => { d.channels.kick[2] = true; }));
  r.box.save(edit((d) => { d.channels.kick[2] = true; d.channels.kick[3] = true; }));
  await new Promise((ok) => setTimeout(ok, 5));
  assert.equal(r.sent.length, 1); assert.equal(r.box.busy(), true);
  r.holdOff(); await new Promise((ok) => setTimeout(ok, 5)); r.holdOff(); await r.box.flush();
  assert.deepEqual(r.sent, ['Hit kick on step 3.', 'Hit kick on step 4.'], 'the second message was said against the bar the first left');
  assert.equal(r.box.busy(), false);
});

test('a no-change message says nothing; a message that is not rhythm data is dropped with a warning and never written', async () => {
  const r = rig();
  r.box.save(BAR); r.box.save({ nonsense: true }); r.box.save(null); r.box.save(edit((d) => { d.steps = 3; }));
  await r.box.flush();
  assert.deepEqual(r.sent, []); assert.equal(r.warns.filter((w) => /not rhythm data/.test(w)).length, 3);
});

test('the swing slider: its burst is ONE line after the quiet time; anything else arriving first writes the held swing at once, then itself', async () => {
  const r = rig();
  for (const v of [5, 10, 15, 20]) r.box.save(edit((d) => { d.swing_pct = v; }));
  await new Promise((ok) => setTimeout(ok, 5));
  assert.deepEqual(r.sent, [], 'while the slider moves nothing is written'); assert.equal(r.box.busy(), true);
  assert.equal(r.timers.some((t) => t.live && t.ms === SWING_QUIET_MS), true);
  await r.fire();
  assert.deepEqual(r.sent, ['Set the swing to 20 percent.']); assert.equal(r.box.busy(), false);
  const r2 = rig();
  const s = edit((d) => { d.swing_pct = 30; });
  r2.box.save(s); r2.box.save(edit((d) => { d.channels.kick[1] = true; }, s));
  await r2.box.flush();
  assert.deepEqual(r2.sent, ['Set the swing to 30 percent.', 'Hit kick on step 2.'], 'the held swing, then the click');
});

test('a write the replay does not agree with: the widget is redrawn from the replay (the load), and the Score is told the bar that is shown', async () => {
  const truth = edit((d) => { d.channels.snare[1] = true; });
  const r = rig({ appendLine: async () => ({ ok: true, message: 'x', data: truth }) });
  r.box.save(edit((d) => { d.channels.kick[2] = true; }));
  await r.box.flush();
  assert.deepEqual(r.loads, [truth]); assert.deepEqual(r.box.current(), truth); assert.deepEqual(r.shown, [truth]);
});

test('a write that was refused: the widget is drawn again from the note (reload), the indicator says why, nothing is lost silently', async () => {
  const r = rig({ appendLine: async () => ({ ok: false, message: 'Line 3 is not a sentence I can read.' }) });
  r.box.save(edit((d) => { d.channels.kick[2] = true; }));
  await r.box.flush();
  assert.equal(r.reloads(), 1); assert.deepEqual(r.status, [{ state: 'error', message: 'Line 3 is not a sentence I can read.' }]);
  assert.ok(r.warns.some((w) => /not written/.test(w)));
});

test('a bar the list cannot say is written by the old save, with the very payload the widget sent', async () => {
  const r = rig({ appendLine: async () => ({ ok: false, message: 'cannot', reason: 'unlistable' }) });
  const p = edit((d) => { d.channels.kick[2] = true; });
  r.box.save(p); await r.box.flush();
  assert.deepEqual(r.legacy, [p]); assert.equal(r.reloads(), 0); assert.deepEqual(r.box.current(), p);
});

test('a throw in the write is a refusal, never an unhandled rejection; the next message still goes', async () => {
  let n = 0;
  const r = rig({ appendLine: async (s) => { n++; if (n === 1) throw new Error('disk gone'); return { ok: true, message: s }; } });
  const a = edit((d) => { d.channels.kick[2] = true; });
  r.box.save(a); r.box.save(edit((d) => { d.channels.kick[3] = true; }, a));
  await r.box.flush();
  assert.equal(r.reloads(), 1); assert.equal(n, 2);
});

test('a load drops what was held for the old bar (and a write that finishes after it): the widget now shows the note\'s bar', async () => {
  const r = rig();
  r.box.save(edit((d) => { d.swing_pct = 20; }));
  await new Promise((ok) => setTimeout(ok, 5));
  assert.equal(r.box.busy(), true);
  const fresh = edit((d) => { d.tempo_bpm = 90; });
  r.box.loaded(fresh);
  assert.equal(r.box.busy(), false); assert.deepEqual(r.box.current(), fresh);
  await r.fire();
  assert.deepEqual(r.sent, [], 'the held swing was dropped with the old bar');
  const r2 = rig(); r2.holdOn();
  r2.box.save(edit((d) => { d.channels.kick[2] = true; }));
  await new Promise((ok) => setTimeout(ok, 5));
  r2.box.loaded(fresh); r2.holdOff(); await r2.box.flush();
  assert.deepEqual(r2.box.current(), fresh, 'the finished write does not overwrite what the load put on screen'); assert.deepEqual(r2.status, []);
});
