// 2026-11-16-1200 - whole_half_steps.html: two notes on a small piano (13 keys, C4 to C5) and the distance between them in WHOLE and HALF steps: n half steps are floor(n/2) whole steps plus n mod 2 half step, said as text ("7 half steps = 3 whole + 1 half"),
// as a row of W / H chips with the half-step count under each, with the notes between lit on the piano; Play sounds the two notes with the piano voice (one after the other, or together). The pure functions for 0..12, the chips, the words, the
// page in a DOM with the Web Audio stand-in, the piano voice block, and the page's pixels (no margin or padding, no fixed height). The no-scroll check at 800 and 360 px wide is real Chrome: scripts/dev/measure-step-gadgets.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';

const DIR = path.resolve(import.meta.dirname, '../assets/vaults/music-theory/music_instruments/resources/html');
const html = fs.readFileSync(path.join(DIR, 'whole_half_steps.html'), 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];
function pure(): any { const mod: { exports: any } = { exports: {} }; vm.runInNewContext(scriptOf(html), { module: mod, Math, Float32Array }); return mod.exports; }
const g = pure();
const plain = (x: unknown): any => JSON.parse(JSON.stringify(x));

test('splitSteps(n) for 0..12: floor(n/2) whole steps and n mod 2 half step, and two half steps always make a whole one', () => {
  const want = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
  for (let n = 0; n <= 12; n++) {
    assert.deepEqual(plain(g.splitSteps(n)), { whole: want[n][0], half: want[n][1] }, `n=${n}`);
    const s = g.splitSteps(n); assert.equal(2 * s.whole + s.half, n);
  }
  assert.deepEqual(plain(g.splitSteps(-3)), { whole: 1, half: 1 }, 'a distance is never negative (the lower note is the start)');
  assert.deepEqual(plain(g.splitSteps(NaN)), { whole: 0, half: 0 }); assert.deepEqual(plain(g.splitSteps(undefined)), { whole: 0, half: 0 });
  assert.deepEqual(plain(g.splitSteps(2.6)), { whole: 1, half: 0 }, 'a half step is a whole number of keys');
});

test('chipsFor(n) for 0..12: the whole steps first (W, 2 half steps each) and the half step last (H, 1); the counts add up to n; never more than six chips (the row never wraps)', () => {
  for (let n = 0; n <= 12; n++) {
    const c = plain(g.chipsFor(n));
    assert.deepEqual(c.map((x: any) => x.kind), [...Array(Math.floor(n / 2)).fill('W'), ...Array(n % 2).fill('H')], `n=${n}`);
    for (const x of c) assert.equal(x.halfSteps, x.kind === 'W' ? 2 : 1);
    assert.equal(c.reduce((a: number, x: any) => a + x.halfSteps, 0), n); assert.ok(c.length <= 6);
  }
  assert.deepEqual(plain(g.chipsFor(7)).map((x: any) => `${x.kind}${x.halfSteps}`), ['W2', 'W2', 'W2', 'H1']);
  assert.deepEqual(plain(g.chipsFor(0)), []);
});

test('the words: "7 half steps = 3 whole + 1 half"; 1 half step; 2 half steps = 1 whole; 0 is "Same note: 0 steps"; 12 is six whole steps, an octave', () => {
  assert.equal(g.stepsText(7), '7 half steps = 3 whole + 1 half');
  assert.equal(g.stepsText(1), '1 half step = 1 half');
  assert.equal(g.stepsText(2), '2 half steps = 1 whole');
  assert.equal(g.stepsText(3), '3 half steps = 1 whole + 1 half');
  assert.equal(g.stepsText(11), '11 half steps = 5 whole + 1 half');
  assert.equal(g.stepsText(0), 'Same note: 0 steps');
  assert.equal(g.stepsText(12), '12 half steps = 6 whole (an octave)');
  for (let n = 1; n <= 12; n++) assert.match(g.stepsText(n), new RegExp(`^${n} half steps? = `));
  assert.equal(g.prompt({ a: null, b: null }), 'Click a key, then a second key.'); assert.equal(g.prompt({ a: 60, b: null }), 'Now click a second key (the same key again is the same note).');
});

test('SELECTING: the first click chooses a key, the second a second one (the same key again is the same note: 0 steps); with two chosen any click starts over; the lower of the two is the start; the notes strictly between are the ones lit', () => {
  let s = plain(g.select({ a: null, b: null }, 64)); assert.deepEqual(s, { a: 64, b: null });
  assert.deepEqual(plain(g.select(s, 67)), { a: 64, b: 67 }); assert.deepEqual(plain(g.select(s, 64)), { a: 64, b: 64 });
  assert.deepEqual(plain(g.select({ a: 64, b: 67 }, 60)), { a: 60, b: null }); assert.deepEqual(plain(g.select({ a: 64, b: 64 }, 64)), { a: 64, b: null });
  assert.deepEqual(plain(g.ends({ a: 67, b: 60 })), { lo: 60, hi: 67 }); assert.equal(g.ends({ a: 60, b: null }), null);
  assert.deepEqual(plain(g.between({ a: 67, b: 60 })), [61, 62, 63, 64, 65, 66]); assert.deepEqual(plain(g.between({ a: 60, b: 61 })), []); assert.deepEqual(plain(g.between({ a: 60, b: 60 })), []);
  assert.deepEqual(plain(g.between({ a: 60, b: 72 })), [61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71]); assert.deepEqual(plain(g.between({ a: 60, b: null })), []);
  assert.equal(g.LOW, 60); assert.equal(g.HIGH, 72);
});

test('PLAY: the lower note then the higher one 0.6 s later, or both together (the same toggle as the two-note gadget); nothing before two keys are chosen; the same note twice is one note', () => {
  assert.deepEqual(plain(g.planPlay({ a: 60, b: null }, 'up')), []);
  const up = plain(g.planPlay({ a: 67, b: 60 }, 'up')); assert.deepEqual(up.map((n: any) => [n.midi, n.when]), [[60, 0], [67, 0.6]]);
  const tog = plain(g.planPlay({ a: 67, b: 60 }, 'together')); assert.deepEqual(tog.map((n: any) => [n.midi, n.when]), [[60, 0], [67, 0]]);
  assert.equal(plain(g.planPlay({ a: 64, b: 64 }, 'up')).length, 1); assert.equal(plain(g.planPlay({ a: 64, b: 64 }, 'together')).length, 1);
  assert.equal(g.PIANO_OSC_PER_NOTE, 20); assert.ok(Math.abs(g.midiToHz(69) - 440) < 1e-9);
});

// ---- the page, in a DOM ------------------------------------------------------------------------------------------------------------------------------------------------------------
function open() {
  const stub = audioStub(); const errors: string[] = [];
  const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
  win.AudioContext = stub.Ctx; win.Float32Array = Float32Array;
  const s = scriptOf(html); win.document.write(html.replace(`<script>${s}</script>`, '')); win.eval(s);
  const doc = win.document;
  const click = (sel: string) => doc.querySelector(sel).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const key = (m: number) => click(`.key[data-midi="${m}"]`);
  const chips = () => [...doc.querySelectorAll('#chips .chip')].map((c: any) => [c.querySelector('.letter').textContent, c.querySelector('.count').textContent]);
  return { win, doc, stub, errors, click, key, chips, text: (id: string) => doc.getElementById(id).textContent as string };
}
test('THE PAGE: 13 keys C4 to C5 with the black ones; before two clicks nothing is said and Play waits; two clicks give the words, the chips with the half-step count under each, and the notes between lit', () => {
  const p = open();
  assert.equal(p.doc.querySelectorAll('.key').length, 13); assert.equal(p.doc.querySelectorAll('.key.black').length, 5);
  assert.equal(p.text('readout'), 'Click a key, then a second key.'); assert.equal(p.doc.getElementById('play').disabled, true); assert.deepEqual(p.chips(), []);
  p.key(67); p.key(60);                                                                                                                                      // the HIGHER first: the lower is still the start
  assert.equal(p.text('readout'), '7 half steps = 3 whole + 1 half');
  assert.deepEqual(p.chips(), [['W', '2'], ['W', '2'], ['W', '2'], ['H', '1']]);
  assert.equal(p.doc.getElementById('play').disabled, false);
  const lit = [...p.doc.querySelectorAll('.key.between')].map((k: any) => +k.getAttribute('data-midi')).sort((a, b) => a - b); assert.deepEqual(lit, [61, 62, 63, 64, 65, 66]);
  const held = [...p.doc.querySelectorAll('.key.held')].map((k: any) => +k.getAttribute('data-midi')).sort((a, b) => a - b); assert.deepEqual(held, [60, 67]);
  p.key(62); assert.equal(p.text('readout'), 'Now click a second key (the same key again is the same note).'); assert.deepEqual(p.chips(), []); assert.equal(p.doc.querySelectorAll('.key.between').length, 0);
  assert.equal(p.errors.length, 0);
});
test('0 AND 12 on the page: the same key twice is "Same note: 0 steps" with no chips (the row says nothing is between); C4 and C5 are six whole steps, an octave; 1 is one H chip', () => {
  const p = open();
  p.key(64); p.key(64); assert.equal(p.text('readout'), 'Same note: 0 steps'); assert.deepEqual(p.chips(), []); assert.equal(p.doc.getElementById('play').disabled, false); assert.equal(p.doc.querySelectorAll('.key.between').length, 0);
  p.key(60); p.key(72); assert.equal(p.text('readout'), '12 half steps = 6 whole (an octave)'); assert.deepEqual(p.chips().map((c) => c[0]).join(''), 'WWWWWW'); assert.equal(p.doc.querySelectorAll('.key.between').length, 11);
  p.key(61); p.key(62); assert.equal(p.text('readout'), '1 half step = 1 half'); assert.deepEqual(p.chips(), [['H', '1']]);
  assert.equal(p.errors.length, 0);
});
test('THE NOTE says plainly what a whole and a half step are: two half steps, two keys up, the black keys count; H and W are spelled out; no words of the tool', () => {
  const p = open(); const note = p.text('note');
  assert.match(note, /A whole step is two half steps/); assert.match(note, /two keys up/); assert.match(note, /black keys count/);
  assert.match(note, /H is a half step/); assert.match(note, /W is a whole step/);
  assert.doesNotMatch(html, /\bForge\b|forge_|localStorage|sessionStorage/i); assert.doesNotMatch(html, /<script[^>]*src=|<link[^>]*href=|https?:\/\/(?!www\.w3\.org)/i);
});
test('PLAY sounds the two notes with the piano voice, 20 oscillators each: one after the other by default (the lower first, 0.6 s apart), together after the toggle; choosing keys sounds nothing', () => {
  const p = open();
  p.key(67); p.key(60); assert.equal(p.stub.all.length, 0, 'choosing keys plays nothing');
  p.click('#play'); assert.deepEqual(p.stub.osc.map((x: number) => +x.toFixed(2)), [261.63, 392]); assert.equal(p.stub.all.length, 40); assert.ok(p.stub.times[1] - p.stub.times[0] > 0.5);
  p.stub.osc.length = 0; p.stub.all.length = 0; p.stub.times.length = 0; p.click('#mode'); assert.match(p.text('mode'), /together/);
  p.click('#play'); assert.deepEqual(p.stub.osc.map((x: number) => +x.toFixed(2)), [261.63, 392]); assert.equal(p.stub.times[1], p.stub.times[0], 'together: the same moment');
  assert.equal(p.errors.length, 0);
});
test('PIXELS: no margin or padding on html and body, no fixed page height, the strip sized by its viewBox, the rows that change reserve their height (the page is as tall for a half step as for an octave)', () => {
  assert.match(html, /html, body \{ margin: 0; padding: 0;/); assert.doesNotMatch(html, /(?:html|body)[^{]*\{[^}]*\b(?:height|min-height)\s*:\s*\d+(?:px|vh)/);
  assert.match(html, /svg \{ display: block; width: 100%;/); assert.match(html, /\.chips \{[^}]*min-height: \d+px/); assert.match(html, /#readout \{[^}]*min-height: \d+px/);
});
test('THE PIANO VOICE is the vault\'s one block (byte-identical to the lab\'s), and the page carries no other sound code', () => {
  const lab = fs.readFileSync(path.join(DIR, 'piano_voice_lab.html'), 'utf8');
  const BEGIN = '// ==== piano voice BEGIN', END = '// ==== piano voice END';
  const block = (h: string) => h.slice(h.indexOf(BEGIN), h.indexOf('\n', h.indexOf(END)));
  assert.equal(block(html), block(lab)); assert.ok(block(html).length > 5000);
  assert.doesNotMatch(html, /createPeriodicWave|setPeriodicWave/);
});
