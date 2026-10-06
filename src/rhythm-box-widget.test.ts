// Beat-as-data Phase 5 (drain 2026-10-05-2100) + 5b (drain 2026-10-06-1200): the Rhythm Box widget's side of "edit a rhythm data note
// through the widget" — load from the note, and (5b) AUTOSAVE every pattern-data change instead of a Save button.
//
// HOW the widget is tested (the repo had no widget tests): rhythm_box.html is a single file whose script has a pure-core region
// exported through `module.exports` when there is no `document`. Two layers, both using what the repo already has:
//   1. PURE CORE  — the script is evaluated in plain node (no DOM) and its exported functions are called directly;
//   2. DOM LAYER  — the page markup is loaded into a happy-dom Window (already a devDependency), the script is evaluated in that
//      window, and the host (plugin) is simulated with a fake `window.parent` whose postMessage is a spy.
// The widget is read from the SOURCE vault checkout (../music-theory) when present, else the bundled copy; with neither, the file
// skips with that reason. (The bundled copy only gains these changes after the driver re-syncs the vault.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { formatRhythmJson, parseWidgetMessage, type RhythmData } from './rhythm-edit-core.ts';

const WIDGET_REL = 'music_instruments/resources/html/rhythm_box.html';
const CANDIDATES = [path.resolve(process.cwd(), '../music-theory', WIDGET_REL), path.resolve(process.cwd(), 'assets/vaults/music-theory', WIDGET_REL)];
const WIDGET_FILE = CANDIDATES.find((f) => fs.existsSync(f));
const skip = WIDGET_FILE ? false : 'rhythm_box.html found in neither ../music-theory nor the bundled music-theory vault';
const html = WIDGET_FILE ? fs.readFileSync(WIDGET_FILE, 'utf-8') : '';
const SCRIPT = (/<script>([\s\S]*?)<\/script>/.exec(html) ?? [])[1] ?? '';

// ---- layer 1: the pure core, in plain node ---------------------------------------------------------------------

function pureCore(): any {
  const mod: { exports: any } = { exports: {} };
  new Function('module', SCRIPT)(mod);
  return mod.exports;
}

const rock = (): RhythmData => ({
  time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100,
  channels: {
    kick: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    hihat: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
  },
});

test('widget core: a cell is false | true | int 1-127; anything else is a rest', { skip }, () => {
  const w = pureCore();
  for (const [v, expect] of [[true, true], [false, false], [0, false], [1, 1], [72, 72], [127, 127], [128, false], [-1, false], [1.5, false],
                              ['x', false], [null, false], [undefined, false], [NaN, false]] as Array<[unknown, unknown]>) {
    assert.equal(w.normalizeCell(v), expect, String(v));
  }
});

test('widget core: a click clears any hit (plain or velocity) and turns an empty cell into a PLAIN hit — never an invented velocity', { skip }, () => {
  const w = pureCore();
  assert.equal(w.toggleCell(false), true);
  assert.equal(w.toggleCell(0), true);
  assert.equal(w.toggleCell(true), false);
  assert.equal(w.toggleCell(112), false);
  assert.equal(w.toggleCell(36), false);
});

test('widget core: accent = an int velocity >= 100, matching the engine\'s accent threshold', { skip }, () => {
  const w = pureCore();
  assert.equal(w.ACCENT_THRESHOLD, 100);
  assert.equal(w.isAccentedCell(99), false);
  assert.equal(w.isAccentedCell(100), true);
  assert.equal(w.isAccentedCell(127), true);
  assert.equal(w.isAccentedCell(true), false);            // a plain hit plays at 90 and is never accented
  assert.equal(w.isAccentedCell(false), false);
  const lib = fs.readFileSync(path.resolve(process.cwd(), 'assets/engine/forge/music/lib.py'), 'utf-8');
  const engine = /_RHYTHM_ACCENT_THRESHOLD\s*=\s*(\d+)/.exec(lib);
  assert.ok(engine, 'the bundled engine defines _RHYTHM_ACCENT_THRESHOLD');
  assert.equal(w.ACCENT_THRESHOLD, Number(engine![1]), 'widget threshold == engine threshold (drift guard)');
});

test('widget core: Export/Save data keeps int velocities instead of flattening them to true', { skip }, () => {
  const w = pureCore();
  const pattern = { kick: [112, false, true, 0, 72], snare: [], hihat: [128, 1.5, 'x', null, 127] };
  const data = w.buildRhythmData('4/4', 25, 100, pattern);
  assert.deepEqual(data.channels.kick.slice(0, 5), [112, false, true, false, 72]);
  assert.deepEqual(data.channels.hihat.slice(0, 5), [false, false, false, false, 127]);
  assert.equal(data.channels.kick.length, 16);
  assert.deepEqual(w.buildRhythmData('4/4', 0, 100, { kick: [true, false] }).channels.kick.slice(0, 2), [true, false]);   // booleans as before
});

test('widget core: Export JSON text == the plugin\'s formatRhythmJson (two implementations, one shape), ints included', { skip }, () => {
  const w = pureCore();
  const d = rock();
  d.channels.hihat[0] = 112; d.channels.snare[1] = 36; d.channels.kick[0] = 100;
  for (const data of [rock(), d]) assert.equal(w.rhythmDataJson(data), formatRhythmJson(data));
});

test('widget core: parseRhythmLoad accepts a valid 4/4 and 3/4 pattern, keeping ints', { skip }, () => {
  const w = pureCore();
  const d = rock(); d.channels.hihat[0] = 112;
  const r = w.parseRhythmLoad(d);
  assert.equal(r.ok, true);
  assert.equal(r.state.timeSig, '4/4'); assert.equal(r.state.bpm, 100); assert.equal(r.state.swingPct, 0);
  assert.equal(r.state.pattern.hihat[0], 112);
  const waltz = { time_signature: '3/4', steps: 12, group_size: 4, swing_pct: 10, tempo_bpm: 90, channels: { kick: [true, ...new Array(11).fill(false)] } };
  const rw = w.parseRhythmLoad(waltz);
  assert.equal(rw.ok, true);
  assert.equal(rw.state.pattern.snare.length, 12);        // a channel the note lacks loads as all rest
});

for (const [label, mutate, why] of [
  ['an unsupported time signature', (d: any) => { d.time_signature = '5/4'; }, /supports/],
  ['a grid that does not match the signature', (d: any) => { d.steps = 12; for (const c of Object.keys(d.channels)) d.channels[c] = d.channels[c].slice(0, 12); }, /steps/],
  ['a tempo outside the widget range', (d: any) => { d.tempo_bpm = 300; }, /tempo_bpm/],
  ['a fractional tempo (a save would round it)', (d: any) => { d.tempo_bpm = 100.5; }, /tempo_bpm/],
  ['a fractional swing (the slider would round it)', (d: any) => { d.swing_pct = 12.5; }, /swing_pct/],
  ['an unknown channel (a save would drop it)', (d: any) => { d.channels.cowbell = new Array(16).fill(false); }, /cowbell/],
  ['a channel of the wrong length', (d: any) => { d.channels.kick = d.channels.kick.slice(0, 8); }, /kick/],
  ['a step that is a string', (d: any) => { d.channels.snare[2] = 'x'; }, /snare step 2/],
  ['a step above 127', (d: any) => { d.channels.snare[2] = 128; }, /snare step 2/],
  ['a negative step', (d: any) => { d.channels.snare[2] = -5; }, /snare step 2/],
] as Array<[string, (d: any) => void, RegExp]>) {
  test(`widget core: parseRhythmLoad refuses ${label}`, { skip }, () => {
    const d: any = rock(); mutate(d);
    const r = pureCore().parseRhythmLoad(d);
    assert.equal(r.ok, false);
    assert.match(r.message, why);
  });
}

test('widget core: parseRhythmLoad refuses non-objects', { skip }, () => {
  for (const raw of [null, 'x', 5, [], undefined]) assert.equal(pureCore().parseRhythmLoad(raw).ok, false);
});

// ---- layer 2: the page, in happy-dom ---------------------------------------------------------------------------

interface Harness { win: any; doc: any; posted: any[]; host: object | null; send: (m: unknown, source?: unknown) => Promise<void>; el: (id: string) => any; cell: (ch: string, s: number) => any }

async function loadWidget(asHost: boolean): Promise<Harness> {
  const posted: any[] = [];
  // Messages are captured through a JSON round trip: objects built inside the happy-dom vm context have that context's Object.prototype,
  // which node's strict deepEqual (rightly) does not equate with ours, though the structure is identical.
  const host = asHost ? { postMessage: (m: unknown) => { posted.push(JSON.parse(JSON.stringify(m))); } } : null;
  const win: any = new Window({ url: 'http://localhost/' });
  if (host) Object.defineProperty(win, 'parent', { value: host, configurable: true });
  const m = /<script>([\s\S]*?)<\/script>/.exec(html)!;
  win.document.write(html.replace(m[0], ''));
  win.eval(m[1]);
  await new Promise((r) => setTimeout(r, 5));
  const send = async (msg: unknown, source: unknown = host) => {
    win.dispatchEvent(new win.MessageEvent('message', { data: msg, source }));
    await new Promise((r) => setTimeout(r, 5));
  };
  return {
    win, doc: win.document, posted, host, send,
    el: (id) => win.document.getElementById(id),
    cell: (ch, s) => win.document.querySelector(`.step[data-channel="${ch}"][data-step="${s}"]`),
  };
}

const load = (data: unknown, noteName = 'my beat') => ({ type: 'forge-rhythm-load', data, noteName });
const saves = (h: Harness) => h.posted.filter((m) => m.type === 'forge-rhythm-save');
const lastSave = (h: Harness) => saves(h).at(-1);
const fire = (h: Harness, id: string, type: string) => h.el(id).dispatchEvent(new h.win.Event(type, { bubbles: true }));
const status = (h: Harness, state: string, message?: string) => h.send({ type: 'forge-rhythm-status', state, ...(message === undefined ? {} : { message }) });

/** Run `action` and return how many save intents it posted. */
async function savesPosted(h: Harness, action: () => void | Promise<void>): Promise<number> {
  const before = saves(h).length;
  await action();
  await new Promise((r) => setTimeout(r, 5));
  return saves(h).length - before;
}

async function loadedHost(data: RhythmData = rock(), name = 'my beat'): Promise<Harness> {
  const h = await loadWidget(true);
  await h.send(load(data, name));
  return h;
}

test('widget DOM: standalone behaviour is unchanged — no ready message, no host bar, no Save button, cells toggle, Export works', { skip }, async () => {
  const h = await loadWidget(false);
  assert.deepEqual(h.posted, []);
  assert.equal(h.el('bSave') === null, true, 'there is no Save button any more');
  assert.equal(h.el('hostBar').hidden, true);
  assert.equal(h.doc.querySelectorAll('.step').length, 48);
  h.cell('kick', 0).click();
  assert.ok(h.cell('kick', 0).classList.contains('on'));
  assert.ok(!h.cell('kick', 0).classList.contains('accent'));
  let copied = '';
  Object.defineProperty(h.win.navigator, 'clipboard', { value: { writeText: (t: string) => { copied = t; return Promise.resolve(); } }, configurable: true });
  h.el('bExport').click();
  assert.match(copied, /"kick": \[true, false, false/);
  await h.send(load(rock()), h.win);                        // a host message in standalone mode (parent === window) is not accepted
  assert.equal(h.el('hostBar').hidden, true);
  assert.deepEqual(h.posted, [], 'standalone never posts anything (no autosave)');
});

test('widget DOM: standalone time-signature change is immediate, as before — no confirm bar', { skip }, async () => {
  const h = await loadWidget(false);
  h.cell('kick', 0).click();
  h.el('timeSig').value = '3/4';
  fire(h, 'timeSig', 'change');
  assert.equal(h.doc.querySelectorAll('.step').length, 36);
  assert.equal(h.el('tsConfirm').hidden, true);
  assert.equal(h.doc.querySelectorAll('.step.on').length, 0, 'the banks were cleared at once');
});

test('widget DOM: hosted, it announces itself once with {type: forge-rhythm-ready}, shows no Save button and keeps the host bar hidden until a load', { skip }, async () => {
  const h = await loadWidget(true);
  assert.deepEqual(h.posted, [{ type: 'forge-rhythm-ready' }]);
  assert.equal(h.el('bSave') === null, true, 'no Save button');
  assert.equal(h.el('hostBar').hidden, true);
});

test('widget DOM: a load message sets signature, tempo, swing and the grid, shows the note name — and posts NOTHING back', { skip }, async () => {
  const h = await loadWidget(true);
  const d = rock(); d.tempo_bpm = 88; d.swing_pct = 25;
  await h.send(load(d, 'straight rock'));
  assert.equal(h.el('hostBar').hidden, false);
  assert.equal(h.el('hostNote').textContent, 'straight rock');
  assert.equal(h.el('bpmVal').textContent, '88 BPM');
  assert.equal(h.el('swingVal').textContent, '25%');
  assert.equal(h.el('swing').value, '25');
  assert.equal(h.el('timeSig').value, '4/4');
  const on = (ch: string) => [...Array(16).keys()].filter((s) => h.cell(ch, s).classList.contains('on'));
  assert.deepEqual(on('kick'), [0, 8]);
  assert.deepEqual(on('snare'), [4, 12]);
  assert.deepEqual(on('hihat'), [0, 2, 4, 6, 8, 10, 12, 14]);
  assert.equal(saves(h).length, 0, 'loading is never a data change');
});

test('widget DOM: loading a 3/4 note rebuilds the grid to 12 steps', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send(load({ time_signature: '3/4', steps: 12, group_size: 4, swing_pct: 0, tempo_bpm: 90, channels: { kick: [true, ...new Array(11).fill(false)] } }));
  assert.equal(h.doc.querySelectorAll('.step').length, 36);
  assert.equal(h.el('timeSig').value, '3/4');
});

test('widget DOM: the loaded pattern is in bank A, the other banks are cleared (even ones the user had filled), and bank A is selected', { skip }, async () => {
  const h = await loadWidget(true);
  h.doc.querySelector('.banks button[data-bank="B"]').click();
  h.cell('snare', 3).click();
  h.doc.querySelector('.banks button[data-bank="C"]').click();
  h.cell('hihat', 5).click();
  await h.send(load(rock()));
  assert.ok(h.doc.querySelector('.banks button[data-bank="A"]').classList.contains('active'));
  assert.ok(!h.doc.querySelector('.banks button[data-bank="C"]').classList.contains('active'));
  assert.equal(h.doc.querySelectorAll('.step.on').length, 2 + 2 + 8, 'bank A shows the loaded pattern');
  for (const b of ['B', 'C', 'D']) {
    h.doc.querySelector(`.banks button[data-bank="${b}"]`).click();
    assert.equal(h.doc.querySelectorAll('.step.on').length, 0, `bank ${b} is empty after a load`);
  }
});

test('widget DOM: before a note has been loaded, data actions post NOTHING (a hosted page must never overwrite a note it has not read)', { skip }, async () => {
  const h = await loadWidget(true);
  assert.equal(await savesPosted(h, () => h.cell('kick', 0).click()), 0);
  assert.equal(await savesPosted(h, () => h.el('bBpmUp').click()), 0);
});

test('widget DOM: after a load it refused, data actions still post nothing', { skip }, async () => {
  const h = await loadWidget(true);
  const d: any = rock(); d.time_signature = '5/4';
  await h.send(load(d));
  assert.match(h.el('loadMsg').textContent, /Could not load this note: .*supports/);
  assert.equal(await savesPosted(h, () => h.cell('kick', 0).click()), 0);
});

// ---- AUTOSAVE: which actions post a save intent ---------------------------------------------------------------

test('autosave: a cell toggle posts exactly ONE save with the new pattern', { skip }, async () => {
  const h = await loadedHost();
  assert.equal(await savesPosted(h, () => h.cell('snare', 0).click()), 1);
  const sent = lastSave(h);
  assert.equal(sent.data.channels.snare[0], true);
  assert.deepEqual(sent.data.channels.kick, rock().channels.kick);
});

test('autosave: every pattern-data action posts exactly one save — tempo up/down, swing, Random, Clear', { skip }, async () => {
  const h = await loadedHost();
  assert.equal(await savesPosted(h, () => h.el('bBpmUp').click()), 1);
  assert.equal(lastSave(h).data.tempo_bpm, 101);
  assert.equal(await savesPosted(h, () => h.el('bBpmDown').click()), 1);
  assert.equal(lastSave(h).data.tempo_bpm, 100);
  assert.equal(await savesPosted(h, () => { h.el('swing').value = '40'; fire(h, 'swing', 'input'); }), 1);
  assert.equal(lastSave(h).data.swing_pct, 40);
  assert.equal(await savesPosted(h, () => h.el('bRandom').click()), 1);
  assert.equal(await savesPosted(h, () => h.el('bClear').click()), 1);
  assert.deepEqual(lastSave(h).data.channels, { kick: new Array(16).fill(false), snare: new Array(16).fill(false), hihat: new Array(16).fill(false) });
});

test('autosave: tap tempo saves when it COMMITS a tempo change, not on the first tap', { skip }, async () => {
  const h = await loadedHost();
  let t = 0;
  Object.defineProperty(h.win.performance, 'now', { value: () => t, configurable: true });
  assert.equal(await savesPosted(h, () => { t = 0; h.el('bTap').click(); }), 0, 'one tap is not a tempo yet');
  assert.equal(await savesPosted(h, () => { t = 500; h.el('bTap').click(); }), 1, 'the second tap commits 120 BPM');
  assert.equal(lastSave(h).data.tempo_bpm, 120);
});

test('autosave: a tempo button at its limit changes nothing and saves nothing', { skip }, async () => {
  const d = rock(); d.tempo_bpm = 240;
  const h = await loadedHost(d);
  assert.equal(await savesPosted(h, () => h.el('bBpmUp').click()), 0);
});

test('widget DOM: cells with a velocity >= 100 are drawn accented, 99 and plain hits are not', { skip }, async () => {
  const h = await loadWidget(true);
  const d = rock(); d.channels.kick[0] = 100; d.channels.kick[8] = 99; d.channels.hihat[0] = 127;
  await h.send(load(d));
  assert.ok(h.cell('kick', 0).classList.contains('accent'));
  assert.ok(!h.cell('kick', 8).classList.contains('accent'));
  assert.ok(h.cell('hihat', 0).classList.contains('accent'));
  assert.ok(!h.cell('hihat', 2).classList.contains('accent'));        // a plain true
  assert.match(h.cell('kick', 0).getAttribute('aria-label'), /velocity 100, accent/);
  h.cell('kick', 0).click();                                           // clearing it removes the ring
  assert.ok(!h.cell('kick', 0).classList.contains('accent'));
});

test('autosave: untouched velocity cells keep their velocity in every payload; a click clears an int cell and sets an empty one to a plain true', { skip }, async () => {
  const d = rock(); d.channels.hihat[0] = 112; d.channels.hihat[2] = 72;
  const h = await loadedHost(d);
  await savesPosted(h, () => h.cell('hihat', 0).click());       // 112 -> rest
  await savesPosted(h, () => h.cell('hihat', 1).click());       // empty -> plain true
  const saved = lastSave(h).data.channels.hihat;
  assert.equal(saved[0], false);
  assert.equal(saved[1], true);
  assert.equal(saved[2], 72, 'a cell nobody touched keeps its velocity');
});

test('autosave: the actions that are NOT data changes never save — play, mute, solo, volume, every bank button', { skip }, async () => {
  const h = await loadedHost();
  assert.equal(await savesPosted(h, () => h.el('bPlay').click()), 0);
  assert.equal(await savesPosted(h, () => h.doc.querySelector('.mini-btn.mute').click()), 0);
  assert.equal(await savesPosted(h, () => h.doc.querySelector('.mini-btn.solo').click()), 0);
  assert.equal(await savesPosted(h, () => { h.el('volume').value = '30'; fire(h, 'volume', 'input'); }), 0);
  for (const b of ['B', 'C', 'D', 'A']) {
    assert.equal(await savesPosted(h, () => h.doc.querySelector(`.banks button[data-bank="${b}"]`).click()), 0, `bank ${b}`);
  }
  assert.equal(await savesPosted(h, () => h.el('bExport').click()), 0);
});

test('autosave: the payload equals the Export JSON for the same state', { skip }, async () => {
  const d = rock(); d.channels.hihat[0] = 112;
  const h = await loadedHost(d);
  await savesPosted(h, () => h.cell('snare', 0).click());
  let copied = '';
  Object.defineProperty(h.win.navigator, 'clipboard', { value: { writeText: (t: string) => { copied = t; return Promise.resolve(); } }, configurable: true });
  h.el('bExport').click();
  assert.deepEqual(JSON.parse(copied), lastSave(h).data);
});

test('autosave: "which actions save" is auditable — one commitChange() posts the intent, and nothing else in the widget does', { skip }, () => {
  const posts = [...SCRIPT.matchAll(/type: "forge-rhythm-save"/g)];
  assert.equal(posts.length, 1, 'exactly one place posts a save intent');
  assert.match(SCRIPT, /function commitChange\(\) \{[\s\S]*?type: "forge-rhythm-save"/);
  const callers = [...SCRIPT.matchAll(/commitChange\(\)/g)].length - 1;      // minus the definition
  assert.ok(callers >= 7, `commitChange is called from the data actions (found ${callers})`);
});

// ---- time-signature change: an in-widget confirm bar (the sandbox blocks window.confirm) ------------------------

test('hosted time-signature change: shows the confirm bar, changes nothing and saves nothing until the user confirms', { skip }, async () => {
  const h = await loadedHost();
  assert.equal(h.el('tsConfirm').hidden, true);
  const n = await savesPosted(h, () => { h.el('timeSig').value = '3/4'; fire(h, 'timeSig', 'change'); });
  assert.equal(n, 0);
  assert.equal(h.el('tsConfirm').hidden, false);
  assert.match(h.el('tsConfirm').textContent, /clears the pattern in the note/i);
  assert.match(h.el('tsConfirm').textContent, /3\/4/);
  assert.equal(h.doc.querySelectorAll('.step').length, 48, 'the grid is untouched');
  assert.equal(h.el('timeSig').value, '4/4', 'the select shows the signature that is still in force');
  assert.equal(h.doc.querySelectorAll('.step.on').length, 12, 'the pattern is intact');
});

test('hosted time-signature change: Cancel leaves everything as it was and saves nothing', { skip }, async () => {
  const h = await loadedHost();
  h.el('timeSig').value = '3/4'; fire(h, 'timeSig', 'change');
  const n = await savesPosted(h, () => h.el('tsCancel').click());
  assert.equal(n, 0);
  assert.equal(h.el('tsConfirm').hidden, true);
  assert.equal(h.doc.querySelectorAll('.step').length, 48);
  assert.equal(h.el('timeSig').value, '4/4');
  assert.equal(h.doc.querySelectorAll('.step.on').length, 12);
});

test('hosted time-signature change: Change rebuilds the grid, clears the banks and posts exactly one save of the empty 3/4 pattern', { skip }, async () => {
  const h = await loadedHost();
  h.el('timeSig').value = '3/4'; fire(h, 'timeSig', 'change');
  const n = await savesPosted(h, () => h.el('tsChange').click());
  assert.equal(n, 1);
  assert.equal(h.el('tsConfirm').hidden, true);
  assert.equal(h.doc.querySelectorAll('.step').length, 36);
  const sent = lastSave(h).data;
  assert.equal(sent.time_signature, '3/4');
  assert.equal(sent.steps, 12);
  assert.deepEqual(sent.channels.kick, new Array(12).fill(false));
});

// ---- the indicator, and "Reload from note" ----------------------------------------------------------------------

test('indicator: saving / saved / error / conflict come from the plugin, and errors do not time out', { skip }, async () => {
  const h = await loadedHost();
  await status(h, 'saving');
  assert.equal(h.el('saveMsg').textContent, 'Saving…');
  await status(h, 'saved');
  assert.equal(h.el('saveMsg').textContent, 'Saved');
  assert.ok(!h.el('saveMsg').classList.contains('error'));
  await status(h, 'error', 'Not saved: this note is marked read_only: true');
  assert.equal(h.el('saveMsg').textContent, 'Not saved: this note is marked read_only: true');
  assert.ok(h.el('saveMsg').classList.contains('error'));
  await new Promise((r) => setTimeout(r, 3500));            // longer than the old transient timer
  assert.equal(h.el('saveMsg').textContent, 'Not saved: this note is marked read_only: true', 'an error stays until the next success');
  await status(h, 'saved');
  assert.equal(h.el('saveMsg').textContent, 'Saved');
  assert.ok(!h.el('saveMsg').classList.contains('error'));
});

test('indicator: the old transient "saved" message does not exist any more — "Saved" stays', { skip }, async () => {
  const h = await loadedHost();
  await status(h, 'saved');
  await new Promise((r) => setTimeout(r, 3500));
  assert.equal(h.el('saveMsg').textContent, 'Saved');
});

test('conflict: the message shows and "Reload from note" appears; clicking it posts forge-rhythm-reload', { skip }, async () => {
  const h = await loadedHost();
  assert.equal(h.el('bReload').hidden, true);
  await status(h, 'conflict', 'The note changed on disk — your latest edit was not saved.');
  assert.match(h.el('saveMsg').textContent, /changed on disk/);
  assert.ok(h.el('saveMsg').classList.contains('error'));
  assert.equal(h.el('bReload').hidden, false);
  h.el('bReload').click();
  assert.deepEqual(h.posted.at(-1), { type: 'forge-rhythm-reload' });
});

test('conflict: a fresh load clears the conflict and hides Reload; "idle" clears the indicator', { skip }, async () => {
  const h = await loadedHost();
  await status(h, 'conflict', 'changed');
  await h.send(load(rock(), 'my beat'));
  assert.equal(h.el('bReload').hidden, true);
  assert.equal(h.el('saveMsg').textContent, '');
  await status(h, 'saved');
  await status(h, 'idle');
  assert.equal(h.el('saveMsg').textContent, '');
});

test('status messages from anything but the embedding window, or with an unknown state, are ignored', { skip }, async () => {
  const h = await loadedHost();
  await h.send({ type: 'forge-rhythm-status', state: 'error', message: 'spoof' }, { postMessage() {} });
  assert.equal(h.el('saveMsg').textContent, '');
  await status(h, 'exploding', 'x');
  assert.equal(h.el('saveMsg').textContent, '');
});

test('the old forge-rhythm-save-result message is still understood (backward compatible)', { skip }, async () => {
  const h = await loadedHost(rock(), 'straight rock');
  await h.send({ type: 'forge-rhythm-save-result', ok: false, message: 'Not saved: the note changed on disk' });
  assert.equal(h.el('saveMsg').textContent, 'Not saved: the note changed on disk');
  assert.ok(h.el('saveMsg').classList.contains('error'));
});

// ---- trust and protocol shape ---------------------------------------------------------------------------------

test('widget DOM: messages that do not come from the embedding window are ignored', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send(load(rock()), { postMessage() {} });          // some other window
  await h.send(load(rock()), null);
  assert.equal(h.el('hostBar').hidden, true);
  await h.send(load(rock()), h.host);                        // the real host
  assert.equal(h.el('hostBar').hidden, false);
});

test('widget DOM: unknown or malformed host messages are ignored', { skip }, async () => {
  const h = await loadWidget(true);
  for (const m of [null, 'x', 5, [], {}, { type: 'other' }, { type: 5 }]) await h.send(m);
  assert.equal(h.el('hostBar').hidden, true);
});

test('widget DOM: the messages the widget sends are ones the plugin core recognises', { skip }, async () => {
  const h = await loadedHost();
  assert.equal(parseWidgetMessage(h.posted[0]).kind, 'ready');
  await savesPosted(h, () => h.cell('kick', 1).click());
  assert.equal(parseWidgetMessage(lastSave(h)).kind, 'save');
  await status(h, 'conflict', 'x');
  h.el('bReload').click();
  assert.equal(parseWidgetMessage(h.posted.at(-1)).kind, 'reload');
});

test('widget source: only the embedding window may talk to the widget; no Save button; the sandbox-blocked dialogs are never used', { skip }, () => {
  assert.match(SCRIPT, /e\.source !== h/);
  assert.ok(!/id="bSave"/.test(html), 'the Save button is gone');
  assert.match(html, /id="hostBar" hidden/);
  assert.match(html, /id="tsConfirm"[^>]* hidden/);
  assert.match(html, /id="bReload" hidden/);
  assert.ok(!/window\.confirm|[^.\w]confirm\(|window\.alert|[^.\w]alert\(|window\.prompt|[^.\w]prompt\(/.test(SCRIPT), 'allow-scripts + allow-same-origin only: confirm/alert/prompt are blocked in the sandbox');
});
