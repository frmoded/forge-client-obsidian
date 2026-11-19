#!/usr/bin/env node
// 2026-11-19-0955 - the caption lives INSIDE the figure now (captions.json, apply-captions.mjs), so an italic caption paragraph directly under an `html-embed` or an image figure (`![[...svg]]`) of a CAPTIONED file is the old caption said a second
// time (the wizard re-adds them, and four gadgets were captioned two ways). This removes them from EVERY note of the vault (`git ls-files '*.md'`; a folder that is not a git repository is walked), not only the ones whose text equals the caption.
//   node scripts/dev/strip-caption-lines.mjs [--vault ~/projects/music-theory]            dry run: prints the files and each line it would remove
//   node scripts/dev/strip-caption-lines.mjs [--vault ...] --write                         writes the notes
// A line goes only when ALL of this holds: it is a paragraph (the lines up to the next blank line) that is italic from its first to its last character (`*...*`, `_..._`; never bold, never a line that merely contains italics), it is the first
// paragraph after the figure (blank lines between are skipped; any other text stops the search), and the figure's file (the embed's path, or the image link; a bare file name is resolved to the one captions.json key that ends in it) has an entry in captions.json.
// The blank lines are tidied as seed-captions.mjs --strip-notes did: a removed paragraph with a blank line above and a blank line (or the end of the file) below takes one of them with it. Idempotent: a second run finds nothing.
// `stripCaptionLines(text, captions)` is the pure function the CLI and the test use.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ITALIC = /^(?:\*(?!\*)([\s\S]*?[^*\s]|[^*\s])\*(?!\*)|_(?!_)([\s\S]*?[^_\s]|[^_\s])_(?!_))$/;
/** Is this paragraph (its lines, in order) one italic run from first to last character? */
export function isItalicParagraph(paragraphLines) {
  const t = paragraphLines.map((l) => l.trim()).join(' ').trim();
  if (!t) return false;
  const m = ITALIC.exec(t); if (!m) return false;
  const inner = (m[1] ?? m[2]) ?? '';
  return !/(^|[^*])\*(?!\*)|(^|[^_])_(?!_)/.test(inner.replace(/\\[*_]/g, '')); // no second italic run inside: `*a* b *c*` is not one run
}

/** The captions.json key a figure reference names: the exact key, or the one key that ends in `/<name>` when the reference is a bare file name. */
export function captionKey(ref, keys) {
  const r = ref.trim(); if (keys.has(r)) return r;
  if (!r.includes('/')) { const hit = [...keys].filter((k) => k.endsWith('/' + r)); if (hit.length === 1) return hit[0]; }
  return null;
}

/** Remove the italic caption paragraphs under captioned figures. Returns { text, removed: [{ line (1-based, of the INPUT), figure, text }] }. */
export function stripCaptionLines(text, captions) {
  const keys = new Set(Object.keys(captions)); const lines = text.split('\n'); const drop = new Set(); const removed = [];
  for (let i = 0; i < lines.length; i++) {
    let figure = null, endAt = i;
    if (lines[i].trim() === '```html-embed') { figure = (lines[i + 1] ?? '').trim(); endAt = i + 1; while (endAt < lines.length && lines[endAt].trim() !== '```') endAt++; }
    else { const m = /^!\[\[([^\]|]+)(\|[^\]]*)?\]\]\s*$/.exec(lines[i]); if (m) figure = m[1]; }
    if (!figure) continue;
    const key = captionKey(figure, keys); if (!key) continue;
    let j = endAt + 1; while (j < lines.length && lines[j].trim() === '') j++;
    if (j >= lines.length) continue;
    let e = j; while (e + 1 < lines.length && lines[e + 1].trim() !== '') e++;
    const para = lines.slice(j, e + 1);
    if (!isItalicParagraph(para)) continue;
    for (let k = j; k <= e; k++) drop.add(k);
    removed.push({ line: j + 1, figure: key, text: para.map((l) => l.trim()).join(' ') });
    i = e;
  }
  if (!drop.size) return { text, removed };
  const next = [];
  for (let i = 0; i < lines.length; i++) {
    if (!drop.has(i)) { next.push(lines[i]); continue; }
    if (!drop.has(i + 1)) { // the last line of a removed paragraph decides about the blank line above its first line
      let s = i; while (drop.has(s - 1)) s--;
      if (lines[s - 1] !== undefined && lines[s - 1].trim() === '' && (lines[i + 1] === undefined || lines[i + 1].trim() === '')) next.pop();
    }
  }
  return { text: next.join('\n'), removed };
}

/** Every .md of the vault: `git ls-files` when the vault is a git repository (what is tracked), else a walk of the folder (dot folders skipped). */
export function listNotes(vault) {
  if (fs.existsSync(path.join(vault, '.git'))) return execFileSync('git', ['ls-files', '-z', '*.md'], { cwd: vault, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean).sort();
  const walk = (d) => fs.readdirSync(path.join(vault, d), { withFileTypes: true }).flatMap((e) => (e.name.startsWith('.') ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.md') ? [path.join(d, e.name)] : []));
  return walk('').sort();
}

export function stripVault(vault, { write = false } = {}) {
  const captions = JSON.parse(fs.readFileSync(path.join(vault, 'captions.json'), 'utf8'));
  const notes = listNotes(vault);
  const files = [];
  for (const note of notes) {
    const p = path.join(vault, note); if (!fs.existsSync(p)) continue;
    const before = fs.readFileSync(p, 'utf8'); const r = stripCaptionLines(before, captions);
    if (!r.removed.length) continue;
    files.push({ note, removed: r.removed }); if (write) fs.writeFileSync(p, r.text);
  }
  return files;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2); const i = args.indexOf('--vault');
  const vault = (i >= 0 ? args[i + 1] : '~/projects/music-theory').replace(/^~(?=$|\/)/, os.homedir());
  const write = args.includes('--write');
  const files = stripVault(vault, { write });
  let n = 0;
  for (const f of files) { console.log(f.note); for (const r of f.removed) { n++; console.log(`  ${f.note}:${r.line}  (under ${r.figure})  ${r.text}`); } }
  console.log(`${n} italic caption line${n === 1 ? '' : 's'} in ${files.length} note${files.length === 1 ? '' : 's'}${write ? ' removed' : ' (dry run: nothing written; --write removes them)'}`);
}
