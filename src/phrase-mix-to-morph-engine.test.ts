// score_first (drain 2026-10-25-1000) — "Turn this mix into a morph" through the REAL engine (the Python the plugin runs, test-support/real-rhythm-engine.ts, booted once from the BUNDLED assets/engine) on the real
// demo bars (byte copies in test/fixtures/score-first/). The `d` the new morph's Bars come from is the ENGINE's own (`morph_rhythm_info` through the plugin glue `_forge_morph_changes`), and the morph that
// results really is a path of single-hit changes: five bars for a d of 4, each one hit from the last. Skipped (visibly) without the music wheels.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { WHEELS_PRESENT, engine, computePhrase, morphChanges } from './test-support/real-rhythm-engine.ts';
import { producePhrase, readPhraseNote, turnMixIntoMorph, type MixPhrase, type MorphPhrase, type PhraseParams, type TurnMixPorts } from './phrase-core.ts';
import { readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const BARS: Record<string, string> = Object.fromEntries(['bar_005', 'bar_006', 'bar_007', 'bar_008'].map((n) => [n, fs.readFileSync(path.join(FIXTURES, `${n}.md`), 'utf8')]));
const dataOf = (name: string): RhythmData => { const r = readRhythmNote(BARS[name]); if (r.ok === false) throw new Error(r.message); return r.value.data; };
const mixText = (a: string, b: string) => `---\ntype: data\ncontent_type: json\ndescription: "phrase_002 — a mix of ${a} and ${b}."\n---\n\n\`\`\`json\n${JSON.stringify({ kind: 'mix', a, b, weight: 0, threshold: 0.65, ghost: true } satisfies MixPhrase, null, 2)}\n\`\`\`\n`;
const measures = (xml: string) => Math.max(0, ...[...xml.matchAll(/<measure[^>]*\snumber="(\d+)"/g)].map((m) => Number(m[1])));
function noteheadsPerBar(xml: string): number[] {
  const out: Record<number, number> = {};
  for (const m of xml.matchAll(/<measure[^>]*\snumber="(\d+)"[^>]*>([\s\S]*?)<\/measure>/g)) {
    const heads = (m[2].match(/<note[ >][\s\S]*?<\/note>/g) ?? []).filter((n) => !n.includes('<rest')).length;
    out[Number(m[1])] = (out[Number(m[1])] ?? 0) + heads;
  }
  return Object.keys(out).map(Number).sort((x, y) => x - y).map((k) => out[k]);
}

/** The vault is a map; the engine is the real one; the new note lands in the map so it can be read back and drawn. */
function world(py: any, mix: { a: string; b: string }) {
  const files = new Map<string, string>([['phrases/phrase_002.md', mixText(mix.a, mix.b)]]);
  for (const [n, t] of Object.entries(BARS)) files.set(`bars/${n}.md`, t);
  const before = files.get('phrases/phrase_002.md');
  const opened: string[] = []; const notices: string[] = []; const lines: string[] = [];
  const ports: TurnMixPorts<{ path: string }> = {
    activePath: () => 'phrases/phrase_002.md',
    folderExists: () => true, createFolder: async () => {},
    listPhraseBasenames: () => [...files.keys()].filter((k) => k.startsWith('phrases/')).map((k) => k.replace(/^phrases\//, '').replace(/\.md$/, '')),
    exists: (p) => files.has(p),
    create: async (p, c) => { files.set(p, c); return { path: p }; },
    open: async (f) => { opened.push(f.path); },
    notify: (m) => { notices.push(m); },
    isAlreadyExists: () => false,
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    changes: async (a, b, order, seed) => morphChanges(py, { a, b }, order, seed),
    trace: (l) => { lines.push(l); },
  };
  return { files, ports, opened, notices, lines, before };
}

test('the glue `_forge_morph_changes` is in the production Python block and answers the engine\'s own d: 4 for bar_005 -> bar_006, 0 for a bar and itself, the same in every order', async () => {
  const py = await engine();
  assert.equal(morphChanges(py, { a: dataOf('bar_005'), b: dataOf('bar_006') }), 4);
  assert.equal(morphChanges(py, { a: dataOf('bar_005'), b: dataOf('bar_005') }), 0);
  for (const order of ['musical', 'seeded', 'by_channel']) assert.equal(morphChanges(py, { a: dataOf('bar_007'), b: dataOf('bar_008') }, order, 3), 16, order);
});

test('the glue refuses what the engine refuses (bars on different grids), with the engine\'s own words', async () => {
  const py = await engine();
  const odd = { ...dataOf('bar_006'), steps: 12, group_size: 3, channels: { kick: Array(12).fill(false) } };
  assert.throws(() => morphChanges(py, { a: dataOf('bar_005'), b: odd }), /morph_rhythm/);
});

test('real engine, real bars: a mix of bar_005 and bar_006 becomes phrase_003, a morph with Bars = d + 1 = 5; drawn by the real engine it is five bars, each ONE hit from the last; the mix is untouched', async () => {
  const py = await engine();
  const w = world(py, { a: 'bar_005', b: 'bar_006' });
  const out = await turnMixIntoMorph(w.ports);
  assert.deepEqual(out, { ok: true, path: 'phrases/phrase_003.md' });
  assert.deepEqual(w.notices, []);
  assert.deepEqual(w.opened, ['phrases/phrase_003.md']);
  assert.deepEqual(w.lines, ['[forge-morph] turned phrase_002 (mix) into phrase_003 (morph, bars 5, d 4)']);
  assert.equal(w.files.get('phrases/phrase_002.md'), w.before, 'the mix is byte-unchanged');
  const made = readPhraseNote(w.files.get('phrases/phrase_003.md')!);
  assert.equal(made.ok, true);
  const morph = (made.ok && made.value) as MorphPhrase;
  assert.deepEqual(morph, { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0 });
  const shown = await producePhrase({ readNote: async (p) => { const t = w.files.get(p); if (t === undefined) throw new Error('File not found'); return t; }, compute: async (d, params: PhraseParams, title) => computePhrase(py, d, params, title) }, morph, 'phrase_003');
  assert.equal(shown.kind, 'score');
  const xml = String((shown as { payload: { content: string } }).payload.content);
  assert.equal(measures(xml), 5);
  const heads = noteheadsPerBar(xml);
  assert.equal(heads.length, 5);
  for (let i = 1; i < heads.length; i++) assert.equal(Math.abs(heads[i] - heads[i - 1]), 1, `bar ${i + 1} differs from bar ${i} by one hit (${heads.join(',')})`);
});

test('the demo pair (d = 16) gives a 17-bar morph; a bar and itself (d = 0) gives the 5-bar default', async () => {
  const py = await engine();
  const big = world(py, { a: 'bar_007', b: 'bar_008' });
  assert.equal((await turnMixIntoMorph(big.ports)).ok, true);
  assert.equal((readPhraseNote(big.files.get('phrases/phrase_003.md')!) as { ok: true; value: MorphPhrase }).value.bars, 17);
  const same = world(py, { a: 'bar_005', b: 'bar_005' });
  assert.equal((await turnMixIntoMorph(same.ports)).ok, true);
  assert.equal((readPhraseNote(same.files.get('phrases/phrase_003.md')!) as { ok: true; value: MorphPhrase }).value.bars, 5);
});
