// 2026-11-12-1201 - the mix strip says when a VOTE can only give fewer than 3 different results, and points at Path (mix-states-core.ts), on the REAL phrase tab (mountPhrase, plain DOM, the note written by the plugin's own
// `applyPhraseWrite`). The pair is the driver's: phrase_002 = a vote mix of bar_007 and bar_001 (byte copies of the playground bars, test/fixtures/score-first/), where bar_001 is a subset of bar_007, so the vote gives 2 results.
// The Method control itself (the `Mode` select, Vote / Path) already existed (2026-10-26-0900); here its round trip is pinned on the Description the note carries.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { applyPhraseWrite, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { extractDescription } from './v2-note-core.ts';

const PATH = 'phrases/phrase_002.md';
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const fx = (n: string) => fs.readFileSync(path.join(FIXTURES, `${n}.md`), 'utf8');
const bar = (hits: number[]) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array.from({ length: 16 }, (_, i) => hits.includes(i)) } })}\n\`\`\`\n`;
const MIX: PhraseParams = { kind: 'mix', a: 'bar_007', b: 'bar_001', weight: 1, threshold: 0.65, ghost: false };
const HINT = 'These two bars can only give 2 different results by vote. Try Path: 9 steps.';
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

function rig(params: PhraseParams, bars: Record<string, string>) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const text = noteContentFor('phrase_002', params);
  const files = new Map<string, string>([[PATH, text], ...Object.entries(bars).map(([k, v]) => [`bars/${k}.md`, v] as [string, string])]);
  const errors: string[] = [];
  win.console.error = (...a: unknown[]) => { if (!/createLiveScore/.test(String(a[0]))) errors.push(a.map(String).join(' ')); };   // the rig's fake Score host is not a real engraving
  let handle: ReturnType<typeof mountPhrase>;
  const ports: PhraseMountPorts = {
    path: PATH, title: 'phrase_002', plan: 'score', initial: text,
    listBars: () => Object.keys(bars).sort(),
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async (next) => {
      const w = applyPhraseWrite(files.get(PATH)!, next, 'phrase_002');
      if (w.ok === false) return w;
      files.set(PATH, w.text);
      queueMicrotask(() => handle.noteModified(PATH));
      return { ok: true };
    },
    compute: async () => ({ type: 'musicxml', content: '<score-partwise/>' }),
    renderInto: (host) => { host.textContent = 'engraved'; return true; },
    stopPlayers: () => {},
    setTimer: (fn) => { fn(); return 0; }, clearTimer: () => {},
  };
  handle = mountPhrase(parent, ports);
  const q = (sel: string) => parent.querySelector(sel) as any;
  const change = async (sel: string, value: string | boolean) => {
    const el = q(sel);
    if (typeof value === 'boolean') el.checked = value; else el.value = value;
    el.dispatchEvent(new win.Event(typeof value === 'boolean' || el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    await flush();
  };
  const hint = (): string | null => { const e = q('.forge-mix-states-hint'); return e && e.style.display !== 'none' && !e.hidden ? e.textContent : null; };
  return { handle, files, q, change, hint, errors, win };
}
const PAIR = { bar_007: fx('bar_007'), bar_001: fx('bar_001') };

test('phrase_002 (a vote mix of bar_007 and bar_001): a one-line hint under the controls says the vote gives 2 results and points at Path with its 9 steps', async () => {
  const r = rig(MIX, PAIR);
  await r.handle.load(); await flush();
  assert.equal(r.hint(), HINT);
  assert.ok(r.q('.forge-mix-controls').contains(r.q('.forge-mix-states-hint')), 'the hint sits in the mix strip, under the controls');
  assert.deepEqual(r.errors, []);
});

test('the hint follows the ghost notes (with them on the pair gives 3 results: no hint) and comes back when they are off', async () => {
  const r = rig(MIX, PAIR);
  await r.handle.load(); await flush();
  await r.change('.forge-mix-ghost', true);
  assert.equal(r.q('.forge-mix-ghost').checked, true);
  assert.equal(r.hint(), null, 'three results with ghost notes on: nothing to say');
  await r.change('.forge-mix-ghost', false);
  assert.equal(r.hint(), HINT);
});

test('a pair that gives 3 or more results by vote shows no hint', async () => {
  const r = rig({ ...MIX, a: 'bar_007', b: 'bar_001' }, { bar_007: bar([0, 4]), bar_001: bar([0, 8]) });   // a, b, their union, their intersection: 4
  await r.handle.load(); await flush();
  assert.equal(r.hint(), null);
});

test('the hint follows the bars: changing bar b to one that gives more results removes it, changing back restores it', async () => {
  const r = rig(MIX, { ...PAIR, bar_003: bar([0, 2, 5]) });                                              // against bar_007 (hits ...), bar_003 is not a subset
  await r.handle.load(); await flush();
  assert.equal(r.hint(), HINT);
  await r.change('.forge-mix-b', 'bar_003');
  assert.equal(r.hint(), null, 'bar_007 and bar_003 give 3 or more');
  await r.change('.forge-mix-b', 'bar_001');
  assert.equal(r.hint(), HINT);
});

test('the Method switch (the Mode select) on the real tab: Path writes the path sentence and hides the hint, the weight slider snaps to its 9 states ("k of 8 changes"), and Vote writes the same vote Description back (weight, threshold and ghost lossless)', async () => {
  const note = noteContentFor('phrase_002', MIX);
  const noteBack = noteContentFor('phrase_002', { ...MIX, mode: 'vote' });          // what Vote writes back: the same note with the mode said out loud ("mode": "vote"), nothing else
  const r = rig(MIX, PAIR);
  await r.handle.load(); await flush();
  assert.equal(extractDescription(r.files.get(PATH)!), 'Mix [[bar_007]] and [[bar_001]], 100 percent [[bar_007]], as a vote. Threshold 65 percent.');
  await r.change('.forge-mix-mode', 'path');
  assert.equal(extractDescription(r.files.get(PATH)!), 'Mix [[bar_007]] and [[bar_001]], 100 percent [[bar_007]], as a path, in musical order. Threshold 65 percent.', 'the note on disk says the path sentence');
  assert.equal(r.hint(), null, 'no hint in path mode');
  assert.equal(r.q('.forge-mix-mode').value, 'path');
  assert.equal(r.q('.forge-mix-weight-changes').textContent, '0 of 8 changes');
  assert.equal(r.q('.forge-mix-weight').step, String(1 / 8), 'one stop per state: 9 stops');
  await r.change('.forge-mix-weight', '0.55');                                                         // between stops 3 (0.625) and 4 (0.5): 0.55 snaps to 4 of 8
  assert.equal(r.q('.forge-mix-weight-changes').textContent, '4 of 8 changes');
  assert.match(extractDescription(r.files.get(PATH)!), /^Mix \[\[bar_007\]\] and \[\[bar_001\]\], 50 percent \[\[bar_007\]\], as a path, in musical order\./);
  await r.change('.forge-mix-weight', '1');
  assert.equal(r.q('.forge-mix-weight-changes').textContent, '0 of 8 changes');
  await r.change('.forge-mix-mode', 'vote');
  assert.equal(extractDescription(r.files.get(PATH)!), extractDescription(note), 'back to Vote: the Description is the one it started as (weight 1, threshold 0.65, ghost off)');
  assert.equal(r.files.get(PATH), noteBack, 'and the note is the same vote note with only the explicit mode added');
  assert.equal(r.hint(), HINT, 'the hint is back');
  assert.equal(r.q('.forge-mix-threshold').value, '0.65');
  assert.deepEqual(r.errors, []);
});

test('the round trip keeps ghost notes too: vote with ghost on -> Path -> Vote is the same note, and the sentence says so in both', async () => {
  const withGhost: PhraseParams = { ...MIX, weight: 0.7, ghost: true };
  const note = noteContentFor('phrase_002', withGhost);
  const noteBack = noteContentFor('phrase_002', { ...withGhost, mode: 'vote' });
  const r = rig(withGhost, PAIR);
  await r.handle.load(); await flush();
  await r.change('.forge-mix-mode', 'path');
  assert.match(extractDescription(r.files.get(PATH)!), /With ghost notes\.$/);
  await r.change('.forge-mix-mode', 'vote');
  assert.equal(extractDescription(r.files.get(PATH)!), extractDescription(note));
  assert.equal(r.files.get(PATH), noteBack);
});

test('bars that cannot be read give no hint and no error (the Score says why)', async () => {
  const r = rig(MIX, { bar_007: 'not a bar', bar_001: fx('bar_001') });
  await r.handle.load(); await flush();
  assert.equal(r.hint(), null);
  assert.deepEqual(r.errors, []);
});
