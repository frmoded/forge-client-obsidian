// 2026-11-24-1035 - scripts/dev/sample-memory.sh: one tab-separated line per sample under a fixed header; read-only (it prints numbers and process NAMES, never an environment).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const SCRIPT = path.resolve(import.meta.dirname, 'sample-memory.sh');
const COLUMNS = ['time', 'compressor_mb', 'swap_used_mb', 'free_mb', 'chrome_rss_mb', 'obsidian_rss_mb', 'claude_rss_mb', 'node_rss_mb', 'headless_chrome', 'worktrees', 'top_compressed'];
const skip = process.platform === 'darwin' ? false : 'vm_stat and top are macOS tools';

test('two samples give the header once and two rows of the same width, the numbers are numbers, and appending to an existing file adds no second header', { skip }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sample-mem-')); const out = path.join(dir, 'm.tsv');
  try {
    const r = spawnSync('bash', [SCRIPT, out, '1', '2'], { encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, r.stderr);
    const lines = fs.readFileSync(out, 'utf8').trimEnd().split('\n');
    assert.equal(lines.length, 3, 'one header and two samples');
    assert.deepEqual(lines[0].split('\t'), COLUMNS);
    for (const l of lines.slice(1)) {
      const c = l.split('\t'); assert.equal(c.length, COLUMNS.length, l);
      assert.match(c[0], /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/);
      for (const i of [1, 2, 3, 4, 5, 6, 7, 8, 9]) assert.match(c[i], /^\d+$/, `${COLUMNS[i]}: ${c[i]}`);
      assert.ok(Number(c[1]) > 0, 'the compressor holds something on a running Mac');
      assert.doesNotMatch(c[10], /=|\bTOKEN|BEARER|SECRET/i, 'process names only: no environment, no secret');
    }
    spawnSync('bash', [SCRIPT, out, '1', '1'], { encoding: 'utf8', timeout: 60000 });
    assert.equal(fs.readFileSync(out, 'utf8').trimEnd().split('\n').filter((l) => l.startsWith('time\t')).length, 1, 'the header is written once');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the script is read-only: it contains no write to anything but its output file and no environment-printing command', () => {
  const src = fs.readFileSync(SCRIPT, 'utf8').split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
  assert.doesNotMatch(src, /ps\s+[^|\n]*eww|launchctl\s+print|\bkill\b|\brm\b|>\s*\/(?!dev\/null)/);
});
