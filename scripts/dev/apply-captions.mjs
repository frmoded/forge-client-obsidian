#!/usr/bin/env node
// 2026-11-19-0940 - put the CAPTION INSIDE every figure listed in <vault>/captions.json (key = the vault path of a gadget .html or an image .svg; value = { title, line }), in the style of the loudness graphs.
// Idempotent (a figure that already carries its caption is rewritten to the same bytes); `--check` writes nothing and exits 1 naming each figure whose file differs from what the script would write.
//   node scripts/dev/apply-captions.mjs [--vault ~/projects/music-theory] [--also <another vault root>]... [--check]
// `applyCaptionsTo(root, { check })` is the same thing as a function (the two gadget generators and the tests use it).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCaption } from './caption-core.mjs';

export const CAPTIONS_FILE = 'captions.json';
export function readCaptions(root) {
  const f = path.join(root, CAPTIONS_FILE); if (!fs.existsSync(f)) return {};
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const [k, v] of Object.entries(j)) if (!v || typeof v.title !== 'string' || typeof v.line !== 'string' || !v.title.trim() || !v.line.trim()) throw new Error(`${CAPTIONS_FILE}: "${k}" needs a title and a line`);
  return j;
}
/** The text of `rel` (a vault path) as it must be on disk: with its caption when captions.json has one. */
export const withCaption = (root, rel, text, captions = readCaptions(root)) => applyCaption(rel, text, captions[rel] ?? null);

export function applyCaptionsTo(root, { check = false } = {}) {
  const captions = readCaptions(root); const changed = [], missing = [];
  for (const rel of Object.keys(captions).sort()) {
    const f = path.join(root, rel);
    if (!fs.existsSync(f)) { missing.push(rel); continue; }
    const before = fs.readFileSync(f, 'utf8'); const after = applyCaption(rel, before, captions[rel]);
    if (after !== before) { changed.push(rel); if (!check) fs.writeFileSync(f, after); }
  }
  return { changed, missing, total: Object.keys(captions).length };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const take = (name) => { const out = []; for (let i = 0; i < args.length; i++) if (args[i] === name) { out.push(args[i + 1]); args.splice(i, 2); i--; } return out; };
  const expand = (p) => p.replace(/^~(?=$|\/)/, os.homedir());
  const check = args.includes('--check');
  const roots = [expand(take('--vault')[0] ?? '~/projects/music-theory'), ...take('--also').map(expand)];
  let bad = false;
  for (const root of roots) {
    const r = applyCaptionsTo(root, { check });
    console.log(`${root}: ${r.total} captions, ${r.changed.length} ${check ? 'differ' : 'written'}${r.missing.length ? `, ${r.missing.length} MISSING files` : ''}`);
    for (const f of r.changed) console.log(`  ${check ? 'differs' : 'wrote'} ${f}`);
    for (const f of r.missing) console.log(`  MISSING ${f}`);
    if (r.missing.length || (check && r.changed.length)) bad = true;
  }
  process.exit(bad ? 1 : 0);
}
