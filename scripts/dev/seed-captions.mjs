#!/usr/bin/env node
// 2026-11-19-0940 - SEED <vault>/captions.json MECHANICALLY from the italic caption lines the wizard wrote under every embed and figure in intervals/, scales/ and circle_of_fifths/ (the line directly under the closing fence of an html-embed, or
// under a `![[...svg]]` line). title = the text before the first colon, line = the rest with the first letter capitalised and the final full stop dropped; no colon: title = the first five words, line = the whole sentence.
// ONE caption per figure: when the same figure is captioned differently in two notes, the first note in sorted path order wins and the others are listed as CONFLICTS (the report is for forge-core to correct).
// An existing entry in captions.json is never overwritten. `--drop-levels <file>...` removes the sentence about Easy, medium and hard from those figures (the two build exercises that no longer have levels).
//   node scripts/dev/seed-captions.mjs [--vault ~/projects/music-theory] [--report <md file>] [--dry]      prints the table
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { seedFromItalic, italicLine } from './caption-core.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const all = (n) => args.flatMap((a, i) => (a === n ? [args[i + 1]] : []));
const vault = (arg('--vault', '~/projects/music-theory')).replace(/^~(?=$|\/)/, os.homedir());
const dry = args.includes('--dry');
const dropLevels = new Set(all('--drop-levels'));
const DIRS = ['intervals', 'scales', 'circle_of_fifths'];
const tracked = execFileSync('git', ['ls-files', '-z', ...DIRS.map((d) => `${d}/*.md`)], { cwd: vault, encoding: 'utf8' }).split('\0').filter(Boolean).sort();

const found = []; // { figure, note, lineNo, text }
for (const note of tracked) {
  const lines = fs.readFileSync(path.join(vault, note), 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    let figure = null, endAt = i;
    if (lines[i].trim() === '```html-embed') { figure = lines[i + 1].trim(); endAt = i + 1; while (endAt < lines.length && lines[endAt].trim() !== '```') endAt++; }
    else { const m = /^!\[\[([^\]|]+\.svg)(\|[^\]]*)?\]\]\s*$/.exec(lines[i]); if (m) figure = m[1]; }
    if (!figure) continue;
    let j = endAt + 1; while (j < lines.length && lines[j].trim() === '') j++;
    const m = j < lines.length ? /^\*([^*].*[^*]|[^*])\*$/.exec(lines[j].trim()) : null;
    found.push({ figure, note, lineNo: j + 1, text: m ? m[1] : null });
  }
}
const stripLevels = (s) => s.replace(/\s*(Easy|Choose easy), medium and hard[^.]*\.\s*/i, ' ').replace(/\s*Choose easy, medium or hard;[^.]*\.?/i, '').replace(/\s+/g, ' ').trim();
const file = path.join(vault, 'captions.json');
const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const out = { ...existing }; const table = [], conflicts = [], noCaption = [];
for (const f of found) {
  if (f.text === null) { noCaption.push(f); continue; }
  let text = f.text; if (dropLevels.has(f.figure)) text = stripLevels(text);
  const seed = seedFromItalic(text);
  const prior = table.find((t) => t.figure === f.figure);
  if (prior) { if (prior.text !== f.text) conflicts.push({ figure: f.figure, kept: prior.note, dropped: f.note, text: f.text }); prior.notes.push(f.note); continue; }
  table.push({ figure: f.figure, note: f.note, notes: [f.note], text: f.text, ...seed });
  if (!(f.figure in out)) out[f.figure] = seed;
}
const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
if (!dry) fs.writeFileSync(file, JSON.stringify(sorted, null, 2) + '\n');
const md = ['| figure | title | line | from note |', '|---|---|---|---|', ...table.map((t) => `| ${t.figure} | ${out[t.figure].title} | ${out[t.figure].line} | ${t.notes.join('; ')} |`)];
if (conflicts.length) md.push('', 'CONFLICTS (the same figure captioned differently; the first note wins):', ...conflicts.map((c) => `- ${c.figure}: kept the line of ${c.kept}; ${c.dropped} said: ${c.text}`));
if (noCaption.length) md.push('', 'NO ITALIC CAPTION UNDER:', ...noCaption.map((n) => `- ${n.figure} in ${n.note}`));
// --strip-notes: remove the italic line directly under an embed or figure when it is EXACTLY the line the seed was made from (an embed whose note said it differently keeps its line, and is listed)
if (args.includes('--strip-notes') && !dry) {
  const seedText = new Map(table.map((t) => [t.figure, t.text])); const removed = [], kept = [];
  const byNote = new Map(); for (const f of found) if (f.text !== null) { (byNote.get(f.note) ?? byNote.set(f.note, []).get(f.note)).push(f); }
  for (const [note, fs_] of byNote) {
    const p = path.join(vault, note); const lines = fs.readFileSync(p, 'utf8').split('\n'); const drop = new Set();
    for (const f of fs_) { if (seedText.get(f.figure) === f.text) { drop.add(f.lineNo - 1); removed.push(`${note}:${f.lineNo}`); } else kept.push(`${note}:${f.lineNo} (${f.figure}) ${f.text}`); }
    if (!drop.size) continue;
    const next = []; for (let i = 0; i < lines.length; i++) { if (drop.has(i)) { if (lines[i - 1] !== undefined && lines[i - 1].trim() === '' && (lines[i + 1] === undefined || lines[i + 1].trim() === '')) { next.pop(); } continue; } next.push(lines[i]); }
    fs.writeFileSync(p, next.join('\n'));
  }
  console.log(`\nstripped ${removed.length} italic lines; kept ${kept.length} that said something else:\n${kept.map((k) => '  ' + k).join('\n')}`);
}
const rep = arg('--report', null); if (rep) fs.writeFileSync(rep.replace(/^~(?=$|\/)/, os.homedir()), md.join('\n') + '\n');
console.log(md.join('\n'));
console.log(`\n${Object.keys(sorted).length} captions in ${file}${dry ? ' (dry: nothing written)' : ''}`);
void italicLine;
