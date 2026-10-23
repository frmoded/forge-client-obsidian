// score_first M7 Phase A (drain 2026-10-22-2330) — the mix phrase surface: a strip of two bar dropdowns, a Weight slider, a Threshold slider, a Ghost notes checkbox and one plain-words sentence
// over the live Score, in plain DOM (happy-dom) with a fake vault and a fake engine. What it writes, when it redraws, what it does NOT have (no lineage inspector, no bracket, no source link:
// M8), and what it says when the mix is wrong. The REAL engine renders the same surface in phrase-engine.test.ts; real Chrome in scripts/dev/measure-phrase.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { MIX_SCORE_DEBOUNCE_MS, mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { applyPhraseWrite, readPhraseNote, type PhraseParams } from './phrase-core.ts';
import { LIVE_SCORE_DEBOUNCE_MS } from './live-score-core.ts';
import { LEAN_SCORE_NOTE } from './score-first-core.ts';

const PHRASE_PATH = 'phrases/phrase_002.md';
const mixText = (p: Record<string, unknown> = {}) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false, ...p }, null, 2)}\n\`\`\`\n`;
const extendText = (p: Record<string, unknown> = {}) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20, ...p }, null, 2)}\n\`\`\`\n`;
const barText = (tempo: number) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: tempo, channels: { kick: Array(16).fill(false) } })}\n\`\`\`\n`;
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

interface Opts { plan?: 'score' | 'lean-note'; phrase?: string; bars?: Record<string, string | null>; listBars?: string[]; initial?: boolean; computeThrows?: string }

function rig(opts: Opts = {}) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([[PHRASE_PATH, opts.phrase ?? mixText()]]);
  for (const [name, text] of Object.entries({ bar_005: barText(100), bar_006: barText(120), bar_007: barText(110), ...(opts.bars ?? {}) })) if (text !== null) files.set(`bars/${name}.md`, text);
  const computes: Array<{ data: any; params: PhraseParams; title: string }> = [];
  const drawn: string[] = [];
  const writes: PhraseParams[] = [];
  const opened: string[] = [];
  const gate: { hold: Promise<void> | null; modifyHold: Promise<void> | null } = { hold: null, modifyHold: null };
  let now = 0;
  const timers: Array<{ id: number; at: number; fn: () => void }> = []; let nextId = 1;
  let handle: ReturnType<typeof mountPhrase>;
  let writeResult: { ok: true } | { ok: false; message: string } = { ok: true };
  const ports: PhraseMountPorts = {
    path: PHRASE_PATH,
    title: 'phrase_002',
    plan: opts.plan ?? 'score',
    inspector: { openNote: (id) => { opened.push(id); } },       // the view passes this for every phrase; a mix must not use it
    listBars: () => opts.listBars ?? ['bar_005', 'bar_006', 'bar_007'],
    initial: opts.initial ? files.get(PHRASE_PATH) : undefined,
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async (params) => {
      writes.push(params);
      if (!writeResult.ok) { if (gate.hold) await gate.hold; return writeResult; }
      const w = applyPhraseWrite(files.get(PHRASE_PATH)!, params);
      if (w.ok === false) return w;
      files.set(PHRASE_PATH, w.text);
      if (gate.hold && gate.modifyHold) { queueMicrotask(() => { void gate.modifyHold!.then(() => handle.noteModified(PHRASE_PATH)); }); await gate.hold; return { ok: true }; }   // the file landed, the modify event is held, the write has not returned yet
      if (gate.hold) await gate.hold;
      queueMicrotask(() => { void (gate.modifyHold ?? Promise.resolve()).then(() => handle.noteModified(PHRASE_PATH)); });
      return { ok: true };
    },
    compute: async (data, params, title) => {
      computes.push({ data, params, title });
      if (opts.computeThrows) throw new Error(opts.computeThrows);
      const tag = params.kind === 'mix' ? `${params.a}:${params.b}:${params.weight}:${params.threshold}:${params.ghost}` : `extend:${params.bars}`;
      return { type: 'musicxml', content: `<score-partwise>${tag}</score-partwise>` };
    },
    renderInto: (host, payload) => { drawn.push(payload.content as string); host.textContent = 'engraved'; return true; },
    stopPlayers: () => {},
    setTimer: (fn, ms) => { const id = nextId++; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
  };
  handle = mountPhrase(parent, ports);
  const advance = async (ms: number) => { now += ms; for (;;) { const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); } await flush(); };
  const q = (sel: string) => parent.querySelector(sel) as any;
  const status = () => q('.forge-rhythm-edit-score-status').textContent as string;
  const fire = async (sel: string, value: string | boolean, type: 'input' | 'change') => {
    const el = q(sel);
    if (typeof value === 'boolean') el.checked = value; else el.value = value;
    el.dispatchEvent(new win.Event(type, { bubbles: true }));
    await flush();
  };
  return { handle, parent, files, computes, drawn, writes, opened, q, status, fire, advance, gate, setWrite: (r: typeof writeResult) => { writeResult = r; }, win, timers };
}

const shown = (r: ReturnType<typeof rig>) => readPhraseNote(r.files.get(PHRASE_PATH)!);

test('a mix phrase shows the mix strip: two bar dropdowns, a Weight slider 0..1 step 0.05 with its number, a Threshold slider, Ghost notes, the sentence — and the Score for the two bars', async () => {
  const r = rig({ initial: true });
  await r.handle.load(); await flush();
  assert.equal(r.q('.forge-mix-a').value, 'bar_005');
  assert.equal(r.q('.forge-mix-b').value, 'bar_006');
  const w = r.q('.forge-mix-weight');
  assert.equal(w.type, 'range'); assert.equal(w.min, '0'); assert.equal(w.max, '1'); assert.equal(w.step, '0.05'); assert.equal(w.value, '0.5');
  assert.equal(r.q('.forge-mix-weight-value').textContent, '0.50');
  const t = r.q('.forge-mix-threshold');
  assert.equal(t.type, 'range'); assert.equal(t.min, '0'); assert.equal(t.max, '1'); assert.equal(t.step, '0.05'); assert.equal(t.value, '0.5');
  assert.equal(r.q('.forge-mix-threshold-value').textContent, '0.50');
  assert.equal(r.q('.forge-mix-ghost').type, 'checkbox'); assert.equal(r.q('.forge-mix-ghost').checked, false);
  assert.equal(r.q('.forge-mix-sentence').textContent, 'Mix of bar_005 and bar_006: 50 % bar_005; a hit appears where the weights say it should (threshold 0.50).');
  for (const sel of ['.forge-mix-a', '.forge-mix-b', '.forge-mix-weight', '.forge-mix-threshold', '.forge-mix-ghost']) assert.ok(r.q(sel).getAttribute('aria-label'), `${sel} has an accessible name`);
  assert.equal(r.computes.length, 1);
  assert.equal(r.computes[0].data.a.tempo_bpm, 100, 'bar a\'s data');
  assert.equal(r.computes[0].data.b.tempo_bpm, 120, 'bar b\'s data');
  assert.deepEqual(r.drawn, ['<score-partwise>bar_005:bar_006:0.5:0.5:false</score-partwise>']);
  assert.equal(r.status(), '');
});

test('both dropdowns list the bars in bars/ (and the phrase\'s own bars even if they are not listed)', async () => {
  const r = rig({ initial: true, listBars: ['bar_005', 'bar_006', 'bar_009'] });
  await r.handle.load();
  for (const sel of ['.forge-mix-a', '.forge-mix-b']) assert.deepEqual([...r.q(sel).querySelectorAll('option')].map((o: any) => o.value), ['bar_005', 'bar_006', 'bar_009']);
  const gone = rig({ initial: true, phrase: mixText({ b: 'bar_002' }), listBars: ['bar_005'] });
  await gone.handle.load();
  assert.equal(gone.q('.forge-mix-b').value, 'bar_002', 'a bar that is not listed (deleted?) is still what the select shows');
});

test('a mix has NO lineage inspector, no bracket and no source link (M8), and the extend strip is gone', async () => {
  const r = rig({ initial: true });
  await r.handle.load(); await flush();
  assert.equal(r.q('.forge-inspector'), null);
  assert.equal(r.q('.forge-phrase-bracket'), null);
  assert.equal(r.q('.forge-phrase-source'), null);
  assert.equal(r.q('.forge-phrase-bars'), null);
  assert.equal(r.q('.forge-phrase-style'), null);
  assert.equal(r.parent.querySelectorAll('.forge-phrase-controls').length, 1);
  assert.deepEqual(r.opened, []);
});

test('moving the Weight slider shows the number and the sentence AT ONCE and writes the phrase JSON (two decimals); the Score follows the note\'s modify event after the mix debounce', async () => {
  const r = rig({ initial: true });
  await r.handle.load(); await flush();
  await r.fire('.forge-mix-weight', '0.35', 'input');
  assert.equal(r.q('.forge-mix-weight-value').textContent, '0.35');
  assert.match(r.q('.forge-mix-sentence').textContent, /35 % bar_005/);
  assert.deepEqual(r.writes.map((w) => (w as { weight: number }).weight), [0.35]);
  assert.deepEqual(shown(r), { ok: true, value: { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.35, threshold: 0.5, ghost: false } });
  assert.equal(r.drawn.length, 1, 'not redrawn yet');
  await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.equal(r.drawn.length, 2);
  assert.equal(r.drawn[1], '<score-partwise>bar_005:bar_006:0.35:0.5:false</score-partwise>');
  assert.equal(MIX_SCORE_DEBOUNCE_MS < LIVE_SCORE_DEBOUNCE_MS, true, 'a slider drag is redrawn sooner than a cell click');
  assert.equal(MIX_SCORE_DEBOUNCE_MS, 0, 'no trailing wait: a drag must redraw while it is still going');
});

test('the browser\'s change event after the last input writes nothing more (same value)', async () => {
  const r = rig({ initial: true });
  await r.handle.load(); await flush();
  await r.fire('.forge-mix-weight', '0.7', 'input');
  await r.fire('.forge-mix-weight', '0.7', 'change');
  assert.equal(r.writes.length, 1);
});

test('scrubbing: input events while a write is in flight are COALESCED — only the latest value is written next, never a queue of them; nothing is lost', async () => {
  const r = rig({ initial: true });
  await r.handle.load(); await flush();
  let release!: () => void;
  r.gate.hold = new Promise<void>((res) => { release = res; });
  await r.fire('.forge-mix-weight', '0.6', 'input');           // starts the write, held
  for (const v of ['0.65', '0.7', '0.75', '0.8']) await r.fire('.forge-mix-weight', v, 'input');
  await r.fire('.forge-mix-threshold', '0.3', 'input');        // a different field in the same burst must not be lost either
  assert.equal(r.writes.length, 1, 'one write in flight, the rest wait');
  assert.equal(r.q('.forge-mix-weight-value').textContent, '0.80', 'the number follows the slider while the write waits');
  r.gate.hold = null; release(); await flush(); await flush();
  assert.equal(r.writes.length, 2, 'exactly one more write, not four');
  assert.deepEqual(shown(r), { ok: true, value: { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.8, threshold: 0.3, ghost: false } });
  await r.advance(MIX_SCORE_DEBOUNCE_MS); await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.equal(r.drawn.at(-1), '<score-partwise>bar_005:bar_006:0.8:0.3:false</score-partwise>');
});

test('the Threshold slider, the Ghost notes checkbox and the two dropdowns each write their field', async () => {
  const r = rig({ initial: true });
  await r.handle.load(); await flush();
  await r.fire('.forge-mix-threshold', '0.7', 'input');
  await r.fire('.forge-mix-ghost', true, 'change');
  await r.fire('.forge-mix-a', 'bar_007', 'change');
  await r.fire('.forge-mix-b', 'bar_005', 'change');
  assert.deepEqual(shown(r), { ok: true, value: { kind: 'mix', a: 'bar_007', b: 'bar_005', weight: 0.5, threshold: 0.7, ghost: true } });
  assert.equal(r.q('.forge-mix-threshold-value').textContent, '0.70');
  assert.match(r.q('.forge-mix-sentence').textContent, /Ghost notes/);
  await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.equal(r.drawn.at(-1), '<score-partwise>bar_007:bar_005:0.5:0.7:true</score-partwise>');
});

test('a hand edit of the JSON redraws through the same path: weight 0.8 moves the slider and the Score; weight 3 is a refusal line naming weight and the strip is disabled', async () => {
  const r = rig({ initial: true });
  await r.handle.load(); await flush();
  r.files.set(PHRASE_PATH, mixText({ weight: 0.8 }));
  r.handle.noteModified(PHRASE_PATH); await flush(); await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.equal(r.q('.forge-mix-weight').value, '0.8');
  assert.equal(r.q('.forge-mix-weight-value').textContent, '0.80');
  assert.equal(r.drawn.at(-1), '<score-partwise>bar_005:bar_006:0.8:0.5:false</score-partwise>');
  const before = r.computes.length;
  r.files.set(PHRASE_PATH, mixText({ weight: 3 }));
  r.handle.noteModified(PHRASE_PATH); await flush(); await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.match(r.status(), /^Phrase: .*weight/);
  assert.equal(r.q('.forge-mix-weight').disabled, true);
  assert.equal(r.computes.length, before, 'the engine was not asked for an invalid mix');
});

test('a missing bar names which one; two bars on different grids is the engine\'s own mix_rhythm line in the status, not a console error', async () => {
  const missing = rig({ initial: true, bars: { bar_006: null } });
  await missing.handle.load(); await flush();
  assert.match(missing.status(), /\bb\b.*bar_006.*(not found|could not be read)/);
  assert.equal(missing.computes.length, 0);

  const origErr = console.error; const errors: unknown[] = []; console.error = (...a: unknown[]) => { errors.push(a); };
  try {
    const mismatch = rig({ initial: true, computeThrows: 'mix_rhythm: a and b must agree on steps, but a has 16 and b has 12' });
    await mismatch.handle.load(); await flush();
    assert.match(mismatch.status(), /^Phrase: mix_rhythm: a and b must agree on steps/);
    assert.equal(errors.length, 0);
  } finally { console.error = origErr; }
});

test('either bar changing under the mix redraws it; a note that is neither does not', async () => {
  const r = rig({ initial: true });
  await r.handle.load(); await flush();
  const n = r.drawn.length;
  r.files.set('bars/bar_006.md', barText(90)); r.handle.noteModified('bars/bar_006.md'); await flush(); await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.equal(r.drawn.length, n + 1);
  assert.equal(r.computes.at(-1)!.data.b.tempo_bpm, 90);
  r.files.set('bars/bar_005.md', barText(80)); r.handle.noteModified('bars/bar_005.md'); await flush(); await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.equal(r.drawn.length, n + 2);
  r.handle.noteModified('bars/bar_007.md'); await flush(); await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.equal(r.drawn.length, n + 2, 'bar_007 is not part of this mix');
});

test('a write the note refuses puts the controls back and says why; nothing is drawn for it', async () => {
  const r = rig({ initial: true });
  await r.handle.load(); await flush();
  r.setWrite({ ok: false, message: 'Not saved: the note is read_only.' });
  await r.fire('.forge-mix-weight', '0.2', 'input');
  assert.equal(r.q('.forge-phrase-status').textContent, 'Not saved: the note is read_only.');
  assert.equal(r.q('.forge-mix-weight').value, '0.5');
  assert.equal(r.q('.forge-mix-weight-value').textContent, '0.50');
});

test('an extend phrase that is hand-edited into a mix swaps the strip (and loses the inspector and the bracket); editing it back restores the extend strip', async () => {
  const r = rig({ phrase: extendText() });
  await r.handle.load(); await flush();
  assert.ok(r.q('.forge-phrase-bars'), 'extend strip first');
  assert.ok(r.q('.forge-phrase-bracket'));
  assert.ok(r.q('.forge-inspector'));
  r.files.set(PHRASE_PATH, mixText());
  r.handle.noteModified(PHRASE_PATH); await flush(); await r.advance(LIVE_SCORE_DEBOUNCE_MS); await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.equal(r.q('.forge-phrase-bars'), null);
  assert.ok(r.q('.forge-mix-weight'));
  assert.equal(r.q('.forge-phrase-bracket'), null);
  assert.equal(r.q('.forge-inspector'), null);
  assert.equal(r.parent.querySelectorAll('.forge-phrase-controls').length, 1);
  assert.equal(r.parent.querySelectorAll('.forge-rhythm-edit-score').length, 1, 'one Score panel, not two');
  assert.match(r.drawn.at(-1)!, /bar_005:bar_006:0.5/);
  r.files.set(PHRASE_PATH, extendText({ bars: 2 }));
  r.handle.noteModified(PHRASE_PATH); await flush(); await r.advance(LIVE_SCORE_DEBOUNCE_MS); await r.advance(MIX_SCORE_DEBOUNCE_MS);
  assert.ok(r.q('.forge-phrase-bars'));
  assert.equal(r.q('.forge-mix-weight'), null);
  assert.ok(r.q('.forge-phrase-bracket'));
  assert.ok(r.q('.forge-inspector'));
  assert.equal(r.parent.querySelectorAll('.forge-rhythm-edit-score').length, 1);
  assert.equal(r.drawn.at(-1), '<score-partwise>extend:2</score-partwise>');
});

test('the strip sits above the Score, in the same place the extend strip does', async () => {
  const r = rig({ initial: true });
  await r.handle.load(); await flush();
  const kids = [...r.parent.children].map((c: any) => c.className.split(' ')[0]);
  assert.equal(kids[0], 'forge-phrase-controls');
  assert.equal(kids.includes('forge-rhythm-edit-score'), true);
  assert.ok(kids.indexOf('forge-phrase-controls') < kids.indexOf('forge-rhythm-edit-score'));
});

test('lean edition: the mix strip is there, the Score is the one-line explanation, the engine is never asked', async () => {
  const r = rig({ initial: true, plan: 'lean-note' });
  await r.handle.load(); await flush();
  assert.ok(r.q('.forge-mix-weight'));
  assert.match(r.parent.textContent, new RegExp(LEAN_SCORE_NOTE.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(r.computes.length, 0);
});

// ---- gaps found by the mutants (client pass) ----------------------------------------------------------------------------------------------------------------------------------------

test('a modify event for an EARLIER write arriving in the middle of a drag does not move the sliders back to the older value', async () => {
  const r = rig({ initial: true });
  await r.handle.load(); await flush();
  let release!: () => void; let releaseModify!: () => void;
  r.gate.hold = new Promise<void>((res) => { release = res; });
  r.gate.modifyHold = new Promise<void>((res) => { releaseModify = res; });
  await r.fire('.forge-mix-weight', '0.6', 'input');           // lands on disk (0.6), its modify event and its return are both held
  await r.fire('.forge-mix-weight', '0.8', 'input');           // the person keeps dragging
  releaseModify(); await flush(); await flush();                // the old modify event arrives: the note says 0.6
  assert.equal(r.q('.forge-mix-weight').value, '0.8', 'the slider stays where the person has it');
  assert.equal(r.q('.forge-mix-weight-value').textContent, '0.80');
  r.gate.hold = null; r.gate.modifyHold = null; release(); await flush(); await flush();
  assert.equal(shown(r).ok && (shown(r) as { value: { weight: number } }).value.weight, 0.8, 'and the 0.8 is what ends up written');
});

test('after a refused write the next control change carries the NOTE\'s values, not the refused one; the controls are put back and later reloads set them again', async () => {
  const r = rig({ initial: true });
  await r.handle.load(); await flush();
  r.setWrite({ ok: false, message: 'Not saved: the note is read_only.' });
  await r.fire('.forge-mix-weight', '0.2', 'input');
  assert.equal(r.q('.forge-mix-weight').value, '0.5');
  r.setWrite({ ok: true });
  await r.fire('.forge-mix-threshold', '0.7', 'input');
  const last = r.writes.at(-1) as unknown as { weight: number; threshold: number };
  assert.equal(last.threshold, 0.7);
  assert.equal(last.weight, 0.5, 'the refused 0.2 is not sent again');
  // and a hand edit afterwards reaches the controls (nothing is left "in flight")
  r.files.set(PHRASE_PATH, mixText({ weight: 0.9 }));
  r.handle.noteModified(PHRASE_PATH); await flush();
  assert.equal(r.q('.forge-mix-weight').value, '0.9');
});

test('a slider value that is not on the grid or out of range is written clamped to two decimals in 0..1', async () => {
  const r = rig({ initial: true });
  await r.handle.load(); await flush();
  await r.fire('.forge-mix-weight', '0.123', 'input');
  assert.equal((r.writes.at(-1) as unknown as { weight: number }).weight, 0.12);
  await r.fire('.forge-mix-threshold', '7', 'input');
  assert.equal((r.writes.at(-1) as unknown as { threshold: number }).threshold, 1);
  await r.fire('.forge-mix-threshold', '-3', 'input');
  assert.equal((r.writes.at(-1) as unknown as { threshold: number }).threshold, 0);
});
