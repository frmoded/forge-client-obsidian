// score_first (drain 2026-10-25-1000) — the visible way from a mix to its morph: a **Morph this mix** button in the mix tab's control strip. Plain DOM (happy-dom), fake vault, fake engine.
// The button exists only when the strip is given the action (the phrase view does, in a score-first vault), asks for it on click and writes NOTHING itself; it is disabled while the mix is wrong, like the
// other mix controls; the extend and morph strips have no such button; and a mix strip WITHOUT the action is byte-identical to before.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import type { PhraseParams } from './phrase-core.ts';

const PHRASE_PATH = 'phrases/phrase_002.md';
const text = (p: Record<string, unknown>) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(p, null, 2)}\n\`\`\`\n`;
const MIX = { kind: 'mix', a: 'bar_005', b: 'bar_001', weight: 0, threshold: 0.65, ghost: true };
const MORPH = { kind: 'morph', a: 'bar_005', b: 'bar_001', bars: 5, order: 'musical', seed: 0 };
const EXTEND = { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 };
const barText = `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array(16).fill(false) } })}\n\`\`\`\n`;
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

function rig(phrase: Record<string, unknown>, withAction: boolean) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([[PHRASE_PATH, text(phrase)], ['bars/bar_005.md', barText], ['bars/bar_001.md', barText]]);
  const asked: number[] = []; const writes: PhraseParams[] = [];
  const ports: PhraseMountPorts = {
    path: PHRASE_PATH, title: 'phrase_002', plan: 'score', initial: files.get(PHRASE_PATH),
    listBars: () => ['bar_005', 'bar_001'],
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async (params) => { writes.push(params); return { ok: true }; },
    compute: async () => ({ type: 'musicxml', content: '<score-partwise/>' }),
    renderInto: (host) => { host.textContent = 'engraved'; return true; },
    stopPlayers: () => {},
    setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as number,
    clearTimer: (h) => clearTimeout(h as never),
    ...(withAction ? { turnIntoMorph: () => { asked.push(1); } } : {}),
  };
  const handle = mountPhrase(parent, ports);
  const q = (sel: string) => parent.querySelector(sel) as any;
  return { handle, parent, q, asked, writes, win };
}

test('a mix tab with the action has a "Morph this mix" button in its strip; clicking it asks for the action once and writes nothing', async () => {
  const r = rig(MIX, true);
  await r.handle.load(); await flush();
  const b = r.q('.forge-mix-morph');
  assert.ok(b, 'the button is there');
  assert.equal(b.textContent, 'Morph this mix');
  assert.equal(b.tagName, 'BUTTON');
  assert.equal(b.type, 'button');
  assert.match(b.title, /morph/i);
  assert.equal(b.disabled, false);
  assert.ok(r.q('.forge-mix-controls').contains(b), 'inside the mix strip');
  b.click(); await flush();
  assert.equal(r.asked.length, 1);
  assert.deepEqual(r.writes, [], 'the strip writes nothing: the action makes the new note, the mix is never modified');
  b.click(); await flush();
  assert.equal(r.asked.length, 2, 'each click asks again (two clicks make two morph notes)');
});

test('the button is disabled while the mix is wrong (like the other mix controls) and enabled again when it is right', async () => {
  const r = rig({ ...MIX, weight: 3 }, true);
  await r.handle.load(); await flush();
  assert.equal(r.q('.forge-mix-morph').disabled, true);
  r.q('.forge-mix-morph').click(); await flush();
  r.q('.forge-mix-morph').dispatchEvent(new r.win.MouseEvent('click', { bubbles: true })); await flush();   // a synthetic click reaches the listener even on a disabled button: the guard in the handler holds it back
  assert.equal(r.asked.length, 0, 'a disabled button asks for nothing');
});

test('a mix strip WITHOUT the action (the strip as it was) has no button; the extend strip and the morph strip never have one', async () => {
  const without = rig(MIX, false);
  await without.handle.load(); await flush();
  assert.equal(without.q('.forge-mix-morph'), null);
  assert.ok(without.q('.forge-mix-weight') && without.q('.forge-mix-threshold') && without.q('.forge-mix-ghost'), 'the rest of the mix strip is as before');
  for (const phrase of [MORPH, EXTEND]) {
    const r = rig(phrase, true);
    await r.handle.load(); await flush();
    assert.equal(r.q('.forge-mix-morph'), null, String(phrase.kind));
    assert.equal(Array.from(r.parent.querySelectorAll('button') as ArrayLike<any>).filter((b: any) => /morph this mix/i.test(b.textContent)).length, 0, `${phrase.kind}: no such button anywhere`);
  }
});

test('the handle says what kind of phrase it shows (the command asks it): mix, morph, extend', async () => {
  for (const [phrase, kind] of [[MIX, 'mix'], [MORPH, 'morph'], [EXTEND, 'extend']] as const) {
    const r = rig(phrase, true);
    await r.handle.load(); await flush();
    assert.equal(r.handle.kind(), kind);
  }
});
