#!/usr/bin/env node
// browser-proof.mjs — a UI drain's real-browser proof as ONE command (wall-clock only; see README.md).
//
// Usage (from the client repo root):
//   node scripts/dev/browser-proof.mjs [--before <git-ref>] [--out <dir>] [--widget <rhythm_box.html>]
//     --before   build the SAME harness from this commit too (a worktree, removed afterwards) and compare a vault WITHOUT the profile against it:
//                measurements.json -> normalIdenticalToBefore (the pane's full outerHTML) — the "no harm to other vaults" proof in a browser
//     --out      output directory (default: $TMPDIR/browser-proof-<timestamp>): bundles, Obsidian's app.css, plugin-styles.css, measurements.json, screenshots in shots/
//     --widget   the Rhythm Box widget (default: ../music-theory/music_instruments/resources/html/rhythm_box.html)
// Needs: Google Chrome (or CHROME=<binary>), Obsidian installed (its app.css is read from the newest obsidian-<version>.asar), the music wheels (the REAL engine runs behind /compute).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(here, '../..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const before = opt('--before', null);
const out = path.resolve(opt('--out', path.join(process.env.TMPDIR || os.tmpdir(), `browser-proof-${Date.now()}`)));
const widget = path.resolve(opt('--widget', path.join(REPO, '../music-theory/music_instruments/resources/html/rhythm_box.html')));
const die = (m) => { console.error(`browser-proof: ${m}`); process.exit(2); };
const run = (cmd, argv, env = {}) => { const r = spawnSync(cmd, argv, { cwd: REPO, stdio: 'inherit', env: { ...process.env, ...env } }); if (r.status !== 0) die(`${cmd} ${argv.join(' ')} failed (${r.status})`); };

if (!fs.existsSync(widget)) die(`widget not found: ${widget} (pass --widget)`);
fs.mkdirSync(path.join(out, 'shots'), { recursive: true });
console.log(`browser-proof: output in ${out}`);

// Obsidian's OWN stylesheet, so the pane is laid out under the real CSS.
const appCss = path.join(out, 'app.css');
if (!fs.existsSync(appCss)) {
  const dir = path.join(os.homedir(), 'Library', 'Application Support', 'obsidian');
  const asars = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^obsidian-[\d.]+\.asar$/.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
  if (!asars.length) die(`no obsidian-<version>.asar under ${dir} (is Obsidian installed?)`);
  run('node', [path.join(here, 'asar-cat.mjs'), path.join(dir, asars.at(-1)), 'app.css', appCss]);
}
fs.copyFileSync(path.join(REPO, 'styles.css'), path.join(out, 'plugin-styles.css'));

// The bundles: the real view, music and lean editions (+ the "before" commit's, from a worktree).
const bundle = (file, env) => run('node', [path.join(here, 'browser/build.mjs')], { OUT: path.join(out, file), ...env });
bundle('harness-music.js', { EDITION: 'music' });
bundle('harness-lean.js', { EDITION: 'lean' });
if (before) {
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-proof-before-'));
  fs.rmSync(wt, { recursive: true });
  run('git', ['worktree', 'add', '--detach', wt, before]);
  try {
    bundle('harness-before.js', { EDITION: 'music', CLIENT: wt });
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', wt], { cwd: REPO, stdio: 'inherit' });
    spawnSync('git', ['worktree', 'prune'], { cwd: REPO });
  }
}

// The measurement: real Chrome, real clicks in the widget iframe, the real engine behind /compute.
run('node', [path.join(here, 'measure.ts'), widget, out, path.join(out, 'shots')]);
console.log(`browser-proof: done. ${path.join(out, 'measurements.json')}  shots: ${path.join(out, 'shots')}`);
