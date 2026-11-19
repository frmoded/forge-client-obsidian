#!/usr/bin/env node
// 2026-11-19-0940 - write the MEASURED height of a gadget into EVERY html-embed of that file in the vault's notes: the second line of the fence (the number under the path), nothing else. Vault-wide: a note anywhere in the vault that embeds the file gets it.
//   node scripts/dev/set-embed-heights.mjs --heights <json: { "<gadget path>": <px> }> [--vault ~/projects/music-theory] [--dry]       prints  note: old -> new  for every embed it changes
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function rewriteHeights(text, heights) {
  const lines = text.split('\n'); const changes = [];
  for (let i = 0; i < lines.length - 2; i++) {
    if (lines[i].trim() !== '```html-embed') continue;
    const file = lines[i + 1].trim(); if (!(file in heights)) continue;
    const old = lines[i + 2].trim(); if (!/^\d+$/.test(old)) throw new Error(`${file}: the line under the path is not a height: "${lines[i + 2]}"`);
    if (Number(old) !== heights[file]) { lines[i + 2] = String(heights[file]); changes.push({ file, old: Number(old), now: heights[file] }); }
  }
  return { text: lines.join('\n'), changes };
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2); const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const vault = arg('--vault', '~/projects/music-theory').replace(/^~(?=$|\/)/, os.homedir());
  const heights = JSON.parse(fs.readFileSync(arg('--heights').replace(/^~(?=$|\/)/, os.homedir()), 'utf8')); const dry = args.includes('--dry');
  const notes = execFileSync('git', ['ls-files', '-z', '*.md'], { cwd: vault, encoding: 'utf8' }).split('\0').filter(Boolean);
  let n = 0;
  for (const note of notes) {
    const p = path.join(vault, note); if (!fs.existsSync(p)) continue;
    const r = rewriteHeights(fs.readFileSync(p, 'utf8'), heights);
    for (const c of r.changes) { console.log(`${note}: ${c.file.split('/').pop()}  ${c.old} -> ${c.now}`); n++; }
    if (r.changes.length && !dry) fs.writeFileSync(p, r.text);
  }
  console.log(`${n} embeds ${dry ? 'would change' : 'changed'}`);
}
