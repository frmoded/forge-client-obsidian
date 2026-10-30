// 2026-10-29-0820 (M10 slice 1): an arrangement on the REAL engine (Pyodide with the vendored music wheels and the engine bundle of assets/engine, which carries combine_tracks; test-support/real-rhythm-engine.ts). Nothing is faked but the vault: kit notes,
// phrase notes and the arrangement note are written by the plugin's own builders. Proves: the Score is drawn by the phrase glue's `arrangement` branch from the json (P4) and its bars are exactly what combine_tracks gives for the phrases' own bars;
// the PYTHON text of the arrangement note, run with every other note bound by name (a kit is its compute() dict, a phrase its bars), gives those same bars; a kit conflict, a different tempo and a shorter phrase behave as designed.
// Skipped (visibly) without the music wheels. Pins the MECHANISM (the blocks call each other by name; the glue calls combine_tracks); if the design moves this SHOULD go red - reassess, don't just rewrite.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { barsOfPayload, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { newKitNote, type KitParams } from './kit-core.ts';
import { newArrangementNote, produceArrangement, type ArrangementParams } from './arrangement-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const barText = (n: string): string => fs.readFileSync(path.join(FIXTURES, `${n}.md`), 'utf8');
/** bar_008 is a latin bar (kick, hihat, claves, conga_low) at 120 bpm; the same bar at the rock fixtures' 100 bpm, so the two can be played together. */
const LATIN_BAR_AT_100 = barText('bar_008').replace('"tempo_bpm": 120', '"tempo_bpm": 100');
const barJson = (text: string): any => JSON.parse(/```json\n([\s\S]*?)\n```/.exec(text)![1]);

const ROCK: KitParams = { kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] };
const LATIN: KitParams = { kind: 'kit', name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] };
const ARR: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }] };
const extend = (source: string, bars: number): PhraseParams => ({ kind: 'extend', source, bars, style: 'repeat_with_fills', tempo_change_pct: 0 });

function vault(over: { latin?: KitParams; latinBar?: string; rockBars?: number; latinBars?: number } = {}): Record<string, string> {
  return {
    'bars/bar_007.md': barText('bar_007'), 'bars/bar_008.md': over.latinBar ?? LATIN_BAR_AT_100,
    'kits/rock.md': newKitNote(ROCK), 'kits/latin.md': newKitNote(over.latin ?? LATIN),
    'phrases/phrase_003.md': noteContentFor('phrase_003', extend('bar_007', over.rockBars ?? 4)),
    'phrases/phrase_009.md': noteContentFor('phrase_009', extend('bar_008', over.latinBars ?? 2)),
    'arrangements/arr_001.md': newArrangementNote('arr_001', ARR),
  };
}
const deps = (py: any, files: Record<string, string>) => ({
  phrases: {
    readNote: async (p: string) => { const t = files[p]; if (t === undefined) throw new Error('File not found'); return t; },
    compute: async (data: any, params: PhraseParams, title: string) => computePhrase(py, data, params, title),
  },
  compute: async (data: unknown, title: string) => computePhrase(py, data, { kind: 'arrangement' }, title),
});
const hits = (bar: any, row: string): number[] => (bar.channels[row] as Array<boolean | number>).flatMap((v, i) => (v === false || v === 0 ? [] : [i]));

/** What combine_tracks gives, asked of the engine directly for the same tracks. */
async function direct(py: any, tracks: unknown): Promise<any[]> {
  py.globals.set('_tracks_json', JSON.stringify(tracks));
  return JSON.parse(py.runPython(['import json as _j', 'from forge.music.lib import combine_tracks', '_j.dumps(combine_tracks(_j.loads(_tracks_json)))'].join('\n')));
}

test('rock (4 bars) and latin (2 bars) played together: a real Score, 4 bars, the latin rows rest from bar 3, and the bars equal combine_tracks over the two tracks drawn alone', async () => {
  const py = await engine();
  const files = vault();
  const out = await produceArrangement(deps(py, files), files['arrangements/arr_001.md'], 'arr_001');
  assert.equal(out.kind, 'score', out.kind === 'score' ? '' : (out as { message: string }).message);
  if (out.kind !== 'score') return;
  assert.equal(typeof out.payload.content === 'string' || typeof out.payload.multi_staff_content === 'string', true, 'a Score payload');
  const bars = barsOfPayload(out.payload)!;
  assert.equal(bars.length, 4, 'as long as the longest phrase');
  assert.deepEqual(Object.keys(bars[0].channels), ['kick', 'snare', 'hihat', 'claves', 'conga_low'], 'the engine\'s channel order; the latin kit has no kick or hi-hat, so the latin phrase\'s own are dropped');
  // each track drawn alone (the same producer, one track): its own bars, restricted to its kit
  const alone = async (index: number): Promise<any[]> => {
    const note = newArrangementNote('arr_002', { kind: 'arrangement', tracks: [ARR.tracks[index]] });
    const o = await produceArrangement(deps(py, files), note, 'arr_002');
    assert.equal(o.kind, 'score');
    return barsOfPayload((o as { payload: Record<string, unknown> }).payload)!;
  };
  const rock = await alone(0);
  const latin = await alone(1);
  assert.equal(rock.length, 4);
  assert.equal(latin.length, 2);
  assert.deepEqual(bars, await direct(py, [{ kit: 'rock', channels: ROCK.channels, bars: rock }, { kit: 'latin', channels: LATIN.channels, bars: latin }]), 'the glue is combine_tracks over the tracks');
  for (const row of ['kick', 'snare', 'hihat']) for (let i = 0; i < 4; i++) assert.deepEqual(bars[i].channels[row], rock[i].channels[row], `the rock phrase\'s ${row}, bar ${i + 1}`);
  for (const row of ['claves', 'conga_low']) {
    assert.ok(hits(latin[0], row).length > 0 || hits(latin[1], row).length > 0, `${row} plays in the latin phrase`);
    for (const i of [0, 1]) assert.deepEqual(bars[i].channels[row], latin[i].channels[row], `the latin phrase\'s ${row}, bar ${i + 1}`);
    for (const i of [2, 3]) assert.deepEqual(bars[i].channels[row], new Array(16).fill(false), `${row} rests in bar ${i + 1}: the shorter phrase has ended`);
  }
});

test('the PYTHON text of the arrangement note, run with every other note bound by name, gives the same bars the Score is drawn from', async () => {
  const py = await engine();
  const files = vault();
  const out = await produceArrangement(deps(py, files), files['arrangements/arr_001.md'], 'arr_001');
  assert.equal(out.kind, 'score');
  if (out.kind !== 'score') return;
  const pythonOf = (note: string): string => /\n# Python\n\n```python\n([\s\S]*?)\n```\n/.exec(note)![1];
  const srcs: Record<string, string> = {};
  const bars: Record<string, unknown> = {};
  for (const [p, t] of Object.entries(files)) {
    const name = p.replace(/^[^/]+\//, '').replace(/\.md$/, '');
    if (p.startsWith('bars/')) bars[name] = barJson(t); else srcs[name] = pythonOf(t);
  }
  py.globals.set('_bars_json', JSON.stringify(bars));
  py.globals.set('_srcs_json', JSON.stringify(srcs));
  const ran = JSON.parse(py.runPython([
    'import json as _j',
    'from forge.music import lib as _lib',
    '_eng = {k: getattr(_lib, k) for k in ("extend_rhythm", "mix_rhythm", "morph_rhythm", "morph_rhythm_info", "thin_out_bars", "double_up_bars", "combine_tracks")}',
    '_bars = _j.loads(_bars_json); _srcs = _j.loads(_srcs_json); _fns = {}',
    'for _n, _d in _bars.items():',
    '    _fns[_n] = (lambda d: (lambda: _j.loads(_j.dumps(d))))(_d)',
    'def _note(name):',
    '    def call():',
    '        g = dict(_eng); g.update(_fns)',
    '        exec(_srcs[name], g)',
    '        return g["compute"](None)',
    '    return call',
    'for _n in _srcs: _fns[_n] = _note(_n)',
    '_j.dumps(_fns["arr_001"]())',
  ].join('\n')));
  assert.deepEqual(ran, barsOfPayload(out.payload), 'the note\'s Python and the drawn Score agree bar for bar');
  assert.equal((ran as unknown[]).length, 4);
});

test('a channel two kits both have is refused in the engine\'s own sentence, naming the channel and both kits; the engine is the judge, nothing is drawn', async () => {
  const py = await engine();
  const files = vault({ latin: { kind: 'kit', name: 'latin', channels: ['kick', 'claves', 'conga_low'] } });
  const out = await produceArrangement(deps(py, files), files['arrangements/arr_001.md'], 'arr_001');
  assert.equal(out.kind, 'refusal', out.kind === 'refusal' ? '' : JSON.stringify(out).slice(0, 200));
  if (out.kind === 'refusal') {
    assert.match(out.message, /^Arrangement: combine_tracks: channel 'kick' is claimed by kit 'rock' and by kit 'latin'/);
  }
});

// 2026-10-29-0910 (deliberate): this test pinned "phrases at different tempos are a plain refusal naming the field, the bar and both kits". The driver decided RE-TIME: the arrangement plays at the FIRST track's tempo.
test('phrases at different tempos are RE-TIMED, not refused: every bar plays at the first track\'s tempo (rock 100, latin 120 -> 100) and the lineage names the tempo the latin bars came with', async () => {
  const py = await engine();
  const files = vault({ latinBar: barText('bar_008') });        // bar_008 as shipped is 120 bpm; the rock bars are 100
  const out = await produceArrangement(deps(py, files), files['arrangements/arr_001.md'], 'arr_001');
  assert.equal(out.kind, 'score', out.kind === 'score' ? '' : (out as { message: string }).message);
  if (out.kind !== 'score') return;
  const bars = barsOfPayload(out.payload)!;
  assert.deepEqual(bars.map((b) => b.tempo_bpm), [100, 100, 100, 100]);
  const lineage = (out.payload as any).arrangement_lineage;
  assert.equal(lineage.length, 4);
  assert.deepEqual(lineage[0].retimed_from, { latin: 120 });
  assert.deepEqual(lineage[2].retimed_from, {}, 'bar 3: the latin phrase has ended, nothing to re-time');
});

test('the lineage rides out of the engine glue: per bar, which phrase and kit each channel group came from, None where the shorter phrase has ended; and it does not change the bars', async () => {
  const py = await engine();
  const files = vault();
  const out = await produceArrangement(deps(py, files), files['arrangements/arr_001.md'], 'arr_001');
  assert.equal(out.kind, 'score');
  if (out.kind !== 'score') return;
  const lineage = (out.payload as any).arrangement_lineage;
  assert.deepEqual(lineage.map((r: any) => r.bar), [1, 2, 3, 4]);
  assert.deepEqual(lineage[0].channels.kick, { kit: 'rock', phrase: 'phrase_003', bar: 1 });
  assert.deepEqual(lineage[1].channels.claves, { kit: 'latin', phrase: 'phrase_009', bar: 2 });
  const ended = lineage[2].channels.claves;
  assert.deepEqual([ended.kit, ended.phrase, ended.bar ?? null], ['latin', 'phrase_009', null], 'Python None crosses Pyodide as undefined: "no bar" is == null on this side');
  assert.deepEqual(lineage[3].channels.snare, { kit: 'rock', phrase: 'phrase_003', bar: 4 });
  const bars = barsOfPayload(out.payload)!;
  const rock = await (async () => { const o = await produceArrangement(deps(py, files), newArrangementNote('arr_002', { kind: 'arrangement', tracks: [ARR.tracks[0]] }), 'arr_002'); return barsOfPayload((o as any).payload)!; })();
  const latin = await (async () => { const o = await produceArrangement(deps(py, files), newArrangementNote('arr_003', { kind: 'arrangement', tracks: [ARR.tracks[1]] }), 'arr_003'); return barsOfPayload((o as any).payload)!; })();
  assert.deepEqual(bars, await direct(py, [{ kit: 'rock', channels: ROCK.channels, bars: rock }, { kit: 'latin', channels: LATIN.channels, bars: latin }]), 'the bars are still exactly combine_tracks over the tracks WITHOUT phrase names');
});

/** Run the PYTHON text of `entry` with every other note bound by name (a kit is its compute() dict, a phrase its bars): what a person running the note would get. */
async function pythonBars(py: any, files: Record<string, string>, entry: string): Promise<unknown> {
  const pythonOf = (note: string): string => /\n# Python\n\n```python\n([\s\S]*?)\n```\n/.exec(note)![1];
  const srcs: Record<string, string> = {}; const bars: Record<string, unknown> = {};
  for (const [p, t] of Object.entries(files)) { const name = p.replace(/^[^/]+\//, '').replace(/\.md$/, ''); if (p.startsWith('bars/')) bars[name] = barJson(t); else srcs[name] = pythonOf(t); }
  py.globals.set('_bars_json', JSON.stringify(bars)); py.globals.set('_srcs_json', JSON.stringify(srcs)); py.globals.set('_entry', entry);
  return JSON.parse(py.runPython([
    'import json as _j', 'from forge.music import lib as _lib',
    '_eng = {k: getattr(_lib, k) for k in ("extend_rhythm", "mix_rhythm", "morph_rhythm", "morph_rhythm_info", "thin_out_bars", "double_up_bars", "combine_tracks")}',
    '_bars = _j.loads(_bars_json); _srcs = _j.loads(_srcs_json); _fns = {}',
    'for _n, _d in _bars.items():', '    _fns[_n] = (lambda d: (lambda: _j.loads(_j.dumps(d))))(_d)',
    'def _note(name):', '    def call():', '        g = dict(_eng); g.update(_fns)', '        exec(_srcs[name], g)', '        return g["compute"](None)', '    return call',
    'for _n in _srcs: _fns[_n] = _note(_n)', '_j.dumps(_fns[_entry]())',
  ].join('\n')));
}
const withSettings = (tracks: ArrangementParams['tracks']): Record<string, string> => ({ ...vault(), 'arrangements/arr_001.md': newArrangementNote('arr_001', { kind: 'arrangement', tracks }) });

test('mute, solo and volume on the REAL engine: a muted kit is gone from the Score, solo equals muting the rest, volume scales the velocities, and the note\'s generated Python gives the same bars as the Score it draws', async () => {
  const py = await engine();
  const draw = async (tracks: ArrangementParams['tracks']): Promise<{ files: Record<string, string>; bars: any[] }> => {
    const files = withSettings(tracks);
    const out = await produceArrangement(deps(py, files), files['arrangements/arr_001.md'], 'arr_001');
    assert.equal(out.kind, 'score', out.kind === 'score' ? '' : (out as { message: string }).message);
    return { files, bars: barsOfPayload((out as { payload: Record<string, unknown> }).payload)! };
  };
  const full = await draw(ARR.tracks);
  const mutedLatin = await draw([ARR.tracks[0], { ...ARR.tracks[1], mute: true }]);
  assert.deepEqual(Object.keys(mutedLatin.bars[0].channels), ['kick', 'snare', 'hihat'], 'latin is silent: only rock\'s rows');
  assert.equal(mutedLatin.bars.length, 4, 'muting does not shorten the arrangement');
  for (const row of ['kick', 'snare', 'hihat']) for (let i = 0; i < 4; i++) assert.deepEqual(mutedLatin.bars[i].channels[row], full.bars[i].channels[row], `rock\'s ${row} is untouched`);
  const soloRock = await draw([{ ...ARR.tracks[0], solo: true }, ARR.tracks[1]]);
  assert.deepEqual(soloRock.bars, mutedLatin.bars, 'solo rock is the same as muting latin');
  const half = await draw([{ ...ARR.tracks[0], volume: 50 }, ARR.tracks[1]]);
  const velocities = (bars: any[], row: string): number[] => bars.flatMap((b) => (b.channels[row] as Array<boolean | number>).filter((v) => v !== false && v !== 0).map((v) => (v === true ? 90 : (v as number))));
  const before = velocities(full.bars, 'kick'); const after = velocities(half.bars, 'kick');
  assert.equal(after.length, before.length, 'no hit lost');
  assert.deepEqual(after, before.map((v) => Math.max(1, Math.min(127, Math.floor(v * 0.5 + 0.5)))), 'every kick hit is at half its velocity, rounded half up');
  assert.deepEqual(half.bars.map((b) => Object.keys(b.channels)), full.bars.map((b) => Object.keys(b.channels)));
  for (const d of [mutedLatin, soloRock, half]) assert.deepEqual(await pythonBars(py, d.files, 'arr_001'), d.bars, 'the note\'s Python and the drawn Score agree bar for bar');
});

test('every kit muted on the real engine: one plain sentence, not an empty Score', async () => {
  const py = await engine();
  const files = withSettings(ARR.tracks.map((t) => ({ ...t, mute: true })));
  const out = await produceArrangement(deps(py, files), files['arrangements/arr_001.md'], 'arr_001');
  assert.equal(out.kind, 'refusal');
  if (out.kind === 'refusal') assert.equal(out.message, 'Every kit is muted, so nothing plays. Unmute one of them.');
});

test('a kit a phrase does not play is simply silent: a kit with a channel the phrase lacks adds no row, and the result still plays', async () => {
  const py = await engine();
  const files = vault({ latin: { kind: 'kit', name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] } });    // bar_008 has no bell and no conga_high
  const out = await produceArrangement(deps(py, files), files['arrangements/arr_001.md'], 'arr_001');
  assert.equal(out.kind, 'score');
  if (out.kind !== 'score') return;
  const rows = Object.keys(barsOfPayload(out.payload)![0].channels);
  assert.ok(!rows.includes('bell') && !rows.includes('conga_high'));
});
