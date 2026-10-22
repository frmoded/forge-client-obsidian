// score_first M5 (drain 2026-10-22-1850) — the Score of a phrase through the REAL engine (the Python the plugin runs, test-support/real-rhythm-engine.ts), on the real bar_005 of the playground
// vault (a byte copy in test/fixtures/score-first/, checked against the sibling checkout when there is one). A fake canvas stands in for Verovio; nothing else is faked. Skipped (visibly)
// without the music wheels.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';

import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
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

test('the fixture is the playground vault\'s own bar_005 (when it is checked out)', async () => {
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
  assert.deepEqual(phraseLineageOf(map.ph_bar_5).map((e) => e.text), ['bar 5 of 8', 'made by phrase_001 (extend, slowing 20 %, style repeat_with_fills)', 'from bar_005', 'tempo 89']);
});
