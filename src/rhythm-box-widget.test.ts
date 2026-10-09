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
  ['an unsupported time signature', (d: any) => { d.time_signature = '7/8'; }, /supports/],
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
  assert.equal(h.el('confirmBar').hidden, true);
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
  // Phase 7: one row per channel IN THE NOTE (this note has only kick) — 12 cells, not 3 fixed rows of 12.
  assert.equal(h.doc.querySelectorAll('.step').length, 12);
  assert.equal(h.el('timeSig').value, '3/4');
});

test('widget DOM: loading a note replaces the single live pattern and shows it (hosted mode has ONE pattern per note — no bank selector)', { skip }, async () => {
  const h = await loadWidget(true);
  h.cell('snare', 3).click();                                       // before any load nothing is bound to a note
  await h.send(load(rock()));
  assert.equal(h.doc.querySelectorAll('.step.on').length, 2 + 2 + 8, 'the loaded pattern is what is shown; nothing of the earlier clicks survives');
  assert.ok(!h.cell('snare', 3).classList.contains('on'));
});

test('hosted: the bank buttons A-D are hidden (once hosted, before or after a load), the time-signature select stays visible', { skip }, async () => {
  const h = await loadWidget(true);
  const banks = [...h.doc.querySelectorAll('.banks button[data-bank]')];
  assert.equal(banks.length, 4);
  assert.ok(banks.every((b: any) => b.hidden === true), 'hidden before the load arrives');
  await h.send(load(rock()));
  assert.ok(banks.every((b: any) => b.hidden === true), 'and after');
  assert.equal(h.el('timeSig').hidden, false);
});

test('hosted: even a (programmatic) bank click changes nothing — the grid stays the note\'s pattern, no save, bank A stays active', { skip }, async () => {
  const h = await loadedHost();
  const before = h.doc.querySelectorAll('.step.on').length;
  for (const b of ['B', 'C', 'D']) {
    assert.equal(await savesPosted(h, () => h.doc.querySelector(`.banks button[data-bank="${b}"]`).click()), 0);
    assert.equal(h.doc.querySelectorAll('.step.on').length, before, `bank ${b}: grid unchanged`);
  }
  assert.ok(h.doc.querySelector('.banks button[data-bank="A"]').classList.contains('active'));
  await savesPosted(h, () => h.cell('kick', 1).click());
  assert.equal(lastSave(h).data.channels.kick[1], true, 'autosave writes the one pattern (bank A) — there is no bank concept to get wrong');
});

test('standalone: the bank buttons are visible and switching banks works exactly as before (the widget is also a teaching widget)', { skip }, async () => {
  const h = await loadWidget(false);
  const banks = [...h.doc.querySelectorAll('.banks button[data-bank]')];
  assert.ok(banks.every((b: any) => b.hidden !== true));
  h.cell('kick', 0).click();
  h.doc.querySelector('.banks button[data-bank="B"]').click();
  assert.equal(h.doc.querySelectorAll('.step.on').length, 0, 'bank B is its own empty pattern');
  h.cell('snare', 4).click();
  h.doc.querySelector('.banks button[data-bank="A"]').click();
  assert.ok(h.cell('kick', 0).classList.contains('on') && !h.cell('snare', 4).classList.contains('on'));
  assert.ok(h.doc.querySelector('.banks button[data-bank="A"]').classList.contains('active'));
});

test('widget DOM: before a note has been loaded, data actions post NOTHING (a hosted page must never overwrite a note it has not read)', { skip }, async () => {
  const h = await loadWidget(true);
  assert.equal(await savesPosted(h, () => h.cell('kick', 0).click()), 0);
  assert.equal(await savesPosted(h, () => h.el('bBpmUp').click()), 0);
});

test('widget DOM: after a load it refused, data actions still post nothing', { skip }, async () => {
  const h = await loadWidget(true);
  const d: any = rock(); d.time_signature = '7/8';
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

test('autosave: every pattern-data action posts exactly one save — tempo up/down, swing, and (after Continue) Random, Clear', { skip }, async () => {
  const h = await loadedHost();
  assert.equal(await savesPosted(h, () => h.el('bBpmUp').click()), 1);
  assert.equal(lastSave(h).data.tempo_bpm, 101);
  assert.equal(await savesPosted(h, () => h.el('bBpmDown').click()), 1);
  assert.equal(lastSave(h).data.tempo_bpm, 100);
  assert.equal(await savesPosted(h, () => { h.el('swing').value = '40'; fire(h, 'swing', 'input'); }), 1);
  assert.equal(lastSave(h).data.swing_pct, 40);
  // Random and Clear are data actions too, but hosted they ask first (drain 2026-10-07-0300): nothing is saved until Continue.
  h.el('bRandom').click();
  assert.equal(await savesPosted(h, () => h.el('confirmOk').click()), 1);
  h.el('bClear').click();
  assert.equal(await savesPosted(h, () => h.el('confirmOk').click()), 1);
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

test('autosave: "which actions save" is auditable — one commitChange() posts the intent, and exactly four places call it', { skip }, () => {
  const posts = [...SCRIPT.matchAll(/type: "forge-rhythm-save"/g)];
  assert.equal(posts.length, 1, 'exactly one place posts a save intent');
  assert.match(SCRIPT, /function commitChange\(\) \{[\s\S]*?type: "forge-rhythm-save"/);
  const noComments = SCRIPT.replace(/\/\/.*$/gm, '');
  const callers = [...noComments.matchAll(/commitChange\(\)/g)].length - 1;      // minus the definition
  assert.equal(callers, 4, 'cell toggle, tempo (changeBpm), swing, and the confirmed whole-pattern change (Random / Clear / time signature)');
  assert.match(noComments, /function applyWholePatternChange\(action\) \{[\s\S]*?\n    commitChange\(\);\n  \}/);
});

test('hosted time-signature change: shows the confirm bar, changes nothing and saves nothing until the user confirms', { skip }, async () => {
  const h = await loadedHost();
  assert.equal(h.el('confirmBar').hidden, true);
  const n = await savesPosted(h, () => { h.el('timeSig').value = '3/4'; fire(h, 'timeSig', 'change'); });
  assert.equal(n, 0);
  assert.equal(h.el('confirmBar').hidden, false);
  assert.match(h.el('confirmBar').textContent, /clears the pattern in the note/i);
  assert.match(h.el('confirmBar').textContent, /3\/4/);
  assert.equal(h.doc.querySelectorAll('.step').length, 48, 'the grid is untouched');
  assert.equal(h.el('timeSig').value, '4/4', 'the select shows the signature that is still in force');
  assert.equal(h.doc.querySelectorAll('.step.on').length, 12, 'the pattern is intact');
});

test('hosted time-signature change: Cancel leaves everything as it was and saves nothing', { skip }, async () => {
  const h = await loadedHost();
  h.el('timeSig').value = '3/4'; fire(h, 'timeSig', 'change');
  const n = await savesPosted(h, () => h.el('confirmCancel').click());
  assert.equal(n, 0);
  assert.equal(h.el('confirmBar').hidden, true);
  assert.equal(h.doc.querySelectorAll('.step').length, 48);
  assert.equal(h.el('timeSig').value, '4/4');
  assert.equal(h.doc.querySelectorAll('.step.on').length, 12);
});

test('hosted time-signature change: Change rebuilds the grid, clears the banks and posts exactly one save of the empty 3/4 pattern', { skip }, async () => {
  const h = await loadedHost();
  h.el('timeSig').value = '3/4'; fire(h, 'timeSig', 'change');
  const n = await savesPosted(h, () => h.el('confirmOk').click());
  assert.equal(n, 1);
  assert.equal(h.el('confirmBar').hidden, true);
  assert.equal(h.doc.querySelectorAll('.step').length, 36);
  const sent = lastSave(h).data;
  assert.equal(sent.time_signature, '3/4');
  assert.equal(sent.steps, 12);
  assert.deepEqual(sent.channels.kick, new Array(12).fill(false));
});

// ---- Random / Clear: the SAME inline confirm bar as the time-signature change (drain 2026-10-07-0300) --------------------------

const onCount = (h: Harness) => h.doc.querySelectorAll('.step.on').length;
const askRandom = (h: Harness) => h.el('bRandom').click();
const askClear = (h: Harness) => h.el('bClear').click();

test('hosted Clear: shows the confirm bar, changes nothing and posts nothing until Continue', { skip }, async () => {
  const h = await loadedHost();
  const before = onCount(h);
  assert.equal(await savesPosted(h, () => askClear(h)), 0);
  assert.equal(h.el('confirmBar').hidden, false);
  assert.match(h.el('confirmText').textContent, /Clear the pattern\?/);
  assert.match(h.el('confirmText').textContent, /note/);
  assert.equal(h.el('confirmOk').textContent, 'Continue');
  assert.equal(h.el('confirmCancel').textContent, 'Cancel');
  assert.equal(onCount(h), before, 'the grid is untouched while the question is open');
});

test('hosted Random: shows the confirm bar with its own wording, changes nothing and posts nothing until Continue', { skip }, async () => {
  const h = await loadedHost();
  const before = onCount(h);
  assert.equal(await savesPosted(h, () => askRandom(h)), 0);
  assert.equal(h.el('confirmBar').hidden, false);
  assert.match(h.el('confirmText').textContent, /Randomi[sz]e the pattern\?/);
  assert.equal(h.el('confirmOk').textContent, 'Continue');
  assert.equal(onCount(h), before);
});

test('Clear → Cancel: pattern intact, bar gone, nothing saved', { skip }, async () => {
  const h = await loadedHost();
  const before = onCount(h);
  askClear(h);
  assert.equal(await savesPosted(h, () => h.el('confirmCancel').click()), 0);
  assert.equal(h.el('confirmBar').hidden, true);
  assert.equal(onCount(h), before);
});

test('Random → Cancel: pattern intact, bar gone, nothing saved', { skip }, async () => {
  const h = await loadedHost();
  const before = [...h.doc.querySelectorAll('.step.on')].map((e: any) => e.dataset.channel + e.dataset.step).join();
  h.win.Math.random = () => 0;                                        // would make every step a hit if it were applied
  askRandom(h);
  assert.equal(await savesPosted(h, () => h.el('confirmCancel').click()), 0);
  assert.equal([...h.doc.querySelectorAll('.step.on')].map((e: any) => e.dataset.channel + e.dataset.step).join(), before);
});

test('Clear → Continue: the pattern is emptied and exactly ONE save of the empty pattern is posted', { skip }, async () => {
  const h = await loadedHost();
  askClear(h);
  assert.equal(await savesPosted(h, () => h.el('confirmOk').click()), 1);
  assert.equal(h.el('confirmBar').hidden, true);
  assert.equal(onCount(h), 0);
  assert.deepEqual(lastSave(h).data.channels, { kick: new Array(16).fill(false), snare: new Array(16).fill(false), hihat: new Array(16).fill(false) });
});

test('Random → Continue: the pattern changes and exactly ONE save with the new pattern is posted', { skip }, async () => {
  const h = await loadedHost();
  h.win.Math.random = () => 0;                                        // deterministic: every weighted step becomes a hit
  askRandom(h);
  assert.equal(await savesPosted(h, () => h.el('confirmOk').click()), 1);
  assert.equal(h.el('confirmBar').hidden, true);
  assert.notEqual(onCount(h), 12, 'the rock pattern was replaced');
  const sent = lastSave(h).data.channels;
  const shown = (ch: string) => [...Array(16).keys()].map((s) => h.cell(ch, s).classList.contains('on'));
  for (const ch of ['kick', 'snare', 'hihat']) assert.deepEqual(sent[ch].map(Boolean), shown(ch), `${ch}: saved == shown`);
});

test('only ONE confirm bar at a time: asking Clear while the Random question is open REPLACES it (and vice versa, and over the time-signature one)', { skip }, async () => {
  const h = await loadedHost();
  askRandom(h);
  askClear(h);
  assert.match(h.el('confirmText').textContent, /Clear the pattern\?/);
  assert.equal(h.doc.querySelectorAll('[role="alertdialog"]').length, 1);
  assert.equal(await savesPosted(h, () => h.el('confirmOk').click()), 1, 'Continue applies the LATEST question only');
  assert.equal(onCount(h), 0);
  const h2 = await loadedHost();
  askClear(h2);
  askRandom(h2);
  assert.match(h2.el('confirmText').textContent, /Randomi[sz]e/);
  h2.el('timeSig').value = '3/4'; fire(h2, 'timeSig', 'change');
  assert.match(h2.el('confirmText').textContent, /3\/4/);
  assert.equal(h2.doc.querySelectorAll('.step').length, 48, 'nothing applied by replacing');
});

test('any OTHER data edit made while a confirm is open dismisses it WITHOUT applying the pending action (cell, tempo, swing)', { skip }, async () => {
  for (const edit of [(h: Harness) => h.cell('snare', 0).click(), (h: Harness) => h.el('bBpmUp').click(), (h: Harness) => { h.el('swing').value = '30'; fire(h, 'swing', 'input'); }]) {
    const h = await loadedHost();
    askClear(h);
    const n = await savesPosted(h, () => edit(h));
    assert.equal(n, 1, 'the edit itself still autosaves');
    assert.equal(h.el('confirmBar').hidden, true, 'the pending question is gone');
    assert.ok(onCount(h) > 0, 'Clear was NOT applied');
  }
});

test('a dismissed confirm cannot be resurrected: clicking Continue after another edit does nothing', { skip }, async () => {
  const h = await loadedHost();
  askClear(h);
  h.cell('snare', 0).click();
  const saves0 = saves(h).length;
  h.el('confirmOk').click();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(saves(h).length, saves0);
  assert.ok(onCount(h) > 0);
});

test('standalone: Random and Clear apply IMMEDIATELY — no confirm bar, no messages posted', { skip }, async () => {
  const h = await loadWidget(false);
  h.cell('kick', 0).click();
  askClear(h);
  assert.equal(h.el('confirmBar').hidden, true);
  assert.equal(onCount(h), 0, 'cleared at once');
  h.win.Math.random = () => 0;
  askRandom(h);
  assert.equal(h.el('confirmBar').hidden, true);
  assert.ok(onCount(h) > 0, 'randomized at once');
  assert.deepEqual(h.posted, []);
});

test('hosted but NOT loaded: Random and Clear never open a confirm (nothing to protect) and never save', { skip }, async () => {
  const h = await loadWidget(true);
  assert.equal(await savesPosted(h, () => askClear(h)), 0);
  assert.equal(h.el('confirmBar').hidden, true);
  assert.equal(await savesPosted(h, () => askRandom(h)), 0);
  assert.equal(h.el('confirmBar').hidden, true);
});

test('playback actions never open a confirm, never save and do not dismiss a pending one: play, mute, solo, volume', { skip }, async () => {
  const h = await loadedHost();
  assert.equal(await savesPosted(h, () => h.el('bPlay').click()), 0);
  assert.equal(h.el('confirmBar').hidden, true);
  askClear(h);
  assert.equal(await savesPosted(h, () => { h.doc.querySelector('.mini-btn.mute').click(); h.doc.querySelector('.mini-btn.solo').click(); h.el('volume').value = '30'; fire(h, 'volume', 'input'); h.el('bPlay').click(); h.el('bPlay').click(); }), 0);
  assert.equal(h.el('confirmBar').hidden, false, 'still asking (after mute, solo, volume, play and stop)');
  assert.equal(h.el('confirmText').textContent.includes('Clear the pattern?'), true);
});

test('a fresh load from the note dismisses a pending Random/Clear question', { skip }, async () => {
  const h = await loadedHost();
  askClear(h);
  await h.send(load(rock()));
  assert.equal(h.el('confirmBar').hidden, true);
  assert.equal(onCount(h), 12);
});

test('auditable: Random and Clear no longer call commitChange() directly — only the confirmed path does', { skip }, () => {
  assert.ok(!/\$\("bRandom"\)\.addEventListener\("click", function \(\) \{[^}]*commitChange/.test(SCRIPT));
  assert.ok(!/\$\("bClear"\)\.addEventListener\("click", function \(\) \{[^}]*commitChange/.test(SCRIPT));
  assert.equal([...SCRIPT.matchAll(/type: "forge-rhythm-save"/g)].length, 1, 'still exactly one place posts a save intent');
  assert.equal([...SCRIPT.matchAll(/id="confirmBar"/g)].length + [...html.matchAll(/id="confirmBar"/g)].length >= 1, true);
  assert.equal([...html.matchAll(/id="confirmBar"/g)].length, 1, 'ONE confirm bar element, reused by every question');
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
  assert.match(html, /id="confirmBar"[^>]* hidden/);
  assert.match(html, /id="bReload" hidden/);
  assert.ok(!/window\.confirm|[^.\w]confirm\(|window\.alert|[^.\w]alert\(|window\.prompt|[^.\w]prompt\(/.test(SCRIPT), 'allow-scripts + allow-same-origin only: confirm/alert/prompt are blocked in the sandbox');
});


// ======================================================================================================================
// Beat-as-data Phase 7 (drain 2026-10-07-1700): world-rhythm vocabulary — channels bell / claves / conga_high / conga_low, meters
// 12/8, 6/8 and 5/4, one row per channel IN THE NOTE (not a fixed three), Add / Remove instrument, and five notes that must
// round-trip byte-identically.
// ======================================================================================================================

const NOTE_DIR = path.resolve(process.cwd(), '../music-theory/rhythm_data');
const FIVE = ['rhythm_pattern_tresillo', 'rhythm_pattern_hemiola', 'rhythm_pattern_bell_12_8', 'rhythm_pattern_clave_son_3_2', 'rhythm_pattern_tha_dhi_gi_na_thom'];
const haveFive = FIVE.every((n) => fs.existsSync(path.join(NOTE_DIR, n + '.md')));
const skipFive = haveFive ? false : 'the five Phase 7 notes are not in the music-theory source checkout';
const noteJson = (n: string): { data: any; block: string } => {
  const text = fs.readFileSync(path.join(NOTE_DIR, n + '.md'), 'utf-8');
  const m = /```json\n([\s\S]*?)\n```/.exec(text)!;
  return { data: JSON.parse(m[1]), block: m[1] };
};
const NEW_CHANNELS = ['bell', 'claves', 'conga_high', 'conga_low'];

test('P7 core: the widget knows exactly the engine\'s channels (parity with _RHYTHM_CHANNEL_INSTRUMENTS in the bundled lib.py)', { skip }, () => {
  const lib = fs.readFileSync(path.resolve(process.cwd(), 'assets/engine/forge/music/lib.py'), 'utf-8');
  const block = /_RHYTHM_CHANNEL_INSTRUMENTS = \{([\s\S]*?)\n\}/.exec(lib)!;
  const engine = [...block[1].matchAll(/^\s*"([a-z_]+)":/gm)].map((m) => m[1]);
  assert.ok(engine.length >= 7, `engine channels read from lib.py: ${engine}`);
  assert.deepEqual([...pureCore().CHANNELS].sort(), [...engine].sort());
});

test('P7 core: the three new meters are in the table with their step length (an eighth in the compound meters)', { skip }, () => {
  const t = pureCore().TIME_SIGNATURES;
  assert.deepEqual([t['12/8'].steps, t['12/8'].groupSize, t['12/8'].stepQl], [12, 3, 0.5]);
  assert.deepEqual([t['6/8'].steps, t['6/8'].groupSize, t['6/8'].stepQl], [6, 3, 0.5]);
  assert.deepEqual([t['5/4'].steps, t['5/4'].groupSize, t['5/4'].stepQl], [20, 4, 0.25]);
  assert.deepEqual([t['4/4'].stepQl, t['3/4'].stepQl], [0.25, 0.25]);
});

test('P7 core: playback speed follows the step length — a step in 12/8 lasts twice a sixteenth at the same quarter-note tempo', { skip }, () => {
  const w = pureCore();
  assert.equal(w.stepSeconds(120), 0.125);
  assert.equal(w.stepSeconds(120, 0.5), 0.25);
  const ev = w.advanceScheduler({ currentStep: 0, nextNoteTime: 0 }, 0, 120, 0, 1.01, 12, 0.5).events.map((e: any) => e.time);
  assert.deepEqual(ev.slice(0, 4), [0, 0.25, 0.5, 0.75]);
  const four = w.advanceScheduler({ currentStep: 0, nextNoteTime: 0 }, 0, 120, 0, 1.01, 16).events.map((e: any) => e.time);
  assert.deepEqual(four.slice(0, 3), [0, 0.125, 0.25], 'the 4/4 default is unchanged');
});

test('P7 core: parseRhythmLoad accepts every new meter and channel, keeps the NOTE\'s channel order as the row order', { skip }, () => {
  const w = pureCore();
  const r = w.parseRhythmLoad({ time_signature: '12/8', steps: 12, group_size: 3, swing_pct: 0, tempo_bpm: 120,
    channels: { bell: [true, ...new Array(11).fill(false)] } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.state.rows, ['bell']);
  const r2 = w.parseRhythmLoad({ time_signature: '5/4', steps: 20, group_size: 4, swing_pct: 0, tempo_bpm: 90,
    channels: { conga_low: new Array(20).fill(false), conga_high: [112, ...new Array(19).fill(false)] } });
  assert.deepEqual(r2.state.rows, ['conga_low', 'conga_high']);
  assert.equal(w.parseRhythmLoad({ time_signature: '6/8', steps: 6, group_size: 3, swing_pct: 0, tempo_bpm: 100, channels: { claves: new Array(6).fill(false) } }).ok, true);
});

test('P7 core: a meter with the wrong grid, an unknown channel and an empty channel set are still refused', { skip }, () => {
  const w = pureCore();
  assert.equal(w.parseRhythmLoad({ time_signature: '12/8', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 120, channels: { bell: new Array(16).fill(false) } }).ok, false);
  assert.equal(w.parseRhythmLoad({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 120, channels: { cowbell: new Array(16).fill(false) } }).ok, false);
  assert.equal(w.parseRhythmLoad({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 120, channels: {} }).ok, false);
});

test('P7 core: buildRhythmData writes exactly the rows given, in that order (default: kick, snare, hihat as before)', { skip }, () => {
  const w = pureCore();
  const pattern = w.emptyPattern(12);
  pattern.bell[0] = true;
  const d = w.buildRhythmData('12/8', 0, 120, pattern, ['bell']);
  assert.deepEqual(Object.keys(d.channels), ['bell']);
  assert.equal(d.steps, 12);
  assert.equal(d.group_size, 3);
  assert.deepEqual(Object.keys(w.buildRhythmData('4/4', 0, 100, w.emptyPattern(16)).channels), ['kick', 'snare', 'hihat']);
});

test('P7 core: randomizePattern fills only the rows asked for and consumes the rng in row order', { skip }, () => {
  const w = pureCore();
  const p = w.randomizePattern(() => 0, 16, 4, ['claves']);
  assert.ok(p.claves.some(Boolean));
  assert.ok(!p.kick.some(Boolean) && !p.bell.some(Boolean));
  const q = w.randomizePattern(() => 0.5, 16, 4);               // default rows: unchanged behaviour
  assert.ok(Array.isArray(q.kick) && Array.isArray(q.hihat));
});

test('P7 round trip: every one of the five notes loads and re-serialises BYTE-IDENTICALLY (the json block, as the plugin would write it)', { skip: skipFive }, () => {
  const w = pureCore();
  for (const n of FIVE) {
    const { data, block } = noteJson(n);
    const r = w.parseRhythmLoad(data);
    assert.equal(r.ok, true, `${n}: ${r.message}`);
    const out = w.buildRhythmData(r.state.timeSig, r.state.swingPct, r.state.bpm, r.state.pattern, r.state.rows);
    assert.equal(w.rhythmDataJson(out), block, n);
    assert.equal(formatRhythmJson(out), block, `${n} (plugin formatter)`);
  }
});

test('P7 DOM: hosted, the grid shows ONE ROW PER CHANNEL IN THE NOTE, in the note\'s order — a bell note shows only the Bell row', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send(load({ time_signature: '12/8', steps: 12, group_size: 3, swing_pct: 0, tempo_bpm: 120, channels: { bell: [true, false, true, false, true, true, false, true, false, true, false, true] } }, 'bell'));
  const rowsShown = [...h.doc.querySelectorAll('.channel-row .name')].map((e: any) => e.textContent);
  assert.deepEqual(rowsShown, ['Bell']);
  assert.equal(h.doc.querySelectorAll('.step').length, 12);
  assert.equal(h.doc.querySelectorAll('.step.beat-start').length, 4, '12/8: four groups of three');
  assert.equal(h.el('timeSig').value, '12/8');
});

test('P7 DOM: a two-channel note in a different order keeps that order, and standalone keeps the default three rows', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send(load({ time_signature: '5/4', steps: 20, group_size: 4, swing_pct: 0, tempo_bpm: 90,
    channels: { conga_low: new Array(20).fill(false), conga_high: [112, ...new Array(19).fill(false)] } }));
  assert.deepEqual([...h.doc.querySelectorAll('.channel-row .name')].map((e: any) => e.textContent), ['Low Conga', 'High Conga']);
  assert.equal(h.doc.querySelectorAll('.step.beat-start').length, 10, '5/4: five groups of four, in each of the two rows');
  const s = await loadWidget(false);
  assert.deepEqual([...s.doc.querySelectorAll('.channel-row .name')].map((e: any) => e.textContent), ['Kick', 'Snare', 'Hi-hat']);
});

test('P7 DOM: the time-signature menu offers 12/8, 6/8 and 5/4; standalone switching to 12/8 rebuilds a 12-step grid in four groups', { skip }, async () => {
  const h = await loadWidget(false);
  const opts = [...h.doc.querySelectorAll('#timeSig option')].map((o: any) => o.value);
  assert.deepEqual(opts, ['4/4', '3/4', '12/8', '6/8', '5/4']);
  h.el('timeSig').value = '12/8'; fire(h, 'timeSig', 'change');
  assert.equal(h.doc.querySelectorAll('.step').length, 36);
  assert.equal(h.doc.querySelectorAll('.step.beat-start').length, 12);
});

test('P7 DOM: hosted time-signature change to 12/8 still goes through the confirm bar and saves 12 steps in groups of 3', { skip }, async () => {
  const h = await loadedHost();
  h.el('timeSig').value = '12/8'; fire(h, 'timeSig', 'change');
  assert.equal(h.el('confirmBar').hidden, false);
  assert.equal(await savesPosted(h, () => h.el('confirmOk').click()), 1);
  const sent = lastSave(h).data;
  assert.deepEqual([sent.time_signature, sent.steps, sent.group_size], ['12/8', 12, 3]);
  assert.deepEqual(Object.keys(sent.channels), ['kick', 'snare', 'hihat'], 'the rows are kept');
});

test('P7 DOM: "Add instrument" lists the channels not shown; choosing one adds its row and hosted posts exactly ONE save containing it', { skip }, async () => {
  const h = await loadedHost();
  const options = [...h.doc.querySelectorAll('#addInstrument option')].map((o: any) => o.value).filter(Boolean);
  assert.deepEqual(options, NEW_CHANNELS);
  const n = await savesPosted(h, () => { h.el('addInstrument').value = 'claves'; fire(h, 'addInstrument', 'change'); });
  assert.equal(n, 1);
  assert.deepEqual(Object.keys(lastSave(h).data.channels), ['kick', 'snare', 'hihat', 'claves']);
  assert.deepEqual(lastSave(h).data.channels.claves, new Array(16).fill(false));
  assert.deepEqual([...h.doc.querySelectorAll('#addInstrument option')].map((o: any) => o.value).filter(Boolean), ['bell', 'conga_high', 'conga_low']);
  assert.ok(h.cell('claves', 3), 'the new row has cells');
  h.cell('claves', 3).click();
  assert.equal(lastSave(h).data.channels.claves[3], true);
});

test('P7 DOM: standalone "Add instrument" adds the row and posts nothing', { skip }, async () => {
  const h = await loadWidget(false);
  h.el('addInstrument').value = 'bell'; fire(h, 'addInstrument', 'change');
  assert.deepEqual([...h.doc.querySelectorAll('.channel-row .name')].map((e: any) => e.textContent), ['Kick', 'Snare', 'Hi-hat', 'Bell']);
  assert.deepEqual(h.posted, []);
});

test('P7 DOM: removing an EMPTY row is immediate and autosaves once; removing a row WITH hits asks first (confirm bar), saves nothing until Remove', { skip }, async () => {
  const h = await loadedHost();
  h.el('addInstrument').value = 'bell'; fire(h, 'addInstrument', 'change');
  const removeBtn = (ch: string) => h.doc.querySelector(`.channel-row [data-remove="${ch}"]`);
  assert.equal(await savesPosted(h, () => removeBtn('bell').click()), 1, 'empty row: immediate');
  assert.deepEqual(Object.keys(lastSave(h).data.channels), ['kick', 'snare', 'hihat']);
  // a row with hits
  assert.equal(await savesPosted(h, () => removeBtn('snare').click()), 0);
  assert.equal(h.el('confirmBar').hidden, false);
  assert.match(h.el('confirmText').textContent, /Snare/);
  assert.equal(h.doc.querySelectorAll('.channel-row').length, 3, 'still there');
  assert.equal(await savesPosted(h, () => h.el('confirmCancel').click()), 0);
  assert.equal(h.doc.querySelectorAll('.channel-row').length, 3);
  removeBtn('snare').click();
  assert.equal(await savesPosted(h, () => h.el('confirmOk').click()), 1);
  assert.deepEqual(Object.keys(lastSave(h).data.channels), ['kick', 'hihat']);
});

test('P7 DOM: the last row cannot be removed (the note would have no channels)', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send(load({ time_signature: '12/8', steps: 12, group_size: 3, swing_pct: 0, tempo_bpm: 120, channels: { bell: new Array(12).fill(false) } }));
  const btn: any = h.doc.querySelector('.channel-row [data-remove="bell"]');
  assert.equal(btn.disabled, true);
  assert.equal(await savesPosted(h, () => btn.click()), 0);
  assert.equal(h.doc.querySelectorAll('.channel-row').length, 1);
  // defence in depth: even with the button force-enabled, the guard in the code refuses
  btn.disabled = false;
  assert.equal(await savesPosted(h, () => btn.click()), 0);
  assert.equal(h.doc.querySelectorAll('.channel-row').length, 1);
  assert.equal(h.el('confirmBar').hidden, true);
});

test('P7 DOM: each of the five notes, loaded and saved with no net edit, posts the SAME data (byte-identical json)', { skip: skipFive }, async () => {
  for (const n of FIVE) {
    const { data, block } = noteJson(n);
    const h = await loadWidget(true);
    await h.send(load(data, n));
    const ch = Object.keys(data.channels)[0];
    h.cell(ch, 1).click(); h.cell(ch, 1).click();                     // an edit and its undo: a save is posted with the original data
    const sent = lastSave(h).data;
    assert.deepEqual(sent, data, n);
    assert.equal(pureCore().rhythmDataJson(sent), block, n);
  }
});

test('P7 DOM: accents (velocity >= 100) on the new channels keep the double ring; velocities survive', { skip }, async () => {
  const h = await loadWidget(true);
  const d = { time_signature: '5/4', steps: 20, group_size: 4, swing_pct: 0, tempo_bpm: 90,
    channels: { conga_high: [112, false, false, false, 80, ...new Array(15).fill(false)], conga_low: new Array(20).fill(false) } };
  await h.send(load(d));
  assert.ok(h.cell('conga_high', 0).classList.contains('accent'));
  assert.ok(!h.cell('conga_high', 4).classList.contains('accent'));
  assert.ok(h.cell('conga_high', 4).classList.contains('on'));
});

// ---- sounds: the four new voices exist and are recognisably different from each other and from the old three ------------------

function fakeAudio(win: any) {
  const log: Array<{ kind: string; type?: string; freq?: number; t?: number }> = [];
  const param = () => ({ value: 0, setValueAtTime(v: number) { this.value = v; }, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  const node = (kind: string, extra: any = {}) => ({ connect() {}, disconnect() {}, start(t?: number) { log.push({ kind, type: (this as any).type, freq: (this as any).frequency?.value, t }); }, stop() {}, ...extra });
  class FakeCtx {
    currentTime = 0; sampleRate = 8000; state = 'running'; destination = {};
    constructor() { win.__ctx = this; }
    resume() {}
    createGain() { return { gain: param(), connect() {}, disconnect() {} }; }
    createOscillator() { const o: any = node('osc', { frequency: param(), type: 'sine' }); return o; }
    createBiquadFilter() { return { type: 'lowpass', frequency: param(), Q: param(), gain: param(), connect() {}, disconnect() {} }; }
    createBufferSource() { return node('noise', { buffer: null }); }
    createBuffer(_c: number, n: number) { return { getChannelData: () => new Float32Array(n) }; }
  }
  win.AudioContext = FakeCtx;
  return log;
}

async function soundOf(channel: string, steps = 16, group = 4, ts = '4/4') {
  const h = await loadWidget(true);
  const log = fakeAudio(h.win);
  await h.send(load({ time_signature: ts, steps, group_size: group, swing_pct: 0, tempo_bpm: 120, channels: { [channel]: [true, ...new Array(steps - 1).fill(false)] } }));
  h.el('bPlay').click();
  h.el('bPlay').click();
  return JSON.stringify(log.map((l) => [l.kind, l.type, l.freq]));
}

test('P7 sounds: every channel makes sound, and no two channels make the same sound', { skip }, async () => {
  const all = ['kick', 'snare', 'hihat', ...NEW_CHANNELS];
  const sounds: Record<string, string> = {};
  for (const ch of all) {
    sounds[ch] = await soundOf(ch);
    assert.notEqual(sounds[ch], '[]', `${ch} produced no audio nodes`);
  }
  assert.equal(new Set(Object.values(sounds)).size, all.length, JSON.stringify(sounds));
});

test('P7 sounds: the widget\'s voice table names all seven channels (source pin)', { skip }, () => {
  assert.match(SCRIPT, /var VOICE = \{ kick: playKick, snare: playSnare, hihat: playHihat, bell: playBell, claves: playClaves, conga_high: playCongaHigh, conga_low: playCongaLow \};/);
});

test('P7 playback: scheduleStep plays only the rows shown (a removed row is silent)', { skip }, () => {
  assert.match(SCRIPT, /function scheduleStep\(step, time\) \{[\s\S]*?rows\.forEach\(function \(ch\) \{/);
});

test('P7 playback speed: in 12/8 at 120 BPM a step lasts 0.25 s (an eighth), in 4/4 0.125 s (a sixteenth) — through the real scheduler wiring', { skip }, async () => {
  async function stepGap(ts: string, steps: number, group: number): Promise<number> {
    const h = await loadWidget(true);
    const log = fakeAudio(h.win);
    await h.send(load({ time_signature: ts, steps, group_size: group, swing_pct: 0, tempo_bpm: 120, channels: { claves: new Array(steps).fill(true) } }));
    h.el('bPlay').click();                       // schedules step 0 at 0.05 s
    (h.win as any).__ctx.currentTime = 0.4;      // the scheduler's next tick looks 0.1 s ahead of this
    await new Promise((r) => setTimeout(r, 90));
    h.el('bPlay').click();
    const times = [...new Set(log.filter((l) => l.kind === 'osc').map((l) => Math.round((l.t ?? 0) * 1000) / 1000))].sort((a, b) => a - b);
    assert.ok(times.length >= 2, `${ts}: at least two steps scheduled, got ${JSON.stringify(times)}`);
    return Math.round((times[1] - times[0]) * 1000) / 1000;
  }
  assert.equal(await stepGap('12/8', 12, 3), 0.25);
  assert.equal(await stepGap('4/4', 16, 4), 0.125);
});
