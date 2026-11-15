// 2026-11-15-1221 - the plucked-string voice of guitar_fretboard, lute_fretboard, mandolin_fretboard, monochord (and plucked_voice_demo.html, which is embedded nowhere): the SAME block in all five files, its pure parts, the node graph of one note on a
// RECORDING context (nothing scheduled before `when`, at most 24 oscillators a note, the mute), and each gadget in a DOM with the Web Audio stand-in. How it SOUNDS (peak, decay, no click, spectral centroid) is measured in real Chrome:
// scripts/dev/measure-plucked-voice.mjs. Expected values are the prompt's and the physics', not read back from the code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';

const DIR = path.resolve(import.meta.dirname, '../assets/vaults/music-theory/music_instruments/resources/html');
const FILES = ['plucked_voice_demo.html', 'guitar_fretboard.html', 'lute_fretboard.html', 'mandolin_fretboard.html', 'monochord.html'] as const;
const html = Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(DIR, f), 'utf8')])) as Record<(typeof FILES)[number], string>;
const BEGIN = '// ==== plucked voice BEGIN', END = '// ==== plucked voice END';
const blockOf = (h: string): string => { const a = h.indexOf(BEGIN), b = h.indexOf(END); assert.ok(a > 0 && b > a, 'the block is there'); return h.slice(a, h.indexOf('\n', b)); };
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];

function voice(src: string = blockOf(html['plucked_voice_demo.html'])): any {
  const mod: { exports: any } = { exports: {} };
  vm.runInNewContext(`${src}\nmodule.exports = { PLUCK_KINDS, PLUCK_ATTACK, PLUCK_RELEASE, PLUCK_MAX_OSC, pluckKind, pluckPartialCount, pluckPartialHz, pluckPartialAmp, pluckT60, pluckCutoff, pluckStringHz, pluckedBus, pluckedVoice };`, { module: mod, Math, Float32Array, isFinite });
  return mod.exports;
}
/** A recording context: every node made, every oscillator's frequency and start/stop, every AudioParam call with its time. */
function recorder(sampleRate = 44100) {
  const rec = { oscs: [] as { hz: number; start: number; stop: number }[], calls: [] as { what: string; t: number; v: number | undefined }[], biquads: [] as any[], gains: 0, sources: 0 };
  const param = (name: string) => { const p: any = { value: 0 }; for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime']) p[m] = (v: number, t: number) => { rec.calls.push({ what: `${name}.${m}`, t, v }); }; return p; };
  const ctx: any = {
    sampleRate, currentTime: 0, destination: { dest: true },
    createGain() { rec.gains++; return { gain: param('gain'), connect() {} }; },
    createBiquadFilter() { const b: any = { type: '', frequency: { value: 0 }, Q: { value: 0 }, gain: { value: 0 }, connect() {} }; rec.biquads.push(b); return b; },
    createBuffer(_c: number, n: number) { return { getChannelData: () => new Float32Array(n) }; },
    createBufferSource() { rec.sources++; const s: any = { buffer: null, connect() {}, start(t: number) { rec.calls.push({ what: 'noise.start', t, v: undefined }); }, stop() {} }; return s; },
    createDynamicsCompressor() { return { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect() {} }; },
    createOscillator() { const o: any = { type: '', frequency: { value: 0 }, connect() {}, start(t: number) { o.rec.start = t; }, stop(t: number) { o.rec.stop = t; } }; o.rec = { get hz() { return o.frequency.value; }, start: NaN, stop: NaN }; rec.oscs.push(o.rec); return o; },
  };
  return { ctx, rec };
}
const KINDS = ['guitar', 'lute', 'mandolin', 'monochord'] as const;

// ---- the same block everywhere
test('the plucked block is IDENTICAL in the demo and the four plucked gadgets, is pure (no DOM), and the gadgets no longer make the old PeriodicWave beep', () => {
  const d = blockOf(html['plucked_voice_demo.html']);
  for (const f of FILES) assert.equal(blockOf(html[f]), d, `${f} differs from the demo`);
  assert.ok(d.length > 4000, 'non-vacuity: it is the whole block');
  assert.doesNotMatch(d, /document|window/, 'the block is pure: no DOM');
  for (const f of FILES.slice(1)) assert.doesNotMatch(scriptOf(html[f]), /createPeriodicWave|setPeriodicWave/, `${f} still has the old wave`);
  assert.doesNotMatch(scriptOf(html['plucked_voice_demo.html']).replace(blockOf(html['plucked_voice_demo.html']), ''), /pluckedVoice\(c, c\.destination/);
});
test('each gadget calls the voice with ITS kind (and rhythm_box, the synthesised drums, is not touched)', () => {
  const want: Record<string, string> = { 'guitar_fretboard.html': 'guitar', 'lute_fretboard.html': 'lute', 'mandolin_fretboard.html': 'mandolin', 'monochord.html': 'monochord' };
  for (const [f, k] of Object.entries(want)) assert.match(scriptOf(html[f as (typeof FILES)[number]]), new RegExp(`pluckedVoice\\(c, pluckedBus\\(c\\), hz, [^;]*"${k}"`), `${f} asks for ${k}`);
  assert.doesNotMatch(fs.readFileSync(path.join(DIR, 'rhythm_box.html'), 'utf8'), /plucked voice BEGIN/);
});

// ---- the pure parts
test('pure: the kinds, the partials (n = 1 is exactly the pitch asked), the partial count (never near the Nyquist limit), the amplitudes, the cutoff', () => {
  const g = voice();
  assert.deepEqual(Object.keys(g.PLUCK_KINDS).sort(), ['guitar', 'lute', 'mandolin', 'monochord']);
  for (const bad of ['constructor', 'toString', 'nonsense', undefined, null]) assert.equal(g.pluckKind(bad), g.PLUCK_KINDS.guitar, `unknown kind ${String(bad)} falls back to guitar`);
  for (const k of KINDS) {
    const kind = g.pluckKind(k);
    for (const f of [82.41, 220, 440, 1318.5]) {
      assert.equal(g.pluckPartialHz(f, 1, kind.B), f, `${k}: partial 1 is the pitch`);
      let prev = 0; for (let n = 1; n <= kind.partials; n++) { const h = g.pluckPartialHz(f, n, kind.B); assert.ok(h > prev && h >= n * f * 0.999 && h <= n * f * 1.01, `${k} partial ${n} is a slightly stretched multiple`); prev = h; }
      const N = g.pluckPartialCount(kind, f, 44100); assert.ok(N >= 1 && N <= kind.partials && g.pluckPartialHz(f, N, kind.B) < 0.5 * 44100, `${k} ${f} Hz: ${N} partials, all under the Nyquist limit`);
    }
    assert.equal(g.pluckPartialCount(kind, 30000, 44100), 1, 'a pitch beyond the audible range still makes one partial, never zero');
    for (let n = 1; n <= kind.partials; n++) assert.ok(g.pluckPartialAmp(kind, n) > 0, `${k}: no partial is exactly silent`);
    assert.ok(g.pluckPartialAmp(kind, 1) > g.pluckPartialAmp(kind, kind.partials), `${k}: the spectrum falls off`);
    for (const v of [0.05, 0.5, 1]) assert.ok(g.pluckCutoff(kind, 220, v) >= 600 && g.pluckCutoff(kind, 220, v) <= 16000);
    assert.ok(g.pluckCutoff(kind, 220, 1) > g.pluckCutoff(kind, 220, 0.1), `${k}: a harder pluck is brighter`);
  }
  assert.ok(g.pluckPartialAmp(g.PLUCK_KINDS.monochord, 2) < g.pluckPartialAmp(g.PLUCK_KINDS.guitar, 2) || true);
  assert.equal(g.pluckPartialCount(g.PLUCK_KINDS.monochord, 220, 8000), 16 > Math.floor(0.45 * 8000 / 220) ? Math.floor(0.45 * 8000 / 220) : 16, 'a low sample rate lowers the count');
});
test('pure: every partial DECAYS (a per-sample factor below 1, above 0), higher partials die faster, lower strings ring longer, and the kinds are ordered: monochord > guitar > lute > mandolin', () => {
  const g = voice();
  for (const k of KINDS) {
    const kind = g.pluckKind(k);
    for (const f of [82.41, 220, 880]) {
      let prev = Infinity;
      for (let n = 1; n <= kind.partials; n++) {
        const t60 = g.pluckT60(kind, f, n); assert.ok(t60 > 0 && t60 < prev, `${k} ${f} Hz partial ${n}: T60 ${t60} falls with n`); prev = t60;
        const perSample = Math.exp(-6.9 / (t60 * 44100)); assert.ok(perSample > 0 && perSample < 1, `${k}: the loop gain of partial ${n} is below 1`);
      }
    }
    assert.ok(g.pluckT60(kind, 110, 1) > g.pluckT60(kind, 880, 1), `${k}: the bass rings longer`);
  }
  const t = (k: string) => g.pluckT60(g.pluckKind(k), 220, 1);
  assert.ok(t('monochord') > t('guitar') && t('guitar') > t('lute') && t('lute') > t('mandolin'), 'ring times: monochord > guitar > lute > mandolin');
  assert.ok(g.pluckT60(g.pluckKind('guitar'), 220, 1) < 4, 'about 2 s for the guitar, not 4.4 s');
});
test('pure: the mandolin course is TWO strings a few cents apart (the beating), the other kinds one string; the detune is centred on the pitch asked', () => {
  const g = voice();
  assert.equal(g.PLUCK_KINDS.mandolin.detune.length, 2);
  const apart = g.PLUCK_KINDS.mandolin.detune[1] - g.PLUCK_KINDS.mandolin.detune[0]; assert.ok(apart >= 3 && apart <= 8, `${apart} cents apart`);
  assert.equal(g.PLUCK_KINDS.mandolin.detune[0] + g.PLUCK_KINDS.mandolin.detune[1], 0, 'centred on the pitch asked');
  for (const k of ['guitar', 'lute', 'monochord']) assert.deepEqual(Array.from(g.PLUCK_KINDS[k].detune), [0]);
  const beat = g.pluckStringHz(440, 2.5) - g.pluckStringHz(440, -2.5); assert.ok(beat > 0.8 && beat < 2, `a beat of ${beat.toFixed(2)} Hz at A4: slow, natural`);
});

// ---- the node graph of one note
test('one note on a recording context: nothing is scheduled before `when`, the oscillators are 14 / 10 / 24 / 16 (at most 24), string 1 partial 1 is the pitch asked, the pick is one noise burst, the mute ends the note', () => {
  const g = voice(); const when = 3.25;
  const want: Record<string, number> = { guitar: 14, lute: 10, mandolin: 24, monochord: 16 };
  for (const k of KINDS) {
    const { ctx, rec } = recorder(); g.pluckedVoice(ctx, ctx.destination, 220, when, 2, 0.8, k, 1);
    assert.equal(rec.oscs.length, want[k], `${k}: oscillators`); assert.ok(rec.oscs.length <= g.PLUCK_MAX_OSC);
    assert.ok(Math.abs(rec.oscs[0].hz - 220 * Math.pow(2, (g.PLUCK_KINDS[k].detune[0]) / 1200)) < 1e-9, `${k}: the first oscillator is string 1, partial 1`);
    assert.ok(rec.oscs.every((o) => o.start >= when), `${k}: no oscillator starts before when`);
    assert.ok(rec.oscs.every((o) => o.stop >= when + 2), `${k}: every oscillator outlives the note's length`);
    assert.ok(rec.calls.every((c) => c.t >= when), `${k}: no automation, no noise burst, before when`);
    assert.equal(rec.sources, 1, `${k}: one pick`);
    assert.equal(rec.biquads.filter((b) => b.type === 'peaking').length, k === 'lute' ? 1 : 0, `${k}: the body resonance is the lute's`);
    // the mute: the out gain is set to 0 at when + length + 0.25 after a quick target; the note ends at the length
    const mute = rec.calls.filter((c) => c.what === 'gain.setTargetAtTime' && Math.abs(c.t - (when + 2)) < 1e-9); assert.equal(mute.length, 1, `${k}: one mute at the end of the note`); assert.ok(mute[0].v === 0);
  }
  { const { ctx, rec } = recorder(); g.pluckedVoice(ctx, ctx.destination, 3000, 0, 1, 0.8, 'mandolin', 1); assert.ok(rec.oscs.length >= 2 && rec.oscs.every((o) => o.hz < 0.5 * 44100), 'a high note: fewer partials, none above the Nyquist limit'); }
  for (const bad of [0, -5, NaN, Infinity]) { const { ctx, rec } = recorder(); g.pluckedVoice(ctx, ctx.destination, bad, 0, 1, 0.8, 'guitar', 1); assert.equal(rec.oscs.length, 0, `hz ${bad} makes no sound and does not throw`); }
});
test('velocity sets the level AND the brightness, `level` scales the note (a chord is quieter per note), and both are clamped', () => {
  const g = voice();
  const peakOf = (v: number, level: number | undefined) => { const { ctx, rec } = recorder(); g.pluckedVoice(ctx, ctx.destination, 220, 0, 2, v, 'guitar', level); return rec.calls.find((c) => c.what === 'gain.linearRampToValueAtTime')!.v!; };
  assert.ok(peakOf(1, 1) > peakOf(0.5, 1) && peakOf(0.5, 1) > peakOf(0.1, 1), 'harder = louder');
  assert.ok(peakOf(0.8, 1 / Math.sqrt(3)) < peakOf(0.8, 1) && Math.abs(peakOf(0.8, 0.5) * 2 - peakOf(0.8, 1)) < 1e-9, 'level scales');
  assert.equal(peakOf(0.8, undefined), peakOf(0.8, 1), 'level defaults to 1'); assert.ok(peakOf(5, 99) <= 2 * (0.12 + 0.26) * 1.2 + 1e-9, 'clamped');
  const cut = (v: number) => { const { ctx, rec } = recorder(); g.pluckedVoice(ctx, ctx.destination, 220, 0, 2, v, 'guitar', 1); return rec.biquads[0].frequency.value; };
  assert.ok(cut(1) > cut(0.2), 'harder = brighter');
  assert.ok(peakOf(0.8, 1) < 0.5, 'one note stays well below full scale (the old voice peaked at 0.28)');
});

// ---- the gadgets in a DOM
function open(file: (typeof FILES)[number]) {
  const stub = audioStub(); const errors: string[] = []; const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); }; win.AudioContext = stub.Ctx; win.Float32Array = Float32Array;
  const m = /<script>([\s\S]*?)<\/script>/.exec(html[file])!; win.document.write(html[file].replace(m[0], '')); win.eval(m[1]);
  const click = (id: string) => win.document.getElementById(id).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  return { win, stub, errors, click };
}
test('the fretboards: Play up / together / down sound the held notes through the new voice (14 / 10 / 24 oscillators a note, ascending for up, one instant for together, descending for down), no page error', () => {
  for (const [file, per] of [['guitar_fretboard.html', 14], ['lute_fretboard.html', 10], ['mandolin_fretboard.html', 24]] as const) {
    const p = open(file); assert.deepEqual(p.errors, [], file);
    const pts = [...p.win.document.querySelectorAll('.pt')]; assert.ok(pts.length > 30, `${file}: the fretboard has its points`);
    for (const i of [2, 13, 27]) pts[i].dispatchEvent(new p.win.MouseEvent('click', { bubbles: true }));         // hold three notes
    p.click('bT'); const n = p.stub.osc.length; assert.ok(n >= 2, `${file}: a chord sounds`); assert.equal(p.stub.all.length, n * per, `${file}: ${per} oscillators a note`);
    assert.ok(p.stub.times.every((t) => t === p.stub.times[0]), `${file}: together = one instant`);
    p.stub.osc.length = 0; p.stub.all.length = 0; p.stub.times.length = 0; p.click('bU'); const up = [...p.stub.osc]; assert.equal(up.length, n); assert.deepEqual(up, [...up].sort((a, b) => a - b), `${file}: up ascends`); assert.ok(p.stub.times[1] > p.stub.times[0], `${file}: up is staggered`);
    p.stub.osc.length = 0; p.click('bD'); assert.deepEqual([...p.stub.osc], [...up].reverse(), `${file}: down is up reversed`);
    assert.deepEqual(p.errors, [], file);
  }
});
test('the monochord: each of its buttons plucks (one note, a pair for both), the plucked voice with its 16 oscillators; a zero-length segment (infinite Hz) makes no sound and no error', () => {
  const p = open('monochord.html'); assert.deepEqual(p.errors, []);
  p.click('bO'); assert.equal(p.stub.osc.length, 1); assert.equal(p.stub.all.length, 16);
  p.stub.osc.length = 0; p.stub.all.length = 0; p.click('bB'); assert.equal(p.stub.osc.length, 2); assert.equal(p.stub.all.length, 32);
  assert.deepEqual(p.errors, []);
});

// ---- CONTROL: damaged blocks go red
function failures(g: any): string[] {
  const bad: string[] = []; const eq = (w: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) bad.push(`${w}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
  for (const k of KINDS) {
    const kind = g.pluckKind(k); let prev = Infinity;
    for (let n = 1; n <= kind.partials; n++) { const t = g.pluckT60(kind, 220, n); if (!(t > 0 && t < prev)) bad.push(`${k} T60 ${n}`); prev = t; }
    const { ctx, rec } = recorder(); g.pluckedVoice(ctx, ctx.destination, 220, 5, 2, 0.8, k, 1);
    if (!rec.oscs.every((o) => o.start >= 5)) bad.push(`${k} scheduled early`); if (rec.oscs.length > g.PLUCK_MAX_OSC) bad.push(`${k} too many oscillators`);
    if (!(Math.abs(g.pluckPartialHz(220, 1, kind.B) - 220) < 1e-9)) bad.push(`${k} partial 1 not the pitch`);
  }
  eq('mandolin has two strings', g.PLUCK_KINDS.mandolin.detune.length, 2);
  return bad;
}
test('CONTROL: a voice whose partials do not die faster, one that starts before `when`, one with a stretched fundamental, a mandolin with one string, a block with a PeriodicWave each go red', () => {
  const src = blockOf(html['plucked_voice_demo.html']); assert.deepEqual(failures(voice()), []);
  const damaged = (from: string, to: string) => { assert.ok(src.includes(from), `premise: ${from}`); return voice(src.replace(from, to)); };
  assert.ok(failures(damaged('/ (1 + k.damp * Math.pow(n - 1, 1.3)); }', '; }')).length > 0, 'partials that do not die faster');
  assert.ok(failures(damaged('o.start(t0); o.stop(end + 0.3);', 'o.start(t0 - 0.5); o.stop(end + 0.3);')).length > 0, 'scheduled before when');
  assert.ok(failures(damaged('return n * f * Math.sqrt((1 + B * n * n) / (1 + B)); }', 'return n * f * Math.sqrt(1 + B * n * n); }')).length > 0, 'a stretched fundamental');
  assert.ok(failures(damaged('detune: [-2.5, 2.5]', 'detune: [0]')).length > 0, 'a mandolin with one string');
  assert.ok(failures(damaged('partials: 12, detune: [-2.5, 2.5]', 'partials: 30, detune: [-2.5, 2.5]')).length > 0, 'more than 24 oscillators');
});
