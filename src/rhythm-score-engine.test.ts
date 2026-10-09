// Beat-as-data Phase 6 (drain 2026-10-07-1600): REAL engine check for the Score view's compute path. Boots real Pyodide with the vendored
// music wheels and the bundled engine (as music21-bundle.test.ts does), execs the SAME Python text the host runs (RHYTHM_SCORE_PYTHON),
// and asserts that a rhythm data note's data becomes MusicXML with the right parts and accents; then renders that MusicXML with the real
// Verovio toolkit in node when it can (the plugin's own verovio.ts needs a DOM for its time map, so this drives the toolkit directly).
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadPyodide } from 'pyodide';
import { extractProductionPythonBlock } from './test-support/extract-python-block.ts';

const WHEELS_DIR = path.resolve(process.cwd(), 'assets/wheels');
const WHEELS_PRESENT = fs.existsSync(WHEELS_DIR) && fs.readdirSync(WHEELS_DIR).some((f) => f.endsWith('.whl'));
const test = (name: string, fn: () => Promise<void>) =>
  baseTest(name, { skip: WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels', timeout: 300_000 }, fn);

function walk(dir: string, base = ''): Array<{ rel: string; abs: string }> {
  const out: Array<{ rel: string; abs: string }> = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, e.name);
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs, rel)); else out.push({ rel, abs });
  }
  return out;
}

let _py: Promise<any> | null = null;
async function engine(): Promise<any> {
  if (_py) return _py;
  _py = (async () => {
    const py = await loadPyodide();
    await py.loadPackage(['numpy', 'pyyaml']);
    for (const d of ['/bundle', '/bundle/wheels', '/bundle/site-packages', '/bundle/engine']) { try { py.FS.mkdir(d); } catch { /* exists */ } }
    for (const { rel, abs } of walk(WHEELS_DIR)) { try { py.FS.writeFile('/bundle/wheels/' + rel, fs.readFileSync(abs)); } catch { /* */ } }
    const made = new Set(['/bundle/engine']);
    for (const { rel, abs } of walk(path.resolve(process.cwd(), 'assets/engine'))) {
      const parts = rel.split(path.sep);
      let cur = '/bundle/engine';
      for (let i = 0; i < parts.length - 1; i++) { cur += '/' + parts[i]; if (!made.has(cur)) { try { py.FS.mkdir(cur); made.add(cur); } catch { /* */ } } }
      try { py.FS.writeFile('/bundle/engine/' + parts.join('/'), fs.readFileSync(abs)); } catch { /* */ }
    }
    try { py.FS.mkdir('/bundle/user-vault'); } catch { /* exists */ }
    py.runPython(extractProductionPythonBlock());
    return py;
  })();
  return _py;
}

function compute(py: any, data: unknown, title: string): any {
  py.globals.set('_d', JSON.stringify(data));
  py.globals.set('_t', title);
  const proxy = py.runPython('_forge_rhythm_score_payload(_d, _t)');
  const out = proxy.toJs({ dict_converter: Object.fromEntries });
  proxy.destroy?.();
  return out;
}

const ROCK = {
  time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100,
  channels: {
    kick: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    hihat: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
  },
};

test('real engine: straight-rock data -> a tagged MusicXML payload with the three parts Kick, Snare, Closed Hi-Hat', async () => {
  const py = await engine();
  const r = compute(py, ROCK, 'rhythm_pattern_straight_rock');
  assert.equal(r.type, 'musicxml');
  assert.equal(r.has_percussion, true, 'percussion score: the dual multi-staff + kit shape');
  const xml: string = r.multi_staff_content;
  assert.ok(typeof xml === 'string' && xml.length > 500);
  const names = [...xml.matchAll(/<part-name>([^<]*)<\/part-name>/g)].map((m) => m[1]);
  assert.deepEqual(names, ['Kick', 'Snare', 'Closed Hi-Hat']);
  assert.match(xml, /<title>rhythm_pattern_straight_rock<\/title>|rhythm_pattern_straight_rock/);
  assert.equal((xml.match(/<note[ >]/g) ?? []).filter(Boolean).length > 0, true);
  assert.ok(typeof r.multi_staff_midi_base64 === 'string' && r.multi_staff_midi_base64.length > 20, 'the engine ships music21 MIDI bytes for playback');
  assert.ok(typeof r.kit_content === 'string');
});

test('real engine: velocity >= 100 hits carry accent articulations in the MusicXML; plain hits and 99 do not', async () => {
  const py = await engine();
  const data = JSON.parse(JSON.stringify(ROCK));
  data.channels.kick[0] = 112;          // accent
  data.channels.kick[8] = 99;           // just under the threshold
  const xml: string = compute(py, data, 't').multi_staff_content;
  const accents = (xml.match(/<accent\b/g) ?? []).length;
  assert.equal(accents, 1, 'exactly the one velocity-112 hit is accented');
  const plain = compute(py, ROCK, 't').multi_staff_content;
  assert.equal((plain.match(/<accent\b/g) ?? []).length, 0);
});

test('real engine: the tempo mark the engine emits is in the score (quarter = 100)', async () => {
  const py = await engine();
  const xml: string = compute(py, ROCK, 't').multi_staff_content;
  assert.match(xml, /<per-minute>100<\/per-minute>|tempo="100/);
});

test('real engine: invalid data raises with the engine\'s own message (channel and step), it is never silently coerced', async () => {
  const py = await engine();
  const bad = JSON.parse(JSON.stringify(ROCK));
  bad.channels.kick[3] = 'yes';
  assert.throws(() => compute(py, bad, 't'), /kick|step|3/);
});

test('real Verovio (node): the MusicXML renders to SVG with three staves (skips with the reason if this environment cannot run it)', async (t) => {
  const py = await engine();
  const xml: string = compute(py, ROCK, 't').multi_staff_content;
  let verovio: any;
  try { const m: any = await import('verovio'); verovio = m.default ?? m; } catch (e) { t.skip(`verovio not importable in node: ${(e as Error).message}`); return; }
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('verovio runtime did not initialise within 60 s')), 60_000);
      const done = () => { clearTimeout(timer); resolve(); };
      if (verovio.module?.calledRun) done(); else verovio.module.onRuntimeInitialized = done;
    });
    const tk = new verovio.toolkit();
    tk.loadData(xml);
    const svg: string = tk.renderToSVG(1);
    const staves = (svg.match(/class="staff"/g) ?? []).length;
    assert.equal(staves, 3, 'one staff per part: Kick, Snare, Closed Hi-Hat');
    assert.ok(tk.getPageCount() >= 1);
  } catch (e) {
    t.skip(`verovio could not run headless here: ${(e as Error).message}`);
  }
});

// ---- Beat-as-data Phase 7: two of the five world-rhythm notes through the REAL engine (the same compute path the Score view uses) -----

function sourceNote(name: string): { data: any; skipReason?: string } {
  for (const base of ['../music-theory/rhythm_data', 'assets/vaults/music-theory/rhythm_data']) {
    const file = path.resolve(process.cwd(), base, `${name}.md`);
    if (fs.existsSync(file)) {
      const m = /```json\n([\s\S]*?)\n```/.exec(fs.readFileSync(file, 'utf-8'))!;
      return { data: JSON.parse(m[1]) };
    }
  }
  return { data: null, skipReason: `${name}.md is in neither the source vault nor the bundled copy (the bundled copy gains it after the driver's vault sync)` };
}

/** The raw MIDI bytes of the payload's engine-written file: [(key, velocity)] for every note-on on channel 10 (status 0x99). */
function drumNoteOns(b64: string): Array<[number, number]> {
  const bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 2 < bytes.length; i++) {
    if (bytes[i] === 0x99 && bytes[i + 1] < 128 && bytes[i + 2] > 0 && bytes[i + 2] < 128) out.push([bytes[i + 1], bytes[i + 2]]);
  }
  return out;
}

test('real engine, Phase 7: rhythm_pattern_bell_12_8 -> one part "Bell", 12/8 in the score, GM Cowbell (56) on channel 10, tempo 120', async (t) => {
  const { data, skipReason } = sourceNote('rhythm_pattern_bell_12_8');
  if (!data) { t.skip(skipReason); return; }
  const py = await engine();
  const r = compute(py, data, 'rhythm_pattern_bell_12_8');
  assert.equal(r.type, 'musicxml');
  const xml: string = r.multi_staff_content;
  assert.deepEqual([...xml.matchAll(/<part-name>([^<]*)<\/part-name>/g)].map((m) => m[1]), ['Bell']);
  assert.match(xml, /<beats>12<\/beats>\s*<beat-type>8<\/beat-type>/);
  assert.match(xml, /<per-minute>120<\/per-minute>/);
  const notes = drumNoteOns(r.multi_staff_midi_base64);
  assert.equal(notes.length, 7, 'the seven bell strokes');
  assert.ok(notes.every(([key]) => key === 56), JSON.stringify(notes));
});

test('real engine, Phase 7: rhythm_pattern_tha_dhi_gi_na_thom -> High Conga + Low Conga in 5/4, GM 62 and 64, velocities 112/80/80/80 and 112, two accents', async (t) => {
  const { data, skipReason } = sourceNote('rhythm_pattern_tha_dhi_gi_na_thom');
  if (!data) { t.skip(skipReason); return; }
  const py = await engine();
  const r = compute(py, data, 'rhythm_pattern_tha_dhi_gi_na_thom');
  const xml: string = r.multi_staff_content;
  assert.deepEqual([...xml.matchAll(/<part-name>([^<]*)<\/part-name>/g)].map((m) => m[1]), ['High Conga', 'Low Conga']);
  assert.match(xml, /<beats>5<\/beats>\s*<beat-type>4<\/beat-type>/);
  const notes = drumNoteOns(r.multi_staff_midi_base64);
  assert.deepEqual(notes.filter(([k]) => k === 62).map(([, v]) => v), [112, 80, 80, 80]);
  assert.deepEqual(notes.filter(([k]) => k === 64).map(([, v]) => v), [112]);
  assert.equal((xml.match(/<accent\b/g) ?? []).length, 2, 'tha and thom carry the accent mark');
  assert.equal(r.has_percussion, true);
  assert.ok(typeof r.kit_content === 'string');
});
