// 2026-11-16-1200 - scale_player_basic.html: the first Scales page's player. The full player (scale_player.html) with only what a first-time reader needs: a tonic, ONLY major and natural minor, the W / H chips, the piano strip, the staff with
// the letter row, one Play (up); NO Up / Down switch (it was disabled for these two scales and confused readers), no modes, no other scales. It shares the scale code with the full player as an IDENTICAL block (a copy that drifts is a failure);
// the basic file only drops UI. The no-scroll check at 800 and 360 px wide is real Chrome: scripts/dev/measure-step-gadgets.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';

const DIR = path.resolve(import.meta.dirname, '../assets/vaults/music-theory/scales/resources/html');
const full = fs.readFileSync(path.join(DIR, 'scale_player.html'), 'utf8');
const html = fs.readFileSync(path.join(DIR, 'scale_player_basic.html'), 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];
const block = (h: string, a: string, b: string): string => { const i = h.indexOf(a), j = h.indexOf(b); assert.ok(i > 0 && j > i, `${a} is there`); return h.slice(i, h.indexOf('\n', j)); };
function pure(h: string): any { const mod: { exports: any } = { exports: {} }; vm.runInNewContext(scriptOf(h), { module: mod, Math, Float32Array }); return mod.exports; }

test('THE SHARED CODE IS IDENTICAL: the scale core block, the helpers around Play (withOctave, usesForm, effectiveForm, planPlay) and the piano voice block are byte for byte the full player\'s; the basic file only drops UI', () => {
  const core = (h: string) => block(h, '// ==== scale core BEGIN', '// ==== scale core END');
  assert.equal(core(html), core(full)); assert.ok(core(html).length > 6000, 'non-vacuity: the whole block');
  const helpers = (h: string) => h.slice(h.indexOf('// The octave note is the tonic again'), h.indexOf('// ==== piano voice BEGIN'));
  assert.equal(helpers(html), helpers(full)); assert.match(helpers(html), /function planPlay/);
  const voice = (h: string) => block(h, '// ==== piano voice BEGIN', '// ==== piano voice END');
  assert.equal(voice(html), voice(full));
  assert.doesNotMatch(core(html), /document|window/, 'pure: no DOM');
  const g = pure(html), f = pure(full);
  for (const id of ['major', 'natural_minor']) for (let t = 0; t < 12; t++) assert.deepEqual(JSON.parse(JSON.stringify(g.spellScale(t, id, 'up'))), JSON.parse(JSON.stringify(f.spellScale(t, id, 'up'))), `${id} ${t}`);
});

// ---- the page, in a DOM ------------------------------------------------------------------------------------------------------------------------------------------------------------
function open() {
  const stub = audioStub(); const errors: string[] = []; const sched: Array<{ fn: () => void; ms: number }> = [];
  const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
  win.AudioContext = stub.Ctx; win.Float32Array = Float32Array; win.__schedule = (fn: () => void, ms: number) => { sched.push({ fn, ms }); return sched.length; }; win.__unschedule = () => {};
  const s = scriptOf(html); win.document.write(html.replace(`<script>${s}</script>`, '')); win.eval(s);
  const doc = win.document;
  const set = (id: string, v: string) => { const e = doc.getElementById(id); e.value = v; e.dispatchEvent(new win.Event('change', { bubbles: true })); };
  const click = (sel: string) => doc.querySelector(sel).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  return { win, doc, stub, errors, sched, set, click, q: (s: string) => doc.querySelector(s), qa: (s: string) => [...doc.querySelectorAll(s)] as any[] };
}
test('ONLY WHAT A FIRST-TIME READER NEEDS: a tonic select, a scale select with major and natural minor and nothing else, the step chips, the piano strip, the staff, the letters, ONE Play; no Up / Down switch, no mode, no optgroup', () => {
  const p = open();
  assert.deepEqual(p.qa('#scale option').map((o) => o.value), ['major', 'natural_minor']); assert.deepEqual(p.qa('#scale option').map((o) => o.textContent), ['major', 'natural minor']);
  assert.equal(p.qa('#scale optgroup').length, 0); assert.equal(p.qa('#tonic option').length, 12);
  assert.equal(p.q('#form'), null); assert.equal(p.q('#form-up'), null); assert.equal(p.q('#form-down'), null); assert.equal(p.q('#play-down'), null); assert.equal(p.q('#play-both'), null);
  assert.deepEqual(p.qa('button').map((b) => b.id), ['play']); assert.equal(p.q('#play').textContent, 'Play');
  for (const id of ['chips', 'strip', 'staff', 'letters', 'note']) assert.ok(p.q(`#${id}`), id);
  assert.doesNotMatch(html.replace(/\/\/ ==== scale core BEGIN[\s\S]*?\/\/ ==== scale core END[^\n]*/, ''), /Direction of the scale|form-up|form-down|play-down|play-both/);
  assert.equal(p.errors.length, 0);
});
test('MAJOR AND NATURAL MINOR on the page: C major is W W H W W W H and the strip lights C D E F G A B C with the tonic marked; A natural minor is W H W W H W W, spelled A B C D E F G; the tonic select spells the tonic as the scale does', () => {
  const p = open();
  assert.deepEqual(p.qa('#chips .chip').map((c) => c.textContent), ['W', 'W', 'H', 'W', 'W', 'W', 'H']);
  assert.deepEqual(p.qa('.key.lit').map((k) => +k.getAttribute('data-midi')).sort((a, b) => a - b), [60, 62, 64, 65, 67, 69, 71, 72]);
  assert.equal(p.qa('.key.tonic').length, 2);
  p.set('tonic', '9'); p.set('scale', 'natural_minor');
  assert.deepEqual(p.qa('#chips .chip').map((c) => c.textContent), ['W', 'H', 'W', 'W', 'H', 'W', 'W']);
  assert.deepEqual(p.qa('#letters .letter').map((l) => l.getAttribute('aria-label')), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  p.set('tonic', '1'); assert.equal(p.q('#tonic').options[1].textContent, 'C♯', 'C-sharp natural minor: the tonic is spelled for ITS key (C sharp, not D flat)');
  p.set('tonic', '3'); p.set('scale', 'major'); assert.equal(p.q('#tonic').options[3].textContent, 'E♭'); assert.deepEqual(p.qa('#letters .letter').map((l) => l.getAttribute('aria-label')), ['E flat', 'F', 'G', 'A flat', 'B flat', 'C', 'D']);
  assert.ok(p.q('#staff').children.length > 5, 'the staff is drawn'); assert.equal(p.errors.length, 0);
});
test('PLAY sounds the scale UP with the piano voice: 8 notes of 20 oscillators, the tonic first and the octave last, each note lit as it sounds; nothing sounds before Play', () => {
  const p = open();
  assert.equal(p.stub.all.length, 0);
  p.click('#play'); assert.equal(p.stub.osc.length, 8); assert.equal(p.stub.all.length, 160);
  assert.deepEqual(p.stub.osc.map((x: number) => Math.round(x)), [262, 294, 330, 349, 392, 440, 494, 523]);
  p.sched[0].fn(); assert.equal(p.qa('.key.sounding').length, 1, 'the sounding note is lit'); assert.equal(p.qa('.letter.sounding').length, 1);
  p.sched.forEach((s) => s.fn()); assert.equal(p.qa('.key.sounding').length, 0, 'lit off at the end');
  assert.equal(p.errors.length, 0);
});
test('PIXELS (the same rules as the full player): no margin or padding on html and body, no fixed page height, both drawings sized by their viewBox, the rows reserve their height; no words of the tool, nothing from the network', () => {
  assert.match(html, /html, body \{ margin: 0; padding: 0;/); assert.doesNotMatch(html, /(?:html|body)[^{]*\{[^}]*\b(?:height|min-height)\s*:\s*\d+(?:px|vh)/);
  assert.match(html, /svg \{ display: block; width: 100%;/); assert.match(html, /#note \{ min-height: \d+px/); assert.match(html, /\.chips \{[^}]*min-height: \d+px/); assert.match(html, /\.letters \{[^}]*min-height: \d+px/);
  assert.doesNotMatch(html, /\bForge\b|forge_|localStorage|sessionStorage/i); assert.doesNotMatch(html, /<script[^>]*src=|<link[^>]*href=|https?:\/\/(?!www\.w3\.org)/i);
});
