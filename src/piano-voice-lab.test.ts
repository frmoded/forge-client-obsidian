// 2026-11-16-1001 - the piano's decay was too slow (a note rang 14 to 29 s) and the voice is now ONE TABLE (PIANO_PARAMS, with ranges) that `pianoVoice` also takes as its last argument; piano_voice_lab.html lets a person choose by ear with the same code.
// Here: the time a note takes to fall 40 and 60 dB per register (the table says it exactly: a time constant t is down 40 dB after t*ln(100) and 60 dB after t*ln(1000)), what the old voice took, the release, every number of the table doing its job on the graph
// of a note, no node scheduled before `when` for any preset, the block IDENTICAL in every gadget of the vault that has one (found by walking the vault, so a new gadget is held too), and the lab itself in a DOM: presets, the two settings, the keys, the
// A/B buttons, the sliders, "copy these settings" (the text it prints is a table that reads back). The audible claims are measured on a real OfflineAudioContext in Chrome: scripts/dev/measure-piano-lab.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { Window } from 'happy-dom';

const ROOT = path.resolve(import.meta.dirname, '..');
const VAULT = path.join(ROOT, 'assets/vaults/music-theory');
const LAB = path.join(VAULT, 'music_instruments/resources/html/piano_voice_lab.html');
const labHtml = fs.readFileSync(LAB, 'utf8');
const BEGIN = '// ==== piano voice BEGIN', END = '// ==== piano voice END';
const blockOf = (h: string): string => { const a = h.indexOf(BEGIN), b = h.indexOf(END); assert.ok(a > 0 && b > a, 'the block is there'); return h.slice(a, h.indexOf('\n', b)); };
const presetsOf = (h: string): string => { const a = h.indexOf('// ==== piano voice presets BEGIN'), b = h.indexOf('// ==== piano voice presets END'); assert.ok(a > 0 && b > a); return h.slice(a, h.indexOf('\n', b)); };
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];

function voice(): any {
  const mod: { exports: any } = { exports: {} };
  vm.runInNewContext(`${blockOf(labHtml)}\n${presetsOf(labHtml)}\nmodule.exports = { PIANO_PARAMS, PIANO_RANGES, PIANO_PRESETS, pianoParams, pianoDecay, pianoDecayBase, pianoCutoff, pianoPartialAmp, pianoVoice, pianoMidi, pianoPartialHz, pianoB, pianoBus };`, { module: mod, Math, Float32Array, isFinite });
  return mod.exports;
}
interface Call { fn: string; v: number; t: number; tau?: number }
function recorder() {
  const nodes: any[] = [];
  const param = (): any => { const p: any = { value: 0, calls: [] as Call[] }; for (const fn of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime']) p[fn] = (v: number, t: number, tau?: number) => { p.calls.push({ fn, v, t, tau }); }; return p; };
  const mk = (kind: string): any => { const n: any = { kind, frequency: param(), gain: param(), Q: param(), starts: [] as number[], stops: [] as number[], connect() {} }; n.start = (t: number) => n.starts.push(t); n.stop = (t: number) => n.stops.push(t); nodes.push(n); return n; };
  const ctx: any = { sampleRate: 44100, destination: {}, createOscillator: () => mk('oscillator'), createGain: () => mk('gain'), createBiquadFilter: () => mk('biquad'), createBufferSource: () => mk('bufferSource'), createDynamicsCompressor: () => mk('compressor'),
    createBuffer: (_c: number, n: number) => ({ length: n, getChannelData: () => new Float32Array(n) }) };
  return { ctx, nodes, of: (k: string) => nodes.filter((n) => n.kind === k) };
}
const F = 261.6256;
const g = voice();
const plain = (x: unknown): any => JSON.parse(JSON.stringify(x));          // objects made inside the sandbox have the sandbox's prototypes: compare what they say, not what they are
const T40 = (t: number): number => t * Math.log(100), T60 = (t: number): number => t * Math.log(1000);

test('HOW LONG A NOTE RINGS, per register: the fundamental is down 40 dB (mostly gone) in 1 to 4 s from C2 to C7, lower notes ring longer, C2 is down 60 dB in under 6 s; the old voice took 19 s (C2), 14 s (C4), 9 s (C6) to fall 40 dB', () => {
  const rows: Record<string, { m: number; t40: number; t60: number }> = {};
  for (const [name, m] of [['C2', 36], ['C3', 48], ['C4', 60], ['C5', 72], ['C6', 84], ['C7', 96]] as const) rows[name] = { m, t40: T40(g.pianoDecayBase(m, g.PIANO_PARAMS)), t60: T60(g.pianoDecayBase(m, g.PIANO_PARAMS)) };
  for (const [name, r] of Object.entries(rows)) assert.ok(r.t40 >= 1 && r.t40 <= 4, `${name} is down 40 dB in ${r.t40.toFixed(2)} s`);
  assert.ok(rows.C2.t60 < 6, `C2 down 60 dB in ${rows.C2.t60.toFixed(2)} s`);
  const order = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'].map((n) => rows[n].t40);
  for (let i = 1; i < order.length; i++) assert.ok(order[i] < order[i - 1], 'strictly shorter every octave up');
  const old = g.PIANO_PRESETS[0].params;                                                                            // the voice before: what it took, read from its own preset
  assert.deepEqual([36, 60, 84].map((m) => Math.round(T40(g.pianoDecayBase(m, old)))), [19, 14, 9]);
  assert.deepEqual([36, 60, 84].map((m) => Math.round(T60(g.pianoDecayBase(m, old)))), [29, 22, 14]);
  assert.ok(rows.C4.t40 < T40(g.pianoDecayBase(60, old)) / 4, 'at least four times shorter in the middle');
});
test('the OLD voice is a preset: its decay is exactly the old formula (a time constant of clamp(4.2 - 0.045 (m - 36), 0.7, 4.2) / (1 + 0.8 (n - 1))) on every key of a piano, so the comparison in the lab is honest', () => {
  const old = g.PIANO_PRESETS[0].params;
  for (let m = 21; m <= 108; m++) for (let n = 1; n <= 10; n++) {
    const was = Math.min(4.2, Math.max(0.7, 4.2 - 0.045 * (m - 36))) / (1 + 0.8 * (n - 1));
    assert.ok(Math.abs(g.pianoDecay(m, n, old) - was) < 1e-9, `m=${m} n=${n}: ${g.pianoDecay(m, n, old)} vs ${was}`);
  }
  assert.equal(g.pianoCutoff(60, 0.8, old), g.pianoCutoff(60, 0.8, undefined), 'brightness 1 is the cutoff the voice always had');
});
test('THE RELEASE: with the table the note is down 60 dB within 150 ms of its end, the gain is exactly 0 after, and no oscillator stops while it is audible; a longer release setting is a longer fade', () => {
  for (const release of [undefined, 0.01, 0.08, 0.2, 0.4]) {
    const r = recorder(); g.pianoVoice(r.ctx, {}, F, 1.0, 1.0, 0.8, 1, release === undefined ? undefined : { release });
    const out = r.of('gain')[0].gain.calls as Call[]; const tau = out.find((c) => c.fn === 'setTargetAtTime')!.tau!;
    const rel = release === undefined ? g.PIANO_PARAMS.release : release; assert.ok(Math.abs(tau - rel / 4) < 1e-12, `tau for release ${rel}`);
    const zero = out.filter((c) => c.fn === 'setValueAtTime').at(-1)!;
    assert.equal(zero.v, 0); assert.ok(Math.exp(-(zero.t - 2.0) / tau) < 1e-4, `${(zero.t - 2.0).toFixed(3)} s after the end the fade is below -80 dB (release ${rel})`);
    for (const o of r.of('oscillator')) assert.ok(o.stops[0] >= zero.t, 'no oscillator stops before the gain is exactly 0');
    if (release === undefined) assert.ok(Math.exp(-0.15 / tau) < 0.001, 'down 60 dB within 150 ms');
  }
});
test('EVERY NUMBER OF THE TABLE DOES ITS JOB on the graph of a note: decay (per register), partialDecay, brightness, hammer, attack, detune, body and release; nothing else moves', () => {
  const note = (over: object, midi = 60) => { const r = recorder(); g.pianoVoice(r.ctx, {}, 440 * Math.pow(2, (midi - 69) / 12), 0, 1, 0.8, 1, over); return r; };
  const taus = (r: ReturnType<typeof recorder>) => r.of('oscillator').slice(0, 10).map((o, i) => ((r.nodes[r.nodes.indexOf(o)] as any), 0)).length;       // (kept simple: partial gains are read below)
  void taus;
  const partialTaus = (r: ReturnType<typeof recorder>) => r.nodes.filter((n) => n.kind === 'gain' && n.gain.calls.some((c: Call) => c.fn === 'setTargetAtTime' && (c.tau as number) > 0.004 && c.v === 0 && n.gain.calls[0].v < 0.2 && n.gain.calls.length === 2)).map((n) => (n.gain.calls.find((c: Call) => c.fn === 'setTargetAtTime') as Call).tau as number);
  const base = note({});
  assert.equal(partialTaus(base).length, 20);
  assert.ok(Math.abs(partialTaus(base)[0] - g.pianoDecay(60, 1)) < 1e-12 && Math.abs(partialTaus(base)[0] - g.PIANO_PARAMS.decayMid) < 1e-12, 'middle C: decayMid');
  for (const [m, key, v] of [[36, 'decayLow', 1.7], [60, 'decayMid', 1.1], [84, 'decayHigh', 0.9]] as const) assert.ok(Math.abs(partialTaus(note({ [key]: v }, m))[0] - v) < 1e-12, `${key} is the time constant at its register`);
  assert.ok(Math.abs(partialTaus(note({ decayLow: 1.7 }, 60))[0] - g.PIANO_PARAMS.decayMid) < 1e-12, 'decayLow does not touch middle C');
  const pd = partialTaus(note({ partialDecay: 0 })); assert.ok(pd.slice(0, 10).every((t) => Math.abs(t - g.PIANO_PARAMS.decayMid) < 1e-12), 'partialDecay 0: all partials ring alike');
  const cut = (r: ReturnType<typeof recorder>) => (r.of('biquad')[0].frequency.value as number);
  assert.ok(cut(note({ brightness: 2 })) > cut(note({})) && cut(note({ brightness: 0.5 })) < cut(note({})), 'brightness moves the cutoff');
  const hammer = (r: ReturnType<typeof recorder>) => { const ng = r.of('gain').at(-1)!; return ng.gain.calls[0].v as number; };
  assert.ok(Math.abs(hammer(note({ hammer: 2 })) - 2 * hammer(note({}))) < 1e-12 && hammer(note({ hammer: 0 })) === 0, 'hammer scales the knock');
  const ramp = (r: ReturnType<typeof recorder>) => (r.of('gain')[0].gain.calls as Call[]).find((c) => c.fn === 'linearRampToValueAtTime')!.t;
  assert.ok(Math.abs(ramp(note({ attack: 0.02 })) - 0.02) < 1e-12 && Math.abs(ramp(note({})) - 0.004) < 1e-12, 'attack is the ramp');
  const second = (r: ReturnType<typeof recorder>) => r.of('oscillator')[10].frequency.value as number;
  assert.ok(Math.abs(second(note({ detune: 10 })) / second(note({ detune: 0 })) - Math.pow(2, 10 / 1200)) < 1e-9, 'detune: string 2 is that many cents sharp');
  assert.ok(Math.abs(second(note({ detune: 0 })) - base.of('oscillator')[0].frequency.value) < 1e-9, 'detune 0: both strings alike');
  const amps = (r: ReturnType<typeof recorder>) => r.nodes.filter((n) => n.kind === 'gain' && n.gain.calls.length === 2 && n.gain.calls[0].fn === 'setValueAtTime' && n.gain.calls[1].fn === 'setTargetAtTime' && (n.gain.calls[1].tau as number) > 0.004).slice(0, 10).map((n) => n.gain.calls[0].v as number);
  assert.ok(amps(note({ body: 2 }))[0] / amps(note({ body: 2 }))[9] > amps(note({ body: 0.5 }))[0] / amps(note({ body: 0.5 }))[9], 'a higher body falls off faster toward the upper partials');
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0); assert.ok(Math.abs(sum(amps(note({ body: 2 }))) * 2 - 1) < 1e-9, 'the partial amplitudes of both strings still sum to 1 (the note gain alone sets the level)');
  assert.equal(note({}).of('oscillator').length, 20);
});
test('pianoParams: the table with a setting laid on it, every number inside its range, a missing or non-number value is the table\'s own; the setting given is never changed', () => {
  assert.deepEqual(plain(g.pianoParams(undefined)), plain(g.PIANO_PARAMS)); assert.deepEqual(plain(g.pianoParams({})), plain(g.PIANO_PARAMS)); assert.deepEqual(plain(g.pianoParams(null)), plain(g.PIANO_PARAMS));
  const wild = { decayLow: 99, decayMid: -5, decayHigh: NaN, partialDecay: 'x', brightness: Infinity, hammer: 1e9, attack: -1, detune: 500, body: 0, release: 100, extra: 5 };
  const frozen = JSON.stringify(wild); const out = g.pianoParams(wild); assert.equal(JSON.stringify(wild), frozen, 'not changed');
  for (const k of Object.keys(g.PIANO_RANGES)) { const [lo, hi] = g.PIANO_RANGES[k]; assert.ok(out[k] >= lo && out[k] <= hi, `${k}=${out[k]} in ${lo}..${hi}`); }
  assert.deepEqual([out.decayLow, out.decayMid, out.partialDecay, out.brightness, out.hammer, out.attack], [6, 0.1, g.PIANO_PARAMS.partialDecay, g.PIANO_PARAMS.brightness, 3, 0.001], 'too big = the top of the range, too small = the bottom, not a finite number = the table\'s own (an Infinity and a string included)');
  assert.equal(out.extra, undefined);
  assert.deepEqual(plain(Object.keys(g.PIANO_PARAMS)), plain(Object.keys(g.PIANO_RANGES)), 'one range for every number');
  for (const k of Object.keys(g.PIANO_PARAMS)) { const [lo, hi] = g.PIANO_RANGES[k]; assert.ok(g.PIANO_PARAMS[k] >= lo && g.PIANO_PARAMS[k] <= hi, `the table's ${k} is in its range`); }
});
test('PRESETS: six, each named and in range (clamping changes nothing), all different from one another; "Old voice" is first, "Shorter (the new voice)" is EXACTLY the table the gadgets ship, so shipping another one is one edit', () => {
  const P = plain(g.PIANO_PRESETS), table = plain(g.PIANO_PARAMS); assert.equal(P.length, 6);
  assert.deepEqual(P.map((p: any) => p.name), ['Old voice (long)', 'Shorter (the new voice)', 'Brighter', 'Mellow', 'Dry and short', 'Honky-tonk']);
  for (const p of P) { assert.deepEqual(Object.keys(p.params), Object.keys(table), p.name); assert.deepEqual(plain(g.pianoParams(p.params)), p.params, `${p.name} is in range`); assert.ok(p.note.length > 10, `${p.name} says what it is`); }
  assert.deepEqual(P[1].params, table);
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) assert.notDeepEqual(P[i].params, P[j].params, `${P[i].name} vs ${P[j].name}`);
  const t40 = (p: any, m: number) => T40(g.pianoDecayBase(m, p.params));
  assert.ok(P.slice(1).every((p: any) => t40(p, 36) < 5), 'every preset but the old one is mostly gone in under 5 s at C2');
});
test('SCHEDULING with every preset: nothing starts, stops or is automated before `when`, the note outlasts its release, and a preset that is clamped plays the same as the clamped table', () => {
  for (const p of g.PIANO_PRESETS) for (const when of [0, 2.5]) for (const len of [0.05, 1]) {
    const r = recorder(); g.pianoVoice(r.ctx, {}, F, when, len, 0.8, 1, p.params);
    for (const n of r.nodes) { for (const t of [...n.starts, ...n.stops]) assert.ok(t >= when, `${p.name}: ${n.kind} ${t} < ${when}`); for (const q of [n.gain, n.frequency]) for (const c of q.calls) assert.ok(c.t >= when, `${p.name}: automation ${c.t} < ${when}`); }
    for (const o of r.of('oscillator')) assert.ok(o.stops[0] > when + Math.max(0.05, len), `${p.name}: outlasts the note`);
  }
});

// ---- the block is the same in EVERY gadget of the vault that has one -----------------------------------------------------------------------------------------------------------
function walk(dir: string): string[] { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.html') ? [path.join(dir, e.name)] : [])); }
test('THE BLOCK IS IDENTICAL IN EVERY GADGET THAT HAS ONE (the vault is walked, so a gadget added later is held to it): 26 gadgets, the lab among them', () => {
  const have = walk(VAULT).filter((f) => fs.readFileSync(f, 'utf8').includes(BEGIN));
  const want = blockOf(labHtml);
  assert.ok(want.length > 5000, 'non-vacuity: the whole block');
  assert.ok(have.length >= 26, `${have.length} gadgets carry the piano voice`);
  assert.ok(have.some((f) => f === LAB), 'the lab is one of them');
  for (const f of have) assert.equal(blockOf(fs.readFileSync(f, 'utf8')), want, `${path.relative(VAULT, f)} differs from the lab`);
  assert.doesNotMatch(want, /document|window/, 'the block is pure: no DOM');
  assert.doesNotMatch(labHtml, /https?:\/\/(?!localhost)[^\s"')]*\.(js|css)|<script[^>]*src=|<link[^>]*href=/i, 'the lab loads nothing from the network or from another file');
});
test('the lab is on no page: no note of the vault embeds it', () => {
  const notes = (function w(d: string): string[] { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === '.obsidian' ? [] : w(path.join(d, e.name))) : e.name.endsWith('.md') ? [path.join(d, e.name)] : [])); })(VAULT);
  for (const n of notes) assert.ok(!fs.readFileSync(n, 'utf8').includes('piano_voice_lab'), `${path.relative(VAULT, n)} mentions the lab`);
});

// ---- the lab, in a DOM ----------------------------------------------------------------------------------------------------------------------------------------------------------------
function lab() {
  const log = { taus: [] as number[], starts: [] as number[], cutoffs: [] as number[] }; const errors: string[] = []; let copied = '';
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime(_v: number, _t: number, tau: number) { log.taus.push(tau); } });
  class Ctx {
    currentTime = 0; sampleRate = 44100; state = 'running'; destination = {};
    resume() {}
    createGain() { return { gain: param(), connect() {} }; }
    createBiquadFilter() { return { type: '', frequency: { set value(v: number) { log.cutoffs.push(v); } }, Q: param(), connect() {} }; }
    createOscillator() { const o: any = { type: '', frequency: { value: 0 }, connect() {}, start(t: number) { log.starts.push(t); }, stop() {} }; return o; }
    createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {} }; }
    createBuffer(_c: number, n: number) { return { length: n, getChannelData: () => new Float32Array(n) }; }
    createDynamicsCompressor() { return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect() {} }; }
  }
  const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
  win.AudioContext = Ctx; win.Float32Array = Float32Array;
  Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: async (t: string) => { copied = t; } }, configurable: true });
  const s = scriptOf(labHtml); win.document.write(labHtml.replace(`<script>${s}</script>`, '')); win.eval(s);
  const doc = win.document;
  const q = (sel: string): any => doc.querySelector(sel);
  const click = (sel: string | any) => (typeof sel === 'string' ? q(sel) : sel).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const press = (el: any) => el.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true }));
  const mark = () => { log.taus.length = 0; log.starts.length = 0; log.cutoffs.length = 0; };
  return { win, doc, q, click, press, log, errors, mark, copied: () => copied };
}
test('THE LAB OPENS: six presets, two settings that start as the old and the new voice, ten sliders each with its range and a plain label, 25 keys C3 to C5, no error', () => {
  const l = lab();
  assert.equal(l.doc.querySelectorAll('#presets button').length, 6);
  assert.match(l.q('#nameA').textContent, /^Old voice \(long\)$/); assert.match(l.q('#nameB').textContent, /^Shorter \(the new voice\)$/);
  const sl = [...l.doc.querySelectorAll('#sliders input[type=range]')] as any[]; assert.equal(sl.length, 10);
  for (const s of sl) { const k = s.id.replace(/^s_/, ''); assert.equal(+s.min, g.PIANO_RANGES[k][0], k); assert.equal(+s.max, g.PIANO_RANGES[k][1], k); assert.ok(l.q(`label[for="${s.id}"]`).textContent.length >= 4, k); }
  assert.equal(l.doc.querySelectorAll('.key').length, 25); assert.equal(l.doc.querySelectorAll('.key.black').length, 10);
  assert.equal(l.q('.key').getAttribute('aria-label'), 'C 3'); assert.equal(l.q('.key[data-midi="72"]').getAttribute('aria-label'), 'C 5');
  assert.equal(l.errors.length, 0); assert.match(l.q('#sum').textContent, /^Down 40 dB after: low C 19\.3 s, middle C 14\.4 s, high C 9\.4 s/);       // slot A is the old voice
});
test('PLAY A / PLAY B / A THEN B: each plays the real voice with ITS setting (the time constant of the partials and the release tell which), the chord is 3 notes, A then B is A, a pause, then B', () => {
  const l = lab();
  l.click('#playA'); assert.equal(l.log.starts.length, 20); assert.ok(l.log.taus.includes(g.PIANO_PRESETS[0].params.decayMid) && l.log.taus.includes(0.02 / 4), 'A is the old voice');
  l.mark(); l.click('#playB'); assert.equal(l.log.starts.length, 20); assert.ok(l.log.taus.includes(g.PIANO_PARAMS.decayMid) && l.log.taus.includes(0.08 / 4) && !l.log.taus.includes(3.12), 'B is the new voice');
  l.mark(); l.click('#playAB'); assert.equal(l.log.starts.length, 40);
  const first = l.log.starts.slice(0, 20), second = l.log.starts.slice(20); assert.ok(Math.min(...second) - Math.max(...first) >= 0.6 - 1e-9, 'a pause between A and B');
  l.mark(); const sel = l.q('#what'); sel.selectedIndex = 3; sel.dispatchEvent(new l.win.Event('change')); l.click('#playB'); assert.equal(l.log.starts.length, 60, 'C major chord: three notes of 20 oscillators');
  assert.equal(l.errors.length, 0);
});
test('THE KEYS play through the setting the switch names (B at first), the switch flips it, and a key plays one note of 20 oscillators at its pitch', () => {
  const l = lab();
  l.press(l.q('.key[data-midi="60"]')); assert.equal(l.log.starts.length, 20); assert.ok(l.log.taus.includes(g.PIANO_PARAMS.decayMid), 'B');
  l.mark(); l.click('#flip'); assert.equal(l.q('#flipName').textContent, 'A'); l.press(l.q('.key[data-midi="62"]')); assert.ok(l.log.taus.includes(3.12) || l.log.taus.some((t) => t > 2), 'A is the old long voice'); assert.ok(!l.log.taus.includes(g.PIANO_PARAMS.decayMid));
  l.mark(); l.click('#flip'); assert.equal(l.q('#flipName').textContent, 'B'); assert.match(l.q('#status').textContent, /^The keys now play B: Shorter/);
});
test('EDITING: a preset goes into the setting being edited; a slider changes the number (clamped), marks the setting "(edited)" and is what plays; the other setting is untouched', () => {
  const l = lab(), mellow = plain(g.PIANO_PRESETS[3]).params.decayMid;
  l.click('#editB'); l.click('#preset3'); assert.equal(l.q('#nameB').textContent, 'Mellow'); assert.equal(l.q('#nameA').textContent, 'Old voice (long)');
  const s = l.q('#s_decayMid'); assert.equal(+s.value, mellow); s.value = '1'; s.dispatchEvent(new l.win.Event('input'));
  assert.equal(l.q('#nameB').textContent, 'Mellow (edited)'); assert.equal(l.q('#o_decayMid').textContent, '1'); assert.equal(l.win.__lab.slots().B.params.decayMid, 1); assert.equal(l.win.__lab.slots().A.params.decayMid, 3.12);
  l.mark(); l.click('#playB'); assert.ok(l.log.taus.includes(1) && !l.log.taus.includes(mellow), 'what plays is the edited number');
  s.value = String(mellow); s.dispatchEvent(new l.win.Event('input')); assert.equal(l.q('#nameB').textContent, 'Mellow', 'put back: no longer edited');
  l.click('#editA'); assert.equal(+l.q('#s_decayMid').value, 3.12, 'the sliders show the setting being edited');
  assert.equal(l.errors.length, 0);
});
test('COPY THESE SETTINGS prints both settings as a table that reads back to the numbers on the sliders, and puts it on the clipboard', async () => {
  const l = lab();
  l.click('#editB'); l.click('#preset4'); const s = l.q('#s_detune'); s.value = '7.5'; s.dispatchEvent(new l.win.Event('input'));
  l.click('#copy'); await new Promise((r) => setTimeout(r, 5));
  const text = l.q('#out').value as string; assert.equal(l.copied(), text); assert.equal(l.win.__lab.text(), text);
  assert.match(text, /\/\/ A: Old voice \(long\)/); assert.match(text, /\/\/ B: Dry and short \(edited\)/);
  const tables = [...text.matchAll(/var PIANO_PARAMS = \{[\s\S]*?\n  \};/g)].map((m) => m[0]); assert.equal(tables.length, 2);
  const read = (t: string) => { const c: any = {}; vm.runInNewContext(`${t}\nout = PIANO_PARAMS;`, c); return c.out; };
  assert.deepEqual(plain(read(tables[0])), plain(l.win.__lab.slots().A.params)); assert.deepEqual(plain(read(tables[1])), plain(l.win.__lab.slots().B.params));
  assert.equal(read(tables[1]).detune, 7.5); assert.deepEqual(Object.keys(plain(read(tables[0]))), Object.keys(plain(g.PIANO_PARAMS)));
  assert.match(l.q('#copied').textContent, /Copied/);
});
