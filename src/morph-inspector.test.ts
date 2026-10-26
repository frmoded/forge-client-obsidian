// score_first M7c Phase B (drain 2026-10-24-1230) — the morph's Inspector on the surface a person uses: happy-dom, the real mountPhrase + live Score area + the generic inspector with the morph's ports, a fake
// renderer that draws one g.measure per bar and one note per tied hit from the ids on the annotated MusicXML, a fake vault (notes, a bars/ listing, create) and a fake engine that returns the bars the REAL engine
// would for bar_005 -> bar_006 in the musical order (the real engine runs the same path in phrase-morph-engine.test.ts, real Chrome in scripts/dev/measure-morph.ts). What is pinned: the stack of every bar and
// hit, a click anywhere in a bar, the arrows, the colours of the pinned bar's noteheads, the pin surviving a redraw, and Edit this bar / Revert to generated on a morph bar (write order, refusals, byte-for-byte revert).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { applyPhraseWrite, type MorphPhrase, type PhraseParams } from './phrase-core.ts';
import { LIVE_SCORE_DEBOUNCE_MS } from './live-score-core.ts';
import { MORPH_COLOURS, type MorphEdit } from './morph-lineage-core.ts';
import { MIX_MARK_CLASS } from './mix-hits-dom.ts';
import type { RhythmDataLike } from './provenance-core.ts';
import { morphXml } from './test-support/morph-xml.ts';

const PATH = 'phrases/phrase_004.md';
const note = (json: object) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\n`;
const morphText = (p: Record<string, unknown> = {}) => note({ kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0, ...p });
const rows = (channels: Record<string, number[]>) => Object.fromEntries(Object.entries(channels).map(([c, at]) => [c, Array.from({ length: 16 }, (_, i) => at.includes(i))]));
const DATA_A = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: rows({ kick: [0, 2, 3, 6, 8], snare: [4, 6, 12] }) };
const DATA_B = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 120, channels: rows({ kick: [0, 8], snare: [4, 12] }) };
const barNote = (data: object) => note(data);
const EDITS: MorphEdit[] = [
  { kind: 'remove', channel: 'kick', step: 3 }, { kind: 'remove', channel: 'kick', step: 2 }, { kind: 'remove', channel: 'kick', step: 6 }, { kind: 'remove', channel: 'snare', step: 6 },
];
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };

const stateData = (k: number, tempo: number): RhythmDataLike & { tempo_bpm: number; swing_pct: number } => {
  const channels = Object.fromEntries(Object.entries(DATA_A.channels).map(([c, row]) => [c, [...row]]));
  for (const e of EDITS.slice(0, k)) channels[e.channel][e.step] = e.kind === 'add';
  return { ...DATA_A, tempo_bpm: tempo, channels } as never;
};
/** What the real engine hands back for bar_005 -> bar_006, musical order: bar i is state round-half-up(i * d / (bars - 1)); a forked bar is the fork's data; the tempo slides 100 -> 120. */
function fakeMorph(params: MorphPhrase & { override_bars?: Record<string, RhythmDataLike> }) {
  const d = EDITS.length;
  const states = params.bars === 1 ? [params.position ?? 0] : Array.from({ length: params.bars }, (_, i) => Math.floor((2 * i * d + (params.bars - 1)) / (2 * (params.bars - 1))));
  const tempo = (i: number) => (params.bars === 1 ? 100 + Math.floor((20 * (params.position ?? 0)) / d + 0.5) : Math.floor(100 + (20 * i) / (params.bars - 1) + 0.5));
  const drawn = states.map((k, i) => stateData(k, tempo(i))) as RhythmDataLike[];
  const generated = [...drawn];
  for (const [n, forked] of Object.entries(params.override_bars ?? {})) drawn[Number(n) - 1] = forked;
  const xml = morphXml(drawn, drawn.map((b) => Number((b as { tempo_bpm?: number }).tempo_bpm ?? 100)));
  return { type: 'musicxml', content: xml, multi_staff_content: xml, morph_info: { d, edits: EDITS, bars: params.bars }, bars_data: drawn, ...(params.override_bars && Object.keys(params.override_bars).length > 0 ? { morph_generated: generated } : {}) };
}

function rig(opts: { phrase?: string; createThrows?: string; writeResult?: { ok: false; message: string }; files?: Record<string, string> } = {}) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([[PATH, opts.phrase ?? morphText()], ['bars/bar_005.md', barNote(DATA_A)], ['bars/bar_006.md', barNote(DATA_B)], ...Object.entries(opts.files ?? {})]);
  const opened: string[] = []; const notices: string[] = []; const log: string[] = []; const computes: PhraseParams[] = []; const infos: string[] = [];
  let handle: ReturnType<typeof mountPhrase>;
  let now = 0; const timers: Array<{ id: number; at: number; fn: () => void }> = []; let nextId = 1;
  const savedInfo = console.info; console.info = (...a: unknown[]) => { infos.push(a.map(String).join(' ')); };
  const ports: PhraseMountPorts = {
    path: PATH, title: 'phrase_004', plan: 'score',
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async (params) => {
      log.push('write phrase');
      if (opts.writeResult) return opts.writeResult;
      const w = applyPhraseWrite(files.get(PATH)!, params); if (w.ok === false) return w;
      files.set(PATH, w.text);
      queueMicrotask(() => handle.noteModified(PATH));
      return { ok: true };
    },
    compute: async (_d, params) => { computes.push(params); return fakeMorph(params as never); },
    renderInto: (host, payload) => {
      const xml = String(payload.multi_staff_content);
      const first = /<part id="P1">([\s\S]*?)<\/part>/.exec(xml)![1];
      const ids = [...first.matchAll(/<measure number="\d+"(?: id="([^"]+)")?>/g)].map((m) => m[1] ?? '');
      const hitIds = [...xml.matchAll(/ id="(mo(\d+)_[^"]+)"/g)].map((m) => ({ id: m[1], bar: Number(m[2]) }));
      host.innerHTML = `<svg>${ids.map((id, i) => `<g class="measure" id="${id}"><g class="staff"><path id="sl_${i + 1}"/></g>${hitIds.filter((h) => h.bar === i + 1).map((h) => `<g class="note" id="${h.id}"><g class="notehead"><use id="${h.id}-h"/></g></g>`).join('')}</g>`).join('')}</svg>`;
      host.querySelectorAll('*').forEach((g: any) => { g.getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 }); });
      host.querySelectorAll('g.measure').forEach((g: any, i: number) => { g.getBoundingClientRect = () => ({ left: 100 * i, top: 0, right: 100 * i + 90, bottom: 50, width: 90, height: 50, x: 100 * i, y: 0 }); });
      return true;
    },
    stopPlayers: () => {},
    setTimer: (fn, ms) => { const id = nextId++; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    listBars: () => [...files.keys()].filter((k) => /^bars\/bar_\d+\.md$/.test(k)).map((k) => k.slice(5, -3)),
    inspector: { openNote: (id) => { opened.push(id); log.push(`open ${id}`); } },
    fork: {
      listBarBasenames: () => [...files.keys()].filter((k) => /^bars\/bar_\d+\.md$/.test(k)).map((k) => k.slice(5, -3)),
      exists: (p) => files.has(p),
      create: async (p, content) => { if (opts.createThrows) throw new Error(opts.createThrows); log.push(`create ${p}`); files.set(p, content); return { path: p }; },
      notify: (m) => { notices.push(m); },
      isAlreadyExists: (e) => /already exists/i.test(String((e as Error)?.message ?? e)),
    },
  };
  handle = mountPhrase(parent, { ...ports, initial: files.get(PATH) });
  const advance = async (ms: number) => { now += ms; for (;;) { const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); } await flush(); };
  const q = (sel: string) => parent.querySelector(sel) as any;
  const qa = (sel: string) => [...parent.querySelectorAll(sel)] as any[];
  const fire = (el: any, type: string, init: any = {}) => el.dispatchEvent(new win.MouseEvent(type, { bubbles: true, ...init }));
  const key = (el: any, k: string) => el.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const stack = () => qa('.forge-inspector-lineage > li').map((li) => (li.querySelector('span') ?? li.querySelector('button')).textContent);
  const settle = async () => { await flush(); await advance(LIVE_SCORE_DEBOUNCE_MS); await flush(); await advance(LIVE_SCORE_DEBOUNCE_MS); await flush(); };
  const pinned = () => qa('.forge-artifact-pinned').map((e) => e.id);
  const fill = (id: string) => (q(`#${id} .notehead`) as any)?.style.fill as string;
  const done = () => { console.info = savedInfo; };
  return { handle, files, opened, notices, log, computes, infos, q, qa, fire, key, stack, settle, advance, pinned, fill, done, win };
}

const pinBar = (r: ReturnType<typeof rig>, n: number) => r.fire(r.q(`#sl_${n}`), 'click');
const button = (r: ReturnType<typeof rig>) => r.q('.forge-inspector-action-button');
const LEGEND = '▲ only bar_005 (not changed yet) · ■ only bar_006 (already changed) · ● both bars · # steps count from 1: step 1 is the first position of the bar';   // 2026-10-26-1100, deliberate: the legend says once that steps count from 1

test('clicking a bar of a 5-bar atomic morph shows its stack: place, who made it, step, the two bars, the tempo, the named change, the legend, Edit this bar — for every bar', async () => {
  const r = rig();
  await r.handle.load(); await r.settle();
  const expected: Array<[number, number, string]> = [[1, 100, 'unchanged: this is bar_005'], [2, 105, 'removed kick at step 4'], [3, 110, 'removed kick at step 3'], [4, 115, 'removed kick at step 7'], [5, 120, 'removed snare at step 7; this is bar_006']];
  for (const [n, tempo, edit] of expected) {
    pinBar(r, n);
    assert.deepEqual(r.stack(), [`bar ${n} of 5`, 'made by phrase_004 (morph bar_005 -> bar_006, musical order)', `step ${n - 1} of 4 single-hit changes applied`, 'from bar_005', 'from bar_006', `tempo ${tempo}`, edit, LEGEND, 'Edit this bar'], `bar ${n}`);
    assert.deepEqual(r.pinned(), [`ph_bar_${n}`]);
  }
  r.done();
});

test('a 2-bar morph: bar 1 is bar_005, bar 2 lists the four changes and says it is bar_006', async () => {
  const r = rig({ phrase: morphText({ bars: 2 }) });
  await r.handle.load(); await r.settle();
  pinBar(r, 1);
  assert.equal(r.stack()[6], 'unchanged: this is bar_005');
  pinBar(r, 2);
  assert.deepEqual([r.stack()[0], r.stack()[2], r.stack()[6]], ['bar 2 of 2', 'step 4 of 4 single-hit changes applied', 'removed kick at step 4; removed kick at step 3; removed kick at step 7; removed snare at step 7; this is bar_006']);
  r.done();
});

test('one bar at a position: its stack says which step of the path it is', async () => {
  const r = rig({ phrase: morphText({ bars: 1, position: 2 }) });
  await r.handle.load(); await r.settle();
  pinBar(r, 1);
  assert.deepEqual([r.stack()[0], r.stack()[2], r.stack()[6]], ['bar 1 of 1', 'step 2 of 4 single-hit changes applied', 'after 2 of 4 changes, the last: removed kick at step 3']);
  r.done();
});

test('clicking a notehead pins THAT hit and shows where it came from and in which bar it changes, over the bar\'s stack', async () => {
  const r = rig();
  await r.handle.load(); await r.settle();
  r.fire(r.q('#mo2_kick_0-h'), 'click');
  assert.deepEqual(r.stack().slice(0, 2), ['this hit: from both bars', 'bar 2 of 5']);
  assert.deepEqual(r.pinned(), ['mo2_kick_0']);
  r.fire(r.q('#mo2_kick_2-h'), 'click');
  assert.deepEqual(r.stack().slice(0, 3), ['this hit: from bar_005 only (removed in bar 3)', 'bar 2 of 5', 'made by phrase_004 (morph bar_005 -> bar_006, musical order)']);
  r.fire(r.q('#mo1_snare_6-h'), 'click');
  assert.equal(r.stack()[0], 'this hit: from bar_005 only (removed in bar 5)');
  assert.equal(button(r).textContent, 'Edit this bar', 'a pinned hit offers its bar\'s fork');
  r.done();
});

test('a click anywhere inside a bar\'s box (here, the svg root over bar 3) pins the BAR; outside every bar lets go', async () => {
  const r = rig();
  await r.handle.load(); await r.settle();
  const svg = r.q('svg');
  r.fire(svg, 'click', { clientX: 205, clientY: 25 });
  assert.deepEqual(r.pinned(), ['ph_bar_3']);
  r.fire(svg, 'click', { clientX: 105, clientY: 25 });
  assert.deepEqual(r.pinned(), ['ph_bar_2'], 'a click on another bar moves the pin');
  r.fire(svg, 'click', { clientX: 105, clientY: 25 });
  assert.deepEqual(r.pinned(), ['ph_bar_2'], 'a repeat keeps it');
  r.fire(svg, 'click', { clientX: 900, clientY: 25 });
  assert.deepEqual(r.pinned(), []);
  r.done();
});

test('every hit has an enlarged click target (a rectangle inside it); a bar has none, so a click beside a notehead is the hit and a click elsewhere in the bar is the bar', async () => {
  const r = rig();
  await r.handle.load(); await r.settle();
  assert.ok(r.q('#mo2_kick_0 .forge-artifact-hitbox') !== null, 'a hit has its target');
  assert.equal(r.qa('#ph_bar_2 > .forge-artifact-hitbox').length, 0, 'a bar does not: it would take the notes\' clicks');
  assert.equal(r.qa('.forge-artifact-hitbox').length, 30, 'one per hit of the 5 bars');
  r.done();
});

test('the arrow keys walk the bars (not the hits) and wrap; Esc lets go', async () => {
  const r = rig();
  await r.handle.load(); await r.settle();
  const host = r.q('.forge-rhythm-score-host');
  r.key(host, 'ArrowRight'); assert.deepEqual(r.pinned(), ['ph_bar_1']);
  r.key(host, 'ArrowRight'); r.key(host, 'ArrowRight'); assert.deepEqual(r.pinned(), ['ph_bar_3']);
  r.key(host, 'ArrowLeft'); assert.deepEqual(r.pinned(), ['ph_bar_2']);
  r.key(host, 'ArrowLeft'); r.key(host, 'ArrowLeft'); assert.deepEqual(r.pinned(), ['ph_bar_5'], 'wraps');
  r.key(host, 'Escape'); assert.deepEqual(r.pinned(), []);
  r.done();
});

test('the pinned bar\'s noteheads are painted by where the hit came from (inline fill + a mark each); other bars are untouched; Esc clears it', async () => {
  const r = rig();
  await r.handle.load(); await r.settle();
  assert.equal(r.fill('mo3_kick_0'), '', 'nothing pinned: nothing painted');
  pinBar(r, 3);
  assert.equal(r.fill('mo3_kick_0'), MORPH_COLOURS.both);
  assert.equal(r.fill('mo3_kick_6'), MORPH_COLOURS.a);
  assert.equal(r.fill('mo2_kick_0'), '', 'another bar is not painted');
  assert.equal(r.qa(`.${MIX_MARK_CLASS}`).length, 6, 'one mark per painted notehead: the 6 hits of bar 3');
  r.fire(r.q('#mo5_kick_0-h'), 'click');
  assert.equal(r.fill('mo5_kick_0'), MORPH_COLOURS.both);
  assert.equal(r.fill('mo3_kick_0'), '', 'the paint moves with the pin');
  assert.equal(r.qa(`.${MIX_MARK_CLASS}`).length, 4);
  r.key(r.q('.forge-rhythm-score-host'), 'Escape');
  assert.equal(r.qa(`.${MIX_MARK_CLASS}`).length, 0);
  assert.equal(r.fill('mo5_kick_0'), '');
  assert.equal(r.q('#mo5_kick_0 .notehead').hasAttribute('style'), false, 'no empty style attribute is left behind');
  r.done();
});

test('the pin survives a redraw: moving a control draws the Score again and the same bar is still pinned with its stack', async () => {
  const r = rig();
  await r.handle.load(); await r.settle();
  pinBar(r, 3);
  const select = r.q('.forge-morph-order');
  select.value = 'by_channel'; select.dispatchEvent(new r.win.Event('change', { bubbles: true }));
  await r.settle();
  assert.deepEqual(r.pinned(), ['ph_bar_3']);
  assert.equal(r.stack()[0], 'bar 3 of 5');
  assert.match(r.stack()[1], /made by phrase_004/);
  r.done();
});

test('a hover with nothing pinned previews the stack but offers no button', async () => {
  const r = rig();
  await r.handle.load(); await r.settle();
  r.fire(r.q('#ph_bar_3'), 'mouseover');
  assert.equal(r.stack()[0], 'bar 3 of 5');
  assert.equal(button(r), null);
  r.done();
});

test('the evidence line says how many bars and hits were tied', async () => {
  const r = rig();
  await r.handle.load(); await r.settle();
  assert.ok(r.infos.includes('[forge-morph] inspector mapped 5 bars and 30 hits'), r.infos.join(' | '));
  r.done();
});

// ---- Edit this bar / Revert to generated on a morph bar ---------------------------------------------------------------------------------------------------------------------------------------------

test('Edit this bar on a morph bar: the fork note is written FIRST (the bar\'s own data, forked_from naming the phrase and the bar), THEN the phrase gets its override, THEN the Beat Box opens it; nothing is deleted', async () => {
  const r = rig();
  await r.handle.load(); await r.settle();
  const before = r.files.get(PATH)!;
  pinBar(r, 3);
  r.fire(button(r), 'click');
  await r.settle();
  assert.deepEqual(r.log.filter((l) => !/^open phrases/.test(l)).slice(0, 3), ['create bars/bar_007.md', 'write phrase', 'open bars/bar_007'], 'write order');
  const fork = r.files.get('bars/bar_007.md')!;
  assert.match(fork, /^forked_from: "\[\[phrase_004\]\]"\nforked_bar: 3$/m);
  assert.match(fork, /"tempo_bpm": 110/, 'the generated bar\'s own tempo');
  assert.deepEqual(JSON.parse(/```json\n([\s\S]*?)\n```/.exec(fork)![1]).channels.kick.map((v: boolean, i: number) => (v ? i : -1)).filter((i: number) => i >= 0), [0, 6, 8], 'bar 3 is state 2: kick 0 6 8');
  assert.match(r.files.get(PATH)!, /"overrides": \{\n    "3": "bars\/bar_007"\n  \}/);
  assert.deepEqual(r.opened.filter((o) => o.startsWith('bars/')), ['bars/bar_007']);
  assert.notEqual(r.files.get(PATH), before);
  r.done();
});

test('after the fork, the engine is handed the fork note\'s bar for bar 3 and the Score maps bar 3 as a fork: its stack says so and offers Revert; its hits are not mapped; the other bars are exactly what they were', async () => {
  const r = rig();
  await r.handle.load(); await r.settle();
  pinBar(r, 4); const bar4 = r.stack();
  pinBar(r, 3); r.fire(button(r), 'click'); await r.settle();
  assert.ok((r.computes.at(-1) as any).override_bars?.['3'], 'the engine got override_bars for bar 3');
  assert.equal(r.q('#mo3_kick_0'), null, 'a forked bar has no mapped hits');
  pinBar(r, 3);
  assert.deepEqual(r.stack(), ['bar 3 of 5', 'forked: edited in bar_007 (was made by phrase_004, morph bar_005 -> bar_006, musical order)', "tempo 110 (the fork's own)", 'Revert to generated']);
  assert.equal(button(r).textContent, 'Revert to generated');
  pinBar(r, 4);
  assert.deepEqual(r.stack(), bar4, 'bar 4 is untouched');
  r.done();
});

test('Revert to generated removes the override: the phrase text is exactly what it was before the fork, and the fork note stays', async () => {
  const r = rig();
  await r.handle.load(); await r.settle();
  const before = r.files.get(PATH)!;
  pinBar(r, 3); r.fire(button(r), 'click'); await r.settle();
  pinBar(r, 3); r.fire(button(r), 'click'); await r.settle();
  assert.equal(r.files.get(PATH), before, 'byte for byte');
  assert.ok(r.files.has('bars/bar_007.md'), 'nothing is deleted');
  assert.deepEqual((r.computes.at(-1) as any).override_bars, undefined);
  pinBar(r, 3);
  assert.equal(r.stack()[1], 'made by phrase_004 (morph bar_005 -> bar_006, musical order)');
  r.done();
});

test('refusals: a fork that cannot be created changes nothing and says why; a fork note that went missing, or is on another grid, is a Score refusal naming the bar', async () => {
  const failing = rig({ createThrows: 'disk full' });
  await failing.handle.load(); await failing.settle();
  const before = failing.files.get(PATH)!;
  pinBar(failing, 3); failing.fire(button(failing), 'click'); await failing.settle();
  assert.equal(failing.files.get(PATH), before);
  assert.match(failing.notices.join(' '), /Edit this bar: disk full/);
  failing.done();
  const gone = rig({ phrase: morphText({ overrides: { '3': 'bars/bar_009' } }) });
  await gone.handle.load(); await gone.settle();
  assert.match(gone.q('.forge-rhythm-edit-score-status').textContent, /^Phrase: bar 3 is forked to bars\/bar_009 \(bars\/bar_009\.md\) but that note was not found or could not be read/);
  gone.done();
  const twelve = barNote({ time_signature: '4/4', steps: 12, group_size: 4, swing_pct: 0, tempo_bpm: 90, channels: { kick: Array(12).fill(false) } });
  const grid = rig({ phrase: morphText({ overrides: { '3': 'bars/bar_009' } }), files: { 'bars/bar_009.md': twelve } });
  await grid.handle.load(); await grid.settle();
  assert.match(grid.q('.forge-rhythm-edit-score-status').textContent, /^Phrase: bar 3 \(bars\/bar_009\) differs from bar a bar_005 in steps \(it has 4\/4, 12 steps, group 4; the phrase has 4\/4, 16 steps, group 4\)/);
  grid.done();
});

test('a morph with a fork note in its JSON refuses an override for a bar it does not have', async () => {
  const r = rig({ phrase: morphText({ overrides: { '9': 'bars/bar_009' } }) });
  await r.handle.load(); await r.settle();
  assert.match(r.q('.forge-rhythm-edit-score-status').textContent, /^Phrase: overrides: "9" is not a bar of this phrase \(bars 1 to 5\); raise Bars, or remove the override with Revert to generated\./);   // 2026-10-26-1100, deliberate: the line names the way out
  r.done();
});

test('the bar a fork was made from is read FRESH: editing the fork note redraws the Score (the phrase watches its forks)', async () => {
  const r = rig({ phrase: morphText({ overrides: { '3': 'bars/bar_009' } }), files: { 'bars/bar_009.md': barNote({ ...DATA_A, tempo_bpm: 140, channels: rows({ kick: [0, 1], snare: [4] }) }) } });
  await r.handle.load(); await r.settle();
  const before = r.computes.length;
  r.files.set('bars/bar_009.md', barNote({ ...DATA_A, tempo_bpm: 150, channels: rows({ kick: [0, 2], snare: [4] }) }));
  r.handle.noteModified('bars/bar_009.md');
  await r.settle();
  assert.equal(r.computes.length, before + 1);
  pinBar(r, 3);
  assert.match(r.stack()[2], /tempo 150 \(the fork's own\)/);
  r.done();
});

// ---- 2026-10-26-1100 (CCQA smoke 5): the refusal trap ---------------------------------------------------------------------------------------------------------------------------------------------------

const change = (r: ReturnType<typeof rig>, sel: string, value: string) => { const el = r.q(sel); el.value = value; el.dispatchEvent(new r.win.Event('change', { bubbles: true })); };
const status = (r: ReturnType<typeof rig>) => r.q('.forge-rhythm-edit-score-status').textContent as string;

test('THE TRAP: with a fork on bar 3, lowering Bars to 2 is a refusal that names the way out, the Bars field (and the strip) stays enabled, the stale Inspector with its live Revert is cleared, and raising Bars brings the Score back with the fork kept', async () => {
  const fork = barNote({ ...DATA_A, tempo_bpm: 140, channels: rows({ kick: [0, 1], snare: [4] }) });
  const r = rig({ phrase: morphText({ overrides: { '3': 'bars/bar_009' } }), files: { 'bars/bar_009.md': fork } });
  await r.handle.load(); await r.settle();
  pinBar(r, 3);
  assert.ok(r.stack().includes('Revert to generated'), 'precondition: the pinned fork bar offers Revert');
  change(r, '.forge-morph-bars', '2'); await r.settle();
  assert.match(status(r), /^Phrase: overrides: "3" is not a bar of this phrase \(bars 1 to 2\); raise Bars, or remove the override with Revert to generated\./);
  for (const sel of ['.forge-morph-bars', '.forge-morph-a', '.forge-morph-b', '.forge-morph-order', '.forge-morph-atomic']) assert.equal(r.q(sel).disabled, false, `${sel} stays enabled: it can fix the cause or is harmless`);
  assert.equal(r.q('.forge-morph-bars').value, '2', 'the strip shows what the note says');
  assert.equal(r.qa('.forge-inspector-lineage').length, 0, 'no stale stack under a refusal');
  assert.equal(r.qa('.forge-inspector-action-button').length, 0, 'no live "Revert to generated" under a refusal');
  assert.match(r.q('.forge-inspector-body').textContent, /^Click a bar or a note/, 'the Inspector is back at its hint');
  assert.equal(r.qa('.forge-inspector-notes li').length, 0, 'and its "Notes in this score" list is gone');
  assert.equal(r.pinned().length, 0);
  // the way out: raise Bars
  change(r, '.forge-morph-bars', '5'); await r.settle();
  assert.equal(status(r), '', 'the refusal is gone');
  assert.match(r.files.get(PATH)!, /"3": "bars\/bar_009"/, 'raising Bars lost no fork');
  assert.ok(r.q('#ph_bar_3'), 'the Score is drawn again');
  pinBar(r, 3);
  assert.ok(r.stack().includes('Revert to generated'), 'and the fork bar offers Revert again');
  r.done();
});

test('the trap is only for what the strip can fix: a morph with a Bars the strip cannot make valid keeps every control disabled as before', async () => {
  const r = rig({ phrase: morphText({ bars: 99 }) });
  await r.handle.load(); await r.settle();
  assert.match(status(r), /bars must be a whole number from 1 to 64/);
  assert.equal(r.q('.forge-morph-bars').disabled, true);
  r.done();
});

test('the other controls stay live in the trap and write through the kept phrase: changing Order while the fork refusal stands keeps the override in the note', async () => {
  const r = rig({ phrase: morphText({ bars: 2, overrides: { '3': 'bars/bar_009' } }) });
  await r.handle.load(); await r.settle();
  assert.match(status(r), /raise Bars/);
  change(r, '.forge-morph-order', 'by_channel'); await r.settle();
  assert.match(r.files.get(PATH)!, /"order": "by_channel"/);
  assert.match(r.files.get(PATH)!, /"3": "bars\/bar_009"/);
  assert.match(status(r), /raise Bars/, 'still the same refusal');
  r.done();
});

test('(3) every stack carries the legend line that says steps count from 1, once', async () => {
  const r = rig();
  await r.handle.load(); await r.settle();
  pinBar(r, 2);
  const legend = r.stack().filter((t) => /steps count from 1/.test(t));
  assert.equal(legend.length, 1);
  assert.match(legend[0], /^▲ only bar_005 \(not changed yet\) · ■ only bar_006 \(already changed\) · ● both bars · # steps count from 1: step 1 is the first position of the bar$/);
  r.fire(r.q('#mo2_kick_2'), 'click');                                      // a hit's stack carries it too
  assert.equal(r.stack().filter((t) => /steps count from 1/.test(t)).length, 1);
  r.done();
});
