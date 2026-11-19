#!/usr/bin/env node
// 2026-11-19-0900 - build the FOUR circle of fifths gadgets from their templates (scripts/dev/templates/circle/*) and the shared blocks: the Scales player's scale core, piano voice and scale view (read from scale_player.html, byte for byte) and the circle blocks
// (circle core, exercise core, wheel, staff), each written once here and copied into every file that uses it. src/circle-of-fifths-gadget.test.ts pins that the copies are identical, that the generator reproduces the files, and everything else.
//   node scripts/dev/make-circle-gadgets.mjs [--vault ~/projects/music-theory] [--also <another vault root, e.g. assets/vaults/music-theory>]...
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCaptions, withCaption } from './apply-captions.mjs';

const args = process.argv.slice(2);
const take = (name) => { const out = []; for (let i = 0; i < args.length; i++) if (args[i] === name) { out.push(args[i + 1]); args.splice(i, 2); i--; } return out; };
const expand = (p) => p.replace(/^~(?=$|\/)/, os.homedir());
const vault = expand(take('--vault')[0] ?? '~/projects/music-theory');
const also = take('--also').map(expand);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const T = path.join(ROOT, 'scripts/dev/templates/circle');
const rd = (f) => fs.readFileSync(path.join(T, f), 'utf8').replace(/\n$/, '');
const player = fs.readFileSync(path.join(vault, 'scales/resources/html/scale_player.html'), 'utf8');
function block(name) {
  const a = player.indexOf(`  // ==== ${name} BEGIN`); const e = player.indexOf(`  // ==== ${name} END`);
  if (a < 0 || e < a) throw new Error(`scale_player.html has no "${name}" block`);
  return player.slice(a, player.indexOf('\n', e) + 1).replace(/\n$/, '');
}
const prelude = (() => { const a = player.indexOf('  var BASE = 60, LOW'); const i = player.indexOf('  function isBlack', a); return player.slice(a, player.indexOf('\n', i)); })();
const CAPTIONS = readCaptions(vault);                                                                                  // the caption inside the figure (2026-11-19-0940)
const FILES = [
  { file: 'circle_of_fifths.html', template: 'explorer.template.html', title: 'The circle of fifths' },
  { file: 'circle_exercise_key_to_signature.html', template: 'ex1.template.html', title: 'Exercise: key to signature' },
  { file: 'circle_exercise_signature_to_key.html', template: 'ex2.template.html', title: 'Exercise: signature to key' },
  { file: 'circle_exercise_neighbours.html', template: 'ex3.template.html', title: 'Exercise: neighbours on the circle' },
];
const fill = (t, f) => t
  .replace('@@HEAD@@', () => rd('head.html'))
  .replace('@@TITLE@@', () => f.title)
  .replace('@@PRELUDE@@', () => prelude)
  .replace('@@SCALE_CORE@@', () => block('scale core'))
  .replace('@@PIANO_VOICE@@', () => block('piano voice'))
  .replace('@@SCALE_VIEW@@', () => block('scale view'))
  .replace('@@CIRCLE_CORE@@', () => rd('circle-core.js'))
  .replace('@@CIRCLE_EXERCISE_CORE@@', () => rd('circle-exercise-core.js'))
  .replace('@@CIRCLE_WHEEL@@', () => rd('circle-wheel-view.js'))
  .replace('@@CIRCLE_STAFF@@', () => rd('circle-staff-view.js'));
for (const root of [vault, ...also]) {
  const dir = path.join(root, 'circle_of_fifths/resources/html');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of FILES) { const out = withCaption(vault, `circle_of_fifths/resources/html/${f.file}`, fill(rd(f.template), f) + '\n', CAPTIONS); if (/@@\w+@@/.test(out)) throw new Error(`${f.file}: a placeholder is left`); fs.writeFileSync(path.join(dir, f.file), out); console.log(`wrote ${path.join(dir, f.file)} (${out.length} bytes)`); }
}
