#!/usr/bin/env node
// 2026-11-17-2003 - build the five SCALE EXERCISE widgets (the "build the scale" gadgets redesigned to look like the Scales hub player) from ONE template and the blocks of scale_player.html, so the blocks are byte-identical by construction:
//   scripts/dev/templates/scale-exercise.template.html  +  the player's `scale core`, `piano voice` and `scale view` blocks  ->  scale_build_major / _natural_minor / _modes_and_minor / _other_scales and scale_ear_build_the_scale (.html)
// Each file differs from the others only by its `config` block (the scales it offers) and its <title>; src/scale-build-exercise.test.ts pins that and the three shared blocks.
//   node scripts/dev/make-scale-exercises.mjs [--vault ~/projects/music-theory] [--also <another vault root, e.g. assets/vaults/music-theory>]...
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const take = (name) => { const out = []; for (let i = 0; i < args.length; i++) if (args[i] === name) { out.push(args[i + 1]); args.splice(i, 2); i--; } return out; };
const expand = (p) => p.replace(/^~(?=$|\/)/, os.homedir());
const vault = expand(take('--vault')[0] ?? '~/projects/music-theory');
const also = take('--also').map(expand);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const template = fs.readFileSync(path.join(ROOT, 'scripts/dev/templates/scale-exercise.template.html'), 'utf8');
const dir = (root) => path.join(root, 'scales/resources/html');
const player = fs.readFileSync(path.join(dir(vault), 'scale_player.html'), 'utf8');

/** The lines of a marked block of the player, BEGIN line to END line inclusive (each with its newline). */
function block(name) {
  const a = player.indexOf(`  // ==== ${name} BEGIN`); const e = player.indexOf(`  // ==== ${name} END`);
  if (a < 0 || e < a) throw new Error(`scale_player.html has no "${name}" block`);
  return player.slice(a, player.indexOf('\n', e) + 1).replace(/\n$/, '');
}
const prelude = (() => { const a = player.indexOf('  var BASE = 60, LOW'); const i = player.indexOf('  function isBlack', a); return player.slice(a, player.indexOf('\n', i)).replace(/^  /, '').replace('STEP_SECONDS = 0.45', 'STEP_SECONDS = 0.45'); })();

const FILES = [
  { file: 'scale_build_major.html', title: 'Exercise: build the major scale', scales: ['major'] },
  { file: 'scale_build_natural_minor.html', title: 'Exercise: build the natural minor scale', scales: ['natural_minor'] },
  { file: 'scale_build_modes_and_minor.html', title: 'Exercise: build modes and minor scales', scales: ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian', 'natural_minor', 'harmonic_minor', 'melodic_minor'] },
  { file: 'scale_build_other_scales.html', title: 'Exercise: build pentatonic, blues and symmetric scales', scales: ['major_pentatonic', 'minor_pentatonic', 'blues', 'whole_tone', 'diminished_wh', 'diminished_hw'] },
  { file: 'scale_ear_build_the_scale.html', title: 'Exercise: build a scale', scales: ['major', 'natural_minor', 'harmonic_minor', 'dorian', 'mixolydian', 'major_pentatonic', 'minor_pentatonic'] },
];
const fill = (t, f) => t
  .replace('@@TITLE@@', () => f.title)
  .replace('@@SCALES@@', () => `[${f.scales.map((s) => JSON.stringify(s)).join(', ')}]`)
  .replace('@@PRELUDE@@', () => prelude)
  .replace('@@SCALE_CORE@@', () => block('scale core'))
  .replace('@@PIANO_VOICE@@', () => block('piano voice'))
  .replace('@@SCALE_VIEW@@', () => block('scale view'));
for (const root of [vault, ...also]) {
  fs.mkdirSync(dir(root), { recursive: true });
  if (root !== vault) fs.copyFileSync(path.join(dir(vault), 'scale_player.html'), path.join(dir(root), 'scale_player.html'));      // the player carries the shared view block: the copy must match
  for (const f of FILES) { const out = fill(template, f); if (/@@\w+@@/.test(out)) throw new Error(`${f.file}: a placeholder is left`); fs.writeFileSync(path.join(dir(root), f.file), out); console.log(`wrote ${path.join(dir(root), f.file)} (${out.length} bytes)`); }
}
