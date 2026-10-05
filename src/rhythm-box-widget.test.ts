// Beat-as-data Phase 5 (drain 2026-10-05-2100): the Rhythm Box widget's side of "edit a rhythm data note through the widget".
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
const lastSave = (h: Harness) => [...h.posted].reverse().find((m) => m.type === 'forge-rhythm-save');

test('widget DOM: standalone behaviour is unchanged — no ready message, Save and the host bar hidden, cells toggle, Export works', { skip }, async () => {
  const h = await loadWidget(false);
  assert.deepEqual(h.posted, []);
  assert.equal(h.el('bSave').hidden, true);
  assert.equal(h.el('hostBar').hidden, true);
  assert.equal(h.doc.querySelectorAll('.step').length, 48);
  h.cell('kick', 0).click();
  assert.ok(h.cell('kick', 0).classList.contains('on'));
  assert.ok(!h.cell('kick', 0).classList.contains('accent'));
  let copied = '';
  Object.defineProperty(h.win.navigator, 'clipboard', { value: { writeText: (t: string) => { copied = t; return Promise.resolve(); } }, configurable: true });
  h.el('bExport').click();
  assert.match(copied, /"kick": \[true, false, false/);
  // a host message in standalone mode (parent === window) is not accepted
  await h.send(load(rock()), h.win);
  assert.equal(h.el('bSave').hidden, true);
});

test('widget DOM: hosted, it announces itself once with {type: forge-rhythm-ready}', { skip }, async () => {
  const h = await loadWidget(true);
  assert.deepEqual(h.posted, [{ type: 'forge-rhythm-ready' }]);
  assert.equal(h.el('bSave').hidden, true, 'Save stays hidden until a load message arrives');
});

test('widget DOM: a load message sets signature, tempo, swing and the grid; Save and the note name appear', { skip }, async () => {
  const h = await loadWidget(true);
  const d = rock(); d.tempo_bpm = 88; d.swing_pct = 25;
  await h.send(load(d, 'straight rock'));
  assert.equal(h.el('bSave').hidden, false);
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
});

test('widget DOM: loading a 3/4 note rebuilds the grid to 12 steps', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send(load({ time_signature: '3/4', steps: 12, group_size: 4, swing_pct: 0, tempo_bpm: 90, channels: { kick: [true, ...new Array(11).fill(false)] } }));
  assert.equal(h.doc.querySelectorAll('.step').length, 36);
  assert.equal(h.el('timeSig').value, '3/4');
});

test('widget DOM: the loaded pattern is in bank A, the other banks are cleared (even ones the user had filled), and bank A is selected', { skip }, async () => {
  const h = await loadWidget(true);
  // the user had worked in bank B and C before the note was loaded
  h.doc.querySelector('.banks button[data-bank="B"]').click();
  h.cell('snare', 3).click();
  h.doc.querySelector('.banks button[data-bank="C"]').click();
  h.cell('hihat', 5).click();
  assert.equal(h.doc.querySelectorAll('.step.on').length, 1);
  await h.send(load(rock()));
  assert.ok(h.doc.querySelector('.banks button[data-bank="A"]').classList.contains('active'));
  assert.ok(!h.doc.querySelector('.banks button[data-bank="C"]').classList.contains('active'));
  assert.equal(h.doc.querySelectorAll('.step.on').length, 2 + 2 + 8, 'bank A shows the loaded pattern');
  for (const b of ['B', 'C', 'D']) {
    h.doc.querySelector(`.banks button[data-bank="${b}"]`).click();
    assert.equal(h.doc.querySelectorAll('.step.on').length, 0, `bank ${b} is empty after a load`);
  }
});

test('widget DOM: Save sends exactly the loaded data when nothing was touched — int velocities preserved', { skip }, async () => {
  const h = await loadWidget(true);
  const d = rock(); d.channels.hihat[0] = 112; d.channels.hihat[2] = 72; d.channels.kick[0] = 100; d.channels.snare[4] = 36;
  await h.send(load(d));
  h.el('bSave').click();
  assert.deepEqual(lastSave(h), { type: 'forge-rhythm-save', data: d });
});

test('widget DOM: a click toggles an int cell to a rest and an empty cell to a plain true; untouched ints survive the save', { skip }, async () => {
  const h = await loadWidget(true);
  const d = rock(); d.channels.hihat[0] = 112; d.channels.hihat[2] = 72;
  await h.send(load(d));
  h.cell('hihat', 0).click();            // 112 -> rest
  h.cell('hihat', 1).click();            // empty -> plain true
  h.el('bSave').click();
  const saved = lastSave(h).data.channels.hihat;
  assert.equal(saved[0], false);
  assert.equal(saved[1], true);
  assert.equal(saved[2], 72, 'a cell nobody touched keeps its velocity');
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

test('widget DOM: Save data equals Export JSON data for the same state', { skip }, async () => {
  const h = await loadWidget(true);
  const d = rock(); d.channels.hihat[0] = 112;
  await h.send(load(d));
  h.cell('snare', 0).click();
  let copied = '';
  Object.defineProperty(h.win.navigator, 'clipboard', { value: { writeText: (t: string) => { copied = t; return Promise.resolve(); } }, configurable: true });
  h.el('bExport').click();
  h.el('bSave').click();
  assert.deepEqual(JSON.parse(copied), lastSave(h).data);
});

test('widget DOM: messages that do not come from the embedding window are ignored', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send(load(rock()), { postMessage() {} });          // some other window
  await h.send(load(rock()), null);
  assert.equal(h.el('bSave').hidden, true);
  await h.send(load(rock()), h.host);                        // the real host
  assert.equal(h.el('bSave').hidden, false);
});

test('widget DOM: unknown or malformed host messages are ignored', { skip }, async () => {
  const h = await loadWidget(true);
  for (const m of [null, 'x', 5, [], {}, { type: 'other' }, { type: 5 }]) await h.send(m);
  assert.equal(h.el('bSave').hidden, true);
});

test('widget DOM: a load it cannot save back is refused on the widget with a message and Save stays hidden', { skip }, async () => {
  const h = await loadWidget(true);
  const d: any = rock(); d.time_signature = '5/4';
  await h.send(load(d));
  assert.equal(h.el('bSave').hidden, true);
  assert.match(h.el('loadMsg').textContent, /Could not load this note: .*supports/);
});

test('widget DOM: the save result drives the "Saved to <note>" indicator, errors are shown as errors', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send(load(rock(), 'straight rock'));
  await h.send({ type: 'forge-rhythm-save-result', ok: true, message: 'ok' });
  assert.equal(h.el('saveMsg').textContent, 'Saved to straight rock');
  assert.ok(!h.el('saveMsg').classList.contains('error'));
  await h.send({ type: 'forge-rhythm-save-result', ok: false, message: 'Not saved: the note changed on disk' });
  assert.equal(h.el('saveMsg').textContent, 'Not saved: the note changed on disk');
  assert.ok(h.el('saveMsg').classList.contains('error'));
});

test('widget DOM: the messages the widget sends are ones the plugin core recognises', { skip }, async () => {
  const h = await loadWidget(true);
  assert.equal(parseWidgetMessage(h.posted[0]).kind, 'ready');
  await h.send(load(rock()));
  h.el('bSave').click();
  assert.equal(parseWidgetMessage(lastSave(h)).kind, 'save');
});

test('widget source: only the embedding window may talk to the widget (source check) and Save is hidden by default', { skip }, () => {
  assert.match(SCRIPT, /e\.source !== h/);
  assert.match(html, /<button id="bSave" hidden/);
  assert.match(html, /id="hostBar" hidden/);
});
