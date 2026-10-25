// score_first M7c Phase A (drain 2026-10-24-1200) — the morph phrase surface: a strip of Bar a and Bar b, Bars with an Atomic button, Order, Seed (only for the seeded order), a Position slider (only while Bars is 1)
// and one plain-words sentence over the live Score, in plain DOM (happy-dom) with a fake vault and a fake engine. What it writes, what it shows, what it does NOT have (no bracket, no source link, no Inspector: that is
// the next prompt), and that a mix and an extend phrase still get their own surfaces. The real engine runs the same Score in phrase-morph-engine.test.ts; real Chrome in scripts/dev/measure-morph.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { MIX_SCORE_DEBOUNCE_MS, mountMorphControls, mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { applyPhraseWrite, readPhraseNote, type MorphPhrase, type PhraseParams } from './phrase-core.ts';

const PATH = 'phrases/phrase_004.md';
const noteOf = (json: object) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\n`;
const morphText = (p: Record<string, unknown> = {}) => noteOf({ kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0, ...p });
const barText = (kick: number[], snare: number[], tempo = 100) => noteOf({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: tempo, channels: { kick: Array.from({ length: 16 }, (_, i) => kick.includes(i)), snare: Array.from({ length: 16 }, (_, i) => snare.includes(i)) } });
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
// bar_005 -> bar_006 differ in 4 cells; bar_007 -> bar_005 differ in 7
const BARS: Record<string, string> = { bar_005: barText([0, 2, 3, 6, 8], [4, 6, 12]), bar_006: barText([0, 8], [4, 12], 120), bar_007: barText([0], []) };

function rig(opts: { phrase?: string; bars?: Record<string, string>; initial?: boolean; listBars?: string[] } = {}) {
  const gate: { reads: Promise<void> | null; write: Promise<void> | null } = { reads: null, write: null };            // hold every read of a bar note (not the phrase note) until released: a count that comes back late
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([[PATH, opts.phrase ?? morphText()]]);
  for (const [name, text] of Object.entries({ ...BARS, ...(opts.bars ?? {}) })) files.set(`bars/${name}.md`, text);
  const computes: Array<{ data: any; params: PhraseParams }> = [];
  const drawn: string[] = [];
  const writes: PhraseParams[] = [];
  const opened: string[] = [];
  let now = 0;
  const timers: Array<{ id: number; at: number; fn: () => void }> = []; let nextId = 1;
  let handle: ReturnType<typeof mountPhrase>;
  const ports: PhraseMountPorts = {
    path: PATH, title: 'phrase_004', plan: 'score',
    inspector: { openNote: (id) => { opened.push(id); } },
    listBars: () => opts.listBars ?? ['bar_005', 'bar_006', 'bar_007'],
    initial: opts.initial === false ? undefined : files.get(PATH),
    readNote: async (p) => { if (gate.reads && p.startsWith('bars/')) await gate.reads; const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async (params) => {
      writes.push(params);
      if (gate.write) await gate.write;                                      // a write that takes a while (a slow vault)
      const w = applyPhraseWrite(files.get(PATH)!, params);
      if (w.ok === false) return w;
      files.set(PATH, w.text);
      queueMicrotask(() => handle.noteModified(PATH));
      return { ok: true };
    },
    compute: async (data, params) => {
      computes.push({ data, params });
      return { type: 'musicxml', content: `<score-partwise>${JSON.stringify(params)}</score-partwise>` };
    },
    renderInto: (host, payload) => { drawn.push(payload.content as string); host.textContent = 'engraved'; return true; },
    stopPlayers: () => {},
    setTimer: (fn, ms) => { const id = nextId++; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
  };
  handle = mountPhrase(parent, ports);
  const advance = async (ms: number) => { now += ms; for (;;) { const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); await flush(); } await flush(); };
  const q = (sel: string) => parent.querySelector(sel) as any;
  const fire = async (sel: string, value: string | boolean, type: 'input' | 'change') => {
    const el = q(sel);
    if (typeof value === 'boolean') el.checked = value; else el.value = value;
    el.dispatchEvent(new win.Event(type, { bubbles: true }));
    await flush();
  };
  const click = async (sel: string) => { q(sel).dispatchEvent(new win.Event('click', { bubbles: true })); await flush(); };
  const shown = () => readPhraseNote(files.get(PATH)!);
  const loaded = async () => { await handle.load(); await flush(); await advance(MIX_SCORE_DEBOUNCE_MS); };
  return { handle, parent, files, computes, drawn, writes, opened, q, fire, click, advance, shown, loaded, win, gate };
}

test('a morph phrase shows the morph strip: Bar a, Bar b, Bars + Atomic, Order, Seed, the sentence — and the Score for the two bars; the Position slider is not there for five bars', async () => {
  const r = rig();
  await r.loaded();
  assert.equal(r.q('.forge-morph-a').value, 'bar_005');
  assert.equal(r.q('.forge-morph-b').value, 'bar_006');
  const bars = r.q('.forge-morph-bars');
  assert.equal(bars.type, 'number'); assert.equal(bars.min, '1'); assert.equal(bars.max, '64'); assert.equal(bars.value, '5');
  assert.equal(r.q('.forge-morph-atomic').textContent, 'Atomic');
  assert.deepEqual([...r.q('.forge-morph-order').querySelectorAll('option')].map((o: any) => [o.value, o.textContent]), [['musical', 'musical'], ['seeded', 'seeded'], ['by_channel', 'by channel']]);
  assert.equal(r.q('.forge-morph-order').value, 'musical');
  assert.equal(r.q('.forge-morph-seed').value, '0');
  assert.equal(r.q('.forge-morph-seed').disabled, true, 'a seed only matters for the seeded order');
  assert.equal(r.q('.forge-morph-position').closest('label').style.display, 'none', 'no Position while Bars is 5');
  assert.equal(r.q('.forge-morph-sentence').textContent, 'Morph from bar_005 to bar_006 in 5 bars: 4 single-hit changes (musical order).');
  for (const sel of ['.forge-morph-a', '.forge-morph-b', '.forge-morph-bars', '.forge-morph-atomic', '.forge-morph-order', '.forge-morph-seed', '.forge-morph-position']) assert.ok(r.q(sel).getAttribute('aria-label'), `${sel} has an accessible name`);
  assert.equal(r.computes.length, 1);
  assert.deepEqual(r.computes[0].params, { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0 });
  assert.equal(r.computes[0].data.a.tempo_bpm, 100); assert.equal(r.computes[0].data.b.tempo_bpm, 120);
  assert.equal(r.drawn.length, 1);
});

test('a morph has no bracket, no source link, no Inspector and no other strip (navigation is the next prompt); no stray open', async () => {
  const r = rig();
  await r.loaded();
  assert.ok(r.q('.forge-inspector') === null);
  assert.ok(r.q('.forge-phrase-bracket') === null);
  assert.ok(r.q('.forge-phrase-source') === null);
  assert.ok(r.q('.forge-mix-weight') === null && r.q('.forge-phrase-bars') === null);
  assert.equal(r.parent.querySelectorAll('.forge-phrase-controls').length, 1);
  assert.deepEqual(r.opened, []);
});

test('both dropdowns list the bars in bars/ (and the morph\'s own bars even if they are not listed)', async () => {
  const r = rig({ listBars: ['bar_005', 'bar_006', 'bar_009'] });
  await r.loaded();
  for (const sel of ['.forge-morph-a', '.forge-morph-b']) assert.deepEqual([...r.q(sel).querySelectorAll('option')].map((o: any) => o.value), ['bar_005', 'bar_006', 'bar_009']);
});

test('Atomic sets Bars to the number of single-hit changes + 1 (read fresh from the two bars) and writes it once; the Score follows the modify event', async () => {
  const r = rig({ phrase: morphText({ bars: 2 }) });
  await r.loaded();
  assert.equal(r.q('.forge-morph-sentence').textContent, 'Morph from bar_005 to bar_006 in 2 bars: 4 single-hit changes (musical order).');
  await r.click('.forge-morph-atomic');
  assert.equal(r.q('.forge-morph-bars').value, '5');
  assert.deepEqual(r.writes.map((w) => (w as MorphPhrase).bars), [5]);
  assert.deepEqual(r.shown(), { ok: true, value: { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0 } });
  await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.equal(JSON.parse(r.drawn.at(-1)!.replace(/<\/?score-partwise>/g, '')).bars, 5);
  // after a bar changes, Atomic follows the NEW pair (bar_005 -> bar_007 differ in 7 cells)
  await r.fire('.forge-morph-b', 'bar_007', 'change');
  await r.click('.forge-morph-atomic');
  assert.equal(r.q('.forge-morph-bars').value, '8');
});

test('Atomic is clamped to 64 bars (when more changes lie between the bars), and does nothing when a bar cannot be read', async () => {
  const wide = (on: boolean) => noteOf({ time_signature: '4/4', steps: 32, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array(32).fill(on), snare: Array(32).fill(on) } });
  const r = rig({ bars: { bar_008: wide(true), bar_009: wide(false) }, phrase: morphText({ a: 'bar_008', b: 'bar_009', bars: 2 }), listBars: ['bar_008', 'bar_009'] });
  await r.loaded();
  assert.equal(r.q('.forge-morph-sentence').textContent, 'Morph from bar_008 to bar_009 in 2 bars: 64 single-hit changes (musical order).');
  await r.click('.forge-morph-atomic');
  assert.equal(r.q('.forge-morph-bars').value, '64', '64 changes would need 65 bars: the limit is 64');
  const gone = rig({ phrase: morphText({ b: 'bar_099', bars: 2 }) });
  await gone.loaded();
  const before = gone.writes.length;
  await gone.click('.forge-morph-atomic');
  assert.equal(gone.writes.length, before, 'nothing written');
  assert.equal(gone.q('.forge-morph-bars').value, '2');
});

test('Bars is clamped to 1..64 and a non-number is put back; the Score follows', async () => {
  const r = rig();
  await r.loaded();
  await r.fire('.forge-morph-bars', '99', 'change');
  assert.equal(r.q('.forge-morph-bars').value, '64');
  assert.equal((r.shown() as any).value.bars, 64);
  await r.fire('.forge-morph-bars', 'abc', 'change');
  assert.equal(r.q('.forge-morph-bars').value, '64', 'put back to what the note says');
  assert.equal(r.writes.length, 1);
});

test('Order writes; the Seed field is enabled only for the seeded order and clamps to a whole number, 0 or more', async () => {
  const r = rig();
  await r.loaded();
  await r.fire('.forge-morph-order', 'seeded', 'change');
  assert.equal((r.shown() as any).value.order, 'seeded');
  assert.equal(r.q('.forge-morph-seed').disabled, false);
  assert.match(r.q('.forge-morph-sentence').textContent, /\(seeded order, seed 0\)\.$/);
  await r.fire('.forge-morph-seed', '3', 'change');
  assert.equal((r.shown() as any).value.seed, 3);
  assert.match(r.q('.forge-morph-sentence').textContent, /seed 3\)\.$/);
  await r.fire('.forge-morph-seed', '-4', 'change');
  assert.equal(r.q('.forge-morph-seed').value, '0'); assert.equal((r.shown() as any).value.seed, 0);
  await r.fire('.forge-morph-order', 'by_channel', 'change');
  assert.equal(r.q('.forge-morph-seed').disabled, true);
  assert.match(r.q('.forge-morph-sentence').textContent, /\(by-channel order\)\.$/);
});

test('Bars = 1 shows the Position slider (0..d, step 1, labelled "k of d changes") and writes position 0; going back above 1 removes the position from the note', async () => {
  const r = rig();
  await r.loaded();
  await r.fire('.forge-morph-bars', '1', 'change');
  assert.deepEqual((r.shown() as any).value, { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 1, order: 'musical', seed: 0, position: 0 });
  const slider = r.q('.forge-morph-position');
  assert.equal(slider.closest('label').style.display, '');
  assert.equal(slider.type, 'range'); assert.equal(slider.min, '0'); assert.equal(slider.max, '4'); assert.equal(slider.step, '1'); assert.equal(slider.value, '0');
  assert.equal(r.q('.forge-morph-position-value').textContent, '0 of 4 changes');
  await r.fire('.forge-morph-position', '3', 'input');
  assert.equal(r.q('.forge-morph-position-value').textContent, '3 of 4 changes');
  assert.equal((r.shown() as any).value.position, 3);
  assert.equal(r.q('.forge-morph-sentence').textContent, 'Morph from bar_005 to bar_006: one bar, after 3 of 4 single-hit changes (musical order).');
  await r.fire('.forge-morph-bars', '3', 'change');
  assert.deepEqual((r.shown() as any).value, { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 3, order: 'musical', seed: 0 });
  assert.ok(!/"position"/.test(r.files.get(PATH)!), 'no stray position in the note');
  assert.equal(r.q('.forge-morph-position').closest('label').style.display, 'none');
});

test('a Position beyond the new pair\'s last change is pulled back inside 0..d when a bar changes', async () => {
  const r = rig({ phrase: morphText({ bars: 1, position: 4 }) });
  await r.loaded();
  assert.equal(r.q('.forge-morph-position').value, '4');
  await r.fire('.forge-morph-b', 'bar_005', 'change');                       // bar_005 to itself: 0 changes
  assert.equal(r.q('.forge-morph-position').max, '0');
  assert.equal((r.shown() as any).value.position, 0);
  assert.equal(r.q('.forge-morph-position-value').textContent, '0 of 0 changes');
});

test('a Position drag collapses into few writes with the last value, redrawn at once (no trailing wait) — one render in flight, never a queue', async () => {
  const r = rig({ phrase: morphText({ bars: 1, position: 0 }) });
  await r.loaded();
  for (let k = 0; k <= 4; k++) await r.fire('.forge-morph-position', String(k), 'input');
  assert.equal((r.shown() as any).value.position, 4);
  assert.equal(r.writes.at(-1) && (r.writes.at(-1) as MorphPhrase).position, 4);
  await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.equal(JSON.parse(r.drawn.at(-1)!.replace(/<\/?score-partwise>/g, '')).position, 4);
  assert.equal(MIX_SCORE_DEBOUNCE_MS, 0);
});

test('changing a bar writes it, recomputes the number of changes in the sentence, and redraws', async () => {
  const r = rig();
  await r.loaded();
  await r.fire('.forge-morph-b', 'bar_007', 'change');
  assert.equal((r.shown() as any).value.b, 'bar_007');
  assert.equal(r.q('.forge-morph-sentence').textContent, 'Morph from bar_005 to bar_007 in 5 bars: 7 single-hit changes (musical order).');
  await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.equal(r.computes.at(-1)!.params.kind === 'morph' && r.computes.at(-1)!.params.b, 'bar_007');
});

test('a morph that is wrong shows a disabled strip and the Score says why; fixing the JSON by hand brings the strip back', async () => {
  const r = rig({ phrase: morphText({ bars: 0 }) });
  await r.loaded();
  assert.equal(r.q('.forge-morph-bars').disabled, true);
  assert.equal(r.q('.forge-morph-atomic').disabled, true);
  assert.match(r.q('.forge-rhythm-edit-score-status').textContent, /Phrase: bars must be a whole number from 1 to 64, got 0\./);
  r.files.set(PATH, morphText({ bars: 3 }));
  r.handle.noteModified(PATH);
  await flush(); await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.equal(r.q('.forge-morph-bars').disabled, false);
  assert.equal(r.q('.forge-morph-bars').value, '3');
});

test('a bar this morph is made of changing redraws the Score (and the number of changes follows on the next strip refresh)', async () => {
  const r = rig();
  await r.loaded();
  const before = r.computes.length;
  r.files.set('bars/bar_006.md', barText([0, 8], [4, 12, 14], 120));
  r.handle.noteModified('bars/bar_006.md');
  await flush(); await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.equal(r.computes.length, before + 1);
  r.handle.noteModified('bars/bar_007.md');
  await flush(); await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.equal(r.computes.length, before + 1, 'a bar it is not made of does nothing');
});

test('the surface follows what the note SAYS it is: an extend note hand-edited into a morph (and back) gets the right strip, a mix still gets the mix strip', async () => {
  const extend = noteOf({ kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 });
  const r = rig({ phrase: extend });
  await r.loaded();
  assert.ok(r.q('.forge-phrase-bars') !== null && r.q('.forge-morph-bars') === null);
  r.files.set(PATH, morphText());
  r.handle.noteModified(PATH);
  await flush(); await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.ok(r.q('.forge-morph-bars') !== null && r.q('.forge-phrase-bars') === null);
  assert.equal(r.parent.querySelectorAll('.forge-phrase-controls').length, 1);
  r.files.set(PATH, extend);
  r.handle.noteModified(PATH);
  await flush(); await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.ok(r.q('.forge-phrase-bars') !== null && r.q('.forge-morph-bars') === null);
  const mix = rig({ phrase: noteOf({ kind: 'mix', a: 'bar_005', b: 'bar_006' }) });
  await mix.loaded();
  assert.ok(mix.q('.forge-mix-weight') !== null && mix.q('.forge-morph-bars') === null);
});

test('mountMorphControls on its own: set(null) disables everything and says nothing; nothing fires onChange from set()', async () => {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const changes: unknown[] = [];
  const c = mountMorphControls(parent, { onChange: (p) => changes.push(p), listBars: () => ['bar_005'], changes: async () => 4 });
  c.set(null);
  assert.equal(parent.querySelector('.forge-morph-bars').disabled, true);
  assert.equal(parent.querySelector('.forge-morph-sentence').textContent, '');
  c.set({ kind: 'morph', a: 'bar_005', b: 'bar_005', bars: 5, order: 'musical', seed: 0 });
  await flush();
  assert.deepEqual(changes, []);
  assert.equal(parent.querySelector('.forge-morph-sentence').textContent, 'Morph from bar_005 to bar_005 in 5 bars: 4 single-hit changes (musical order).');
  c.setStatus('Not saved: nope');
  assert.equal(parent.querySelector('.forge-phrase-status').textContent, 'Not saved: nope');
  c.dispose();
  assert.equal(parent.querySelector('.forge-morph-controls'), null);
});

test('an Atomic whose count comes back after the person has already picked another bar is dropped (it was for the old pair)', async () => {
  const r = rig({ phrase: morphText({ bars: 2 }) });
  await r.loaded();
  let release!: () => void;
  r.gate.reads = new Promise<void>((res) => { release = res; });
  await r.click('.forge-morph-atomic');                                    // asks for the count of bar_005 -> bar_006; the reads are held
  r.q('.forge-morph-b').value = 'bar_007';
  r.q('.forge-morph-b').dispatchEvent(new r.win.Event('change', { bubbles: true }));
  await flush();
  release(); r.gate.reads = null;
  await flush(); await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.equal((r.shown() as any).value.b, 'bar_007');
  assert.equal(r.q('.forge-morph-bars').value, '2', 'the old pair\'s count (4 changes -> 5 bars) must not be applied to the new pair');
  assert.deepEqual(r.writes.map((w) => (w as MorphPhrase).bars), [2], 'only the bar change was written');
});

test('a bar that is there but is not rhythm data, or a pair on different grids, has no count: the sentence leaves it out and Atomic does nothing (the Score says why)', async () => {
  const twelve = noteOf({ time_signature: '4/4', steps: 12, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array(12).fill(false), snare: Array(12).fill(false) } });
  const junk = rig({ bars: { bar_008: 'this is not a rhythm note' }, phrase: morphText({ b: 'bar_008', bars: 3 }), listBars: ['bar_005', 'bar_008'] });
  await junk.loaded();
  assert.equal(junk.q('.forge-morph-sentence').textContent, 'Morph from bar_005 to bar_008 in 3 bars (musical order).');
  await junk.click('.forge-morph-atomic');
  assert.equal(junk.q('.forge-morph-bars').value, '3'); assert.equal(junk.writes.length, 0);
  const grids = rig({ bars: { bar_009: twelve }, phrase: morphText({ b: 'bar_009', bars: 3 }), listBars: ['bar_005', 'bar_009'] });
  await grids.loaded();
  assert.equal(grids.q('.forge-morph-sentence').textContent, 'Morph from bar_005 to bar_009 in 3 bars (musical order).');
  await grids.click('.forge-morph-atomic');
  assert.equal(grids.q('.forge-morph-bars').value, '3'); assert.equal(grids.writes.length, 0);
});

test('the strip on its own: the Seed enables the moment the order is seeded, and a new bar asks for the new pair\'s count at once (nothing waits for the note to be re-read)', async () => {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const asked: string[] = []; const patches: unknown[] = [];
  const c = mountMorphControls(parent, { onChange: (p) => patches.push(p), listBars: () => ['bar_005', 'bar_006', 'bar_007'], changes: async (a, b) => { asked.push(`${a}>${b}`); return b === 'bar_007' ? 7 : 4; } });
  c.set({ kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0 });
  await flush();
  const q = (sel: string) => parent.querySelector(sel) as any;
  assert.equal(q('.forge-morph-seed').disabled, true);
  q('.forge-morph-order').value = 'seeded'; q('.forge-morph-order').dispatchEvent(new win.Event('change', { bubbles: true })); await flush();
  assert.equal(q('.forge-morph-seed').disabled, false, 'without waiting for set()');
  q('.forge-morph-order').value = 'musical'; q('.forge-morph-order').dispatchEvent(new win.Event('change', { bubbles: true })); await flush();
  assert.equal(q('.forge-morph-seed').disabled, true);
  asked.length = 0;
  q('.forge-morph-b').value = 'bar_007'; q('.forge-morph-b').dispatchEvent(new win.Event('change', { bubbles: true })); await flush();
  assert.deepEqual(asked, ['bar_005>bar_007']);
  assert.equal(q('.forge-morph-sentence').textContent, 'Morph from bar_005 to bar_007 in 5 bars: 7 single-hit changes (musical order).');
  q('.forge-morph-a').value = 'bar_006'; q('.forge-morph-a').dispatchEvent(new win.Event('change', { bubbles: true })); await flush();
  assert.deepEqual(asked, ['bar_005>bar_007', 'bar_006>bar_007']);
  assert.ok(patches.length >= 3);
});

test('writes are serialised and coalesced: inputs that arrive while a write is in flight make exactly ONE more write, with the latest values', async () => {
  const r = rig({ phrase: morphText({ bars: 1, position: 0 }) });
  await r.loaded();
  let release!: () => void;
  r.gate.write = new Promise<void>((res) => { release = res; });
  await r.fire('.forge-morph-position', '1', 'input');                      // the first write starts and is held
  for (const v of ['2', '3', '4']) await r.fire('.forge-morph-position', v, 'input');
  assert.equal(r.writes.length, 1, 'nothing else is written while one is in flight');
  release(); r.gate.write = null;
  await flush(); await flush();
  assert.deepEqual(r.writes.map((w) => (w as MorphPhrase).position), [1, 4], 'one more write, with the latest value');
  assert.equal((r.shown() as any).value.position, 4);
  assert.equal(r.q('.forge-morph-position-value').textContent, '4 of 4 changes');
});
