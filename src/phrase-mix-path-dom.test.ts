// score_first (drain 2026-10-26-0900) — the mix strip's PATH mode, in plain DOM (happy-dom) with a fake vault and a fake engine: a Mode select (Vote, Path), Order and Seed that exist only in path mode, a Weight slider with
// one stop per single-hit change (step 1/d, snapping on input) labelled `k of d changes`, Threshold and Ghost notes greyed with a one-line note, and the sentence in the path's words. A vote mix's strip is what it was
// (its own suite, phrase-mix-dom.test.ts, runs unchanged). What it writes: the weight a stop writes (four decimals), the mode switch keeps weight, threshold and ghost, vote mode carries no order or seed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountMixControls, mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { applyPhraseWrite, readPhraseNote, type PhraseParams } from './phrase-core.ts';

const PHRASE_PATH = 'phrases/phrase_002.md';
const text = (p: Record<string, unknown>) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(p, null, 2)}\n\`\`\`\n`;
const PATH = { kind: 'mix', a: 'bar_005', b: 'bar_001', weight: 0.5, threshold: 0.65, ghost: true, mode: 'path', order: 'musical', seed: 0 };
const VOTE = { kind: 'mix', a: 'bar_005', b: 'bar_001', weight: 0.5, threshold: 0.65, ghost: true };
const bar = (kick: number[], extra: Record<string, number[]> = {}) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({
  time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100,
  channels: Object.fromEntries(Object.entries({ kick, ...extra }).map(([c, at]) => [c, Array.from({ length: 16 }, (_, i) => at.includes(i))])),
})}\n\`\`\`\n`;
// bar_005 vs bar_001: 4 single-hit changes (kick 8 and 12 only in a; kick 2 and 6 only in b); bar_002 vs bar_001: 3 (kick 8 only in a; 2 and 6 only in b)... see DISTANCES
const BARS: Record<string, string> = {
  'bars/bar_005.md': bar([0, 4, 8, 12]), 'bars/bar_001.md': bar([0, 2, 4, 6]), 'bars/bar_002.md': bar([0, 4, 6]), 'bars/bar_003.md': bar([0, 4, 8, 12]),
};
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

function rig(phrase: Record<string, unknown>, opts: { listBars?: string[] } = {}) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([[PHRASE_PATH, text(phrase)], ...Object.entries(BARS)]);
  const computes: PhraseParams[] = []; const writes: PhraseParams[] = [];
  let handle: ReturnType<typeof mountPhrase>;
  const ports: PhraseMountPorts = {
    path: PHRASE_PATH, title: 'phrase_002', plan: 'score', initial: files.get(PHRASE_PATH),
    listBars: () => opts.listBars ?? ['bar_005', 'bar_001', 'bar_002', 'bar_003'],
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async (params) => {
      writes.push(params);
      const w = applyPhraseWrite(files.get(PHRASE_PATH)!, params);
      if (w.ok === false) return w;
      files.set(PHRASE_PATH, w.text);
      queueMicrotask(() => handle.noteModified(PHRASE_PATH));          // the vault's modify event for this write brings the Score
      return { ok: true };
    },
    compute: async (_data, params) => { computes.push(params); return { type: 'musicxml', content: '<score-partwise/>' }; },
    renderInto: (host) => { host.textContent = 'engraved'; return true; },
    stopPlayers: () => {},
    setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as number,
    clearTimer: (h) => clearTimeout(h as never),
  };
  handle = mountPhrase(parent, ports);
  const q = (sel: string) => parent.querySelector(sel) as any;
  const fire = async (sel: string, value: string | boolean, type: 'input' | 'change') => {
    const el = q(sel);
    if (typeof value === 'boolean') el.checked = value; else el.value = value;
    el.dispatchEvent(new win.Event(type, { bubbles: true }));
    await flush();
  };
  const shown = () => readPhraseNote(files.get(PHRASE_PATH)!);
  const hidden = (sel: string) => q(sel).closest('label').style.display === 'none';
  return { handle, parent, files, computes, writes, q, fire, shown, hidden, win };
}
const open = async (phrase: Record<string, unknown>, opts?: { listBars?: string[] }) => { const r = rig(phrase, opts); await r.handle.load(); await flush(); await new Promise((x) => setTimeout(x, 30)); await flush(); return r; };

test('a path mix shows a Mode select reading Path, Order and Seed, the Weight slider with step 1/d and the label `k of d changes`, and the sentence in the path\'s words', async () => {
  const r = await open(PATH);
  assert.equal(r.q('.forge-mix-mode').value, 'path');
  assert.deepEqual([...r.q('.forge-mix-mode').options].map((o: any) => [o.value, o.textContent]), [['vote', 'Vote'], ['path', 'Path']]);
  assert.equal(r.q('.forge-mix-weight').step, '0.25', 'd = 4: five stops');
  assert.equal(r.q('.forge-mix-weight').min, '0'); assert.equal(r.q('.forge-mix-weight').max, '1');
  assert.equal(r.q('.forge-mix-weight').value, '0.5');
  assert.equal(r.q('.forge-mix-weight-value').textContent, '0.50');
  assert.equal(r.q('.forge-mix-weight-changes').textContent, '2 of 4 changes');
  assert.notEqual(r.q('.forge-mix-weight-changes').style.display, 'none', 'the label is SHOWN, not only present');
  assert.equal(r.q('.forge-mix-sentence').textContent, 'Mix of bar_005 and bar_001, path: 2 of 4 single-hit changes (musical order).');
  assert.equal(r.hidden('.forge-mix-order'), false); assert.equal(r.hidden('.forge-mix-seed'), false);
  assert.equal(r.q('.forge-mix-order').value, 'musical');
  assert.deepEqual([...r.q('.forge-mix-order').options].map((o: any) => o.value), ['musical', 'seeded', 'by_channel']);
  assert.equal(r.q('.forge-mix-seed').disabled, true, 'a seed matters only for the seeded order');
});

test('Threshold and Ghost notes are greyed in path mode with a one-line note saying why; they are live again in vote mode', async () => {
  const path = await open(PATH);
  assert.equal(path.q('.forge-mix-threshold').disabled, true);
  assert.equal(path.q('.forge-mix-ghost').disabled, true);
  assert.equal(path.q('.forge-mix-threshold').value, '0.65', 'the value stays in the strip and the note');
  assert.equal(path.q('.forge-mix-ghost').checked, true);
  assert.match(path.q('.forge-mix-path-note').textContent, /Threshold and Ghost notes are not used in path mode/);
  assert.notEqual(path.q('.forge-mix-path-note').style.display, 'none');
  const vote = await open(VOTE);
  assert.equal(vote.q('.forge-mix-threshold').disabled, false);
  assert.equal(vote.q('.forge-mix-ghost').disabled, false);
  assert.equal(vote.q('.forge-mix-path-note').style.display, 'none');
});

test('a vote mix\'s strip is what it was: Mode reads Vote, the Weight slider steps by 0.05, no `k of d changes`, no Order or Seed, and the sentence is the vote\'s', async () => {
  const r = await open(VOTE);
  assert.equal(r.q('.forge-mix-mode').value, 'vote');
  assert.equal(r.q('.forge-mix-weight').step, '0.05');
  assert.equal(r.q('.forge-mix-weight-changes').style.display, 'none');
  assert.equal(r.hidden('.forge-mix-order'), true); assert.equal(r.hidden('.forge-mix-seed'), true);
  assert.equal(r.q('.forge-mix-sentence').textContent, 'Mix of bar_005 and bar_001: 50 % bar_005; a hit appears where the weights say it should (threshold 0.65). Ghost notes: quiet extra hits where the weights come close.');
  assert.equal(r.q('.forge-mix-morph'), null);
});

test('dragging the Weight slider through every stop writes the weight of that stop (1, 0.75, 0.5, 0.25, 0) and the label follows: 0 of 4 ... 4 of 4 changes', async () => {
  const r = await open({ ...PATH, weight: 1 });
  const labels: string[] = []; const weights: number[] = [];
  for (const j of [0, 1, 2, 3, 4]) {
    await r.fire('.forge-mix-weight', String(1 - j / 4), 'input');
    labels.push(r.q('.forge-mix-weight-changes').textContent);
    await flush();
  }
  for (const w of r.writes) weights.push((w as { weight: number }).weight);
  assert.deepEqual(labels, ['0 of 4 changes', '1 of 4 changes', '2 of 4 changes', '3 of 4 changes', '4 of 4 changes']);
  assert.deepEqual(weights, [0.75, 0.5, 0.25, 0], 'stop 0 was already the note\'s weight: nothing to write');
  const last = r.shown(); assert.equal(last.ok && (last.value as { weight: number }).weight, 0);
  assert.equal(r.q('.forge-mix-sentence').textContent, 'Mix of bar_005 and bar_001, path: 4 of 4 single-hit changes (musical order).');
});

test('a value between two stops snaps to the nearest stop on input (the strip writes the stop, never the in-between number); d = 3 writes four-decimal weights', async () => {
  const r = await open(PATH);
  await r.fire('.forge-mix-weight', '0.6', 'input');           // (1 - 0.6) * 4 = 1.6 -> stop 2
  assert.equal(r.q('.forge-mix-weight-changes').textContent, '2 of 4 changes');
  assert.deepEqual(r.writes, [], 'stop 2 is weight 0.5: the note already says so, so nothing is written');
  await r.fire('.forge-mix-weight', '0.9', 'input');           // 0.4 -> stop 0.4 -> 0 changes? (1 - 0.9) * 4 = 0.4 -> stop 0
  assert.equal((r.writes.at(-1) as { weight: number }).weight, 1);
  const three = await open({ ...PATH, b: 'bar_002', weight: 1 });          // bar_005 vs bar_002 is 3 changes
  assert.equal(three.q('.forge-mix-weight').step, String(1 / 3));
  await three.fire('.forge-mix-weight', '0.7', 'input');
  assert.equal((three.writes.at(-1) as { weight: number }).weight, 0.6667);
  assert.equal(three.q('.forge-mix-weight-changes').textContent, '1 of 3 changes');
  await three.fire('.forge-mix-weight', '0.3', 'input');
  assert.equal((three.writes.at(-1) as { weight: number }).weight, 0.3333);
  assert.equal(three.q('.forge-mix-weight-changes').textContent, '2 of 3 changes');
});

test('the Score is asked for the path: every write reaches the engine with mode path, the order, the seed and the new weight', async () => {
  const r = await open(PATH);
  await r.fire('.forge-mix-weight', '0.25', 'input');
  await new Promise((x) => setTimeout(x, 30)); await flush();
  const last = r.computes.at(-1) as Record<string, unknown>;
  assert.equal(last.mode, 'path'); assert.equal(last.order, 'musical'); assert.equal(last.seed, 0); assert.equal(last.weight, 0.25);
});

test('switching Mode keeps weight, threshold and ghost: Vote -> Path writes mode path with order musical and seed 0; Path -> Vote writes mode vote and drops order and seed; the sentence changes with it', async () => {
  const r = await open(VOTE);
  await r.fire('.forge-mix-mode', 'path', 'change');
  assert.deepEqual(r.shown(), { ok: true, value: { ...VOTE, mode: 'path', order: 'musical', seed: 0 } });
  await new Promise((x) => setTimeout(x, 30)); await flush();
  assert.equal(r.q('.forge-mix-weight').step, '0.25', 'the stops appear once d is known');
  assert.equal(r.q('.forge-mix-sentence').textContent, 'Mix of bar_005 and bar_001, path: 2 of 4 single-hit changes (musical order).');
  assert.equal(r.q('.forge-mix-threshold').disabled, true);
  await r.fire('.forge-mix-mode', 'vote', 'change');
  assert.deepEqual(r.shown(), { ok: true, value: { ...VOTE, mode: 'vote' } });
  assert.doesNotMatch(r.files.get(PHRASE_PATH)!, /"order"|"seed"/);
  assert.equal(r.q('.forge-mix-weight').step, '0.05');
  assert.equal(r.q('.forge-mix-threshold').disabled, false);
  assert.match(r.q('.forge-mix-sentence').textContent, /^Mix of bar_005 and bar_001: 50 % bar_005; a hit appears/);
});

test('Order and Seed are written in path mode: choosing seeded enables Seed; each is kept in the note; the sentence says the order', async () => {
  const r = await open(PATH);
  await r.fire('.forge-mix-order', 'seeded', 'change');
  assert.equal(r.q('.forge-mix-seed').disabled, false);
  await r.fire('.forge-mix-seed', '7', 'change');
  assert.deepEqual(r.shown(), { ok: true, value: { ...PATH, order: 'seeded', seed: 7 } });
  assert.equal(r.q('.forge-mix-sentence').textContent, 'Mix of bar_005 and bar_001, path: 2 of 4 single-hit changes (seeded order, seed 7).');
  await r.fire('.forge-mix-order', 'by_channel', 'change');
  assert.equal(r.q('.forge-mix-seed').disabled, true);
  assert.equal(r.shown().ok && (r.shown() as { value: { order: string } }).value.order, 'by_channel');
});

test('changing a bar asks for d again: the slider\'s stops follow the new pair', async () => {
  const r = await open(PATH);
  assert.equal(r.q('.forge-mix-weight').step, '0.25');
  await r.fire('.forge-mix-b', 'bar_002', 'change');
  await new Promise((x) => setTimeout(x, 30)); await flush();
  assert.equal(r.q('.forge-mix-weight').step, String(1 / 3));
  assert.equal(r.q('.forge-mix-weight-changes').textContent, '2 of 3 changes', '(1 - 0.5) * 3 = 1.5 rounds up to 2');
});

test('two identical bars (d = 0): one stop, "0 of 0 changes", and the sentence says there is nothing to walk', async () => {
  const r = await open({ ...PATH, b: 'bar_003' });          // bar_003 is bar_005's hits
  assert.equal(r.q('.forge-mix-weight-changes').textContent, '0 of 0 changes');
  assert.match(r.q('.forge-mix-sentence').textContent, /nothing to walk/);
});

test('a path mix that is wrong (a mode that is not vote or path) disables the strip and the Score says why; it is never written over', async () => {
  const r = await open({ ...PATH, mode: 'x' });
  assert.equal(r.q('.forge-mix-weight').disabled, true);
  assert.equal(r.q('.forge-mix-mode').disabled, true);
  assert.deepEqual(r.writes, []);
});

// ---- the strip on its own: what the integrated rig cannot tell apart (the phrase redraws the strip after every write, which hides these) --------------------------------------------------------------------

function bareStrip(initial: Record<string, unknown>, changes: (a: string, b: string) => Promise<number | null>) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const patches: unknown[] = [];
  const strip = mountMixControls(parent, { onChange: (p) => { patches.push(p); }, listBars: () => ['bar_005', 'bar_001', 'bar_002'], changes });
  const q = (sel: string) => parent.querySelector(sel) as any;
  const fire = async (sel: string, value: string) => { const el = q(sel); el.value = value; el.dispatchEvent(new win.Event('change', { bubbles: true })); await flush(); };
  strip.set(initial as any);
  return { strip, q, fire, patches };
}

test('on its own, the strip asks for d when the mode becomes Path (not only when the phrase redraws it), and never in vote mode', async () => {
  const asked: string[] = [];
  const r = bareStrip(VOTE, async (a, b) => { asked.push(`${a}:${b}`); return 4; });
  await flush();
  assert.deepEqual(asked, [], 'a vote mix asks nothing');
  await r.fire('.forge-mix-mode', 'path');
  assert.deepEqual(asked, ['bar_005:bar_001'], 'the mode switch asked');
  assert.equal(r.q('.forge-mix-weight').step, '0.25');
  assert.deepEqual(r.patches, [{ mode: 'path' }]);
});

test('on its own, an answer for a pair the person has already left is dropped: the stops follow the LATEST pair even when the answers arrive out of order', async () => {
  const waiting: Array<{ pair: string; resolve: (d: number) => void }> = [];
  const r = bareStrip(PATH, (a, b) => new Promise((resolve) => { waiting.push({ pair: `${a}:${b}`, resolve: (d) => resolve(d) }); }));
  assert.deepEqual(waiting.map((w) => w.pair), ['bar_005:bar_001']);
  await r.fire('.forge-mix-b', 'bar_002');
  assert.deepEqual(waiting.map((w) => w.pair), ['bar_005:bar_001', 'bar_005:bar_002']);
  waiting[1].resolve(3); await flush();
  assert.equal(r.q('.forge-mix-weight').step, String(1 / 3));
  waiting[0].resolve(4); await flush();                                // the stale answer for the old pair arrives last
  assert.equal(r.q('.forge-mix-weight').step, String(1 / 3), 'still the stops of the latest pair');
  assert.equal(r.q('.forge-mix-weight-changes').textContent, '2 of 3 changes');
});
