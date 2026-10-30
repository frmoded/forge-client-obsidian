// 2026-10-30-1000 (M10 slice 3) - navigation in an arrangement on the REAL engine and the REAL Verovio toolkit (node): the lineage the engine gives, the MusicXML it writes and the SVG Verovio draws from it are tied together by
// arrangement-nav-core.ts and arrangement-rows-dom.ts. What this proves that the fakes cannot: the ids the plugin puts on the measures come back as the ids of the `g.measure` elements; each holds ONE `g.staff` per part in the order of the
// parts; and the notes inside staff i of bar n are exactly the hits of the i-th channel of bar n - so a row drawn into that staff IS that channel's row. (Layout - where the boxes are - is the browser's; getBBox is stubbed here.)
// Skipped (visibly) without the music wheels or without a Verovio that runs headless here. Pins the MECHANISM (Verovio draws a measure group per bar holding a staff group per part): if that moves this SHOULD go red - reassess, don't just rewrite.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';

import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { noteContentFor, type PhraseParams } from './phrase-core.ts';
import { newKitNote, type KitParams } from './kit-core.ts';
import { newArrangementNote, produceArrangement, type ArrangementParams } from './arrangement-core.ts';
import { annotateArrangementPayload, arrangementLineageOf, rowId } from './arrangement-nav-core.ts';
import { ensureArrangementRows, ROW_CLASS } from './arrangement-rows-dom.ts';
import { pinnedNoteFor } from './linked-panes-core.ts';
import { CANONICAL_CHANNELS } from './provenance-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: (t: any) => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const barText = (n: string): string => fs.readFileSync(path.join(FIXTURES, `${n}.md`), 'utf8');
const LATIN_BAR_AT_100 = barText('bar_008').replace('"tempo_bpm": 120', '"tempo_bpm": 100');
const ROCK: KitParams = { kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] };
const LATIN: KitParams = { kind: 'kit', name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] };
const ARR: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }] };
const extend = (source: string, bars: number): PhraseParams => ({ kind: 'extend', source, bars, style: 'repeat_with_fills', tempo_change_pct: 0 });
const files = (): Record<string, string> => ({
  'bars/bar_007.md': barText('bar_007'), 'bars/bar_008.md': LATIN_BAR_AT_100, 'kits/rock.md': newKitNote(ROCK), 'kits/latin.md': newKitNote(LATIN),
  'phrases/phrase_003.md': noteContentFor('phrase_003', extend('bar_007', 4)), 'phrases/phrase_009.md': noteContentFor('phrase_009', extend('bar_008', 2)),
  'arrangements/arr_001.md': newArrangementNote('arr_001', ARR),
});
const deps = (py: any, f: Record<string, string>) => ({
  phrases: { readNote: async (p: string) => { const t = f[p]; if (t === undefined) throw new Error('File not found'); return t; }, compute: async (data: any, params: PhraseParams, title: string) => computePhrase(py, data, params, title) },
  compute: async (data: unknown, title: string) => computePhrase(py, data, { kind: 'arrangement' }, title),
});
const hitCount = (cells: unknown[]): number => cells.filter((v) => v === true || (typeof v === 'number' && v > 0)).length;

async function realPayload(): Promise<Record<string, unknown>> {
  const py = await engine();
  const f = files();
  const out = await produceArrangement(deps(py, f), f['arrangements/arr_001.md'], 'arr_001');
  assert.equal(out.kind, 'score', out.kind === 'score' ? '' : (out as { message: string }).message);
  return (out as { payload: Record<string, unknown> }).payload;
}

test('the real engine\'s Score is tied: a row for every channel of every bar (4 bars x 5 channels), each tied to the kit, phrase and bar the engine named, with the phrases the producer read riding along', async () => {
  const payload = await realPayload();
  assert.deepEqual(Object.keys(payload.forge_phrases as object).sort(), ['phrase_003', 'phrase_009'], 'the producer says which phrases it read');
  const r = annotateArrangementPayload('arrangements/arr_001', payload);
  assert.deepEqual(r.problems, []);
  assert.equal(Object.keys(r.map).length, 20);
  const p = (bar: number, channel: string) => r.map[rowId(bar, channel)].params;
  assert.deepEqual([p(2, 'kick').kit, p(2, 'kick').phrase, p(2, 'kick').phraseBar, p(2, 'kick').sourceNote, p(2, 'kick').sourceReason], ['rock', 'phrase_003', 2, 'bars/bar_007', 'pinned bar 2']);
  assert.deepEqual([p(2, 'claves').kit, p(2, 'claves').phrase, p(2, 'claves').phraseBar, p(2, 'claves').sourceNote, p(2, 'claves').cameWith], ['latin', 'phrase_009', 2, 'bars/bar_008', null], 'this latin bar was written at 100 bpm: nothing was re-timed');
  assert.deepEqual([p(3, 'conga_low').ended, p(3, 'conga_low').phraseBar, p(3, 'conga_low').sourceNote, p(3, 'conga_low').sourceReason], [true, null, 'phrases/phrase_009', 'phrase ended'], 'bar 3: the shorter phrase has ended');
  // what the inspector would say and where the pane would go, for the same rows
  assert.equal(arrangementLineageOf(r.map[rowId(2, 'claves')])[0].text, 'bar 2 of 4 · latin kit · phrase_009 bar 2 · played at 100 bpm');
  assert.match(arrangementLineageOf(r.map[rowId(4, 'conga_low')])[0].text, /^bar 4 of 4 · latin kit · the latin phrase has ended/);
  assert.deepEqual(pinnedNoteFor(r.map[rowId(2, 'snare')]), { noteId: 'bars/bar_007', reason: 'pinned bar 2' });
});

test('a re-timed kit says what it came with: the latin bar as shipped is 120 bpm, the arrangement plays at the rock phrase\'s 100', async () => {
  const py = await engine();
  const f = { ...files(), 'bars/bar_008.md': barText('bar_008') };
  const out = await produceArrangement(deps(py, f), f['arrangements/arr_001.md'], 'arr_001');
  assert.equal(out.kind, 'score');
  if (out.kind !== 'score') return;
  const r = annotateArrangementPayload('arrangements/arr_001', out.payload);
  assert.deepEqual(r.problems, []);
  assert.equal(arrangementLineageOf(r.map[rowId(1, 'claves')])[0].text, 'bar 1 of 4 · latin kit · phrase_009 bar 1 · played at 100 bpm (came with 120)');
  assert.equal(arrangementLineageOf(r.map[rowId(1, 'kick')])[0].text, 'bar 1 of 4 · rock kit · phrase_003 bar 1 · played at 100 bpm');
});

test('real Verovio: the measure ids come back as the ids of the measure groups, each holds one staff per part, and the notes in staff i of bar n are exactly the hits of the i-th channel of bar n', async (t) => {
  const payload = await realPayload();
  const r = annotateArrangementPayload('arrangements/arr_001', payload);
  assert.deepEqual(r.problems, []);
  let verovio: any;
  try { const m: any = await import('verovio'); verovio = m.default ?? m; } catch (e) { t.skip(`verovio not importable in node: ${(e as Error).message}`); return; }
  let svg: string;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('verovio runtime did not initialise within 60 s')), 60_000);
      const done = () => { clearTimeout(timer); resolve(); };
      if (verovio.module?.calledRun) done(); else verovio.module.onRuntimeInitialized = done;
    });
    const tk = new verovio.toolkit();
    tk.setOptions({ breaks: 'none', pageWidth: 30000, adjustPageHeight: true });
    tk.loadData(r.payload.multi_staff_content as string);
    svg = tk.renderToSVG(1);
  } catch (e) { t.skip(`verovio could not run headless here: ${(e as Error).message}`); return; }

  const win: any = new Window({ url: 'http://localhost/' });
  const host = new win.DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;       // Verovio's SVG is XML: the HTML parser of the test DOM drops most of it
  const bars = payload.bars_data as Array<{ channels: Record<string, unknown[]> }>;
  const present = CANONICAL_CHANNELS.filter((c) => bars.some((b) => c in b.channels));
  assert.deepEqual(present, ['kick', 'snare', 'hihat', 'claves', 'conga_low']);
  for (const [i, bar] of bars.entries()) {
    const measure = host.querySelector(`[id="ph_bar_${i + 1}"]`);
    assert.ok(measure, `bar ${i + 1}: the id we put on the measure is the id of a group in the SVG`);
    assert.equal(measure.getAttribute('class'), 'measure');
    const staves = [...measure.children].filter((c: any) => c.classList.contains('staff')) as any[];
    assert.equal(staves.length, present.length, `bar ${i + 1}: one staff per part`);
    for (const [s, channel] of present.entries()) {
      const notes = staves[s].querySelectorAll('.note').length;
      assert.equal(notes, hitCount(bar.channels[channel] ?? []), `bar ${i + 1}, staff ${s}: the notes drawn there are the hits of ${channel}`);
    }
  }

  // the rows land in those staves: stub the one thing the browser does (the box of a staff), and every row is drawn into the staff of its own channel
  host.querySelectorAll('.staff').forEach((s: any) => { s.getBBox = () => ({ x: 0, y: 0, width: 100, height: 40 }); });
  assert.equal(ensureArrangementRows(host, r.map), 20);
  assert.equal(host.querySelectorAll(`.${ROW_CLASS}`).length, 20);
  for (const [i, bar] of bars.entries()) for (const [s, channel] of present.entries()) {
    const row = host.querySelector(`[id="${rowId(i + 1, channel)}"]`);
    assert.ok(row, `${rowId(i + 1, channel)} is drawn`);
    assert.equal(row.parentNode.querySelectorAll('.note').length, hitCount(bar.channels[channel] ?? []), `${channel} row of bar ${i + 1} is in the staff that has that channel's notes (staff ${s})`);
  }
  assert.equal(ensureArrangementRows(host, r.map), 0, 'and drawing them again changes nothing');
});
