#!/usr/bin/env node
// 2026-11-19-0940 - every html-embed (and every `![[...svg]]` figure) of the WHOLE vault whose file has no entry in captions.json: its note, its file and the nearest sentence (the last prose line above it), so that forge-core can write the missing captions. Invents nothing.
//   node scripts/dev/report-uncaptioned.mjs [--vault ~/projects/music-theory]      markdown on stdout
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2); const i = args.indexOf('--vault');
const vault = (i >= 0 ? args[i + 1] : '~/projects/music-theory').replace(/^~(?=$|\/)/, os.homedir());
const captions = JSON.parse(fs.readFileSync(path.join(vault, 'captions.json'), 'utf8'));
const notes = execFileSync('git', ['ls-files', '-z', '*.md'], { cwd: vault, encoding: 'utf8' }).split('\0').filter(Boolean).sort();
const rows = [];
for (const note of notes) {
  const lines = fs.readFileSync(path.join(vault, note), 'utf8').split('\n');
  for (let k = 0; k < lines.length; k++) {
    let figure = null, kind = '';
    if (lines[k].trim() === '```html-embed') { figure = lines[k + 1].trim(); kind = 'widget'; }
    else { const m = /^!\[\[([^\]|]+\.(?:svg|png|jpg|jpeg|gif|webp))(\|[^\]]*)?\]\]\s*$/i.exec(lines[k]); if (m) { figure = m[1]; kind = 'image'; } }
    if (!figure || figure in captions) continue;
    let j = k - 1; while (j >= 0 && (lines[j].trim() === '' || lines[j].trim().startsWith('```'))) j--;
    let near = j >= 0 ? lines[j].trim() : ''; near = near.replace(/^#+\s*/, '').replace(/\s+/g, ' ');
    const sentence = (near.match(/[^.!?]*[.!?]?\s*$/)?.[0] ?? near).trim() || near;
    rows.push({ note, kind, figure, near: (near.length > 160 ? near.slice(0, 157) + '...' : near), line: k + 1 });
  }
}
const widgets = rows.filter((r) => r.kind === 'widget'), images = rows.filter((r) => r.kind === 'image');
console.log(`## html-embeds with no entry in captions.json: ${widgets.length}\n`);
for (const r of widgets) console.log(`- ${r.note}:${r.line} — ${r.figure.split('/').pop()} — nearest sentence: ${r.near}`);
console.log(`\n## image figures with no entry in captions.json: ${images.length}\n`);
for (const r of images) console.log(`- ${r.note}:${r.line} — ${r.figure.split('/').pop()} — nearest sentence: ${r.near}`);
