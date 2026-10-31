// The pure parts of scripts/dev/mutate.mjs (drain 2026-10-26-1300): reading a diff, generating mutants from it, mapping a source file to the tests that cover it, classifying a
// run, and the report. Nothing here touches the disk or spawns a process, so scripts/mutate-runner.test.mjs can test every rule on literal inputs.
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

// ---- the diff ------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** `git diff -U0` text -> Map<file, Set<line>> of the lines the NEW side added or changed (a pure deletion adds none). */
export function parseChangedLines(diffText) {
  const out = new Map();
  let file = null;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ ')) { const p = line.slice(4).trim(); file = p === '/dev/null' ? null : p.replace(/^b\//, ''); continue; }
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m && file) {
      const start = Number(m[1]), count = m[2] === undefined ? 1 : Number(m[2]);
      if (!out.has(file)) out.set(file, new Set());
      for (let i = 0; i < count; i++) out.get(file).add(start + i);
    }
  }
  return out;
}

/** The files a diff-seeded run mutates: source, not tests, not generated, not declarations. */
export function isMutableSource(file) {
  if (!/\.(ts|mjs|js|cjs)$/.test(file)) return false;
  if (/\.test\.(ts|mjs|js)$/.test(file) || /\.generated\.ts$/.test(file) || /\.d\.ts$/.test(file)) return false;
  if (/^src\/test-support\//.test(file) || /^scripts\/dev\//.test(file)) return false;
  return /^(src|scripts)\//.test(file);
}

// ---- mutants -------------------------------------------------------------------------------------------------------------------------------------------------------------------

const SWAPS = new Map([
  [ts.SyntaxKind.EqualsEqualsEqualsToken, ['!==', 'eq-flip']], [ts.SyntaxKind.ExclamationEqualsEqualsToken, ['===', 'eq-flip']],
  [ts.SyntaxKind.EqualsEqualsToken, ['!=', 'eq-flip']], [ts.SyntaxKind.ExclamationEqualsToken, ['==', 'eq-flip']],
  [ts.SyntaxKind.LessThanToken, ['<=', 'boundary']], [ts.SyntaxKind.LessThanEqualsToken, ['<', 'boundary']],
  [ts.SyntaxKind.GreaterThanToken, ['>=', 'boundary']], [ts.SyntaxKind.GreaterThanEqualsToken, ['>', 'boundary']],
  [ts.SyntaxKind.AmpersandAmpersandToken, ['||', 'logic']], [ts.SyntaxKind.BarBarToken, ['&&', 'logic']],
  [ts.SyntaxKind.PlusToken, ['-', 'plus-minus']], [ts.SyntaxKind.MinusToken, ['+', 'plus-minus']],
]);

const inType = (node) => { for (let p = node; p; p = p.parent) if (ts.isTypeNode(p) || ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p)) return true; return false; };
const isKey = (n) => n.parent && (ts.isPropertyAssignment(n.parent) || ts.isPropertySignature(n.parent) || ts.isPropertyDeclaration(n.parent) || ts.isEnumMember(n.parent)) && n.parent.name === n;
const isModuleSpec = (n) => n.parent && (ts.isImportDeclaration(n.parent) || ts.isExportDeclaration(n.parent) || ts.isExternalModuleReference(n.parent) || ts.isImportTypeNode(n.parent)) ||
  (n.parent && ts.isCallExpression(n.parent) && (n.parent.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.parent.expression) && n.parent.expression.text === 'require')));

/**
 * Mutants of `text` (the file `file`), restricted to the nodes that START on a line in `lines` (a Set of 1-based lines; null = every line). Each is
 * { id, file, line, op, start, end, from, to } where text.slice(start, end) === from and replacing it with `to` is the mutant. Ids are stable for an
 * unchanged file: `<file>:<line>:<op>#<k>`, k counting the mutants of that op on that line.
 */
export function generateMutants(file, text, lines) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, /\.(ts|tsx)$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const found = [];
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const add = (start, end, to, op) => {
    if (start < 0 || end < start) return;
    const line = lineOf(start);
    if (lines && !lines.has(line)) return;
    const from = text.slice(start, end);
    if (from === to) return;
    found.push({ file, line, op, start, end, from, to });
  };
  const visit = (node) => {
    if (inType(node)) return;
    if (ts.isBinaryExpression(node)) {
      const swap = SWAPS.get(node.operatorToken.kind);
      if (swap) add(node.operatorToken.getStart(sf), node.operatorToken.getEnd(), swap[0], swap[1]);
    } else if (ts.isNumericLiteral(node) && !isKey(node) && !isModuleSpec(node)) {
      const n = Number(node.text);
      if (Number.isFinite(n) && !/^[+-]/.test(node.text)) add(node.getStart(sf), node.getEnd(), String(n + 1), 'number+1');
    } else if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
      if (!isKey(node)) add(node.getStart(sf), node.getEnd(), node.kind === ts.SyntaxKind.TrueKeyword ? 'false' : 'true', 'bool-flip');
    } else if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
      add(node.getStart(sf), node.operand.getStart(sf), '', 'drop-not');
    } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text.length > 0 && !isKey(node) && !isModuleSpec(node) && !ts.isLiteralTypeNode(node.parent) &&
      !(ts.isExpressionStatement(node.parent))) {
      add(node.getStart(sf), node.getEnd(), "''", 'empty-string');
    } else if (ts.isTemplateExpression(node)) {
      add(node.getStart(sf), node.getEnd(), "''", 'empty-string');
    } else if (ts.isIfStatement(node)) {
      add(node.expression.getStart(sf), node.expression.getEnd(), 'false', 'if-false');
      add(node.expression.getStart(sf), node.expression.getEnd(), 'true', 'if-true');
    } else if (ts.isReturnStatement(node) && node.expression) {
      add(node.getStart(sf), node.getEnd(), 'return;', 'early-return');
    } else if (ts.isExpressionStatement(node)) {
      const e = node.expression;
      const isSuper = ts.isCallExpression(e) && e.expression.kind === ts.SyntaxKind.SuperKeyword;
      if (!isSuper && !ts.isStringLiteral(e)) add(node.getStart(sf), node.getEnd(), ';', 'drop-statement');
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const seen = new Set(), counts = new Map(), out = [];
  for (const m of found) {
    const key = `${m.start}:${m.end}:${m.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ck = `${m.line}:${m.op}`;
    const k = (counts.get(ck) ?? 0) + 1;
    counts.set(ck, k);
    out.push({ ...m, id: `${m.file}:${m.line}:${m.op}#${k}` });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Cap a mutant list at `max` by an even stride (deterministic: the same diff gives the same sample). */
export function sample(mutants, max) {
  if (!Number.isFinite(max) || mutants.length <= max) return mutants;
  const out = [];
  for (let i = 0; i < max; i++) out.push(mutants[Math.floor((i * mutants.length) / max)]);
  return out;
}

/** The hand-written list: [file, name, from, to, tests?] tuples (today's shape) or { file, name, from, to, tests? } objects. */
export function parseHandList(json) {
  if (!Array.isArray(json)) throw new Error('a hand-written mutant list is a JSON array of [file, name, from, to, tests?] or { file, name, from, to, tests? }');
  return json.map((row, i) => {
    const r = Array.isArray(row) ? { file: row[0], name: row[1], from: row[2], to: row[3], tests: row[4] } : row;
    for (const k of ['file', 'name', 'from', 'to']) if (typeof r[k] !== 'string') throw new Error(`hand-written mutant ${i}: "${k}" must be a string`);
    if (r.tests !== undefined && (!Array.isArray(r.tests) || r.tests.some((t) => typeof t !== 'string'))) throw new Error(`hand-written mutant ${i} (${r.name}): "tests" must be an array of file paths`);
    return { file: r.file, name: r.name, from: r.from, to: r.to, tests: r.tests };
  });
}

/** Resolve a hand-written mutant against the file text: exactly one occurrence of `from`, else not applicable (said, never skipped silently). */
export function resolveHand(m, text) {
  const parts = text.split(m.from);
  if (parts.length === 1) return { ...m, id: m.name, op: 'hand', status: 'n/a', why: 'the text to replace does not occur' };
  if (parts.length > 2) return { ...m, id: m.name, op: 'hand', status: 'n/a', why: `the text to replace occurs ${parts.length - 1} times; it must occur once` };
  const start = text.indexOf(m.from);
  const line = text.slice(0, start).split('\n').length;
  return { ...m, id: m.name, op: 'hand', line, start, end: start + m.from.length };
}

export const applyMutant = (text, m) => text.slice(0, m.start) + m.to + text.slice(m.end);

// ---- the file -> tests map -------------------------------------------------------------------------------------------------------------------------------------------------

const EXTS = ['.ts', '.mjs', '.js', '.cjs', '.tsx', '/index.ts', '/index.mjs', '/index.js'];

function resolveSpec(from, spec, known) {
  if (!spec.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  const candidates = [base, ...EXTS.map((e) => base + e), base.replace(/\.js$/, '.ts'), base.replace(/\.mjs$/, '.ts')];
  return candidates.find((c) => known.has(c)) ?? null;
}

export const isTestFile = (f) => /^(src|scripts)\/[^/]+\.test\.(ts|mjs|js)$/.test(f);
// a test drives Chrome when something it IMPORTS (not merely a file name it mentions) is the DevTools driver
const CHROME_FILE = /(^|\/)scripts\/dev\/cdp\.mjs$/;
// "engine" in the report means SLOW: it boots Pyodide, or bundles and loads the real plugin (tens of seconds each); a slow test runs for a mutant only when it names the file itself or the file is the glue
const BOOTS_ENGINE = /loadPyodide\s*\(|real-rhythm-engine\.ts|bundleRealPlugin\s*\(|loadRealOnload\s*\(/;

/**
 * texts: Map<relative path, text> of every .ts/.mjs/.js file the graph may touch. Returns { tests, deps }:
 *  - deps: Map<file, Set<file>>, an edge for every relative import AND every file NAME that appears in the file's text ("music-edition.full.ts" in an fs.readFileSync
 *    is a dependency a pure import graph cannot see; a name mentioned in a comment is a harmless extra edge);
 *  - tests: Map<test file, { direct: Set, closure: Set, engine: boolean, chrome: boolean }>.
 */
export function buildMap(texts) {
  const known = new Set(texts.keys());
  const byBase = new Map();
  for (const f of known) { const b = path.posix.basename(f); if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(f); }
  const deps = new Map(), imports = new Map();
  for (const [f, text] of texts) {
    const edges = new Set(), imported = new Set();
    for (const spec of ts.preProcessFile(text, true, true).importedFiles.map((i) => i.fileName)) { const r = resolveSpec(f, spec, known); if (r) { edges.add(r); imported.add(r); } }
    imports.set(f, imported);
    // a file whose text merely QUOTES file names (a test of this tool, with fixtures) says so with the marker below and then has import edges only
    if (!/mutate-map: imports only/.test(text)) for (const tok of text.match(/[A-Za-z0-9_.-]+\.(?:ts|tsx|mjs|cjs|js)(?![A-Za-z0-9_])/g) ?? []) {
      const hits = byBase.get(tok); if (hits) for (const h of hits) edges.add(h);
    }
    edges.delete(f);
    deps.set(f, edges);
  }
  const closureOf = (start, graph = deps) => {
    const seen = new Set([start]), stack = [start];
    while (stack.length) for (const d of graph.get(stack.pop()) ?? []) if (!seen.has(d)) { seen.add(d); stack.push(d); }
    seen.delete(start);
    return seen;
  };
  const tests = new Map();
  for (const f of known) {
    if (!isTestFile(f)) continue;
    const closure = closureOf(f);
    const all = [f, ...closure];
    tests.set(f, {
      direct: deps.get(f), closure,
      engine: all.some((x) => BOOTS_ENGINE.test(texts.get(x) ?? '')),
      chrome: [f, ...closureOf(f, imports)].some((x) => CHROME_FILE.test(x)),
    });
  }
  return { tests, deps };
}

/**
 * The test files a mutant in `file` must run. A light test runs when `file` is anywhere in its closure. A test that boots the Pyodide engine (slow, serialised on
 * the engine) runs only when `file` is something it names itself (an import or a file it reads) or when `file` is the engine glue (`glue` regexp), which is what
 * the engine tests exist to prove. A test that drives Chrome never runs here (Chrome studies stall each other); `chrome` lists them so the report can say so.
 */
export function selectTests(map, file, glue) {
  const run = [], chrome = [];
  const isGlue = glue.test(file);
  for (const [t, info] of map.tests) {
    if (t === file) continue;
    const covers = info.closure.has(file);
    if (!covers) continue;
    if (info.chrome) { chrome.push(t); continue; }
    if (info.engine && !info.direct.has(file) && !isGlue) continue;
    run.push(t);
  }
  return { run: orderTests(map, file, run, {}, isGlue), chrome: chrome.sort() };
}

/**
 * The order tests run in is the speed of a kill (a mutant dies at its FIRST failing test): the tests that do not boot the engine come first, named-by-the-file ones before the rest (a light test costs
 * a tenth of a second whoever the likeliest killer is); then the engine tests, named first. Within each group the cheapest first by measured duration (`seconds`: file -> seconds, from earlier runs; unknown
 * counts as nothing), then by name. A test measured slower than SLOW_SECONDS counts as an engine test whatever the static rule said.
 */
export const SLOW_SECONDS = 8;
export function orderTests(map, file, tests, seconds = {}, glue = false) {
  const slow = (t) => !!(map.tests.get(t)?.engine || (seconds[t] ?? 0) > SLOW_SECONDS);
  const named = (t) => (map.tests.get(t)?.direct.has(file) ? 0 : 1);
  const byCost = (x, y) => named(x) - named(y) || (seconds[x] ?? 0) - (seconds[y] ?? 0) || (x < y ? -1 : 1);
  if (!glue) {
    const key = (t) => (slow(t) ? 2 : 0) + named(t);
    return [...tests].sort((x, y) => key(x) - key(y) || (seconds[x] ?? 0) - (seconds[y] ?? 0) || (x < y ? -1 : 1));
  }
  // The engine glue is the one file whose killers are the engine tests (the Python it carries is only run by a booted engine), while its TypeScript half is killed by light tests: neither group may wait for
  // the other, so they are interleaved, one engine test to every two light ones (a run starts a few files at once).
  const eng = tests.filter(slow).sort(byCost), light = tests.filter((t) => !slow(t)).sort(byCost);
  const out = [];
  while (eng.length || light.length) {
    if (eng.length) out.push(eng.shift());
    for (let i = 0; i < 2 && light.length; i++) out.push(light.shift());
  }
  return out;
}

/** Tests that killed this mutant on an earlier run go first (a kill is the cheapest thing to repeat). */
export function preferFirst(tests, killers = []) {
  const first = killers.filter((k) => tests.includes(k));
  return [...first, ...tests.filter((t) => !first.includes(t))];
}

export const hashTexts = (texts) => {
  const h = crypto.createHash('sha256');
  for (const f of [...texts.keys()].sort()) { h.update(f); h.update('\0'); h.update(texts.get(f)); h.update('\0'); }
  return h.digest('hex');
};

// ---- a run -----------------------------------------------------------------------------------------------------------------------------------------------------------------

/** Numbers from node's TAP summary (`# tests 12`, `# pass 12`, `# fail 0`, `# skipped 0`), or null when it never printed one. */
export function parseTapSummary(out) {
  const n = (k) => { const m = new RegExp(`^# ${k} (\\d+)`, 'm').exec(out); return m ? Number(m[1]) : null; };
  const tests = n('tests'), pass = n('pass'), fail = n('fail'), skipped = n('skipped');
  return tests === null ? null : { tests, pass, fail, skipped };
}

/**
 * killed | timeout | survived | invalid | not-run. `not-run` is a survivor that proves nothing: the process exited 0 but the tests it was asked to run did not pass
 * (a skipped or empty selection looks exactly like a clean pass). `invalid` is a mutant that is not valid code (the files never loaded): not a kill, not a survivor.
 */
export function classifyRun({ status, timedOut, output, summary }) {
  if (timedOut) return 'timeout';
  const sum = summary ?? parseTapSummary(output);
  if (status === 0) return sum && sum.pass > 0 ? 'survived' : 'not-run';
  if (/SyntaxError/.test(output) && !/AssertionError/.test(output)) return 'invalid';
  return 'killed';
}

export const outcomeIsKill = (o) => o === 'killed' || o === 'timeout';

// ---- the loop cap (drain 2026-10-29-0840) ---------------------------------------------------------------------------------------------------------------------------------------
// A mutant that removes a loop's exit hangs until the per-mutant timeout. `capLoops` rewrites the UNBOUNDED loop headers of the mutated file so each site counts its iterations and throws after `max`: the mutant dies in a fraction
// of a second, as a kill by the loop cap (reported apart from the timeouts). Sites: `while (true)`, `for (;;)` and `for (init; ; update)` (an empty condition; init and update without parentheses or semicolons). A loop it cannot read is left to
// the timeout. The helper is appended AFTER the code, so no line of the file moves. The count is per site and per module INSTANCE (it lives on the helper function, not on globalThis, so a test that bundles the module again starts again from zero): 5,000,000 is far above any loop of this code base and a few tenths of a second of a spin.
export const LOOP_CAP_MESSAGE = 'forge-mutate: loop cap exceeded';
export const DEFAULT_MAX_LOOP = 5_000_000;
export function capLoops(text, max = DEFAULT_MAX_LOOP) {
  if (!(max > 0)) return text;
  let sites = 0;
  const site = (str, offset) => JSON.stringify(`L${str.slice(0, offset).split('\n').length}#${sites}`);              // the line and the header's ordinal: two loops on one line count apart
  const whiles = text.replace(/\bwhile\s*\(\s*true\s*\)/g, (m, offset, str) => { sites++; return `while (__forgeLoopCap(${site(str, offset)}))`; });
  const out = whiles.replace(/\bfor\s*\(([^;()]*);\s*;([^;()]*)\)/g, (m, init, update, offset, str) => { sites++; return `for (${init}; __forgeLoopCap(${site(str, offset)});${update})`; });
  if (sites === 0) return text;
  return `${out}\nfunction __forgeLoopCap(site) { const c = (__forgeLoopCap.counts ??= new Map()); const n = (c.get(site) ?? 0) + 1; c.set(site, n); if (n > ${max}) throw new Error('${LOOP_CAP_MESSAGE} at ' + site); return true; }\n`;
}
export const killedByLoopCap = (output) => output.includes(LOOP_CAP_MESSAGE);

/** results: [{ id, file, line, op, name?, outcome, from, to, why? }]; equivalent: { id|name: reason }. */
export function summarize(results, equivalent = {}) {
  const key = (r) => (r.name ?? r.id);
  const s = { generated: results.length, killed: 0, timeout: 0, loopCap: 0, survived: [], explained: [], invalid: [], notApplicable: [], uncovered: [], notRun: [] };
  for (const r of results) {
    if (r.status === 'n/a') { s.notApplicable.push(r); continue; }
    if (r.outcome === 'killed') { s.killed++; if (r.loopCap) s.loopCap++; }
    else if (r.outcome === 'timeout') { s.killed++; s.timeout++; }
    else if (r.outcome === 'invalid') s.invalid.push(r);
    else if (r.outcome === 'not-run') s.notRun.push(r);
    else if (r.outcome === 'uncovered' || r.outcome === 'survived') {
      const why = equivalent[r.id] ?? equivalent[key(r)];
      if (why !== undefined) s.explained.push({ ...r, why });
      else if (r.outcome === 'uncovered') s.uncovered.push(r);
      else s.survived.push(r);
    }
  }
  s.unexplained = s.survived.length + s.uncovered.length + s.notRun.length;
  return s;
}

const show = (t) => JSON.stringify(t.length > 100 ? t.slice(0, 97) + '...' : t);

/** The message for a mutant in a file the pool has no test for: it says what to do instead of a bare "uncovered". */
/**
 * 2026-10-29-0930: the tests marked "mutate-map: imports only" (a test that quotes real file names in its fixtures says so, and then only what it IMPORTS is a dependency) that nevertheless NAME `file` in their text and do not import it:
 * the shape of a CLI test, which runs the file as a process. They are not in the pool for a mutant of `file`, so the file's wiring is covered by no test of the run; the report says so (importsOnlyNote).
 */
export function importsOnlyNamers(texts, map, file) {
  const base = path.posix.basename(file);
  const out = [];
  for (const [t, text] of texts) {
    if (t === file || !isTestFile(t) || !/mutate-map: imports only/.test(text) || !text.includes(base)) continue;
    if (map.tests.get(t)?.closure.has(file)) continue;          // it imports the file (directly or far): it is in the pool anyway
    out.push(t);
  }
  return out.sort();
}
export function importsOnlyNote(file, tests) {
  const many = tests.length > 1;
  return `note: ${tests.join(', ')} ${many ? 'name' : 'names'} ${file} but ${many ? 'are' : 'is'} marked "mutate-map: imports only" (${many ? 'they run' : 'it runs'} the file, ${many ? 'they do' : 'it does'} not import it), so ${many ? 'they are' : 'it is'} not in the pool and the file's CLI wiring is covered by no test of this run: name ${many ? 'them' : 'it'} in the 'tests' field of a --hand mutant (or --glue) to cover it`;
}

export const noTestMessage = (file) => `0 tests in the pool for ${file}: add \`--glue\` or name the file in a test`;

/**
 * Each file that failed in the batch is re-run ALONE (one at a time) and only a file that fails alone is red: a file that fails among others and passes alone is load, not a red
 * baseline (22 of 23 files passed alone and in the matrix when CC first saw this). `runOne(file)` resolves { status } (0 = pass); returns { redAlone, flaky } in the given order.
 */
export async function confirmRedAlone(files, runOne) {
  const redAlone = [], flaky = [];
  for (const f of files) ((await runOne(f)).status === 0 ? flaky : redAlone).push(f);
  return { redAlone, flaky };
}

export function formatReport(s, { wallMs, jobs, testCount, chromeSkipped = [], treeUnchanged = null, baselineRed = [], notes = [] }) {
  const lines = [];
  // A red baseline heads the report, loud: the run is printed anyway (a 20-60 minute run is never thrown away) but the kills by these files prove nothing.
  if (baselineRed.length) lines.push(`BASELINE NOT GREEN: kills by these files are unproven: ${baselineRed.join(', ')}`);
  const mins = Math.floor(wallMs / 60000), secs = Math.round((wallMs % 60000) / 1000);
  lines.push(`mutants: generated ${s.generated} | killed ${s.killed} (by timeout ${s.timeout}${s.loopCap > 0 ? `, by loop cap ${s.loopCap}` : ''}) | survived ${s.survived.length} | uncovered ${s.uncovered.length} | equivalent-explained ${s.explained.length} | invalid ${s.invalid.length} | not applicable ${s.notApplicable.length} | not run ${s.notRun.length}`);
  lines.push(`wall time ${mins}m${String(secs).padStart(2, '0')}s with ${jobs} at a time, ${testCount} test file(s) in the pool`);
  if (treeUnchanged !== null) lines.push(treeUnchanged.ok ? `working tree: unchanged (git status and ${treeUnchanged.files} file hashes identical before and after)` : `WORKING TREE CHANGED: ${treeUnchanged.why}`);
  if (chromeSkipped.length) lines.push(`not run (they drive Chrome; Chrome studies are never in the pool): ${chromeSkipped.join(', ')}`);
  for (const note of notes) lines.push(note);
  const where = (r) => `${r.file}:${r.line ?? '?'}`;
  for (const r of s.survived) lines.push(`SURVIVED     ${where(r)} [${r.id}]  ${show(r.from)} -> ${show(r.to)}`);
  for (const r of s.uncovered) lines.push(`NO TEST      ${where(r)} [${r.id}]  ${noTestMessage(r.file)}`);
  for (const r of s.notRun) lines.push(`NOT RUN      ${where(r)} [${r.id}]  the selected tests did not pass (skipped or empty), so this proves nothing`);
  for (const r of s.explained) lines.push(`equivalent   ${where(r)} [${r.id}]  ${r.why}`);
  for (const r of s.invalid) lines.push(`invalid      ${where(r)} [${r.id}]  not valid code: ${show(r.from)} -> ${show(r.to)}`);
  for (const r of s.notApplicable) lines.push(`n/a          ${r.file} [${r.id}]  ${r.why}`);
  return lines.join('\n');
}

/** Run `fn` over `items`, at most `n` at a time, results in item order. */
export async function runPool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { for (;;) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  return out;
}

// ---- files the runner will not mutate ---------------------------------------------------------------------------------------------------------------------------------------------------
// 2026-10-31-0800: the two files that SUPERVISE the runner's children. A mutated copy of either can spin for ever with nothing left to kill it (62 copies, load average near 50, measured 2026-10-30), so the runner refuses them
// whatever the road in (--hand, --file; a --diff leaves their lines out).
export const UNSUPERVISABLE = ['scripts/dev/reaper.mjs', 'scripts/dev/proc-tree.mjs'];
/** Is this file (as the user spelled it, relative to the project or absolute) one of the two? Compared after path normalization, case-sensitively, whole path only. */
export function unsupervisable(file, root) {
  const rel = path.relative(root, path.resolve(root, file)).split(path.sep).join('/');
  return UNSUPERVISABLE.includes(rel);
}
export const unsupervisableSentence = (rel) => `mutate: ${rel} is not mutated by this runner: the runner cannot supervise the thing that supervises it. Use a hand copy outside the repo, and check that \`ps -Ao pid,command | grep forge-mutate-\` is empty afterwards.`;
