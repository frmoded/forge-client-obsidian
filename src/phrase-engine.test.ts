// score_first M5 (drain 2026-10-22-1850) — the Score of a phrase through the REAL engine (the Python the plugin runs, test-support/real-rhythm-engine.ts), on the real bar_005 of the playground
// vault (a byte copy in test/fixtures/score-first/, checked against the sibling checkout when there is one). A fake canvas stands in for Verovio; nothing else is faked. Skipped (visibly)
// without the music wheels.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';

import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { dirtySiblingReason } from './test-support/dirty-sibling.ts';
import { createLiveScore } from './live-score-core.ts';
import { mountScorePanel } from './live-score-dom.ts';
import { producePhrase, type PhraseParams } from './phrase-core.ts';
import { annotatePhraseXml, phraseLineageOf, phraseProvenance } from './phrase-lineage-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const FIXTURE = path.resolve(import.meta.dirname, '../test/fixtures/score-first/bar_005.md');
const SIBLING = path.resolve(import.meta.dirname, '../../music-playground/bars/bar_005.md');
const BAR_005 = fs.readFileSync(FIXTURE, 'utf8');
const flush = async (n = 40) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 2)); };

const PHRASE: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 };
const measuresPerPart = (xml: string) => xml.split(/<part /).slice(1).map((p) => (p.match(/<measure /g) ?? []).length);
const soundTempi = (xml: string) => xml.split(/<part /).slice(1).map((p) => [...p.matchAll(/<sound tempo="([^"]+)"/g)].map((m) => Number(m[1])));
const metronomes = (xml: string) => xml.split(/<part /).slice(1).map((p) => [...p.matchAll(/<per-minute>([^<]+)<\/per-minute>/g)].map((m) => Number(m[1])));

function deps(py: any, text = BAR_005) {
  return {
    readNote: async (_p: string) => text,
    compute: async (data: any, params: PhraseParams, title: string) => computePhrase(py, data, params, title),
  };
}

// Strict against the COMMITTED playground bar (the matrix's clean worktree); a live checkout whose bars the plugin refreshed is skipped WITH its reason (a counted skip), never compared and never silently passed.
baseTest('the fixture is the playground vault\'s own bar_005 (when it is checked out)', async (t) => {
  const dirty = dirtySiblingReason(path.dirname(SIBLING), 'music-playground/bars');
  if (dirty !== null) { t.skip(`not comparing: ${dirty}`); return; }
  if (!fs.existsSync(SIBLING)) return;                // not checked out here: the fixture stands in
  assert.equal(fs.readFileSync(SIBLING, 'utf8'), BAR_005);
});

test('REAL ENGINE: bar_005 as a phrase of 8 bars slowing 20 % is 8 bars with a tempo mark at bar 1 and at every change, in both engraved views', async () => {
  const py = await engine();
  const out = await producePhrase(deps(py), PHRASE, 'phrase_001');
  assert.equal(out.kind, 'score', out.kind === 'score' ? '' : (out as { message: string }).message);
  if (out.kind !== 'score') return;
  const want = [100, 97, 94, 91, 89, 86, 83, 80];
  for (const key of ['multi_staff_content', 'kit_content'] as const) {
    const xml = out.payload[key] as string;
    assert.equal(typeof xml, 'string', key);
    const measures = measuresPerPart(xml);
    assert.ok(measures.length >= 1, key);
    for (const n of measures) assert.equal(n, 8, `${key}: 8 bars in every part`);
    for (const tempi of soundTempi(xml)) assert.deepEqual(tempi, want, `${key}: <sound tempo> at bar 1 and at each change`);
    for (const tempi of metronomes(xml)) assert.deepEqual(tempi, want, `${key}: the printed metronome mark at bar 1 and at each change`);
  }
  assert.equal(out.payload.type, 'musicxml');
  assert.ok(typeof out.payload.multi_staff_midi_base64 === 'string' && (out.payload.multi_staff_midi_base64 as string).length > 0, 'the payload carries the MIDI the player uses');
});

test('REAL ENGINE: a speed-up (+50 % over 4 bars), one bar, and the unchanged default', async () => {
  const py = await engine();
  const up = await producePhrase(deps(py), { ...PHRASE, bars: 4, tempo_change_pct: 50 }, 'p');
  assert.equal(up.kind, 'score');
  if (up.kind === 'score') assert.deepEqual(soundTempi(up.payload.multi_staff_content as string)[0], [100, 117, 133, 150]);
  const one = await producePhrase(deps(py), { ...PHRASE, bars: 1 }, 'p');
  assert.equal(one.kind, 'score');
  if (one.kind === 'score') {
    assert.deepEqual(measuresPerPart(one.payload.multi_staff_content as string), [1, 1]);
    assert.deepEqual(soundTempi(one.payload.multi_staff_content as string)[0], [100], 'a one-bar phrase stays at the seed tempo');
  }
  const flat = await producePhrase(deps(py), { ...PHRASE, bars: 4, tempo_change_pct: 0 }, 'p');
  assert.equal(flat.kind, 'score');
  if (flat.kind === 'score') {
    assert.deepEqual(measuresPerPart(flat.payload.multi_staff_content as string), [4, 4]);
    assert.ok(soundTempi(flat.payload.multi_staff_content as string)[0].every((t) => t === 100), 'no slowdown: every bar at 100');
  }
});

test('REAL ENGINE: all three styles engrave, and a seed the engine refuses (12 steps) is an error LINE naming why, not a thrown exception', async () => {
  const py = await engine();
  for (const style of ['repeat_with_fills', 'building', 'ghost_notes'] as const) {
    const o = await producePhrase(deps(py), { ...PHRASE, style, bars: 4 }, 'p');
    assert.equal(o.kind, 'score', style);
  }
  const twelve = BAR_005.replace('"steps": 16', '"steps": 12').replace(/\[true, false, true, true, false, false, true, false, true, false, false, false, false, false, false, false\]/, JSON.stringify(Array(12).fill(false)))
    .replace(/\[false, false, false, false, true, false, true, false, false, false, false, false, true, false, false, false\]/, JSON.stringify(Array(12).fill(false)));
  assert.notEqual(twelve, BAR_005);
  const o = await producePhrase(deps(py, twelve), PHRASE, 'p');
  assert.equal(o.kind, 'error');
  if (o.kind === 'error') assert.match(o.message, /16|steps/i);
});

test('END TO END (real engine, fake canvas): the live Score scheduler draws the phrase, a changed parameter redraws, a missing source is a line and the old score is taken away', async () => {
  const py = await engine();
  const win: any = new Window({ url: 'http://localhost/' });
  const tab = win.document.createElement('div'); win.document.body.appendChild(tab);
  const drawn: string[] = [];
  const panel = mountScorePanel(tab, { renderInto: (host, payload) => { drawn.push(payload.multi_staff_content as string); host.textContent = 'engraved'; return true; }, stopPlayers: () => {} });
  let source: string | null = BAR_005;
  const timers = new Map<number, () => void>(); let tid = 0;
  const live = createLiveScore({
    produce: (data, title) => producePhrase({ readNote: async () => { if (source === null) throw new Error('File not found'); return source; }, compute: async (d, p, t) => computePhrase(py, d, p, t) }, data, title),
    view: panel.view,
    title: 'phrase_001',
    setTimer: (fn) => { timers.set(++tid, fn); return tid; },
    clearTimer: (h) => { timers.delete(h as number); },
  });
  const fire = async () => { const fns = [...timers.values()]; timers.clear(); fns.forEach((f) => f()); await flush(); };
  const status = () => tab.querySelector('.forge-rhythm-edit-score-status').textContent as string;

  live.showNow(PHRASE); await flush(100);
  assert.equal(drawn.length, 1);
  assert.deepEqual(measuresPerPart(drawn[0]), [8, 8]);
  assert.deepEqual(soundTempi(drawn[0])[0], [100, 97, 94, 91, 89, 86, 83, 80]);
  assert.equal(status(), '');

  live.update({ ...PHRASE, bars: 4, tempo_change_pct: -10 }); await fire(); await flush(100);
  assert.equal(drawn.length, 2);
  assert.deepEqual(measuresPerPart(drawn[1]), [4, 4]);
  assert.deepEqual(soundTempi(drawn[1])[0], [100, 97, 93, 90]);

  source = null;                                        // the source bar goes away (renamed, deleted)
  live.update({ ...PHRASE, bars: 4, tempo_change_pct: -10 }); await fire(); await flush(100);
  assert.equal(drawn.length, 2, 'nothing new is drawn');
  assert.match(status(), /^Phrase: the source bar bar_005 .*not found/);
  assert.equal(tab.querySelectorAll('.forge-rhythm-score-host').length, 0, 'the stale score is taken away, never left looking current');

  source = BAR_005;                                     // the bar comes back: the phrase recovers
  live.update({ ...PHRASE, bars: 4, tempo_change_pct: -10 }); await fire(); await flush(100);
  assert.equal(drawn.length, 3);
  assert.equal(status(), '');
  live.dispose(); panel.dispose();
});

test('REAL ENGINE (M6): every bar of the real 8-bar payload gets an id in BOTH views, and the tempo of each bar is the engine\'s own (100 ... 80); the stack of bar 5 is the prompt\'s example', async () => {
  const py = await engine();
  const out = await producePhrase(deps(py), PHRASE, 'phrase_001');
  assert.equal(out.kind, 'score');
  if (out.kind !== 'score') return;
  const r = annotatePhraseXml(out.payload.multi_staff_content as string, out.payload.kit_content as string, 8);
  assert.equal(r.ok, true, r.ok ? '' : r.problems.join('; '));
  if (r.ok === false) return;
  assert.deepEqual(r.bars.map((b) => b.tempo), [100, 97, 94, 91, 89, 86, 83, 80], 'read from the engine\'s <sound tempo>, not computed here');
  assert.deepEqual(r.kitProblems, [], 'the Kit view is tied too');
  for (const xml of [r.multiXml, r.kitXml!]) {
    const first = /<part\b[^>]*>([\s\S]*?)<\/part>/.exec(xml)![1];
    assert.deepEqual([...first.matchAll(/<measure\b[^>]*\bid="(ph_bar_\d+)"/g)].map((m) => m[1]), [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `ph_bar_${n}`));
  }
  const map = phraseProvenance('phrases/phrase_001', PHRASE, r.bars);
  assert.deepEqual(phraseLineageOf(map.ph_bar_5).map((e) => e.text), ['bar 5 of 8', 'made by phrase_001 (extend, slowing 20 %, style repeat_with_fills)', 'from bar_005', 'tempo 89', 'Edit this bar']);   // M9, deliberate: the Edit this bar action is the one added line
});

test('REAL ENGINE (2100): the fill rule the strip states is what extend_rhythm does — a fill in the last beat of every 4th bar, and in the last bar unless the bar before it was filled; building and ghost_notes never put a fill there', async () => {
  const py = await engine();
  const bar = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(BAR_005)![1]);
  const filled = (style: string, bars: number): number[] => {
    py.globals.set('_seed', JSON.stringify(bar));
    const out = py.runPython(`import json\nfrom forge.music.lib import extend_rhythm\njson.dumps(extend_rhythm(json.loads(_seed), bars=${bars}, style="${style}"))`) as string;
    return (JSON.parse(out) as Array<{ channels: { snare: unknown[] } }>).map((b, i) => (JSON.stringify(b.channels.snare.slice(12, 16)) === '[64,80,96,112]' ? i + 1 : 0)).filter(Boolean);
  };
  assert.deepEqual(filled('repeat_with_fills', 4), [4]);
  assert.deepEqual(filled('repeat_with_fills', 8), [4, 8]);
  assert.deepEqual(filled('repeat_with_fills', 5), [4], 'bar 5 is the last bar but follows a filled bar: no fill');
  assert.deepEqual(filled('repeat_with_fills', 6), [4, 6], 'the last bar gets one when the bar before it was not filled');
  assert.deepEqual(filled('repeat_with_fills', 1), [1]);
  assert.deepEqual(filled('building', 8), []); assert.deepEqual(filled('ghost_notes', 8), []);
});

test('REAL ENGINE (2100): the other two style notes are true — building: the hi-hat is quarters in bar 1, eighths in bar 2, sixteenths from bar 3; ghost_notes: quiet snare notes on steps that are not the seed\'s own hits, 3 mod 4 in the first bar and 1 mod 4 in the second', async () => {
  const py = await engine();
  const bar = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(BAR_005)![1]);
  const run = (style: string): any[] => {
    py.globals.set('_seed', JSON.stringify(bar));
    return JSON.parse(py.runPython(`import json\nfrom forge.music.lib import extend_rhythm\njson.dumps(extend_rhythm(json.loads(_seed), bars=4, style="${style}"))`) as string);
  };
  const hits = (cells: unknown[]) => cells.map((v, i) => (v === true || (typeof v === 'number' && v > 0) ? i : -1)).filter((i) => i >= 0);
  const b = run('building');
  assert.deepEqual(hits(b[0].channels.hihat), [0, 4, 8, 12]);
  assert.deepEqual(hits(b[1].channels.hihat), [0, 2, 4, 6, 8, 10, 12, 14]);
  assert.equal(hits(b[2].channels.hihat).length, 16); assert.equal(hits(b[3].channels.hihat).length, 16);
  const g = run('ghost_notes');
  const seedSnare = bar.channels.snare as unknown[]; const seedKick = bar.channels.kick as unknown[];
  const seedHit = (i: number) => seedSnare[i] === true || seedKick[i] === true || (typeof seedSnare[i] === 'number' && (seedSnare[i] as number) > 0);
  const added = (bi: number) => hits(g[bi].channels.snare).filter((i) => g[bi].channels.snare[i] === 36);
  assert.ok(added(0).length > 0 && added(0).every((i) => i % 4 === 3 && !seedHit(i)), `bar 1 ghosts: ${added(0)}`);
  assert.ok(added(1).length > 0 && added(1).every((i) => i % 4 === 1 && !seedHit(i)), `bar 2 ghosts: ${added(1)}`);
});
