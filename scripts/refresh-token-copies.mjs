#!/usr/bin/env node
// 2026-11-17-2000 (token refresh) - refresh the stale copies of the transpile service token from the one that works, without ever printing it. See refresh-token-copies-core.mjs for what it does and the rules.
//   node scripts/refresh-token-copies.mjs                       the driver's run (the defaults below)
//   node scripts/refresh-token-copies.mjs --dry-run             verify the source and say which files WOULD change; nothing is written or restarted
//   --claude-config   (2026-11-23-1028, OFF by default: a plain run never touches ~/.claude.json) also check the two forge-mcp copies in ~/.claude.json (the wizard's stdio entry and the user-level HTTP entry): with --dry-run it says `match` or `DIFFERENT` for each
//                     with the first 8 hex of a SHA-256, nothing written; a real run rewrites ONLY those two fields (a mode-600 backup first, atomic, refused if the file changed under it) and says what to do next. See refresh-claude-config-core.mjs.
// Defaults: the source is music-playground's forge-actions data file; the targets are every plugin data file in the ClaudeQA vault (plugins `forge-actions` and `forge`) and the music-sandbox vault (when it exists) that
// already has a `transpileServiceToken` key; the forge-mcp launchd file is ~/Library/LaunchAgents/com.forge.mcp.plist (its FORGE_MCP_BEARER). Flags (the tests use them on a temp directory and a local stand-in service):
//   --source <data.json>  --vault <dir> (repeatable; replaces the default vaults)  --plist <file> (or --no-plist)  --env <file> (or --no-env; default ~/projects/forge-transpile/.env, its FORGE_TRANSPILE_SECRET= line only)  --url <base url>  --no-restart  --dry-run
// Exit 0 done and every copy answers 422; 1 stopped (said why, in words, no values); 2 changed but a copy is still refused; 64 bad usage. It prints file names, lengths and status codes only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { refresh } from './refresh-token-copies-core.mjs';

const args = process.argv.slice(2);
const take = (name) => { const out = []; for (let i = 0; i < args.length; i++) if (args[i] === name) { out.push(args[i + 1]); args.splice(i, 2); i--; } return out; };
const has = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const dryRun = has('--dry-run'), noRestart = has('--no-restart'), noPlist = has('--no-plist'), noEnv = has('--no-env'), claudeConfig = has('--claude-config');
const sources = take('--source'), vaultsGiven = take('--vault'), plists = take('--plist'), urls = take('--url'), envs = take('--env');
if (args.length > 0 || sources.length > 1 || plists.length > 1 || urls.length > 1 || envs.length > 1 || [...sources, ...vaultsGiven, ...plists, ...urls, ...envs].some((v) => v === undefined || v.startsWith('--'))) {
  console.error('usage: node scripts/refresh-token-copies.mjs [--dry-run] [--no-restart] [--source <data.json>] [--vault <dir>]... [--plist <file> | --no-plist] [--env <file> | --no-env] [--claude-config] [--url <base url>]');
  process.exit(64);
}
const home = os.homedir();
const expand = (p) => p.replace(/^~(?=$|\/)/, home);
const tilde = (p) => (p.startsWith(home + path.sep) ? '~' + p.slice(home.length) : p);
const pluginData = (vault, plugin) => path.join(vault, '.obsidian/plugins', plugin, 'data.json');

const sourcePath = expand(sources[0] ?? '~/projects/music-playground/.obsidian/plugins/forge-actions/data.json');
const vaults = (vaultsGiven.length ? vaultsGiven : ['~/forge-vaults/ClaudeQA', '~/forge-vaults/music-sandbox', '~/projects/music-sandbox']).map(expand);
const targetFiles = vaults.flatMap((v) => ['forge-actions', 'forge'].map((plugin) => ({ name: tilde(pluginData(v, plugin)), path: pluginData(v, plugin) }))).filter((t) => t.path !== sourcePath);
const plistFile = noPlist ? null : (() => { const p = expand(plists[0] ?? '~/Library/LaunchAgents/com.forge.mcp.plist'); return { name: tilde(p), path: p }; })();

// 2026-11-22-1017: the forge-transpile .env (its FORGE_TRANSPILE_SECRET= line only): the server's own secret, which `deploy/smoke.sh` reads
const envFile = noEnv ? null : (() => { const p = expand(envs[0] ?? '~/projects/forge-transpile/.env'); return { name: tilde(p), path: p }; })();

// the service URL: the argument, else the (non-secret) transpileServiceUrl of the source file, else the hosted service
let url = urls[0];
if (!url) { try { const u = JSON.parse(fs.readFileSync(sourcePath, 'utf8')).transpileServiceUrl; if (typeof u === 'string' && /^https?:\/\//.test(u)) url = u.replace(/\/+$/, ''); } catch { /* the core says the source is missing */ } }
url = (url ?? 'https://forge.thecodingarena.com').replace(/\/+$/, '');

const deps = {
  readFile: (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { if (e && e.code === 'ENOENT') return null; throw new Error('a file could not be read'); } },
  writeFileAtomic: (p, text) => {
    const mode = fs.statSync(p).mode & 0o777; const tmp = `${p}.tmp-${process.pid}`;
    try { fs.writeFileSync(tmp, text, { mode }); fs.chmodSync(tmp, mode); fs.renameSync(tmp, p); }
    catch (e) { try { fs.rmSync(tmp, { force: true }); } catch { /* nothing to clean */ } throw e; }
  },
  // the status-code check of docs/transpile-token-rotation.md step 3: an empty body {} is refused with 401 for a wrong token and 422 for a right one; the token goes in a header of this one request and nowhere else
  check: async (base, token) => {
    try {
      const res = await fetch(`${base}/generate`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: '{}', signal: AbortSignal.timeout(20000) });
      return res.status;
    } catch { return null; }
  },
  // 2026-11-23-1028: the pid before and after (`launchctl list` prints `PID Status Label` only: no environment, so no secret) and launchctl's OWN error text (its first line, never the command's environment)
  restart: async () => {
    const pidOf = () => new Promise((resolve) => { execFile('launchctl', ['list'], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => { if (err) return resolve(null); const line = String(out).split('\n').find((l) => l.trim().endsWith('com.forge.mcp')); const m = line ? /^\s*(\d+)\s/.exec(line) : null; resolve(m ? Number(m[1]) : null); }); });
    const pidBefore = await pidOf();
    const r = await new Promise((resolve) => { execFile('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/com.forge.mcp`], { timeout: 30000 }, (err, _out, errText) => resolve({ err, text: String(errText ?? '').trim().split('\n')[0].slice(0, 200) })); });
    if (r.err) return { ok: false, error: r.text || String(r.err.code ?? 'no message'), pidBefore, pidAfter: null };
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { ok: true, pidBefore, pidAfter: await pidOf() };
  },
  // 2026-11-23-1028: ~/.claude.json: the text with its mtime and size (to see a change between the read and the write), a mode-600 backup that never overwrites one, and the same atomic write as every other file
  readClaude: (p) => { try { const st = fs.statSync(p); return { text: fs.readFileSync(p, 'utf8'), mtimeMs: st.mtimeMs, size: st.size }; } catch (e) { if (e && e.code === 'ENOENT') return null; throw new Error('a file could not be read'); } },
  statClaude: (p) => { try { const st = fs.statSync(p); return { mtimeMs: st.mtimeMs, size: st.size }; } catch { return null; } },
  writeBackup: (p, text) => { fs.writeFileSync(p, text, { mode: 0o600, flag: 'wx' }); fs.chmodSync(p, 0o600); },
  now: () => new Date(),
  say: (line) => console.log(line),
};

const claudeFile = claudeConfig ? { name: tilde(path.join(home, '.claude.json')), path: path.join(home, '.claude.json'), home } : undefined;
const result = await refresh(deps, { sourceFile: { name: tilde(sourcePath), path: sourcePath }, targetFiles, plistFile, envFile, claudeConfig: claudeFile, url, dryRun, restart: !noRestart });
process.exit(result.code);
