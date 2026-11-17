// 2026-11-17-0901 A: which commit does each vault's installed plugin carry? Every vault has its own copy (<vault>/.obsidian/plugins/forge-actions/main.js); the console banner
// shows the stamp of the copy that Obsidian loaded for the vault you opened. Reads main.js and nothing else (a data.json holds the transpile token: it is never opened).
//
//   node scripts/installed-builds.mjs [--head <sha>] [root ...]       roots default to ~/projects and ~/forge-vaults (their direct children are the vaults); head defaults to origin/main
//   node scripts/installed-builds.mjs --verify <main.js> <sha> <clean|dirty>      exit 1 + one sentence when that main.js does not carry that commit (install-local.sh calls this)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describeCopies, parseInstalledStamp, verifyInstalledStamp } from './installed-build-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_ID = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).id;
const args = process.argv.slice(2);

if (args[0] === '--verify') {
  const [, file, sha, tree] = args;
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { console.error(`installed-builds: cannot read ${file}: ${e.message}`); process.exit(1); }
  const v = verifyInstalledStamp(text, sha, tree);
  if (!v.ok) { console.error(`installed-builds: ${v.reason}`); process.exit(1); }
  process.exit(0);
}

let head = '';
const roots = [];
for (let i = 0; i < args.length; i++) { if (args[i] === '--head') head = args[++i] ?? ''; else roots.push(args[i]); }
if (!head) { try { head = execFileSync('git', ['rev-parse', '--short=9', 'origin/main'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { head = 'unknown'; } }
if (roots.length === 0) roots.push(path.join(os.homedir(), 'projects'), path.join(os.homedir(), 'forge-vaults'));

const copies = [];
for (const root of roots) {
  let names = [];
  try { names = fs.readdirSync(root).sort(); } catch { continue; }
  for (const name of names) {
    const main = path.join(root, name, '.obsidian', 'plugins', PLUGIN_ID, 'main.js');
    if (!fs.existsSync(main)) continue;
    copies.push({ vault: name, stamp: parseInstalledStamp(fs.readFileSync(main, 'utf8')) });
  }
}
if (copies.length === 0) { console.log('installed-builds: no vault under ' + roots.join(', ') + ' has the plugin installed'); process.exit(0); }
console.log(`installed copies (each vault has its own), against ${head}:`);
for (const line of describeCopies(copies, head)) console.log('  ' + line);
