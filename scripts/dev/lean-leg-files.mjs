#!/usr/bin/env node
// 2026-11-04-1174 (A) - which test files the LEAN leg of the matrix has to run. The matrix tests two editions in two worktrees of ONE commit; what differs between them is only what the build makes per edition: the built main.js, the generated modules
// (src/*.generated.ts: bundled assets, manifest, stamps) and the edition-selector modules (src/music-edition-selected.ts, src/edition-selected.ts, which the build redirects). A test file that cannot reach any of those runs the SAME computation in both
// worktrees, so running it twice only costs time (1161 measured: both legs ran all 433 files, only 50 touch an edition). The music leg runs the full suite; the lean leg runs the files this scan calls edition-sensitive.
//
// THE RULE, computed (a static import scan), not a hand list. A test file is EDITION-SENSITIVE (it stays in the lean leg) when ANY of these holds for it or for any module it reaches through relative imports (and through repo scripts it names by a path literal):
//   * it imports (transitively) a selector module or a generated module;
//   * its text (comments stripped) mentions the built main.js, the real-plugin bundle (bundleRealPlugin / real-onload), FORGE_EDITION, a build or sync step (`npm run build`, `npm test`, a spawned npm), a shell script or a generated module;
//   * THE SCAN CANNOT TELL: a dynamic import() or require() with a non-literal specifier, or a relative import that does not resolve to a file. Such a file STAYS in the lean leg.
// Everything else is edition-independent and runs in the music leg only.
// usage: node scripts/dev/lean-leg-files.mjs [--root <dir>] [--files | --report | --json]      (--files: the lean leg's files, one per line: what the matrix passes to `node --test`)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Modules whose content differs between the two editions' worktrees (by path). */
export const SEAM_PATHS = [/(^|\/)music-edition-selected\.ts$/, /(^|\/)edition-selected(\.music)?\.ts$/, /\.generated\.ts$/];
/** Text that ties a file to what the build makes per edition. */
export const SEAM_TEXT = /music-edition-selected|edition-selected|\bmain\.js\b|bundleRealPlugin|bundle-real-plugin|real-onload|FORGE_EDITION|\bnpm run (?:build|prebuild|release|sync[\w-]*)\b|\bnpm test\b|['"`]npm['"`]|\.sh['"`]|\.generated\b/;

const SPECS = [
  /\b(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];
const NON_LITERAL = /\b(?:import|require)\s*\(\s*(?!['"])/;
const PATH_LITERAL = /['"`]((?:\.{1,2}\/|[\w@-]+\/)[^'"`\n$]*\.(?:mjs|ts|js|sh))['"`]/g;

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

export function scanEditionSensitivity({ root, testDirs = [['src', '.test.ts'], ['scripts', '.test.mjs']] }) {
  const exists = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
  const resolveRel = (from, spec) => {
    const base = path.resolve(path.dirname(from), spec);
    for (const c of [base, `${base}.ts`, `${base}.mjs`, `${base}.js`, path.join(base, 'index.ts')]) if (exists(c)) return c;
    return null;
  };
  const infos = new Map();                       // file -> { edges: Set, direct: string|null }
  const queue = [];
  const tests = [];
  for (const [dir, suffix] of testDirs) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).filter((n) => n.endsWith(suffix)).sort()) { tests.push(path.join(abs, f)); queue.push(path.join(abs, f)); }
  }
  while (queue.length > 0) {
    const file = queue.pop();
    if (infos.has(file)) continue;
    const info = { edges: new Set(), direct: null };
    infos.set(file, info);
    if (SEAM_PATHS.some((re) => re.test(file))) { info.direct = 'is a module the build makes per edition'; continue; }
    const text = strip(fs.readFileSync(file, 'utf8'));
    const m = SEAM_TEXT.exec(text);
    if (m) info.direct = `mentions ${m[0].trim()}`;
    if (NON_LITERAL.test(text)) info.direct ??= 'the scan cannot tell: a dynamic import() or require() with a non-literal specifier';
    for (const re of SPECS) {
      re.lastIndex = 0;
      for (let x; (x = re.exec(text));) {
        if (!x[1].startsWith('.')) continue;                                      // a package or node: builtin: the same in both editions
        const target = resolveRel(file, x[1]);
        if (target === null) info.direct ??= `the scan cannot tell: ${x[1]} does not resolve to a file`;
        else { info.edges.add(target); queue.push(target); }
      }
    }
    PATH_LITERAL.lastIndex = 0;
    for (let x; (x = PATH_LITERAL.exec(text));) {                                   // a script or module named by a path literal (spawned or read): follow it if it is in the repo
      const target = [path.resolve(path.dirname(file), x[1]), path.resolve(root, x[1])].find(exists);
      if (target && target !== file) { info.edges.add(target); queue.push(target); }
    }
  }
  // sensitivity = can reach a direct node: a breadth-first walk over the REVERSED edges (cycle-safe)
  const reverse = new Map();
  for (const [f, i] of infos) for (const e of i.edges) (reverse.get(e) ?? reverse.set(e, []).get(e)).push(f);
  const why = new Map();
  const frontier = [];
  for (const [f, i] of infos) if (i.direct) { why.set(f, { reason: i.direct, via: null }); frontier.push(f); }
  while (frontier.length > 0) {
    const n = frontier.shift();
    for (const parent of reverse.get(n) ?? []) if (!why.has(parent)) { why.set(parent, { reason: why.get(n).reason, via: n }); frontier.push(parent); }
  }
  const rel = (f) => path.relative(root, f);
  const chainOf = (f) => { const out = []; for (let n = why.get(f)?.via; n; n = why.get(n)?.via) out.push(rel(n)); return out; };
  const results = tests.map((f) => {
    const w = why.get(f);
    return { file: rel(f), sensitive: Boolean(w), why: w ? `${w.reason}${w.via ? ` (through ${chainOf(f).join(' -> ')})` : ''}` : null };
  });
  return { sensitive: results.filter((r) => r.sensitive), independent: results.filter((r) => !r.sensitive), all: results };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf('--root');
  const root = rootIdx >= 0 ? path.resolve(args[rootIdx + 1]) : path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const r = scanEditionSensitivity({ root });
  if (args.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else if (args.includes('--report')) {
    console.log(`lean leg: ${r.sensitive.length} of ${r.all.length} test files (the ${r.independent.length} edition-independent files run in the music leg only: the same computation in both worktrees)`);
    console.log(`lean leg runs: ${r.sensitive.map((x) => x.file).join(' ')}`);
    console.log(`music leg only (edition-independent): ${r.independent.map((x) => x.file).join(' ')}`);
  } else for (const x of r.sensitive) console.log(x.file);
}
