#!/usr/bin/env node
// Drain 2026-10-27-0710 §4 — `npm run rerecord-engine-fixtures`: re-records BOTH pinned engine fixtures when the bundled engine changed (see engine-fixtures-core.mjs).
//   npm run rerecord-engine-fixtures [-- --forge ~/projects/forge] [--force]
// Needs the forge engine's own virtualenv (<forge>/.venv/bin/python: PyYAML and music21 8.3). Run `node scripts/sync-engine-bundle.mjs` first when the engine changed (the first rider).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rerecord } from './engine-fixtures-core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const client = path.resolve(here, '..');
const argv = process.argv.slice(2);
const i = argv.indexOf('--forge');
const forge = path.resolve((i >= 0 ? argv[i + 1] : null) ?? path.join(os.homedir(), 'projects', 'forge'));
const python = path.join(forge, '.venv', 'bin', 'python');
if (!fs.existsSync(python)) { console.error(`rerecord-engine-fixtures: no ${python} (the forge engine's virtualenv)`); process.exit(2); }

const runPython = async (script, args) => {
  const r = spawnSync(python, [path.join(here, script), ...args], { encoding: 'utf8', cwd: client, maxBuffer: 64 * 1024 * 1024 });
  if (r.stdout) process.stdout.write(r.stdout);
  return { status: r.status ?? 1, stderr: r.stderr };
};
const r = await rerecord({ client, forge, runPython, force: argv.includes('--force') });
console.log(`rerecord-engine-fixtures: ${r.message}`);
process.exit(r.ok ? 0 : 1);
