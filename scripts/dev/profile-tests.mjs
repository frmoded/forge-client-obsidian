#!/usr/bin/env node
// 2026-11-03-1161 - MEASUREMENT ONLY: the wall time and peak resident memory of every test file of `npm test`, one `node --test <file>` per file (what `node --test` itself does per file), run N at a time.
//   node scripts/dev/profile-tests.mjs --concurrency 8 --out <dir>/c8.json       (the matrix's own file concurrency)
//   node scripts/dev/profile-tests.mjs --concurrency 1 --out <dir>/c1.json       (each file alone: its own wall time and peak RSS, no contention)
//   node scripts/dev/profile-tests.mjs --report <c8.json> <c1.json>              print the tables (slowest files, by category, the 80 % count)
// Peak RSS is `/usr/bin/time -l`'s "maximum resident set size" (macOS: bytes; the largest process of the file's tree). The category is read from the file's text: real-plugin bundle (bundleRealPlugin / loadRealOnload), Chrome (cdp.mjs),
// real-engine (the Pyodide helper), DOM (happy-dom), esbuild, else pure. Wrap it in `node scripts/dev/heavy-lock.mjs run --what profile -- ...` (one heavy thing at a time).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const client = path.resolve(here, '../..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };

export function categoryOf(text) {
  if (/bundleRealPlugin|loadRealOnload|real-onload/.test(text)) return 'real-plugin';
  if (/cdp\.mjs|openPage\(/.test(text)) return 'chrome';
  if (/real-rhythm-engine|loadPyodide|from 'pyodide'/.test(text)) return 'real-engine';
  if (/happy-dom/.test(text)) return 'dom';
  if (/esbuild/.test(text)) return 'esbuild';
  return 'pure';
}
export function files() {
  const list = [];
  for (const [dir, ext] of [['src', '.test.ts'], ['scripts', '.test.mjs']]) for (const f of fs.readdirSync(path.join(client, dir)).sort()) if (f.endsWith(ext)) list.push(`${dir}/${f}`);
  return list;
}
function runOne(file) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const p = spawn('/usr/bin/time', ['-l', 'node', '--test', file], { cwd: client, env: { ...process.env, FORGE_TEST_PROFILE: '1' } });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      const secs = Number(process.hrtime.bigint() - t0) / 1e9;
      const rss = /(\d+)\s+maximum resident set size/.exec(err);
      const n = (k) => Number(new RegExp(`ℹ ${k} (\\d+)`).exec(out)?.[1] ?? 0);
      resolve({ file, secs: +secs.toFixed(2), rssMb: rss ? Math.round(Number(rss[1]) / 1048576) : null, code, tests: n('tests'), pass: n('pass'), fail: n('fail'), skipped: n('skipped'), category: categoryOf(fs.readFileSync(path.join(client, file), 'utf8')) });
    });
  });
}
async function profile(conc, outFile) {
  const list = files(); const rows = []; let next = 0; const t0 = Date.now();
  await Promise.all(Array.from({ length: conc }, async () => { while (next < list.length) { const f = list[next++]; rows.push(await runOne(f)); } }));
  const total = (Date.now() - t0) / 1000;
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ concurrency: conc, files: list.length, totalSecs: +total.toFixed(1), rows: rows.sort((a, b) => b.secs - a.secs) }, null, 2));
  console.log(`concurrency ${conc}: ${list.length} files in ${total.toFixed(1)} s -> ${outFile}`);
}
function report(c8, c1) {
  const a = JSON.parse(fs.readFileSync(c8, 'utf8')), b = JSON.parse(fs.readFileSync(c1, 'utf8'));
  const alone = new Map(b.rows.map((r) => [r.file, r]));
  console.log(`whole run: concurrency ${a.concurrency}: ${a.totalSecs} s; concurrency ${b.concurrency}: ${b.totalSecs} s; files ${a.files}; tests ${b.rows.reduce((s, r) => s + r.tests, 0)}`);
  console.log('\nTop 25 files (alone | at ' + a.concurrency + ' | peak MB alone | category):');
  for (const r of b.rows.slice(0, 25)) console.log(`${String(r.secs).padStart(6)} s | ${String(a.rows.find((x) => x.file === r.file)?.secs ?? '').padStart(6)} s | ${String(r.rssMb).padStart(5)} MB | ${r.category.padEnd(11)} | ${r.file}`);
  const cats = {}; for (const r of b.rows) { const c = (cats[r.category] ??= { files: 0, secs: 0, maxMb: 0 }); c.files++; c.secs += r.secs; c.maxMb = Math.max(c.maxMb, r.rssMb ?? 0); }
  const sum = b.rows.reduce((s, r) => s + r.secs, 0);
  console.log('\nBy category (concurrency-1 seconds, summed):'); for (const [k, v] of Object.entries(cats).sort((x, y) => y[1].secs - x[1].secs)) console.log(`${k.padEnd(12)} ${String(v.files).padStart(4)} files ${v.secs.toFixed(1).padStart(7)} s ${(100 * v.secs / sum).toFixed(1).padStart(5)} %  max ${v.maxMb} MB`);
  let acc = 0, n = 0; for (const r of b.rows) { acc += r.secs; n++; if (acc >= 0.8 * sum) break; }
  console.log(`\n80 % of the summed time (${(0.8 * sum).toFixed(0)} of ${sum.toFixed(0)} s) is in the slowest ${n} of ${b.rows.length} files.`);
  console.log(`failing files: ${b.rows.filter((r) => r.code !== 0).map((r) => r.file).join(', ') || 'none'}`);
}
if (argv.includes('--report')) { const i = argv.indexOf('--report'); report(argv[i + 1], argv[i + 2]); }
else await profile(Number(arg('--concurrency', 8)), arg('--out', '/dev/stdout'));
