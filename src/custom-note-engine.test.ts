// 2026-11-02-1155 (score_first M16b) - the host's run of a custom note's Python, on the REAL engine (exec_python and its snippet shims) under real Python: the PRODUCTION functions `_forge_run_custom_bars` and
// `_forge_rhythm_phrase_payload` are extracted from src/pyodide-host.ts at test start (the template literal's doubled backslashes undone), never copied (the drift rule of cc-prompt-queue.md). What is proven here: a good Python returns its bars, a note
// it calls by name resolves through the vault, a mistake comes back as a plain dict with the line of the Python, a run that never ends is STOPPED at the limit (also inside a try/except Exception of the person's own), runaway recursion is an
// error not a hang, the engine glue's `custom` kind draws the bars and refuses a wrong bar naming it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO = process.cwd();
const HOST_TS = path.join(REPO, 'src', 'pyodide-host.ts');
const ENGINE = path.join(REPO, 'assets', 'engine');

function resolvePython(): string | null {
  for (const py of [path.resolve(REPO, '..', 'forge', '.venv', 'bin', 'python'), 'python3']) {
    if (spawnSync(py, ['-c', 'import yaml, music21, numpy'], { encoding: 'utf8' }).status === 0) return py;
  }
  return null;
}
const PYTHON = resolvePython();

/** A `def` of the host's embedded Python, the template literal's doubled backslashes undone. */
function defOf(name: string): string {
  const src = fs.readFileSync(HOST_TS, 'utf8');
  const m = new RegExp(`^def ${name}\\([^\\n]*\\n(?:[ \\t]+[^\\n]*\\n|\\n)*`, 'm').exec(src);
  assert.ok(m, `could not extract ${name} from pyodide-host.ts`);
  return m[0].replace(/\\\\/g, '\\');
}

const BAR = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array.from({ length: 16 }, (_, i) => i === 0), snare: Array.from({ length: 16 }, (_, i) => i === 8) } };

function vault(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-note-engine-'));
  fs.mkdirSync(path.join(dir, 'bars'));
  fs.writeFileSync(path.join(dir, 'bars', 'bar_005.md'), `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(BAR, null, 2)}\n\`\`\`\n`);
  return dir;
}

/** Runs `body` (python statements using `run(code, seconds)` and `glue(bars, kind)`) after loading the production functions; prints one json line. */
function py(dir: string, body: string): Record<string, unknown> {
  const program = [
    'import sys, json, time', `sys.path.insert(0, ${JSON.stringify(ENGINE)})`,
    'from forge.core.snippet_registry import SnippetRegistry', 'from forge.core.graph_resolver import GraphResolver', 'from forge.core.executor import exec_python, extract_section',
    'from forge.core.serialization import serialize_result',
    `_forge_user_vault = ${JSON.stringify(dir)}`, '_reg = SnippetRegistry(); _reg.scan(_forge_user_vault); _res = GraphResolver(_reg)', 'def _forge_get_resolver(name):\n    return _reg, _res',
    defOf('_forge_run_custom_bars'), defOf('_forge_rhythm_phrase_payload'),
    'def run(code, seconds=10):\n    t = time.monotonic(); r = _forge_run_custom_bars(code, "phrase_003", seconds); r["took"] = time.monotonic() - t; return r',
    body,
  ].join('\n');
  const r = spawnSync(PYTHON as string, ['-I', '-c', program], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
  assert.equal(r.status, 0, `${r.stderr}\n${r.stdout}`.slice(-2000));
  return JSON.parse(r.stdout.trim().split('\n').pop() as string);
}
const skip = PYTHON === null ? 'no python with yaml, music21 and numpy (the forge engine virtualenv)' : false;

test('a good Python returns its bars as json; the notes it calls by name resolve through the vault (a bar note is its data)', { skip }, () => {
  const out = py(vault(), 'print(json.dumps(run("def compute(context):\\n  b = bar_005()\\n  return [b, b]")))');
  assert.equal(out.ok, true, JSON.stringify(out));
  const bars = JSON.parse(out.bars_json as string);
  assert.equal(bars.length, 2);
  assert.deepEqual(bars[0].channels.kick, BAR.channels.kick);
});

test('a mistake comes back as a plain dict with the error and the line of the Python it stopped at; nothing is raised', { skip }, () => {
  const out = py(vault(), 'print(json.dumps(run("def compute(context):\\n  x = 1\\n  return x / 0")))');
  assert.deepEqual([out.ok, out.timed_out, out.error, out.line], [false, false, 'ZeroDivisionError: division by zero', 3]);
  const name = py(vault(), 'print(json.dumps(run("def compute(context):\\n  return nothing_here()")))');
  assert.equal(name.ok, false);
  assert.match(String(name.error), /nothing_here/);
  const noFn = py(vault(), 'print(json.dumps(run("x = 1")))');
  assert.equal(noFn.ok, false, 'a Python with no compute is an error, not a crash');
  const empty = py(vault(), 'print(json.dumps(run("")))');
  assert.equal(empty.ok, false);
  const notJson = py(vault(), 'print(json.dumps(run("def compute(context):\\n  return {1, 2}")))');
  assert.deepEqual([notJson.ok, String(notJson.error).startsWith('ValueError: the result is not plain data')], [false, true]);
});

test('a run that never ends is STOPPED at the limit (timed_out), within a moment of it, also when the person\'s own code catches Exception around the loop; the trace is off afterwards', { skip }, () => {
  const out = py(vault(), 'print(json.dumps(run("def compute(context):\\n  while True:\\n    pass", 1)))');
  assert.deepEqual([out.ok, out.timed_out], [false, true], JSON.stringify(out));
  assert.ok((out.took as number) >= 1 && (out.took as number) < 6, `stopped at about the limit, took ${String(out.took)} s`);
  const caught = py(vault(), 'print(json.dumps(run("def compute(context):\\n  try:\\n    while True:\\n      pass\\n  except Exception:\\n    return [1]", 1)))');
  assert.deepEqual([caught.ok, caught.timed_out], [false, true], 'an except Exception does not swallow the stop');
  const after = py(vault(), 'run("def compute(context):\\n  while True:\\n    pass", 1)\nimport sys\nprint(json.dumps({"trace": sys.gettrace() is None, "again": run("def compute(context):\\n  return [bar_005()]")["ok"]}))');
  assert.deepEqual(after, { trace: true, again: true }, 'tracing is switched off after a stop and the next run is normal');
});

test('runaway recursion is an error with the line, not a hang or a crash of the host', { skip }, () => {
  const out = py(vault(), 'print(json.dumps(run("def f():\\n  return f()\\ndef compute(context):\\n  return f()", 5)))');
  assert.equal(out.ok, false, JSON.stringify(out));
  assert.match(String(out.error), /RecursionError/);
  assert.ok((out.took as number) < 5, 'quick');
});

test('the engine glue\'s custom kind draws the bars (a tagged MusicXML payload) and refuses a wrong bar with the engine\'s own sentence naming it', { skip }, () => {
  const data = (bars: unknown[]): string => `json.dumps({"bars": json.loads(${JSON.stringify(JSON.stringify(bars))})})`;
  const good = py(vault(), `print(json.dumps({"type": _forge_rhythm_phrase_payload(${data([BAR, BAR])}, json.dumps({"kind": "custom"}), "phrase_003")["type"]}))`);
  assert.equal(good.type, 'musicxml');
  const wrong = { ...BAR, channels: { kick: BAR.channels.kick.slice(0, 15) } };
  const bad = py(vault(), `try:\n    _forge_rhythm_phrase_payload(${data([BAR, wrong])}, json.dumps({"kind": "custom"}), "phrase_003")\n    print(json.dumps({"raised": False}))\nexcept Exception as e:\n    print(json.dumps({"raised": True, "type": type(e).__name__, "message": str(e)}))`);
  assert.equal(bad.raised, true);
  assert.equal(bad.type, 'ValueError');
  assert.match(String(bad.message), /^rhythm_bars_to_stream: bar 1: /, 'the engine names the bar INDEX (from 0): the second bar is bar 1; custom-note-core.ts plainBarError counts it from 1');
});
