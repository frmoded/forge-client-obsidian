// 2026-11-02-1155 (score_first M16b) - the run of a custom note's Python in the REAL Pyodide of the plugin (the whole production Python block, the real engine bundle, WebAssembly): the time limit works there (sys.settrace and the clock), a note the
// Python calls by name resolves through the registry the plugin scanned, a mistake comes back with the line of the Python, and the engine glue draws the bars. custom-note-engine.test.ts proves the same functions under CPython; this is the host the
// person's machine has.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SKIP_REASON, engine } from './test-support/real-rhythm-engine.ts';

const BAR = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array.from({ length: 16 }, (_, i) => i === 0), snare: Array.from({ length: 16 }, (_, i) => i === 8) } };
const barNote = `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(BAR, null, 2)}\n\`\`\`\n`;

async function boot(): Promise<any> {
  const py = await engine();
  try { py.FS.mkdir('/bundle/user-vault/bars'); } catch { /* exists */ }
  py.globals.set('_t_rel', 'bars/bar_005.md'); py.globals.set('_t_body', barNote);
  py.runPython('_forge_sync_user_file(_t_rel, _t_body)');
  return py;
}
function run(py: any, code: string, seconds: number): any {
  py.globals.set('_t_code', code); py.globals.set('_t_seconds', seconds);
  const proxy = py.runPython('_forge_run_custom_bars(_t_code, "phrase_001", _t_seconds)');
  const out = proxy.toJs({ dict_converter: Object.fromEntries });
  proxy.destroy?.();
  return out;
}
const t = (name: string, fn: () => Promise<void>) => test(name, { skip: SKIP_REASON, timeout: 300_000 }, fn);

t('in the real Pyodide: a good Python returns its bars, the bar note it calls by name is its data; a mistake comes back with the line; nothing is raised', async () => {
  const py = await boot();
  const good = run(py, 'def compute(context):\n  b = bar_005()\n  return [b, b]', 10);
  assert.equal(good.ok, true, JSON.stringify(good));
  assert.equal(JSON.parse(good.bars_json).length, 2);
  const bad = run(py, 'def compute(context):\n  x = 1\n  return x / 0', 10);
  assert.deepEqual([bad.ok, bad.timed_out, bad.error, bad.line], [false, false, 'ZeroDivisionError: division by zero', 3]);
});

t('in the real Pyodide: a run that never ends is STOPPED at the limit (also inside the person\'s own try/except Exception), the next run is normal', async () => {
  const py = await boot();
  const t0 = performance.now();
  const loop = run(py, 'def compute(context):\n  while True:\n    pass', 1);
  const took = (performance.now() - t0) / 1000;
  assert.deepEqual([loop.ok, loop.timed_out], [false, true], JSON.stringify(loop));
  assert.ok(took >= 1 && took < 8, `stopped at about the limit: ${took.toFixed(1)} s`);
  const caught = run(py, 'def compute(context):\n  try:\n    while True:\n      pass\n  except Exception:\n    return [1]', 1);
  assert.deepEqual([caught.ok, caught.timed_out], [false, true]);
  const after = run(py, 'def compute(context):\n  return [bar_005()]', 10);
  assert.equal(after.ok, true, 'tracing is off again and the host is usable');
});

t('in the real Pyodide: the engine glue draws the bars of a custom note (a tagged MusicXML payload) and names a wrong bar', async () => {
  const py = await boot();
  const draw = (bars: unknown[]): any => {
    py.globals.set('_t_d', JSON.stringify({ bars })); py.globals.set('_t_p', JSON.stringify({ kind: 'custom' })); py.globals.set('_t_title', 'phrase_001');
    const proxy = py.runPython('_forge_rhythm_phrase_payload(_t_d, _t_p, _t_title)');
    const out = proxy.toJs({ dict_converter: Object.fromEntries }); proxy.destroy?.(); return out;
  };
  assert.equal(draw([BAR, BAR]).type, 'musicxml');
  assert.throws(() => draw([BAR, { ...BAR, channels: { kick: BAR.channels.kick.slice(0, 15) } }]), /bar 1/, 'the engine names the bar INDEX (from 0): custom-note-core.ts plainBarError counts it from 1');
});
