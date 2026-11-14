// 2026-11-13-1214-1 - the piano voice of the vault gadgets (additive synthesis: partials with an inharmonic stretch and their own decay, two detuned strings, a hammer, a low-pass by velocity and pitch, a quick release, a soft limiter bus). The same
// block lives in piano_voice_demo.html, piano_keyboard.html and interval_widget.html (each gadget is a single self-contained file); this file pins the three identical and tests the pure parts and the node graph of one note on a RECORDING fake context.
// The audible claims (spectral centroid, energy above 1 kHz, decay, no clipping on a chord, no click at the end) are measured on a real OfflineAudioContext in Chrome: scripts/dev/measure-piano-voice.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'assets/vaults/music-theory/music_instruments/resources/html');
const FILES = ['piano_voice_demo.html', 'piano_keyboard.html', 'interval_widget.html'] as const;
const html = Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(DIR, f), 'utf8')])) as Record<(typeof FILES)[number], string>;
const BEGIN = '// ==== piano voice BEGIN', END = '// ==== piano voice END';
const blockOf = (h: string): string => { const a = h.indexOf(BEGIN), b = h.indexOf(END); assert.ok(a > 0 && b > a, 'the block is there'); return h.slice(a, h.indexOf('\n', b)); };
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];

/** The pure block alone, run in a sandbox (no DOM): what the node harness of each gadget exports. */
function voice(): any {
  const mod: { exports: any } = { exports: {} };
  vm.runInNewContext(`${blockOf(html['piano_voice_demo.html'])}\nmodule.exports = { PIANO_PARTIALS, PIANO_STRINGS, PIANO_OSC_PER_NOTE, PIANO_ATTACK, PIANO_RELEASE, pianoB, pianoMidi, pianoPartialHz, pianoDecay, pianoPartialAmp, pianoCutoff, pianoBus, pianoVoice };`, { module: mod, Math, Float32Array });
  return mod.exports;
}

// ---- the same block in all three files -------------------------------------------------------------------------------------------------------------------------------------
test('the voice block is IDENTICAL in the demo, the Piano gadget and the interval widget (a copy that drifts is a failure)', () => {
  const [d, k, i] = FILES.map((f) => blockOf(html[f]));
  assert.equal(k, d, 'piano_keyboard.html differs from the demo');
  assert.equal(i, d, 'interval_widget.html differs from the demo');
  assert.ok(d.length > 3000, 'non-vacuity: it is the whole block');
  assert.doesNotMatch(d, /document|window/, 'the block is pure: no DOM');
});
test('the gadgets no longer make the old single-oscillator beep: no PeriodicWave in either; both export the voice for the node harness', () => {
  for (const f of ['piano_keyboard.html', 'interval_widget.html'] as const) {
    assert.doesNotMatch(scriptOf(html[f]), /createPeriodicWave|setPeriodicWave/, `${f} still has the old wave`);
    const mod: { exports: any } = { exports: {} };
    vm.runInNewContext(scriptOf(html[f]), { module: mod, Math, Array, Set, Float32Array });
    assert.equal(typeof mod.exports.pianoVoice, 'function', f); assert.equal(mod.exports.PIANO_OSC_PER_NOTE, 20, f);
  }
});

// ---- the pure parts --------------------------------------------------------------------------------------------------------------------------------------------------------
test('partial frequencies: partial 1 is EXACTLY f; partial n is n*f*sqrt((1+B n^2)/(1+B)), slightly above the harmonic and stretching more the higher it is', () => {
  const g = voice(); const f = 261.6256;
  for (const B of [0.0003, 0.0006, 0.001]) {
    assert.equal(g.pianoPartialHz(f, 1, B), f);
    let prevStretch = 1;
    for (let n = 2; n <= g.PIANO_PARTIALS; n++) {
      const hz = g.pianoPartialHz(f, n, B), harmonic = n * f;
      assert.ok(Math.abs(hz - n * f * Math.sqrt((1 + B * n * n) / (1 + B))) < 1e-9);
      assert.ok(hz > harmonic, `partial ${n} is sharp of the harmonic`);
      const stretch = hz / harmonic; assert.ok(stretch > prevStretch, `the stretch grows with n (${n})`); prevStretch = stretch;
      assert.ok(stretch < 1.07, 'and stays slight');
    }
  }
  assert.ok(g.pianoPartialHz(f, 10, 0.001) > g.pianoPartialHz(f, 10, 0.0003), 'more stiffness, more stretch');
});
test('B rises toward the bass: 0.0003 at C6 and above, about 0.001 at C1 and below, strictly between, never outside 0.0003..0.001', () => {
  const g = voice();
  assert.equal(g.pianoB(84), 0.0003); assert.equal(g.pianoB(100), 0.0003);
  assert.ok(Math.abs(g.pianoB(24) - 0.001) < 1e-12); assert.equal(g.pianoB(0), 0.001);
  let prev = Infinity; for (let m = 24; m <= 84; m++) { const b = g.pianoB(m); assert.ok(b <= prev + 1e-15 && b >= 0.0003 && b <= 0.001, `m=${m}`); prev = b; }
  assert.ok(g.pianoB(36) > g.pianoB(60) && g.pianoB(60) > g.pianoB(84));
});
test('the decay table: higher partials die faster (strictly), bass notes ring longer than treble notes at every partial, every time constant is positive and the bass fundamental rings about 4 s', () => {
  const g = voice();
  for (const m of [24, 36, 48, 60, 72, 84, 96]) { let prev = Infinity; for (let n = 1; n <= g.PIANO_PARTIALS; n++) { const t = g.pianoDecay(m, n); assert.ok(t > 0 && t < prev, `m=${m} n=${n}`); prev = t; } }
  for (let n = 1; n <= g.PIANO_PARTIALS; n++) assert.ok(g.pianoDecay(36, n) > g.pianoDecay(84, n), `bass rings longer (n=${n})`);
  assert.ok(Math.abs(g.pianoDecay(36, 1) - 4.2) < 1e-9); assert.ok(g.pianoDecay(36, 10) < g.pianoDecay(36, 1) / 6);
  for (let n = 1; n < g.PIANO_PARTIALS; n++) assert.ok(g.pianoPartialAmp(n) > g.pianoPartialAmp(n + 1), 'the spectrum falls off');
});
test('velocity to cutoff: harder is brighter, higher notes are darker, and it is clamped to 500..12000 Hz', () => {
  const g = voice();
  assert.ok(g.pianoCutoff(60, 1) > g.pianoCutoff(60, 0.5) && g.pianoCutoff(60, 0.5) > g.pianoCutoff(60, 0.1));
  assert.ok(g.pianoCutoff(36, 0.8) > g.pianoCutoff(60, 0.8) && g.pianoCutoff(60, 0.8) > g.pianoCutoff(84, 0.8));
  assert.equal(g.pianoCutoff(-60, 1), 12000); assert.equal(g.pianoCutoff(127, 0), 500);
});

// ---- the graph of one note on a recording fake --------------------------------------------------------------------------------------------------------------------------------
interface Param { value: number; calls: Array<{ fn: string; v: number; t: number; tau?: number }> }
interface Node { kind: string; id: number; type?: string; frequency: Param; gain: Param; Q: Param; threshold: Param; starts: number[]; stops: number[]; out: Array<Node | 'destination'>; buffer?: unknown }
function recorder() {
  const nodes: Node[] = [];
  const param = (): Param => { const p: Param = { value: 0, calls: [] } as any; for (const fn of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime']) (p as any)[fn] = (v: number, t: number, tau?: number) => { p.calls.push({ fn, v, t, tau }); }; return p; };
  const destination: any = { kind: 'destination' };
  const mk = (kind: string): any => { const n: any = { kind, id: nodes.length, frequency: param(), gain: param(), Q: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), starts: [], stops: [], out: [], connect(to: any) { n.out.push(to === destination ? 'destination' : to); }, start(t: number) { n.starts.push(t); }, stop(t: number) { n.stops.push(t); } }; nodes.push(n); return n; };
  const ctx: any = { currentTime: 0, sampleRate: 44100, destination, createOscillator: () => mk('oscillator'), createGain: () => mk('gain'), createBiquadFilter: () => mk('biquad'), createBufferSource: () => mk('bufferSource'), createDynamicsCompressor: () => mk('compressor'), createBuffer: (_c: number, n: number) => { const d = new Float32Array(n); return { getChannelData: () => d, length: n }; } };
  return { ctx, nodes, destination, of: (k: string) => nodes.filter((n) => n.kind === k) };
}
const F = 261.6256;
test('one note makes exactly 20 oscillators (2 strings x 10 partials), 2 filters, 22 gains and ONE hammer source; string 2 is 2 cents sharp; every partial is where the table says', () => {
  const g = voice(), r = recorder();
  g.pianoVoice(r.ctx, r.destination, F, 1.0, 1.0, 0.8);
  assert.deepEqual([r.of('oscillator').length, r.of('biquad').length, r.of('gain').length, r.of('bufferSource').length], [20, 2, 22, 1]);
  assert.equal(g.PIANO_OSC_PER_NOTE, 20);
  const B = g.pianoB(g.pianoMidi(F));
  const hz = r.of('oscillator').map((o) => o.frequency.value);
  assert.deepEqual(hz.slice(0, 10), [...Array(10)].map((_, i) => g.pianoPartialHz(F, i + 1, B)), 'string 1, partials 1..10');
  assert.deepEqual(hz.slice(10), [...Array(10)].map((_, i) => g.pianoPartialHz(F * Math.pow(2, 2 / 1200), i + 1, B)), 'string 2, two cents sharp');
  assert.equal(hz[0], F, 'the first oscillator of a note is the pitch asked for: what the page tests count');
  assert.ok(hz[10] > hz[0] && hz[10] / hz[0] < 1.0013, 'the beating pair');
  assert.ok(r.of('oscillator').every((o) => o.type === 'sine'));
});
test('SCHEDULING never starts before `when`: every start, every automation time and every stop of every node is at or after it; the stops come after the note ends; the buffer source is a short burst', () => {
  const g = voice();
  for (const when of [0, 0.5, 3.25]) for (const len of [0.05, 0.3, 2]) {
    const r = recorder(); g.pianoVoice(r.ctx, r.destination, F, when, len, 0.8);
    for (const n of r.nodes) {
      for (const t of [...n.starts, ...n.stops]) assert.ok(t >= when, `${n.kind} start/stop ${t} < ${when}`);
      for (const p of [n.gain, n.frequency]) for (const c of p.calls) assert.ok(c.t >= when, `${n.kind} automation at ${c.t} < ${when}`);
    }
    for (const o of r.of('oscillator')) { assert.equal(o.starts.length, 1); assert.equal(o.starts[0], when); assert.ok(o.stops[0] > when + Math.max(0.05, len), 'it outlasts the note, to let the release finish'); }
    const noise = r.of('bufferSource')[0]; assert.ok(noise.stops[0] - noise.starts[0] <= 0.0201, 'the hammer is a few ms');
    assert.ok((noise.buffer as any).length <= 0.012 * 44100 + 1);
  }
});
test('the END of the note is a quick release, never a cut: the note gain is set to its peak, targets zero from the end with a tau of about 5 ms, and is exactly 0 before any oscillator stops', () => {
  const g = voice(), r = recorder(); g.pianoVoice(r.ctx, r.destination, F, 1.0, 1.0, 0.8);
  const out = r.of('gain')[0]; const calls = out.gain.calls;
  assert.equal(calls[0].fn, 'setValueAtTime'); assert.ok(calls[0].v < 0.001 && calls[0].t === 1.0, 'it starts silent at `when`');
  const ramp = calls.find((c) => c.fn === 'linearRampToValueAtTime')!; assert.ok(ramp.t - 1.0 <= 0.005 && ramp.v > 0.05, 'the attack is a few ms');
  const target = calls.find((c) => c.fn === 'setTargetAtTime')!;
  assert.equal(target.v, 0); assert.ok(Math.abs(target.t - 2.0) < 1e-9, 'the release starts when the note ends'); assert.ok(target.tau! >= 0.002 && target.tau! <= 0.01, `tau ${target.tau}`);
  const zero = calls.filter((c) => c.fn === 'setValueAtTime').at(-1)!; assert.equal(zero.v, 0); assert.ok(zero.t > target.t + 0.05 && zero.t < Math.min(...r.of('oscillator').map((o) => o.stops[0])), 'exactly silent before the oscillators stop');
  const rel = 4 * target.tau!; assert.ok(rel >= 0.01 && rel <= 0.03, 'about 20 ms to silence');
});
test('each partial has its OWN decay: the time constant of partial n is pianoDecay(midi, n), and the fundamental starts louder than the tenth', () => {
  const g = voice(), r = recorder(); g.pianoVoice(r.ctx, r.destination, F, 0, 1.0, 0.8);
  const midi = g.pianoMidi(F);
  const partialGains = r.of('oscillator').map((o) => o.out[0] as Node);
  partialGains.slice(0, 10).forEach((pg, i) => { const t = pg.gain.calls.find((c) => c.fn === 'setTargetAtTime')!; assert.equal(t.v, 0); assert.ok(Math.abs(t.tau! - g.pianoDecay(midi, i + 1)) < 1e-12, `partial ${i + 1}`); });
  assert.ok(partialGains[0].gain.calls[0].v > partialGains[9].gain.calls[0].v * 5);
  const sum = partialGains.slice(0, 20).reduce((a, pg) => a + pg.gain.calls[0].v, 0); assert.ok(Math.abs(sum - 1) < 1e-9, 'the partial amplitudes of both strings sum to 1: the note gain alone sets the level');
});
test('velocity: harder = a higher low-pass cutoff, a louder note and a louder hammer; pitch = a lower cutoff; the level argument scales the note (a chord passes less)', () => {
  const g = voice();
  const at = (hz: number, v: number, level?: number) => { const r = recorder(); g.pianoVoice(r.ctx, r.destination, hz, 0, 1, v, level); const lp = r.of('biquad')[0], out = r.of('gain')[0], ng = r.of('gain').at(-1)!; return { cutoff: lp.frequency.value, peak: out.gain.calls.find((c) => c.fn === 'linearRampToValueAtTime')!.v, hammer: ng.gain.calls[0].v, lpType: lp.type, noiseHz: r.of('biquad')[1].frequency.value }; };
  assert.ok(at(F, 1).cutoff > at(F, 0.5).cutoff && at(F, 0.5).cutoff > at(F, 0.1).cutoff);
  assert.ok(at(F, 1).peak > at(F, 0.5).peak && at(F, 1).hammer > at(F, 0.5).hammer);
  assert.ok(at(F * 4, 0.8).cutoff < at(F, 0.8).cutoff && at(F / 4, 0.8).cutoff > at(F, 0.8).cutoff);
  assert.equal(at(F, 0.8).lpType, 'lowpass');
  assert.ok(Math.abs(at(F, 0.8, 0.5).peak * 2 - at(F, 0.8, 1).peak) < 1e-12 && Math.abs(at(F, 0.8, 1).peak - 0.26) < 1e-9);
  assert.ok(at(F, 0.8).peak <= 0.31, 'a single note stays at about the level the old beep had (0.28)');
});
test('the shared bus is a soft limiter into the output, made ONCE per context; a note\'s chain ends at the destination it is given', () => {
  const g = voice(), r = recorder();
  const bus = g.pianoBus(r.ctx); assert.equal(g.pianoBus(r.ctx), bus, 'the same bus for the same context');
  assert.equal(r.of('compressor').length, 1);
  assert.ok(bus.threshold.value <= -6 && bus.ratio.value >= 8, 'a limiter, not a gentle squeeze'); assert.deepEqual(bus.out, ['destination']);
  g.pianoVoice(r.ctx, bus, F, 0, 1, 0.8);
  assert.ok(r.of('gain')[0].out.includes(bus), 'the note gain feeds the bus');
  const r2 = recorder(); assert.notEqual(g.pianoBus(r2.ctx), bus, 'a new context gets its own bus');
});
test('the hammer noise is deterministic: two contexts get the same burst', () => {
  const g = voice(); const a = recorder(), b = recorder();
  g.pianoVoice(a.ctx, a.destination, F, 0, 1, 0.8); g.pianoVoice(b.ctx, b.destination, F, 0, 1, 0.8);
  assert.deepEqual([...(a.of('bufferSource')[0].buffer as any).getChannelData?.() ?? []], [...(b.of('bufferSource')[0].buffer as any).getChannelData?.() ?? []]);
});

// ---- the gadgets, in a DOM, with the stand-in Web Audio ----------------------------------------------------------------------------------------------------------------------------
function open(file: 'piano_keyboard.html' | 'interval_widget.html') {
  const stub = audioStub(); const errors: string[] = [];
  const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
  win.AudioContext = stub.Ctx; win.Float32Array = Float32Array;
  const m = /<script>([\s\S]*?)<\/script>/.exec(html[file])!;
  win.document.write(html[file].replace(m[0], '')); win.eval(m[1]);
  return { win, doc: win.document, stub, errors };
}
const click = (p: any, sel: string) => p.doc.querySelector(sel).dispatchEvent(new p.win.MouseEvent('click', { bubbles: true }));
test('the Piano gadget: pressing keys plays nothing; Together sounds each held key once with the new voice (20 oscillators a note) at the pitch of its key; Up sounds them in order', () => {
  const p = open('piano_keyboard.html');
  for (const m of [64, 67]) p.doc.querySelector(`.key[data-midi="${m}"]`).dispatchEvent(new p.win.MouseEvent('click', { bubbles: true }));
  assert.equal(p.stub.all.length, 0, 'a key press only holds the key');
  click(p, '#bT');
  assert.deepEqual(p.stub.osc.map((x) => +x.toFixed(2)), [130.81, 261.63, 329.63, 392], 'C3 and C4 are held when the page opens; E4 and G4 were added');
  assert.equal(p.stub.all.length, 80); assert.equal(p.stub.nodes.compressor, 1, 'one soft limiter bus');
  p.stub.osc.length = 0; click(p, '#bD');
  assert.deepEqual(p.stub.osc.map((x) => +x.toFixed(2)), [392, 329.63, 261.63, 130.81], 'Down: the highest first');
  assert.equal(p.errors.length, 0);
});
test('the interval widget: a note is the same pitch as before (the first oscillator), every Play sound count is one note per pitch, a long tune is 16 notes of 20 oscillators', () => {
  const p = open('interval_widget.html');
  click(p, '#tabShift');
  const sel = p.doc.getElementById('shTune'); sel.value = 'bwv1007'; sel.dispatchEvent(new p.win.Event('change'));
  p.stub.osc.length = 0; p.stub.all.length = 0; click(p, '#shPlay');
  assert.equal(p.stub.osc.length, 16); assert.equal(p.stub.all.length, 16 * 20);
  assert.equal(+p.stub.osc[0].toFixed(2), 196);                                  // G3
  assert.equal(p.errors.length, 0);
});
